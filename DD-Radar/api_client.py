"""LOGICC-Client (OpenAI-kompatibel) mit Egress-Guard, Retry, Audit-Log und Mock.

Nur `api.logicc.io` ist zugelassen (vgl. `config.pruefe_endpunkt`). Der Client
protokolliert jeden Aufruf revisionssicher in `.dd-radar/audit-log.jsonl` —
Nachweis der sorgfältigen Dienstleisterauswahl und -überwachung nach
§ 43e Abs. 2–5 BRAO bzw. Art. 28 Abs. 3 lit. h DSGVO.
"""

from __future__ import annotations

import json
import logging
import re
import time
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Any

from config import (
    MAX_RETRIES,
    REQUEST_TIMEOUT,
    RETRY_BASE_SLEEP,
    pruefe_endpunkt,
)

logger = logging.getLogger(__name__)


class ApiFehler(RuntimeError):
    """Fehler beim Aufruf des KI-Endpunkts."""


# ---------------------------------------------------------------------------
# Anonymisierung (optional, vor Versand)
# ---------------------------------------------------------------------------

_RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]{2,}")
_RE_IBAN = re.compile(r"\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){2,7}[A-Z0-9]{1,4}\b")
_RE_TEL = re.compile(r"(?<!\d)(?:\+\d{2}[ /-]?)?(?:\(?0\d{2,5}\)?[ /-]?)\d{3,}(?:[ -]?\d{2,})+")


def anonymisiere(text: str) -> str:
    """Maskiert Kontaktdaten und Bankverbindungen vor dem Versand an die KI."""
    text = _RE_EMAIL.sub("[E-MAIL]", text)
    text = _RE_IBAN.sub("[IBAN]", text)
    text = _RE_TEL.sub("[TELEFON]", text)
    return text


# ---------------------------------------------------------------------------
# Basisklasse
# ---------------------------------------------------------------------------

class BaseClient(ABC):
    """Gemeinsame Schnittstelle von Real- und Mock-Client."""

    @abstractmethod
    def json_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        bilder_b64: list[str] | None = None,
        max_tokens: int = 1800,
        kontext: str = "",
    ) -> dict[str, Any]:
        """Liefert die Antwort des Modells als JSON-Objekt."""


# ---------------------------------------------------------------------------
# Audit-Log
# ---------------------------------------------------------------------------

class AuditLog:
    def __init__(self, workdir: Path) -> None:
        self.pfad = workdir / "audit-log.jsonl"
        self.pfad.parent.mkdir(parents=True, exist_ok=True)

    def schreibe(self, eintrag: dict[str, Any]) -> None:
        eintrag = {"zeit": datetime.now().isoformat(timespec="seconds"), **eintrag}
        try:
            with self.pfad.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(eintrag, ensure_ascii=False) + "\n")
        except OSError as exc:      # Protokollfehler darf den Lauf nicht abbrechen
            logger.warning("Audit-Log nicht schreibbar: %s", exc)


# ---------------------------------------------------------------------------
# RealClient
# ---------------------------------------------------------------------------

