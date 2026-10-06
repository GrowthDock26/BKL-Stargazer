/**
 * Deterministische Insolvenzprüfung: §§ 17, 18, 19 InsO.
 *
 * Alle Berechnungen laufen serverseitig — KEIN LLM. Das LLM erläutert
 * nur die Ergebnisse dieser Funktionen.
 *
 * WICHTIG: Die Ergebnisse sind ein technisches Hilfsmittel. Die
 * Fortbestehensprognose und Überschuldungsprüfung erfordern zwingend
 * eine anwaltliche / betriebswirtschaftliche Überprüfung.
 */

// ---------------------------------------------------------------------------
// § 17 InsO — Zahlungsunfähigkeit
// ---------------------------------------------------------------------------

export type ZahlungsunfaehigkeitInput = {
    /** Fällige Verbindlichkeiten gesamt (€) */
    faelligeVerbindlichkeiten: number;
    /** Liquiditätsmittel sofort verfügbar (€) */
    liquideMittelSofort: number;
    /** Voraussichtlich innerhalb von 3 Wochen eingehende Mittel (€) */
    liquideMittelDreiWochen: number;
};

export type ZahlungsunfaehigkeitResult = {
    zahlungsunfaehig: boolean;
    drohendZahlungsunfaehig: boolean;
    deckungsquote: number;  // Anteil der sofort deckbaren Verbindlichkeiten
    berechnung: string;
    hinweis: string;
};

/**
 * Prüft Zahlungsunfähigkeit nach § 17 InsO.
 *
 * BGH-Standard: Liquiditätslücke > 10 % der fälligen Verbindlichkeiten
 * und nicht nur vorübergehend → Zahlungsunfähigkeit.
 * Drohende Zahlungsunfähigkeit (§ 18 InsO): Mittel der nächsten 3 Wochen
 * decken die Verbindlichkeiten nicht.
 */
export function pruefeZahlungsunfaehigkeit(
    input: ZahlungsunfaehigkeitInput,
): ZahlungsunfaehigkeitResult {
    const { faelligeVerbindlichkeiten, liquideMittelSofort, liquideMittelDreiWochen } = input;

    if (faelligeVerbindlichkeiten <= 0) {
        return {
            zahlungsunfaehig: false,
            drohendZahlungsunfaehig: false,
            deckungsquote: 1,
            berechnung: "Keine fälligen Verbindlichkeiten → keine Zahlungsunfähigkeit.",
            hinweis: "Anwaltliche Überprüfung empfohlen.",
        };
    }

    const deckungsquoteSofort = liquideMittelSofort / faelligeVerbindlichkeiten;
    const deckungsquote3W =
        (liquideMittelSofort + liquideMittelDreiWochen) / faelligeVerbindlichkeiten;

    // BGH, Urt. v. 24.05.2005 – Az. IX ZR 123/04: Lücke > 10 % = zahlungsunfähig
    const lueckeSofort = 1 - deckungsquoteSofort;
    const zahlungsunfaehig = lueckeSofort > 0.1;
    const drohendZahlungsunfaehig = deckungsquote3W < 1 && !zahlungsunfaehig;

    return {
        zahlungsunfaehig,
        drohendZahlungsunfaehig,
        deckungsquote: deckungsquoteSofort,
        berechnung:
            `Fällige Verbindlichkeiten: ${faelligeVerbindlichkeiten.toLocaleString("de-DE")} €\n` +
            `Liquide Mittel sofort:      ${liquideMittelSofort.toLocaleString("de-DE")} €\n` +
            `Deckungsquote sofort:       ${(deckungsquoteSofort * 100).toFixed(2)} %\n` +
            `Liquiditätslücke:           ${(lueckeSofort * 100).toFixed(2)} %\n` +
            `→ Zahlungsunfähigkeit (§ 17 InsO): ${zahlungsunfaehig ? "JA (Lücke > 10 %)" : "NEIN"}\n` +
            `→ Drohende Zahlungsunfähigkeit (§ 18 InsO): ${drohendZahlungsunfaehig ? "JA" : "NEIN"}`,
        hinweis:
            "HINWEIS: § 17 InsO-Prüfung nach BGH-Lückenmaßstab (> 10 %). " +
            "Die Beurteilung der Dauerhaftigkeit erfordert anwaltliche/betriebswirtschaftliche Prüfung. " +
            "Keine Rechtsberatung durch dieses System.",
    };
}

// ---------------------------------------------------------------------------
// § 19 InsO — Überschuldung (zweistufig: Überschuldungsstatus + Prognose)
// ---------------------------------------------------------------------------

export type UeberschuldungInput = {
    /** Aktiva (Liquidationswerte) gesamt (€) */
    aktivaLiquidation: number;
    /** Passiva (Verbindlichkeiten) gesamt (€) */
    passivaGesamt: number;
    /** Fortbestehensprognose positiv? (Anwalt/Berater must set this) */
    fortbestehensprognosePositiv: boolean;
    /** Zeitraum Fortbestehensprognose (Monate, min. 12) */
    prognosezeitraumMonate?: number;
};

