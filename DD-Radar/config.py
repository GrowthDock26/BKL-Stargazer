"""Konfiguration: lädt .env-Datei und definiert Konstanten.

Aufbau bewusst analog zum Bescheidprüfer-Projekt (gleiche Kanzlei-Konventionen).
Einziger zugelassener KI-Endpunkt ist LOGICC (api.logicc.io) — vgl.
BKL Legal OS, SETUP-UND-OFFENE-PUNKTE.md Abschnitt 6 (Egress-Guard).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Endpunkt / Modelle
# ---------------------------------------------------------------------------

DEFAULT_API_ENDPOINT: str = "https://api.logicc.io/v1"
ALLOWED_API_HOSTS: tuple[str, ...] = ("api.logicc.io",)

DEFAULT_MODEL: str = "gemini-2.5-flash"      # Klassifikation (Text)
DEFAULT_VISION_MODEL: str = "gpt-4o"         # Fallback für gescannte PDFs/Bilder

# ---------------------------------------------------------------------------
# Kostenbremse / Robustheit
# ---------------------------------------------------------------------------

MAX_CHARS_PER_DOC: int = 14_000     # Textbudget je Dokument an die KI
HEAD_CHARS: int = 10_000            # davon Anfang …
TAIL_CHARS: int = 3_000             # … und Ende (Unterschriftenseite!)
MAX_VISION_PAGES: int = 3           # gescannte PDFs: nur erste N Seiten an Vision
VISION_DPI: int = 150               # 150 dpi reicht zur Typ-Erkennung (300 dpi ≈ 4× Kosten)
MAX_RETRIES: int = 5                # Retries bei HTTP 429 (LOGICC ratelimitet häufig)
RETRY_BASE_SLEEP: float = 8.0       # Sekunden, exponentiell
REQUEST_TIMEOUT: int = 180

# Dateien, die nie analysiert werden
SKIP_NAMES: frozenset[str] = frozenset({
    "thumbs.db", "desktop.ini", ".ds_store", "icon\r",
})
SKIP_PREFIXES: tuple[str, ...] = ("~$", ".~lock.")
SKIP_DIRS: frozenset[str] = frozenset({
    ".git", ".svn", "__pycache__", "node_modules", ".venv", "venv",
    ".idea", ".vscode", "$recycle.bin", "system volume information",
    ".dd-radar",
})

# Dateiendungen, aus denen Text gewonnen werden kann
TEXT_EXTS: frozenset[str] = frozenset({".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm"})
PDF_EXTS: frozenset[str] = frozenset({".pdf"})
DOCX_EXTS: frozenset[str] = frozenset({".docx", ".dotx"})
XLSX_EXTS: frozenset[str] = frozenset({".xlsx", ".xlsm", ".xltx"})
IMAGE_EXTS: frozenset[str] = frozenset({".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"})
LEGACY_EXTS: frozenset[str] = frozenset({".doc", ".xls", ".ppt", ".rtf", ".pptx", ".msg", ".eml"})

ANALYSABLE_EXTS: frozenset[str] = (
    TEXT_EXTS | PDF_EXTS | DOCX_EXTS | XLSX_EXTS | IMAGE_EXTS
)

MAX_FILE_MB: int = 60               # größere Dateien: nur Metadaten, kein Volltext

# ---------------------------------------------------------------------------
# Ampel-Logik
# ---------------------------------------------------------------------------

PRIO_KRITISCH = "KRITISCH"
PRIO_HOCH = "HOCH"
PRIO_MITTEL = "MITTEL"

PRIO_GEWICHT: dict[str, int] = {PRIO_KRITISCH: 5, PRIO_HOCH: 3, PRIO_MITTEL: 1}

STATUS_VORHANDEN = "VORHANDEN"
STATUS_TEILWEISE = "TEILWEISE"
STATUS_FEHLT = "FEHLT"

STATUS_SCORE: dict[str, float] = {
    STATUS_VORHANDEN: 1.0,
    STATUS_TEILWEISE: 0.5,
    STATUS_FEHLT: 0.0,
}

AMPEL_GRUEN = "GRÜN"
AMPEL_GELB = "GELB"
AMPEL_ROT = "ROT"

# Arbeitsverzeichnis für Cache/Protokoll (im gescannten Verzeichnis)
WORKDIR_NAME: str = ".dd-radar"


def load_config(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    """Liest .env aus dem Programmverzeichnis und liefert die Laufzeitkonfiguration.

    Gelesene Variablen:
        LOGICC_API_KEY / API_KEY   – API-Schlüssel (Pflicht außer im Mock-/Offline-Modus)
        API_ENDPOINT               – Default: https://api.logicc.io/v1
        MODEL                      – Default: gemini-2.5-flash
        VISION_MODEL               – Default: gpt-4o
        USE_MOCK                   – "1": keine echten API-Calls (Tests)
        OFFLINE_MODE               – "1": rein deterministische Analyse ohne KI
        USE_VISION                 – "1": gescannte PDFs per Vision auswerten (Default: 1)
        ANONYMISIEREN              – "1": E-Mail/IBAN/Telefon vor Versand maskieren
        MAX_DOCS                   – Obergrenze analysierter Dokumente (0 = alle)
        PROFIL                     – VC | MA | SEED
    """
    _load_dotenv()
    o = overrides or {}

    def _env(key: str, default: str = "") -> str:
        return str(o.get(key.lower(), os.environ.get(key, default))).strip()

    cfg: dict[str, Any] = {
        "api_key":      _env("LOGICC_API_KEY") or _env("API_KEY"),
        "api_endpoint": _env("API_ENDPOINT", DEFAULT_API_ENDPOINT).rstrip("/"),
        "model":        _env("MODEL", DEFAULT_MODEL),
        "vision_model": _env("VISION_MODEL", DEFAULT_VISION_MODEL),
        "use_mock":     _env("USE_MOCK", "0") == "1",
        "offline":      _env("OFFLINE_MODE", "0") == "1",
        "use_vision":   _env("USE_VISION", "1") == "1",
        "anonymisieren": _env("ANONYMISIEREN", "0") == "1",
        "max_docs":     int(_env("MAX_DOCS", "0") or 0),
        "profil":       _env("PROFIL", "VC").upper(),
    }
    return cfg


def pruefe_endpunkt(endpoint: str) -> None:
    """Egress-Guard: bricht ab, wenn ein anderer Host als LOGICC konfiguriert ist.

    Entspricht `egress-guard.ts` im BKL Legal OS: Mandanten-/Unternehmensdaten
    dürfen ausschließlich an den vertraglich gebundenen Anbieter fließen
    (§ 43e BRAO, Art. 28 DSGVO).
    """
    from urllib.parse import urlparse

    host = (urlparse(endpoint).hostname or "").lower()
    if host not in ALLOWED_API_HOSTS:
        raise RuntimeError(
            f"Unzulässiger KI-Endpunkt: {endpoint!r}. "
            f"Erlaubt ist ausschließlich: {', '.join(ALLOWED_API_HOSTS)}. "
            "Grund: Auftragsverarbeitung/Verschwiegenheit (§ 43e BRAO, Art. 28 DSGVO)."
        )


def _load_dotenv() -> None:
    """Liest eine .env-Datei im selben Verzeichnis wie dieses Modul."""
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    with env_path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