class RealClient(BaseClient):
    """Spricht die LOGICC Chat-Completions-API (OpenAI-kompatibel) an."""

    def __init__(self, config: dict[str, Any], audit: AuditLog | None = None) -> None:
        endpoint = config["api_endpoint"]
        pruefe_endpunkt(endpoint)
        if not config.get("api_key"):
            raise ApiFehler(
                "Kein API-Schlüssel gesetzt. Bitte LOGICC_API_KEY in der .env eintragen "
                "(oder mit --offline bzw. USE_MOCK=1 ohne KI arbeiten)."
            )
        self.url = f"{endpoint}/chat/completions"
        self.key = config["api_key"]
        self.model = config["model"]
        self.vision_model = config["vision_model"]
        self.anonymisieren = bool(config.get("anonymisieren"))
        self.audit = audit

    # -- öffentliche API ----------------------------------------------------

    def json_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        bilder_b64: list[str] | None = None,
        max_tokens: int = 1800,
        kontext: str = "",
    ) -> dict[str, Any]:
        if self.anonymisieren:
            user_prompt = anonymisiere(user_prompt)

        model = self.vision_model if bilder_b64 else self.model
        inhalt: Any = user_prompt
        if bilder_b64:
            inhalt = [{"type": "text", "text": user_prompt}] + [
                {"type": "image_url",
                 "image_url": {"url": f"data:image/png;base64,{b}", "detail": "high"}}
                for b in bilder_b64
            ]

        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": inhalt},
            ],
            "max_tokens": max_tokens,
            "stream": True,                       # LOGICC liefert bei Gemini ohne Stream leeren Text
            "response_format": {"type": "json_object"},
        }

        start = time.time()
        roh = self._post_stream(body, kontext=kontext, model=model,
                                zeichen=len(user_prompt), bilder=len(bilder_b64 or []))
        daten = _parse_json(roh)

        if self.audit:
            self.audit.schreibe({
                "aktion": "klassifikation",
                "modell": model,
                "dokument": kontext,
                "zeichen_gesendet": len(user_prompt),
                "bilder_gesendet": len(bilder_b64 or []),
                "anonymisiert": self.anonymisieren,
                "dauer_s": round(time.time() - start, 1),
                "ergebnis": "ok" if daten else "leer",
            })
        return daten

    # -- intern -------------------------------------------------------------

    def _post_stream(self, body: dict, kontext: str, model: str,
                     zeichen: int, bilder: int) -> str:
        daten = json.dumps(body, ensure_ascii=False).encode("utf-8")
        letzter_fehler: Exception | None = None

        for versuch in range(1, MAX_RETRIES + 1):
            req = urllib.request.Request(
                self.url,
                data=daten,
                headers={
                    "Authorization": f"Bearer {self.key}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                    return _lies_sse(resp)
            except urllib.error.HTTPError as exc:
                text = exc.read().decode("utf-8", "replace")[:400]
                letzter_fehler = ApiFehler(f"HTTP {exc.code}: {text}")
                if exc.code == 429 or 500 <= exc.code < 600:
                    wartezeit = RETRY_BASE_SLEEP * (2 ** (versuch - 1))
                    logger.warning("LOGICC %s (%s) — Versuch %d/%d, warte %.0fs",
                                   exc.code, kontext, versuch, MAX_RETRIES, wartezeit)
                    time.sleep(wartezeit)
                    continue
                if exc.code == 400 and "budget" in text.lower():
                    raise ApiFehler(
                        "LOGICC-Budget erschöpft (HTTP 400 budget_exceeded). "
                        "Lauf abgebrochen, bereits klassifizierte Dokumente bleiben im Cache."
                    ) from exc
                raise letzter_fehler from exc
            except (urllib.error.URLError, TimeoutError) as exc:
                letzter_fehler = ApiFehler(f"Netzwerkfehler: {exc}")
                time.sleep(RETRY_BASE_SLEEP * versuch)

        raise letzter_fehler or ApiFehler("Unbekannter API-Fehler")


def _lies_sse(resp) -> str:
    """Sammelt den Text eines SSE-Streams (OpenAI-Format)."""
    stuecke: list[str] = []
    for rohzeile in resp:
        zeile = rohzeile.decode("utf-8", "replace").strip()
        if not zeile.startswith("data:"):
            continue
        nutz = zeile[5:].strip()
        if not nutz or nutz == "[DONE]":
            continue
        try:
            ev = json.loads(nutz)
        except json.JSONDecodeError:
            continue
        delta = (ev.get("choices") or [{}])[0].get("delta") or {}
        inhalt = delta.get("content")
        if isinstance(inhalt, str):
            stuecke.append(inhalt)
    return "".join(stuecke)


def _parse_json(roh: str) -> dict[str, Any]:
    """Robustes JSON-Parsing (entfernt Markdown-Zäune, sucht äußeres Objekt)."""
    if not roh:
        return {}
    text = roh.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    try:
        wert = json.loads(text)
        return wert if isinstance(wert, dict) else {"ergebnis": wert}
    except json.JSONDecodeError:
        pass
    start, ende = text.find("{"), text.rfind("}")
    if 0 <= start < ende:
        try:
            wert = json.loads(text[start:ende + 1])
            return wert if isinstance(wert, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


# ---------------------------------------------------------------------------
# MockClient
# ---------------------------------------------------------------------------

class MockClient(BaseClient):
    """Liefert deterministische Antworten ohne Netzwerkzugriff (Tests, Demo)."""

    def __init__(self, fixture: dict[str, Any] | None = None) -> None:
        self.fixture = fixture or {}
        self.aufrufe: list[str] = []

    def json_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        bilder_b64: list[str] | None = None,
        max_tokens: int = 1800,
        kontext: str = "",
    ) -> dict[str, Any]:
        self.aufrufe.append(kontext)
        if kontext in self.fixture:
            return self.fixture[kontext]
        return {
            "dokumenttyp": "Mock-Dokument",
            "checklist_ids": [],
            "titel_klar": Path(kontext).stem if kontext else "Mock",
            "parteien": [],
            "datum": "",
            "unterschrieben": "unklar",
            "vollstaendig": "unklar",
            "kernaussagen": ["Mock-Modus: keine echte KI-Analyse"],
            "red_flags": [],
            "konfidenz": 0.0,
            "begruendung": "MockClient",
        }


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_client(config: dict[str, Any], workdir: Path) -> BaseClient:
    """Erzeugt den passenden Client gemäß Konfiguration."""
    if config.get("use_mock"):
        fixture: dict[str, Any] = {}
        pfad = config.get("mock_fixture_path")
        if pfad and Path(pfad).exists():
            fixture = json.loads(Path(pfad).read_text(encoding="utf-8"))
        logger.info("MockClient aktiv — keine echten API-Aufrufe.")
        return MockClient(fixture)
    return RealClient(config, AuditLog(workdir))
