#!/usr/bin/env python3
"""Formal claim gate for inkasso payment-claim files.

The script is intentionally conservative. It does not decide German law; it
flags positions that should not be copied into a statement of claim without a
human release.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any


MONEY = Decimal("0.01")


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


def money(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0.00")
    return Decimal(str(value)).quantize(MONEY, rounding=ROUND_HALF_UP)


@dataclass
class Decision:
    status: str
    recommendation: str
    reasons: list[str]


def decide_claim(claim: dict[str, Any], filing_date: date | None) -> Decision:
    amount = money(claim.get("amount"))
    paid_amount = money(claim.get("paid_amount"))
    paid_date = parse_date(claim.get("paid_date"))
    payment_known_date = parse_date(claim.get("payment_known_date"))
    evidence = claim.get("evidence", [])
    kind = claim.get("kind", "other")
    reasons: list[str] = []

    if amount <= 0:
        return Decision("ROT", "Nicht einklagen.", ["Betrag fehlt oder ist nicht positiv."])

    if kind == "main" and paid_amount >= amount and paid_date:
        if not filing_date or paid_date <= filing_date:
            reasons.append("Hauptforderung war vor Klageeinreichung vollständig erfüllt.")
            if payment_known_date and filing_date and payment_known_date <= filing_date:
                reasons.append("Zahlung war vor Klageeinreichung aktenkundig.")
            return Decision("ROT", "Nicht einklagen; allenfalls Kosten- und Zinsfolgen prüfen.", reasons)

    if not evidence:
        reasons.append("Beleg fehlt.")

    if kind in {"dunning_cost", "interest", "collection_cost", "procedural_cost"}:
        if not claim.get("default_basis"):
            reasons.append("Verzugseintritt oder Erstattungsgrund nicht belegt.")
        if claim.get("access_proven") is False:
            reasons.append("Zugang der Mahnung oder Zahlungsaufforderung ist streitig oder ungeklärt.")
        if claim.get("fault_dispute"):
            reasons.append("Schuldner bestreitet Verschulden oder rechtzeitige Kenntnis.")
        if claim.get("proportionality_risk"):
            reasons.append("Eigenständige Klage über Nebenforderungen kann wirtschaftlich/prozessual unverhältnismäßig sein.")
        if reasons:
            return Decision("GELB", "Nur nach anwaltlicher Freigabe oder Vergleichsvorschlag.", reasons)
        return Decision("GRÜN", "Klagefähig, wenn Gerichtsort und Belege bestätigt sind.", ["Nebenforderung ist formal vollständig belegt."])

    if reasons:
        return Decision("GELB", "Vor Klage Belege nachfordern.", reasons)

    return Decision("GRÜN", "Klagefähig, wenn Gerichtsort bestätigt ist.", ["Anspruch ist formal vollständig."])


def build_report(data: dict[str, Any]) -> dict[str, Any]:
    filing_date = parse_date(data.get("filing_date"))
    rows = []
    totals = {"GRÜN": Decimal("0.00"), "GELB": Decimal("0.00"), "ROT": Decimal("0.00")}

    for claim in data.get("claims", []):
        decision = decide_claim(claim, filing_date)
        amount = money(claim.get("amount"))
        totals[decision.status] += amount
        rows.append(
            {
                "id": claim.get("id"),
                "label": claim.get("label"),
                "kind": claim.get("kind"),
                "amount": f"{amount:.2f}",
                "status": decision.status,
                "recommendation": decision.recommendation,
                "reasons": decision.reasons,
            }
        )

    return {
        "case_name": data.get("case_name"),
        "filing_date": data.get("filing_date"),
        "court_check": data.get("court_check", {}),
        "summary": {key: f"{value.quantize(MONEY):.2f}" for key, value in totals.items()},
        "claims": rows,
        "global_recommendation": global_recommendation(rows),
    }


def global_recommendation(rows: list[dict[str, Any]]) -> str:
    green = [row for row in rows if row["status"] == "GRÜN"]
    yellow = [row for row in rows if row["status"] == "GELB"]
    red = [row for row in rows if row["status"] == "ROT"]
    if red and not green and yellow:
        return "Keine Klage über rote Positionen. Gelbe Nebenforderungen nur nach Freigabe; Vergleich/Nichtklage prüfen."
    if green and not yellow and not red:
        return "Klageentwurf kann für grüne Positionen vorbereitet werden."
    if green:
        return "Klage nur für grüne Positionen; gelbe Positionen vorher klären; rote Positionen streichen."
    return "Keine Position ist ohne weitere Klärung klagefähig."


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    data = json.loads(args.input.read_text(encoding="utf-8"))
    report = build_report(data)
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
