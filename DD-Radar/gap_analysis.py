"""Soll-Ist-Abgleich: Ampel, Lückenliste (IRL), Red Flags, Datenraumstruktur.

Diese Schicht ist bewusst vollständig deterministisch. Die KI liefert nur die
Zuordnung einzelner Dokumente; ob daraus „vorhanden", „teilweise" oder „fehlt"
folgt, entscheidet nachvollziehbarer Code — nicht das Modell.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import taxonomy
from config import (
    AMPEL_GELB,
    AMPEL_GRUEN,
    AMPEL_ROT,
    PRIO_GEWICHT,
    PRIO_HOCH,
    PRIO_KRITISCH,
    STATUS_FEHLT,
    STATUS_SCORE,
    STATUS_TEILWEISE,
    STATUS_VORHANDEN,
)
from scanner import Datei
from taxonomy import SollDokument

MIN_KONFIDENZ = 0.45           # darunter gilt eine KI-Zuordnung als unsicher


@dataclass
class Befund:
    """Ergebnis zu einem Soll-Dokument."""

    soll: SollDokument
    status: str
    belege: list[Datei] = field(default_factory=list)
    maengel: list[str] = field(default_factory=list)

    @property
    def ampel(self) -> str:
        if self.status == STATUS_VORHANDEN:
            return AMPEL_GRUEN
        if self.status == STATUS_TEILWEISE:
            return AMPEL_GELB
        return AMPEL_ROT if self.soll.prioritaet in (PRIO_KRITISCH, PRIO_HOCH) else AMPEL_GELB

    @property
    def belegliste(self) -> str:
        return "; ".join(d.rel_pfad for d in self.belege)


@dataclass
class RedFlag:
    datei: str
    schwere: str
    thema: str
    fundstelle: str
    hinweis: str
    workstream: str


@dataclass
class Ergebnis:
    profil: str
    befunde: list[Befund]
    red_flags: list[RedFlag]
    nicht_zugeordnet: list[Datei]
    duplikate: list[Datei]
    altformate: list[Datei]
    kennzahlen: dict
    workstream_ampeln: dict[str, str]


# ---------------------------------------------------------------------------
# Kernlogik
# ---------------------------------------------------------------------------

def _maengel_des_belegs(datei: Datei, soll: SollDokument) -> list[str]:
    """Formale Mängel eines Belegdokuments (deterministisch aus der Klassifikation)."""
    k = datei.klassifikation or {}
    maengel: list[str] = []
    if k.get("unterschrieben") == "nein" and soll.id in taxonomy.SIGNATUR_RELEVANT:
        maengel.append("nicht unterzeichnet")
    if k.get("vollstaendig") == "nein":
        maengel.append("unvollständig (fehlende Anlagen/Platzhalter)")
    if k.get("entwurf") == "ja":
        maengel.append("Entwurfsfassung")
    if float(k.get("konfidenz") or 0) < MIN_KONFIDENZ:
        maengel.append("Zuordnung unsicher — bitte manuell bestätigen")
    return maengel


def _status(soll: SollDokument, belege: list[Datei]) -> tuple[str, list[str]]:
    if not belege:
        return STATUS_FEHLT, []

    alle_maengel: list[str] = []
    sauber = False
    for datei in belege:
        maengel = _maengel_des_belegs(datei, soll)
        if maengel:
            alle_maengel.extend(f"{datei.name}: {m}" for m in maengel)
        else:
            sauber = True

    if sauber and not alle_maengel:
        return STATUS_VORHANDEN, []
    if sauber:
        return STATUS_VORHANDEN, alle_maengel
    return STATUS_TEILWEISE, alle_maengel


def analysiere(dateien: list[Datei], profil: str = "VC") -> Ergebnis:
    """Führt den vollständigen Soll-Ist-Abgleich durch."""
    katalog = taxonomy.katalog_fuer(profil)
    zuordnung: dict[str, list[Datei]] = {d.id: [] for d in katalog}

    nicht_zugeordnet: list[Datei] = []
    duplikate: list[Datei] = []
    altformate: list[Datei] = []
    red_flags: list[RedFlag] = []

    for datei in dateien:
        if datei.duplikat_von:
            duplikate.append(datei)
            continue
        if "Altformat" in (datei.hinweis or ""):
            altformate.append(datei)

        k = datei.klassifikation or {}
        ids = [i for i in (k.get("checklist_ids") or []) if i in zuordnung]
        for cid in ids:
            zuordnung[cid].append(datei)
        if not ids and datei.lesbar:
            nicht_zugeordnet.append(datei)

        ws = taxonomy.by_id(ids[0]).workstream if ids else "—"
        for f in k.get("red_flags") or []:
            red_flags.append(RedFlag(
                datei=datei.rel_pfad,
                schwere=f.get("schwere", "MITTEL"),
                thema=f.get("thema", ""),
                fundstelle=f.get("fundstelle", ""),
                hinweis=f.get("hinweis", ""),
                workstream=ws,
            ))

    befunde: list[Befund] = []
    for soll in katalog:
        belege = zuordnung[soll.id]
        status, maengel = _status(soll, belege)
        befunde.append(Befund(soll=soll, status=status, belege=belege, maengel=maengel))

    # Fehlende kritische Unterlagen sind selbst ein Red Flag
    for b in befunde:
        if b.status == STATUS_FEHLT and b.soll.prioritaet == PRIO_KRITISCH:
            red_flags.append(RedFlag(
                datei="—",
                schwere="HOCH",
                thema=f"Kritische Unterlage fehlt: {b.soll.titel}",
                fundstelle=b.soll.id,
                hinweis=b.soll.warum,
                workstream=b.soll.workstream,
            ))

    rang = {"HOCH": 0, "MITTEL": 1, "NIEDRIG": 2}
    red_flags.sort(key=lambda f: (rang.get(f.schwere, 3), f.workstream))

    return Ergebnis(
        profil=profil,
        befunde=befunde,
        red_flags=red_flags,
        nicht_zugeordnet=nicht_zugeordnet,
        duplikate=duplikate,
        altformate=altformate,
        kennzahlen=_kennzahlen(befunde),
        workstream_ampeln=_workstream_ampeln(befunde),
    )


def _kennzahlen(befunde: list[Befund]) -> dict:
    gewicht = sum(PRIO_GEWICHT[b.soll.prioritaet] for b in befunde) or 1
    erreicht = sum(PRIO_GEWICHT[b.soll.prioritaet] * STATUS_SCORE[b.status] for b in befunde)
    return {
        "bereitschaft_prozent": round(100 * erreicht / gewicht),
        "anzahl_soll": len(befunde),
        "vorhanden": sum(1 for b in befunde if b.status == STATUS_VORHANDEN),
        "teilweise": sum(1 for b in befunde if b.status == STATUS_TEILWEISE),
        "fehlt": sum(1 for b in befunde if b.status == STATUS_FEHLT),
        "kritisch_offen": sum(1 for b in befunde
                              if b.soll.prioritaet == PRIO_KRITISCH and b.status != STATUS_VORHANDEN),
        "hoch_offen": sum(1 for b in befunde
                          if b.soll.prioritaet == PRIO_HOCH and b.status != STATUS_VORHANDEN),
    }


def _workstream_ampeln(befunde: list[Befund]) -> dict[str, str]:
    ampeln: dict[str, str] = {}
    for ws in taxonomy.WORKSTREAMS:
        teil = [b for b in befunde if b.soll.workstream == ws]
        if not teil:
            continue
        if any(b.soll.prioritaet == PRIO_KRITISCH and b.status == STATUS_FEHLT for b in teil):
            ampeln[ws] = AMPEL_ROT
        elif any(b.status != STATUS_VORHANDEN for b in teil):
            ampeln[ws] = AMPEL_GELB
        else:
            ampeln[ws] = AMPEL_GRUEN
    return ampeln


# ---------------------------------------------------------------------------
# Information Request List (Nachforderungsliste)
# ---------------------------------------------------------------------------

def irl(ergebnis: Ergebnis) -> list[dict]:
    """Lückenliste in der Reihenfolge, in der das Start-up sie abarbeiten sollte."""
    reihenfolge = {PRIO_KRITISCH: 0, PRIO_HOCH: 1}
    eintraege: list[dict] = []

    for b in ergebnis.befunde:
        if b.status == STATUS_VORHANDEN and not b.maengel:
            continue
        if b.status == STATUS_FEHLT:
            aufgabe = f"{b.soll.titel} beschaffen und einstellen"
        elif b.status == STATUS_TEILWEISE:
            aufgabe = f"{b.soll.titel} vervollständigen (unterzeichnete Endfassung)"
        else:
            aufgabe = f"{b.soll.titel} — Mängel prüfen"
        eintraege.append({
            "id": b.soll.id,
            "workstream": taxonomy.workstream_name(b.soll.workstream),
            "titel": b.soll.titel,
            "prioritaet": b.soll.prioritaet,
            "status": b.status,
            "aufgabe": aufgabe,
            "warum": b.soll.warum,
            "rechtsgrundlage": b.soll.rechtsgrundlage,
            "maengel": "; ".join(b.maengel),
            "vorhandene_belege": b.belegliste,
            "pruefpunkte": " | ".join(b.soll.pruefpunkte),
        })

    eintraege.sort(key=lambda e: (reihenfolge.get(e["prioritaet"], 2),
                                  0 if e["status"] == STATUS_FEHLT else 1,
                                  e["id"]))
    return eintraege


# ---------------------------------------------------------------------------
# Datenraum-Struktur
# ---------------------------------------------------------------------------

def datenraum_plan(dateien: list[Datei], ergebnis: Ergebnis) -> list[dict]:
    """Vorschlag: Zielordner je Datei nach Workstream und Katalogposition."""
    plan: list[dict] = []
    for datei in dateien:
        if datei.duplikat_von:
            ziel = "99 Duplikate (nicht in den Datenraum)"
            pos = ""
        else:
            ids = (datei.klassifikation or {}).get("checklist_ids") or []
            soll = taxonomy.by_id(ids[0]) if ids else None
            if soll:
                ziel = f"{taxonomy.workstream_name(soll.workstream)}/{soll.id} {soll.titel}"
                pos = soll.id
            else:
                ziel = "98 Ungeklärt (vor Freigabe sichten)"
                pos = ""
        plan.append({
            "aktuell": datei.rel_pfad,
            "zielordner": ziel,
            "katalog_id": pos,
            "dateiname_vorschlag": _dateiname(datei, pos),
            "vertraulichkeit": (datei.klassifikation or {}).get("vertraulichkeit", "mittel"),
        })
    return plan


def _dateiname(datei: Datei, katalog_id: str) -> str:
    k = datei.klassifikation or {}
    titel = (k.get("titel_klar") or datei.pfad.stem).strip()
    titel = " ".join(titel.split())[:70]
    datum = (k.get("datum") or datei.geaendert or "").replace("/", "-")[:10]
    teile = [t for t in (datum, katalog_id, titel) if t]
    return " - ".join(teile) + datei.endung
