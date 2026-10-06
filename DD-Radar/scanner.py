"""Verzeichnis-Scan: findet Dateien, erhebt Metadaten, erkennt Duplikate."""

from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from config import (
    ANALYSABLE_EXTS,
    LEGACY_EXTS,
    MAX_FILE_MB,
    SKIP_DIRS,
    SKIP_NAMES,
    SKIP_PREFIXES,
)

logger = logging.getLogger(__name__)


@dataclass
class Datei:
    """Eine im Datenraum gefundene Datei."""

    pfad: Path
    rel_pfad: str
    name: str
    endung: str
    groesse: int
    geaendert: str                    # ISO-Datum
    sha256: str
    ordner: str                       # relativer Ordnerpfad ("" = Wurzel)
    lesbar: bool                      # Volltext technisch gewinnbar
    hinweis: str = ""                 # z. B. "Altformat", "zu groß"
    duplikat_von: str = ""            # rel_pfad des Erstfunds

    # Wird von extractor/classifier gefüllt
    text: str = ""
    text_quelle: str = ""             # "pdf-text" | "vision" | "docx" | …
    klassifikation: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "rel_pfad": self.rel_pfad,
            "name": self.name,
            "endung": self.endung,
            "groesse": self.groesse,
            "geaendert": self.geaendert,
            "sha256": self.sha256,
            "ordner": self.ordner,
            "lesbar": self.lesbar,
            "hinweis": self.hinweis,
            "duplikat_von": self.duplikat_von,
            "text_quelle": self.text_quelle,
            "klassifikation": self.klassifikation,
        }


def _ueberspringen(name: str) -> bool:
    low = name.lower()
    if low in SKIP_NAMES:
        return True
    return any(low.startswith(p) for p in SKIP_PREFIXES)


def sha256_datei(pfad: Path, block: int = 1 << 20) -> str:
    h = hashlib.sha256()
    try:
        with pfad.open("rb") as fh:
            while chunk := fh.read(block):
                h.update(chunk)
    except OSError as exc:
        logger.warning("Hash fehlgeschlagen für %s: %s", pfad, exc)
        return ""
    return h.hexdigest()


def scanne(wurzel: Path, fortschritt=None) -> list[Datei]:
    """Durchsucht `wurzel` rekursiv und liefert alle relevanten Dateien.

    Args:
        wurzel: zu analysierendes Verzeichnis.
        fortschritt: optionaler Callback(str) für Statusmeldungen.
    """
    wurzel = wurzel.resolve()
    if not wurzel.is_dir():
        raise NotADirectoryError(f"Kein Verzeichnis: {wurzel}")

    gefunden: list[Datei] = []
    gesehen: dict[str, str] = {}          # sha256 -> rel_pfad des Erstfunds

    for ordner, unterordner, dateien in os.walk(wurzel):
        unterordner[:] = [u for u in unterordner if u.lower() not in SKIP_DIRS]
        ordner_pfad = Path(ordner)

        for name in sorted(dateien):
            if _ueberspringen(name):
                continue
            pfad = ordner_pfad / name
            try:
                stat = pfad.stat()
            except OSError:
                continue

            endung = pfad.suffix.lower()
            rel = str(pfad.relative_to(wurzel))
            groesse_mb = stat.st_size / (1024 * 1024)

            lesbar = endung in ANALYSABLE_EXTS
            hinweis = ""
            if endung in LEGACY_EXTS:
                hinweis = "Altformat/nicht auslesbar — bitte als PDF oder DOCX bereitstellen"
            elif not lesbar:
                hinweis = "Dateityp wird nicht ausgewertet"
            if lesbar and groesse_mb > MAX_FILE_MB:
                lesbar = False
                hinweis = f"Datei > {MAX_FILE_MB} MB — nur Metadaten erfasst"
            if stat.st_size == 0:
                lesbar = False
                hinweis = "Leere Datei"

            digest = sha256_datei(pfad) if stat.st_size else ""
            dup = ""
            if digest:
                if digest in gesehen:
                    dup = gesehen[digest]
                    lesbar = False
                    hinweis = hinweis or "Inhaltsgleiches Duplikat"
                else:
                    gesehen[digest] = rel

            gefunden.append(Datei(
                pfad=pfad,
                rel_pfad=rel,
                name=name,
                endung=endung,
                groesse=stat.st_size,
                geaendert=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                          .astimezone().strftime("%Y-%m-%d"),
                sha256=digest,
                ordner=str(pfad.parent.relative_to(wurzel)) if pfad.parent != wurzel else "",
                lesbar=lesbar,
                hinweis=hinweis,
                duplikat_von=dup,
            ))

            if fortschritt and len(gefunden) % 25 == 0:
                fortschritt(f"{len(gefunden)} Dateien erfasst …")

    if fortschritt:
        fortschritt(f"Scan abgeschlossen: {len(gefunden)} Dateien.")
    return gefunden


def scan_statistik(dateien: list[Datei]) -> dict:
    """Kennzahlen für den Berichtskopf."""
    nach_typ: dict[str, int] = {}
    for d in dateien:
        nach_typ[d.endung or "(ohne)"] = nach_typ.get(d.endung or "(ohne)", 0) + 1
    return {
        "anzahl_gesamt": len(dateien),
        "anzahl_analysierbar": sum(1 for d in dateien if d.lesbar),
        "anzahl_duplikate": sum(1 for d in dateien if d.duplikat_von),
        "anzahl_altformat": sum(1 for d in dateien if "Altformat" in d.hinweis),
        "gesamtgroesse_mb": round(sum(d.groesse for d in dateien) / (1024 * 1024), 1),
        "nach_typ": dict(sorted(nach_typ.items(), key=lambda kv: -kv[1])),
        "ordner_anzahl": len({d.ordner for d in dateien}),
    }
