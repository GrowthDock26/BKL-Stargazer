"""DD-Radar — Datenraum-Bereitschaftsprüfung für Start-ups vor der Investoren-DD.

Ablauf:
    Verzeichnis scannen → Text gewinnen → mit LOGICC klassifizieren →
    gegen den DD-Katalog abgleichen → Bericht erzeugen.

Aufruf:
    python dd_radar.py "D:\\Unterlagen" --mandant "Muster GmbH" --profil VC
    python dd_radar.py "D:\\Unterlagen" --offline        # ohne jeden Datenversand
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any, Callable

import classifier
import gap_analysis
import reporter
import scanner
from api_client import ApiFehler, create_client
from config import WORKDIR_NAME, load_config

logger = logging.getLogger("dd_radar")


def _modus_text(cfg: dict[str, Any]) -> str:
    if cfg["offline"]:
        return "OFFLINE — keine Datenübermittlung, Zuordnung nur über Stichworte"
    if cfg["use_mock"]:
        return "MOCK — keine echten KI-Aufrufe"
    return "LOGICC (api.logicc.io)" + (" · anonymisiert" if cfg["anonymisieren"] else "")


def analysiere_verzeichnis(
    verzeichnis: Path,
    cfg: dict[str, Any],
    mandant: str = "",
    ausgabe: Path | None = None,
    fortschritt: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Führt den vollständigen Lauf durch und liefert die erzeugten Pfade."""
    melde = fortschritt or (lambda s: logger.info(s))
    verzeichnis = verzeichnis.resolve()
    workdir = verzeichnis / WORKDIR_NAME
    workdir.mkdir(parents=True, exist_ok=True)
    ziel = (ausgabe or verzeichnis).resolve()
    ziel.mkdir(parents=True, exist_ok=True)

    melde(f"Scanne {verzeichnis} …")
    dateien = scanner.scanne(verzeichnis, fortschritt=melde)
    stat = scanner.scan_statistik(dateien)
    if not dateien:
        raise RuntimeError("Im gewählten Verzeichnis wurden keine Dateien gefunden.")

    client = None
    if not cfg["offline"]:
        melde("Verbinde mit LOGICC …")
        client = create_client(cfg, workdir)

    melde(f"Analysiere {stat['anzahl_analysierbar']} Dokumente "
          f"(Profil {cfg['profil']}, {_modus_text(cfg)}) …")
    try:
        classifier.klassifiziere_alle(
            dateien, client, cfg["profil"], workdir,
            use_vision=cfg["use_vision"], offline=cfg["offline"],
            max_docs=cfg["max_docs"], fortschritt=melde,
        )
    except ApiFehler as exc:
        melde(f"KI-Lauf abgebrochen: {exc}")
        melde("Bereits klassifizierte Dokumente bleiben gespeichert — "
              "erneuter Start setzt am Abbruchpunkt fort.")
        raise

    melde("Gleiche gegen den Due-Diligence-Katalog ab …")
    ergebnis = gap_analysis.analysiere(dateien, cfg["profil"])

    meta = {
        "mandant": mandant or verzeichnis.name,
        "verzeichnis": str(verzeichnis),
        "zeitpunkt": __import__("datetime").datetime.now().strftime("%d.%m.%Y %H:%M"),
        "modell": "—" if cfg["offline"] else cfg["model"],
        "modus": _modus_text(cfg),
        "profil": cfg["profil"],
    }

    stamm = f"DD-Radar_{_dateiname_teil(meta['mandant'])}_{reporter.zeitstempel()}"
    melde("Erzeuge Berichte …")
    pfade = {
        "excel": reporter.schreibe_excel(ziel / f"{stamm}.xlsx", dateien, ergebnis, stat, meta),
        "docx":  reporter.schreibe_docx(ziel / f"{stamm}_Kurzbericht.docx", ergebnis, stat, meta),
        "html":  reporter.schreibe_html(ziel / f"{stamm}_Dashboard.html", ergebnis, stat, meta),
        "json":  reporter.schreibe_json(workdir / f"{stamm}.json", dateien, ergebnis, stat, meta),
    }

    k = ergebnis.kennzahlen
    melde(f"Fertig. Bereitschaftsgrad {k['bereitschaft_prozent']} % · "
          f"{k['fehlt']} Positionen fehlen · {k['kritisch_offen']} davon kritisch · "
          f"{len(ergebnis.red_flags)} Auffälligkeiten.")

    return {"pfade": pfade, "ergebnis": ergebnis, "statistik": stat, "meta": meta}


def _dateiname_teil(text: str) -> str:
    erlaubt = "".join(c if c.isalnum() or c in " -_" else "_" for c in text)
    return "_".join(erlaubt.split())[:40] or "Mandant"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="dd_radar",
        description="Prüft ein Verzeichnis auf Due-Diligence-Bereitschaft "
                    "(Kategorisierung vorhandener und Aufspüren fehlender Unterlagen).",
    )
    parser.add_argument("verzeichnis", type=Path, help="zu analysierendes Verzeichnis")
    parser.add_argument("--mandant", default="", help="Name des Unternehmens für den Bericht")
    parser.add_argument("--profil", default="", choices=["", "SEED", "VC", "MA"],
                        help="Prüfprofil (Default aus .env, sonst VC)")
    parser.add_argument("--out", type=Path, default=None, help="Ausgabeverzeichnis für Berichte")
    parser.add_argument("--offline", action="store_true",
                        help="ohne KI und ohne jede Datenübermittlung arbeiten")
    parser.add_argument("--mock", action="store_true", help="Testlauf ohne echte API-Aufrufe")
    parser.add_argument("--no-vision", action="store_true",
                        help="gescannte PDFs nicht per Vision auswerten")
    parser.add_argument("--anonym", action="store_true",
                        help="E-Mail, Telefon und IBAN vor dem Versand maskieren")
    parser.add_argument("--max-docs", type=int, default=0,
                        help="nur die ersten N Dokumente analysieren (Kostenbremse)")
    parser.add_argument("--leise", action="store_true", help="weniger Ausgabe")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.WARNING if args.leise else logging.INFO,
        format="%(message)s",
        stream=sys.stdout,
    )

    overrides: dict[str, Any] = {}
    if args.profil:
        overrides["profil"] = args.profil
    if args.offline:
        overrides["offline_mode"] = "1"
    if args.mock:
        overrides["use_mock"] = "1"
    if args.no_vision:
        overrides["use_vision"] = "0"
    if args.anonym:
        overrides["anonymisieren"] = "1"
    if args.max_docs:
        overrides["max_docs"] = str(args.max_docs)

    cfg = load_config(overrides)

    try:
        ergebnis = analysiere_verzeichnis(
            args.verzeichnis, cfg, mandant=args.mandant, ausgabe=args.out,
            fortschritt=None if args.leise else print,
        )
    except (ApiFehler, RuntimeError, NotADirectoryError) as exc:
        print(f"\nFehler: {exc}", file=sys.stderr)
        return 1

    print("\nBerichte:")
    for name, pfad in ergebnis["pfade"].items():
        print(f"  {name:6s} {pfad}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
