# Inkasso Claim Gate

`inkasso_claim_gate.py` ist ein kleiner formaler Prüfer für Forderungsakten. Er liest eine JSON-Datei mit einzelnen Forderungspositionen und gibt je Position eine Ampel aus:

- `GRÜN`: kann in den Klageantrag, wenn Gerichtsort und Belege bestätigt sind.
- `GELB`: nur nach anwaltlicher Freigabe, Rückfrage oder Vergleichsvorschlag.
- `ROT`: nicht einklagen.

Beispiel:

```bash
python scripts/inkasso_claim_gate.py \
  --input testakten/inkasso-zahlungsklage-modefuchs/08_claim_gate_input.json \
  --output testakten/inkasso-zahlungsklage-modefuchs/09_claim_gate_output.json
```

Das Werkzeug ersetzt keine materiell-rechtliche Prüfung. Es verhindert nur, dass erfüllte oder nicht belegte Positionen ungeprüft in eine Klage übernommen werden.
