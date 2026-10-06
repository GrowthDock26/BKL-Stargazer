"""Klassifikation der gefundenen Dokumente gegen den DD-Katalog.

Arbeitsteilung:
  * deterministisch  – Stichwortabgleich (`taxonomy.stichwort_treffer`)
  * KI (LOGICC)      – Dokumenttyp, Zuordnung, Vollständigkeit, Red Flags

Die KI darf nur aus den Katalog-IDs auswählen; unbekannte IDs werden verworfen.
Ergebnisse werden je Dateiinhalt (SHA-256) zwischengespeichert, damit erneute
Läufe und Abbrüche keine Kosten erzeugen.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import extractor
import taxonomy
from api_client import ApiFehler, BaseClient
from scanner import Datei

logger = logging.getLogger(__name__)

CACHE_DATEI = "klassifikation-cache.json"
CACHE_VERSION = "1"

# Denk-Modelle (z. B. gemini-2.5-pro) verbrauchen einen Teil des Budgets für
# Reasoning; zu knappe Budgets liefern abgeschnittenes JSON.
TOKEN_BUDGET = 3000
TOKEN_BUDGET_RETRY = 8000

SYSTEM_PROMPT = """Du bist Legal-Tech-Assistenz einer deutschen Wirtschaftskanzlei und
sichtest den Datenraum eines Start-ups, das sich auf eine Investoren-Due-Diligence
vorbereitet.

Deine Aufgabe: EIN Dokument einordnen. Du bewertest nicht die Rechtslage, du
beschreibst, was vorliegt.

Ordne das Dokument einer oder mehreren IDs aus diesem Katalog zu:

{katalog}

Regeln:
- Verwende ausschließlich IDs aus dem Katalog. Passt nichts, gib eine leere Liste zurück.
- Mehrfachzuordnung nur, wenn das Dokument tatsächlich mehrere Punkte abdeckt
  (z. B. ein Beteiligungsvertrag mit integrierter Gesellschaftervereinbarung).
- "unterschrieben": "ja" nur bei erkennbarer Unterschrift, Signaturblock oder
  qualifizierter elektronischer Signatur; ein Unterschriftenfeld allein ist "nein".
- "vollstaendig": "nein" bei fehlenden Anlagen, offenen Platzhaltern ([●], XXX,
  "TBD"), fehlenden Seiten oder abgeschnittenem Text.
- "entwurf": "ja" bei Entwurfsvermerken, Kommentaren, Änderungsverfolgung oder
  Dateinamen-Hinweisen wie "draft", "Entwurf", "v0.".
- red_flags: nur konkrete, im Text belegte Auffälligkeiten mit Fundstelle
  (z. B. "§ 12.3 Change of Control: Kündigungsrecht des Kunden").
  Keine allgemeinen Ratschläge, keine Vermutungen.
- Erfinde keine Zitate, Aktenzeichen oder Normen. Was nicht im Text steht, steht nicht da.
- konfidenz: 0.0–1.0, ehrlich. Bei dünner Textgrundlage niedrig.

Antworte ausschließlich mit einem JSON-Objekt dieser Form:
{{
  "dokumenttyp": "kurze Typbezeichnung, z. B. Gesellschaftsvertrag",
  "titel_klar": "sprechender Titel für den Datenraumindex",
  "checklist_ids": ["CORP-02"],
  "parteien": ["…"],
  "datum": "YYYY-MM-DD oder leer",
  "unterschrieben": "ja|nein|unklar",
  "vollstaendig": "ja|nein|unklar",
  "entwurf": "ja|nein|unklar",
  "sprache": "de|en|…",
  "vertraulichkeit": "hoch|mittel|niedrig",
  "kernaussagen": ["max. 3 kurze Punkte"],
  "red_flags": [{{"schwere": "HOCH|MITTEL|NIEDRIG", "thema": "…", "fundstelle": "…", "hinweis": "…"}}],
  "konfidenz": 0.0,
  "begruendung": "ein Satz"
}}"""

USER_TEMPLATE = """Dateiname: {name}
Ablagepfad: {pfad}
Dateidatum: {datum}
Format: {endung} ({quelle}{seiten})

