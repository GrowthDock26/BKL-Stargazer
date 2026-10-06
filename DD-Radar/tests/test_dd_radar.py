"""Tests für DD-Radar. Aufruf: python -m pytest -q  (im Projektverzeichnis)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import classifier          # noqa: E402
import gap_analysis        # noqa: E402
import scanner             # noqa: E402
import taxonomy            # noqa: E402
from api_client import MockClient, _parse_json, anonymisiere  # noqa: E402
from config import (       # noqa: E402
    STATUS_FEHLT,
    STATUS_TEILWEISE,
    STATUS_VORHANDEN,
    load_config,
    pruefe_endpunkt,
)


# ---------------------------------------------------------------------------
# Egress-Guard
# ---------------------------------------------------------------------------

def test_egress_guard_erlaubt_logicc():
    pruefe_endpunkt("https://api.logicc.io/v1")


@pytest.mark.parametrize("url", [
    "https://api.openai.com/v1",
    "https://api.anthropic.com/v1",
    "https://generativelanguage.googleapis.com/v1",
    "http://api.logicc.io.boese.example/v1",
])
def test_egress_guard_blockiert_fremde_hosts(url):
    with pytest.raises(RuntimeError):
        pruefe_endpunkt(url)


# ---------------------------------------------------------------------------
# Katalog
# ---------------------------------------------------------------------------

def test_katalog_ids_eindeutig():
    ids = [d.id for d in taxonomy.KATALOG]
    assert len(ids) == len(set(ids))


def test_katalog_workstreams_bekannt():
    for d in taxonomy.KATALOG:
        assert d.workstream in taxonomy.WORKSTREAMS


def test_profile_sind_teilmengen():
    seed = {d.id for d in taxonomy.katalog_fuer("SEED")}
    vc = {d.id for d in taxonomy.katalog_fuer("VC")}
    ma = {d.id for d in taxonomy.katalog_fuer("MA")}
    assert seed < vc < ma


def test_stichworttreffer_findet_gesellschaftsvertrag():
    treffer = dict(taxonomy.stichwort_treffer("Gesellschaftsvertrag der Muster GmbH"))
    assert "CORP-02" in treffer


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

def test_scanner_erkennt_duplikate_und_ueberspringt_temp(tmp_path: Path):
    (tmp_path / "a.txt").write_text("gleicher Inhalt", encoding="utf-8")
    (tmp_path / "unter").mkdir()
    (tmp_path / "unter" / "b.txt").write_text("gleicher Inhalt", encoding="utf-8")
    (tmp_path / "~$temp.docx").write_text("x", encoding="utf-8")
    (tmp_path / "Thumbs.db").write_text("x", encoding="utf-8")

    dateien = scanner.scanne(tmp_path)
    namen = {d.name for d in dateien}
    assert namen == {"a.txt", "b.txt"}
    assert sum(1 for d in dateien if d.duplikat_von) == 1

    stat = scanner.scan_statistik(dateien)
    assert stat["anzahl_gesamt"] == 2
    assert stat["anzahl_duplikate"] == 1


def test_scanner_markiert_altformate(tmp_path: Path):
    (tmp_path / "alt.doc").write_text("x", encoding="utf-8")
    datei = scanner.scanne(tmp_path)[0]
    assert not datei.lesbar
    assert "Altformat" in datei.hinweis


# ---------------------------------------------------------------------------
# Klassifikation
# ---------------------------------------------------------------------------

def _datei(tmp_path: Path, name: str, inhalt: str) -> scanner.Datei:
    (tmp_path / name).write_text(inhalt, encoding="utf-8")
    return next(d for d in scanner.scanne(tmp_path) if d.name == name)


def test_bereinige_verwirft_unbekannte_ids():
    roh = {"checklist_ids": ["CORP-02", "GIBT-ES-NICHT"], "konfidenz": 5,
           "unterschrieben": "vielleicht", "red_flags": [{"thema": "X", "schwere": "extrem"}]}
    sauber = classifier._bereinige(roh, "VC")
    assert sauber["checklist_ids"] == ["CORP-02"]
    assert sauber["konfidenz"] == 1.0
    assert sauber["unterschrieben"] == "unklar"
    assert sauber["red_flags"][0]["schwere"] == "MITTEL"


def test_offline_klassifikation_ohne_client(tmp_path: Path):
    datei = _datei(tmp_path, "satzung.txt", "Gesellschaftsvertrag der Muster GmbH, Stammkapital")
    cache = classifier.Cache(tmp_path / ".dd-radar", "VC")
    ergebnis = classifier.klassifiziere_datei(datei, None, "VC", cache,
                                              use_vision=False, offline=True)
    assert "CORP-02" in ergebnis["checklist_ids"]
    assert ergebnis["quelle_zuordnung"] == "stichwort"


def test_cache_verhindert_zweiten_api_aufruf(tmp_path: Path):
    datei = _datei(tmp_path, "hr.txt", "Arbeitsvertrag zwischen der Gesellschaft und …")
    client = MockClient({datei.rel_pfad: {"checklist_ids": ["HR-02"], "konfidenz": 0.9,
                                          "unterschrieben": "ja", "vollstaendig": "ja"}})
    cache = classifier.Cache(tmp_path / ".dd-radar", "VC")

    erst = classifier.klassifiziere_datei(datei, client, "VC", cache, True, False)
    zweit = classifier.klassifiziere_datei(datei, client, "VC", cache, True, False)

    assert erst["checklist_ids"] == ["HR-02"]
    assert zweit["checklist_ids"] == ["HR-02"]
    assert len(client.aufrufe) == 1


def test_parse_json_entfernt_markdown_zaeune():
    assert _parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _parse_json('Text davor {"a": 2} danach') == {"a": 2}
    assert _parse_json("kein json") == {}


def test_anonymisierung():
    text = "Kontakt: max@muster.de, IBAN DE89 3704 0044 0532 0130 00"
    aus = anonymisiere(text)
    assert "max@muster.de" not in aus and "[E-MAIL]" in aus
    assert "[IBAN]" in aus


# ---------------------------------------------------------------------------
# Gap-Analyse
# ---------------------------------------------------------------------------

def _mit_klassifikation(tmp_path: Path, name: str, **klass) -> scanner.Datei:
    # Inhalt je Datei verschieden, sonst greift die Duplikaterkennung
    datei = _datei(tmp_path, name, f"Inhalt von {name}")
    basis = dict(classifier.LEERE_KLASSIFIKATION)
    basis.update({"konfidenz": 0.9, "unterschrieben": "ja", "vollstaendig": "ja"})
    basis.update(klass)
    datei.klassifikation = basis
    return datei


def test_status_vorhanden_teilweise_fehlt(tmp_path: Path):
    gut = _mit_klassifikation(tmp_path, "satzung.txt", checklist_ids=["CORP-02"])
    entwurf = _mit_klassifikation(tmp_path, "sha.txt", checklist_ids=["CORP-05"],
                                  unterschrieben="nein")
    erg = gap_analysis.analysiere([gut, entwurf], "VC")

    nach_id = {b.soll.id: b for b in erg.befunde}
    assert nach_id["CORP-02"].status == STATUS_VORHANDEN
    assert nach_id["CORP-05"].status == STATUS_TEILWEISE
    assert "nicht unterzeichnet" in nach_id["CORP-05"].maengel[0]
    assert nach_id["CORP-01"].status == STATUS_FEHLT


def test_fehlende_unterschrift_nur_wo_relevant(tmp_path: Path):
    # Registerauszug trägt keine Unterschrift — das darf kein Mangel sein
    auszug = _mit_klassifikation(tmp_path, "hrb.txt", checklist_ids=["CORP-01"],
                                 unterschrieben="nein")
    vertrag = _mit_klassifikation(tmp_path, "gv.txt", checklist_ids=["CORP-02"],
                                  unterschrieben="nein")
    nach_id = {b.soll.id: b for b in gap_analysis.analysiere([auszug, vertrag], "VC").befunde}
    assert nach_id["CORP-01"].status == STATUS_VORHANDEN
    assert nach_id["CORP-01"].maengel == []
    assert nach_id["CORP-02"].status == STATUS_TEILWEISE


def test_fehlende_kritische_position_erzeugt_red_flag(tmp_path: Path):
    erg = gap_analysis.analysiere([_mit_klassifikation(tmp_path, "x.txt")], "SEED")
    themen = [f.thema for f in erg.red_flags]
    assert any("Kritische Unterlage fehlt" in t for t in themen)
    assert erg.kennzahlen["bereitschaft_prozent"] == 0


def test_bereitschaftsgrad_steigt_mit_belegen(tmp_path: Path):
    leer = gap_analysis.analysiere([_mit_klassifikation(tmp_path, "leer.txt")], "SEED")
    voll = gap_analysis.analysiere(
        [_mit_klassifikation(tmp_path, f"d{i}.txt", checklist_ids=[d.id])
         for i, d in enumerate(taxonomy.katalog_fuer("SEED"))], "SEED")
    assert leer.kennzahlen["bereitschaft_prozent"] == 0
    assert voll.kennzahlen["bereitschaft_prozent"] == 100
    assert voll.kennzahlen["kritisch_offen"] == 0


def test_irl_sortiert_kritisches_nach_oben(tmp_path: Path):
    erg = gap_analysis.analysiere([_mit_klassifikation(tmp_path, "x.txt")], "VC")
    liste = gap_analysis.irl(erg)
    assert liste[0]["prioritaet"] == "KRITISCH"
    assert all(e["status"] != STATUS_VORHANDEN or e["maengel"] for e in liste)


def test_datenraum_plan_ordnet_zu(tmp_path: Path):
    datei = _mit_klassifikation(tmp_path, "satzung.txt", checklist_ids=["CORP-02"],
                                titel_klar="Satzung Muster GmbH", datum="2025-04-01")
    erg = gap_analysis.analysiere([datei], "VC")
    plan = gap_analysis.datenraum_plan([datei], erg)[0]
    assert plan["katalog_id"] == "CORP-02"
    assert plan["zielordner"].startswith("01 Gesellschaftsrecht")
    assert plan["dateiname_vorschlag"].startswith("2025-04-01 - CORP-02 - Satzung")


# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------

def test_load_config_overrides():
    cfg = load_config({"profil": "ma", "offline_mode": "1", "max_docs": "5"})
    assert cfg["profil"] == "MA"
    assert cfg["offline"] is True
    assert cfg["max_docs"] == 5


# ---------------------------------------------------------------------------
# Gesamtlauf
# ---------------------------------------------------------------------------

def test_gesamtlauf_offline_erzeugt_berichte(tmp_path: Path):
    import dd_radar

    daten = tmp_path / "datenraum"
    daten.mkdir()
    (daten / "Gesellschaftsvertrag.txt").write_text(
        "Gesellschaftsvertrag der Muster GmbH mit Stammkapital", encoding="utf-8")
    (daten / "Cap Table.txt").write_text(
        "Cap Table fully diluted Beteiligungsstruktur", encoding="utf-8")

    cfg = load_config({"offline_mode": "1", "profil": "SEED"})
    ergebnis = dd_radar.analysiere_verzeichnis(daten, cfg, mandant="Muster GmbH",
                                               ausgabe=tmp_path / "out")

    for schluessel in ("excel", "docx", "html", "json"):
        assert ergebnis["pfade"][schluessel].exists()

    roh = json.loads(ergebnis["pfade"]["json"].read_text(encoding="utf-8"))
    assert roh["kennzahlen"]["anzahl_soll"] == len(taxonomy.katalog_fuer("SEED"))

    # Offline-Zuordnung ist bewusst nur ein Indiz: nie VORHANDEN, immer TEILWEISE
    nach_id = {b["id"]: b for b in roh["befunde"]}
    assert nach_id["CORP-02"]["status"] == STATUS_TEILWEISE
    assert nach_id["CORP-04"]["status"] == STATUS_TEILWEISE
    assert all(b["status"] != STATUS_VORHANDEN for b in roh["befunde"])
