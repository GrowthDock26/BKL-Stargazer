#!/usr/bin/env python3
"""Small JVEG witness-compensation calculator for plugin-internal sanity checks.
Input: JSON on stdin or --input file. Output: JSON with components.
This helper does not replace legal review; it records assumptions explicitly.
"""
import argparse
import json
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")

def money(x):
    return str(Decimal(x).quantize(CENT, rounding=ROUND_HALF_UP))

def dec(data, key, default="0"):
    return Decimal(str(data.get(key, default)))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    args = parser.parse_args()
    raw = open(args.input, encoding="utf-8").read() if args.input else __import__("sys").stdin.read()
    data = json.loads(raw or "{}")
    role = data.get("role", "zeuge")
    km_rate = dec(data, "km_rate", "0.35" if role == "zeuge" else "0.42")
    km_total = dec(data, "km_total", "0")
    fahrtkosten = km_total * km_rate
    nights = dec(data, "overnight_nights", "0")
    overnight_claimed = dec(data, "overnight_claimed_total", "0")
    overnight_cap_per_night = data.get("overnight_cap_per_night")
    if overnight_cap_per_night is not None:
        overnight_allowed = min(overnight_claimed, nights * Decimal(str(overnight_cap_per_night)))
    else:
        overnight_allowed = overnight_claimed
    days = dec(data, "days", "1")
    max_hours = days * Decimal("10")
    hours = min(dec(data, "hours", "0"), max_hours)
    verdienst_hourly = min(dec(data, "verdienstausfall_hourly", "0"), Decimal("25"))
    claim_type = data.get("claim_type", "verdienstausfall")
    verdienst = hours * verdienst_hourly if claim_type == "verdienstausfall" else Decimal("0")
    haushalt = hours * Decimal("17") if claim_type == "haushalt" else Decimal("0")
    zeit = hours * Decimal("4") if claim_type == "zeit" else Decimal("0")
    sonstige = dec(data, "other_allowed", "0")
    total = fahrtkosten + overnight_allowed + verdienst + haushalt + zeit + sonstige
    print(json.dumps({
        "assumptions": data,
        "components": {
            "fahrtkosten": money(fahrtkosten),
            "uebernachtung_allowed": money(overnight_allowed),
            "verdienstausfall": money(verdienst),
            "haushaltsfuehrung": money(haushalt),
            "zeitversaeumnis": money(zeit),
            "sonstige": money(sonstige)
        },
        "total": money(total),
        "warnings": [
            "Gesetzesstand und Belege vor produktiver Verwendung prüfen.",
            "Verdienstausfall nach § 22 JVEG verlangt belastbare Unterlagen und ist auf 25 EUR/h begrenzt.",
            "Stundenbezogene Zeugenentschädigung grundsätzlich höchstens 10 Stunden je Tag."
        ]
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