--- DOKUMENTINHALT ---
{text}
--- ENDE ---"""

VISION_HINWEIS = (
    "Der Dokumentinhalt liegt als Seitenbild bei (gescanntes Dokument). "
    "Lies die Seiten aus dem Bild.\n"
)

LEERE_KLASSIFIKATION: dict[str, Any] = {
    "dokumenttyp": "",
    "titel_klar": "",
    "checklist_ids": [],
    "parteien": [],
    "datum": "",
    "unterschrieben": "unklar",
    "vollstaendig": "unklar",
    "entwurf": "unklar",
    "sprache": "",
    "vertraulichkeit": "mittel",
    "kernaussagen": [],
    "red_flags": [],
    "konfidenz": 0.0,
    "begruendung": "",
    "quelle_zuordnung": "",
}


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

class Cache:
    def __init__(self, workdir: Path, profil: str) -> None:
        self.pfad = workdir / CACHE_DATEI
        self.profil = profil
        self.daten: dict[str, Any] = {}
        if self.pfad.exists():
            try:
                roh = json.loads(self.pfad.read_text(encoding="utf-8"))
                if roh.get("version") == CACHE_VERSION and roh.get("profil") == profil:
                    self.daten = roh.get("eintraege", {})
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Cache nicht lesbar, wird neu aufgebaut: %s", exc)

    def get(self, sha: str) -> dict[str, Any] | None:
        return self.daten.get(sha)

    def set(self, sha: str, wert: dict[str, Any]) -> None:
        if sha:
            self.daten[sha] = wert

    def speichern(self) -> None:
        self.pfad.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.pfad.write_text(
                json.dumps({"version": CACHE_VERSION, "profil": self.profil,
                            "eintraege": self.daten}, ensure_ascii=False, indent=1),
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning("Cache nicht schreibbar: %s", exc)


# ---------------------------------------------------------------------------
# Klassifikation
# ---------------------------------------------------------------------------

def _bereinige(roh: dict[str, Any], profil: str) -> dict[str, Any]:
    """Prüft die KI-Antwort gegen den Katalog und normalisiert die Felder."""
    ergebnis = dict(LEERE_KLASSIFIKATION)
    gueltige = {d.id for d in taxonomy.katalog_fuer(profil)}

    ids = roh.get("checklist_ids") or []
    if isinstance(ids, str):
        ids = [ids]
    ergebnis["checklist_ids"] = [i for i in ids if isinstance(i, str) and i.upper() in gueltige]
    ergebnis["checklist_ids"] = [i.upper() for i in ergebnis["checklist_ids"]]
    verworfen = [i for i in ids if isinstance(i, str) and i.upper() not in gueltige]
    if verworfen:
        logger.debug("Unbekannte Katalog-IDs verworfen: %s", verworfen)

    for feld in ("dokumenttyp", "titel_klar", "datum", "sprache", "begruendung"):
        wert = roh.get(feld)
        ergebnis[feld] = wert.strip() if isinstance(wert, str) else ""

    for feld, erlaubt in (("unterschrieben", {"ja", "nein", "unklar"}),
                          ("vollstaendig", {"ja", "nein", "unklar"}),
                          ("entwurf", {"ja", "nein", "unklar"}),
                          ("vertraulichkeit", {"hoch", "mittel", "niedrig"})):
        wert = str(roh.get(feld, "")).strip().lower()
        ergebnis[feld] = wert if wert in erlaubt else LEERE_KLASSIFIKATION[feld]

    for feld in ("parteien", "kernaussagen"):
        wert = roh.get(feld) or []
        ergebnis[feld] = [str(w).strip() for w in wert if str(w).strip()][:5]

    flags: list[dict[str, str]] = []
    for f in roh.get("red_flags") or []:
        if not isinstance(f, dict):
            continue
        schwere = str(f.get("schwere", "MITTEL")).upper()
        flags.append({
            "schwere": schwere if schwere in {"HOCH", "MITTEL", "NIEDRIG"} else "MITTEL",
            "thema": str(f.get("thema", "")).strip(),
            "fundstelle": str(f.get("fundstelle", "")).strip(),
            "hinweis": str(f.get("hinweis", "")).strip(),
        })
    ergebnis["red_flags"] = [f for f in flags if f["thema"] or f["hinweis"]][:6]

    try:
        ergebnis["konfidenz"] = max(0.0, min(1.0, float(roh.get("konfidenz", 0))))
    except (TypeError, ValueError):
        ergebnis["konfidenz"] = 0.0

    ergebnis["quelle_zuordnung"] = "ki"
    return ergebnis


def _offline_klassifikation(datei: Datei, text: str, profil: str) -> dict[str, Any]:
    """Reine Stichwortzuordnung — ohne jeden Datenversand."""
    ergebnis = dict(LEERE_KLASSIFIKATION)
    basis = f"{datei.rel_pfad}\n{text}"
    treffer = taxonomy.stichwort_treffer(basis, profil)
    stark = [tid for tid, score in treffer if score >= 4][:2] or [t[0] for t in treffer[:1]]
    ergebnis["checklist_ids"] = stark
    ergebnis["titel_klar"] = Path(datei.name).stem
    ergebnis["dokumenttyp"] = taxonomy.by_id(stark[0]).titel if stark else "unbestimmt"
    ergebnis["konfidenz"] = 0.35 if stark else 0.0
    ergebnis["begruendung"] = "Offline-Modus: Zuordnung allein über Stichworte"
    ergebnis["quelle_zuordnung"] = "stichwort"
    return ergebnis


def _brauchbar(ergebnis: dict[str, Any]) -> bool:
    """Hat die KI überhaupt etwas geliefert?"""
    return bool(ergebnis.get("dokumenttyp") or ergebnis.get("checklist_ids")
                or ergebnis.get("kernaussagen"))


def _cache_brauchbar(eintrag: dict[str, Any], offline: bool) -> bool:
    """Im KI-Modus dürfen reine Stichwort-Ergebnisse aus einem Offline-Lauf nicht
    wiederverwendet werden — sonst bliebe die KI-Analyse dauerhaft aus."""
    if offline:
        return True
    return str(eintrag.get("quelle_zuordnung", "")).startswith("ki")


def klassifiziere_datei(
    datei: Datei,
    client: BaseClient | None,
    profil: str,
    cache: Cache,
    use_vision: bool,
    offline: bool,
) -> dict[str, Any]:
    """Klassifiziert eine einzelne Datei (mit Cache)."""
    if datei.sha256:
        gespeichert = cache.get(datei.sha256)
        if gespeichert is not None and _cache_brauchbar(gespeichert, offline):
            datei.text_quelle = gespeichert.get("_text_quelle", "cache")
            return {k: v for k, v in gespeichert.items() if not k.startswith("_")}

    auszug = extractor.extrahiere(datei.pfad, use_vision=use_vision) if datei.lesbar \
        else extractor.Auszug(hinweis=datei.hinweis)
    datei.text = auszug.text
    datei.text_quelle = auszug.quelle or "—"

    if not auszug:
        ergebnis = dict(LEERE_KLASSIFIKATION)
        ergebnis["begruendung"] = auszug.hinweis or "Kein auswertbarer Inhalt"
        ergebnis["quelle_zuordnung"] = "keine"
    elif offline or client is None:
        ergebnis = _offline_klassifikation(datei, auszug.text, profil)
    else:
        seiten = f", {auszug.seiten} Seiten" if auszug.seiten else ""
        user = USER_TEMPLATE.format(
            name=datei.name,
            pfad=datei.rel_pfad,
            datum=datei.geaendert,
            endung=datei.endung,
            quelle=auszug.quelle,
            seiten=seiten,
            text=auszug.text or "(kein Text — siehe beigefügte Seitenbilder)",
        )
        if auszug.bilder_b64:
            user = VISION_HINWEIS + user
        system = SYSTEM_PROMPT.format(katalog=taxonomy.katalog_als_prompt(profil))
        try:
            ergebnis = _bereinige(
                client.json_completion(system, user, bilder_b64=auszug.bilder_b64 or None,
                                       max_tokens=TOKEN_BUDGET, kontext=datei.rel_pfad),
                profil)
            if not _brauchbar(ergebnis):
                # Häufigste Ursache: Denk-Modelle (gemini-2.5-pro) verbrauchen das
                # Token-Budget, die JSON-Antwort bricht ab. Einmal mit mehr Budget nachfassen.
                logger.info("Antwort unbrauchbar, Wiederholung mit größerem Budget: %s",
                            datei.rel_pfad)
                ergebnis = _bereinige(
                    client.json_completion(system, user, bilder_b64=auszug.bilder_b64 or None,
                                           max_tokens=TOKEN_BUDGET_RETRY, kontext=datei.rel_pfad),
                    profil)
            if not _brauchbar(ergebnis):
                logger.warning("Keine verwertbare KI-Antwort für %s — Stichwortzuordnung",
                               datei.rel_pfad)
                ergebnis = _offline_klassifikation(datei, auszug.text, profil)
                ergebnis["begruendung"] = ("Keine verwertbare KI-Antwort (Antwort leer oder "
                                           "abgeschnitten) — Zuordnung über Stichworte, "
                                           "bitte manuell prüfen")
        except ApiFehler:
            raise
        except Exception as exc:                  # Einzelfehler nicht laufabbrechend
            logger.warning("Klassifikation fehlgeschlagen (%s): %s", datei.rel_pfad, exc)
            ergebnis = _offline_klassifikation(datei, auszug.text, profil)
            ergebnis["begruendung"] = f"KI-Fehler, Stichwortzuordnung: {exc}"

        # Deterministische Gegenprobe: klarer Stichworttreffer, den die KI nicht sah
        treffer = taxonomy.stichwort_treffer(f"{datei.rel_pfad}\n{auszug.text}", profil)
        for tid, score in treffer[:1]:
            if score >= 6 and tid not in ergebnis["checklist_ids"]:
                ergebnis["checklist_ids"].append(tid)
                ergebnis["quelle_zuordnung"] = "ki+stichwort"

    cache.set(datei.sha256, {**ergebnis, "_text_quelle": datei.text_quelle})
    return ergebnis


def klassifiziere_alle(
    dateien: list[Datei],
    client: BaseClient | None,
    profil: str,
    workdir: Path,
    use_vision: bool = True,
    offline: bool = False,
    max_docs: int = 0,
    fortschritt=None,
) -> list[Datei]:
    """Klassifiziert alle analysierbaren Dateien; speichert den Cache laufend."""
    cache = Cache(workdir, profil)
    kandidaten = [d for d in dateien if d.lesbar]
    if max_docs:
        kandidaten = kandidaten[:max_docs]

    for nr, datei in enumerate(kandidaten, start=1):
        if fortschritt:
            fortschritt(f"[{nr}/{len(kandidaten)}] {datei.rel_pfad}")
        try:
            datei.klassifikation = klassifiziere_datei(
                datei, client, profil, cache, use_vision, offline)
        except ApiFehler as exc:
            cache.speichern()
            raise ApiFehler(
                f"Abbruch nach {nr - 1} von {len(kandidaten)} Dokumenten: {exc}"
            ) from exc
        if nr % 10 == 0:
            cache.speichern()

    for datei in dateien:
        if not datei.klassifikation:
            datei.klassifikation = dict(LEERE_KLASSIFIKATION)
            datei.klassifikation["begruendung"] = datei.hinweis or "nicht analysiert"

    cache.speichern()
    return dateien