export type UeberschuldungResult = {
    bilanziellUeberschuldet: boolean;
    insolvenzrechtlichUeberschuldet: boolean;
    eigenkapital: number;
    berechnung: string;
    hinweis: string;
};

/**
 * Prüft Überschuldung nach § 19 InsO (modifizierter zweistufiger Test).
 *
 * Seit dem ESUG 2012: Überschuldung liegt vor, wenn
 * 1. Überschuldungsstatus negativ UND
 * 2. Fortbestehensprognose negativ.
 * Positive Fortbestehensprognose beseitigt den Insolvenzeröffnungsgrund
 * auch bei negativem Überschuldungsstatus.
 */
export function pruefeUeberschuldung(
    input: UeberschuldungInput,
): UeberschuldungResult {
    const { aktivaLiquidation, passivaGesamt, fortbestehensprognosePositiv } = input;

    const eigenkapital = aktivaLiquidation - passivaGesamt;
    const bilanziellUeberschuldet = eigenkapital < 0;
    const insolvenzrechtlichUeberschuldet =
        bilanziellUeberschuldet && !fortbestehensprognosePositiv;

    return {
        bilanziellUeberschuldet,
        insolvenzrechtlichUeberschuldet,
        eigenkapital,
        berechnung:
            `Aktiva (Liquidationswerte): ${aktivaLiquidation.toLocaleString("de-DE")} €\n` +
            `Passiva (Verbindlichkeiten): ${passivaGesamt.toLocaleString("de-DE")} €\n` +
            `Rechnerisches EK:           ${eigenkapital.toLocaleString("de-DE")} €\n` +
            `Bilanziell überschuldet:    ${bilanziellUeberschuldet ? "JA" : "NEIN"}\n` +
            `Fortbestehensprognose:      ${fortbestehensprognosePositiv ? "POSITIV" : "NEGATIV"}\n` +
            `→ Insolvenzrechtl. Überschuldung (§ 19 InsO): ` +
            `${insolvenzrechtlichUeberschuldet ? "JA" : "NEIN"}`,
        hinweis:
            "HINWEIS: § 19 InsO-Prüfung nach modifiziertem zweistufigen Test (ESUG 2012). " +
            "Fortbestehensprognose muss durch Anwalt / Insolvenzberater eigenverantwortlich " +
            "erstellt werden. Aktivawerte sind Liquidationswerte, nicht Buchwerte. " +
            "Ergebnis ersetzt keine rechtliche Beratung.",
    };
}

// ---------------------------------------------------------------------------
// 13/24-Wochen-Liquiditätsvorschau
// ---------------------------------------------------------------------------

export type LiquiditaetsWoche = {
    woche: number;
    einnahmen: number;
    ausgaben: number;
};

export type LiquiditaetsvorschauResult = {
    wochen: (LiquiditaetsWoche & { saldo: number; kumulativerSaldo: number })[];
    kritischeWochen: number[];
    minSaldo: number;
    minSaldoWoche: number;
    berechnung: string;
    hinweis: string;
};

/**
 * Erstellt eine rollierende Liquiditätsvorschau (13 oder 24 Wochen).
 * Identifiziert Wochen mit negativem kumul. Saldo (Liquiditätslücken).
 */
export function erstelleLiquiditaetsvorschau(
    startSaldo: number,
    wochen: LiquiditaetsWoche[],
): LiquiditaetsvorschauResult {
    let kumulativerSaldo = startSaldo;
    const result: LiquiditaetsvorschauResult["wochen"] = [];
    const kritischeWochen: number[] = [];
    let minSaldo = startSaldo;
    let minSaldoWoche = 0;

    for (const w of wochen) {
        const saldo = w.einnahmen - w.ausgaben;
        kumulativerSaldo += saldo;
        result.push({ ...w, saldo, kumulativerSaldo });

        if (kumulativerSaldo < 0) {
            kritischeWochen.push(w.woche);
        }
        if (kumulativerSaldo < minSaldo) {
            minSaldo = kumulativerSaldo;
            minSaldoWoche = w.woche;
        }
    }

    return {
        wochen: result,
        kritischeWochen,
        minSaldo,
        minSaldoWoche,
        berechnung:
            `Startsaldo: ${startSaldo.toLocaleString("de-DE")} €\n` +
            `Zeitraum: ${wochen.length} Wochen\n` +
            `Krit. Wochen (neg. Saldo): ${kritischeWochen.length > 0 ? kritischeWochen.join(", ") : "keine"}\n` +
            `Minimalsaldo: ${minSaldo.toLocaleString("de-DE")} € (Woche ${minSaldoWoche})`,
        hinweis:
            "HINWEIS: Liquiditätsvorschau ist ein technisches Hilfsmittel. " +
            "Plausiblitätsprüfung und Fortbestehensprognose müssen durch " +
            "Anwalt / Berater eigenverantwortlich erstellt werden.",
    };
}
