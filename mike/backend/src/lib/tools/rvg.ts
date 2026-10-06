/**
 * RVG Gebührenrechner (vereinfacht, TypeScript-Port nach Klotzkette-Werkzeug).
 *
 * Berechnet Gerichts- und Anwaltsgebühren auf Basis des RVG (2021/2023).
 * Alle Berechnungen deterministisch — KEIN LLM.
 *
 * WICHTIG: Keine Gewähr für Vollständigkeit und Richtigkeit. Gebühren sind
 * stets eigenverantwortlich durch den Anwalt zu prüfen (§ 3a RVG).
 * Honorarvereinbarungen müssen als eigenständiges Dokument in Textform
 * geschlossen werden (§ 3a Abs. 1 RVG).
 */

// ---------------------------------------------------------------------------
// Gebührentabelle (§ 13 RVG, Stand 2023)
// ---------------------------------------------------------------------------

type GebührenStufe = { bis: number; gebuehr: number };

const RVG_GEBUEHRENTABELLE_2023: GebührenStufe[] = [
    { bis: 500, gebuehr: 49 },
    { bis: 1000, gebuehr: 88 },
    { bis: 1500, gebuehr: 127 },
    { bis: 2000, gebuehr: 166 },
    { bis: 3000, gebuehr: 222 },
    { bis: 4000, gebuehr: 278 },
    { bis: 5000, gebuehr: 334 },
    { bis: 6000, gebuehr: 390 },
    { bis: 7000, gebuehr: 446 },
    { bis: 8000, gebuehr: 502 },
    { bis: 9000, gebuehr: 558 },
    { bis: 10000, gebuehr: 614 },
    { bis: 13000, gebuehr: 714 },
    { bis: 16000, gebuehr: 814 },
    { bis: 19000, gebuehr: 914 },
    { bis: 22000, gebuehr: 1014 },
    { bis: 25000, gebuehr: 1114 },
    { bis: 30000, gebuehr: 1264 },
    { bis: 35000, gebuehr: 1414 },
    { bis: 40000, gebuehr: 1564 },
    { bis: 45000, gebuehr: 1714 },
    { bis: 50000, gebuehr: 1864 },
    { bis: 65000, gebuehr: 2214 },
    { bis: 80000, gebuehr: 2564 },
    { bis: 95000, gebuehr: 2914 },
    { bis: 110000, gebuehr: 3264 },
    { bis: 125000, gebuehr: 3614 },
    { bis: 140000, gebuehr: 3964 },
    { bis: 155000, gebuehr: 4314 },
    { bis: 170000, gebuehr: 4664 },
    { bis: 185000, gebuehr: 5014 },
    { bis: 200000, gebuehr: 5364 },
    { bis: 230000, gebuehr: 6014 },
    { bis: 260000, gebuehr: 6664 },
    { bis: 290000, gebuehr: 7314 },
    { bis: 320000, gebuehr: 7964 },
    { bis: 350000, gebuehr: 8614 },
    { bis: 380000, gebuehr: 9264 },
    { bis: 410000, gebuehr: 9914 },
    { bis: 440000, gebuehr: 10564 },
    { bis: 470000, gebuehr: 11214 },
    { bis: 500000, gebuehr: 11864 },
];

/** Einfache Gebühr (1,0) nach § 13 RVG für einen Streitwert */
export function einfacheGebuehr(streitwert: number): number {
    if (streitwert <= 0) return 0;

    for (const stufe of RVG_GEBUEHRENTABELLE_2023) {
        if (streitwert <= stufe.bis) return stufe.gebuehr;
    }

    // Über 500.000 € (§ 13 Abs. 1 Satz 3 RVG): je angefangene 50.000 € + 400 €
    const basis = RVG_GEBUEHRENTABELLE_2023[RVG_GEBUEHRENTABELLE_2023.length - 1].gebuehr;
    const ueber500k = streitwert - 500000;
    const zusatz = Math.ceil(ueber500k / 50000) * 400;
    return basis + zusatz;
}

// ---------------------------------------------------------------------------
// Gerichtsgebühren (GKG)
// ---------------------------------------------------------------------------

const GKG_GEBUEHRENTABELLE: GebührenStufe[] = [
    { bis: 500, gebuehr: 38 },
    { bis: 1000, gebuehr: 58 },
    { bis: 1500, gebuehr: 78 },
    { bis: 2000, gebuehr: 98 },
    { bis: 3000, gebuehr: 118 },
    { bis: 4000, gebuehr: 138 },
    { bis: 5000, gebuehr: 158 },
    { bis: 6000, gebuehr: 178 },
    { bis: 7000, gebuehr: 198 },
    { bis: 8000, gebuehr: 218 },
    { bis: 9000, gebuehr: 238 },
    { bis: 10000, gebuehr: 258 },
    { bis: 13000, gebuehr: 298 },
    { bis: 16000, gebuehr: 338 },
    { bis: 19000, gebuehr: 378 },
    { bis: 22000, gebuehr: 418 },
    { bis: 25000, gebuehr: 458 },
    { bis: 30000, gebuehr: 498 },
    { bis: 35000, gebuehr: 548 },
    { bis: 40000, gebuehr: 598 },
    { bis: 45000, gebuehr: 648 },
    { bis: 50000, gebuehr: 698 },
    { bis: 65000, gebuehr: 798 },
    { bis: 80000, gebuehr: 898 },
    { bis: 95000, gebuehr: 998 },
    { bis: 110000, gebuehr: 1098 },
    { bis: 125000, gebuehr: 1198 },
    { bis: 140000, gebuehr: 1298 },
    { bis: 155000, gebuehr: 1398 },
    { bis: 170000, gebuehr: 1498 },
    { bis: 185000, gebuehr: 1598 },
    { bis: 200000, gebuehr: 1698 },
    { bis: 230000, gebuehr: 1898 },
    { bis: 260000, gebuehr: 2098 },
    { bis: 290000, gebuehr: 2298 },
    { bis: 320000, gebuehr: 2498 },
    { bis: 350000, gebuehr: 2698 },
    { bis: 500000, gebuehr: 3298 },
];

export function gerichtsGebuehr(streitwert: number): number {
    if (streitwert <= 0) return 0;
    for (const stufe of GKG_GEBUEHRENTABELLE) {
        if (streitwert <= stufe.bis) return stufe.gebuehr;
    }
    const basis = GKG_GEBUEHRENTABELLE[GKG_GEBUEHRENTABELLE.length - 1].gebuehr;
    const ueber500k = streitwert - 500000;
    return basis + Math.ceil(ueber500k / 50000) * 150;
}

// ---------------------------------------------------------------------------
// Gebührenberechnung für typische Mandate
// ---------------------------------------------------------------------------

export type RVGBerechnung = {
    streitwert: number;
    einfacheGebuehr: number;
    gebuehrenUebersicht: Record<string, { faktor: number; betrag: number; netto: number }>;
    gesamtNetto: number;
    ust: number;
    gesamtBrutto: number;
    gerichtsgebuehren?: number;
    hinweis: string;
};

export type ManouvrierungsArt = "außergerichtlich" | "klage" | "beratung";

/**
 * Berechnet typische Gebühren für ein Mandat.
 *
 * Anm.: Pauschalen (VV Nr. 7001/7002 RVG) und Auslagen nicht enthalten.
 * Honorarvereinbarung nach § 3a RVG geht vor.
 */
export function berechneMandat(
    streitwert: number,
    art: ManouvrierungsArt,
    ustSatz: number = 0.19,
): RVGBerechnung {
    const eg = einfacheGebuehr(streitwert);
    const gebuehren: Record<string, { faktor: number; betrag: number; netto: number }> = {};

    let sumNetto = 0;

    if (art === "beratung") {
        // VV Nr. 2100/2102 RVG: Beratungsgebühr max. 250 €
        const betrag = Math.min(eg, 250);
        gebuehren["Beratungsgebühr (VV 2100)"] = { faktor: 1.0, betrag: eg, netto: betrag };
        sumNetto = betrag;
    } else if (art === "außergerichtlich") {
        // VV Nr. 2300 RVG: Geschäftsgebühr 1,3 (Schwierigkeitsgrad-Spielraum 0,5–2,5)
        const f = 1.3;
        const betrag = eg * f;
        gebuehren["Geschäftsgebühr (VV 2300, 1,3)"] = { faktor: f, betrag: eg, netto: betrag };
        // Auslagenpauschale VV Nr. 7002 (20 % max. 20 €)
        const auslagen = Math.min(betrag * 0.2, 20);
        gebuehren["Auslagenpauschale (VV 7002)"] = { faktor: 0, betrag: 0, netto: auslagen };
        sumNetto = betrag + auslagen;
    } else {
        // Klage (erstinstanzlich, Amts-/Landgericht)
        // Verfahrensgebühr VV 3100: 1,3
        const vg = eg * 1.3;
        gebuehren["Verfahrensgebühr (VV 3100, 1,3)"] = { faktor: 1.3, betrag: eg, netto: vg };
        // Terminsgebühr VV 3104: 1,2
        const tg = eg * 1.2;
        gebuehren["Terminsgebühr (VV 3104, 1,2)"] = { faktor: 1.2, betrag: eg, netto: tg };
        // Auslagenpauschale VV 7002
        const auslagen = Math.min((vg + tg) * 0.2, 20);
        gebuehren["Auslagenpauschale (VV 7002)"] = { faktor: 0, betrag: 0, netto: auslagen };
        sumNetto = vg + tg + auslagen;
    }

    const ust = sumNetto * ustSatz;
    const gesamtBrutto = sumNetto + ust;
    const gg = art === "klage" ? gerichtsGebuehr(streitwert) * 3 : undefined; // 3-fache Gebühr bei streitig

    return {
        streitwert,
        einfacheGebuehr: eg,
        gebuehrenUebersicht: gebuehren,
        gesamtNetto: sumNetto,
        ust,
        gesamtBrutto,
        ...(gg !== undefined ? { gerichtsgebuehren: gg } : {}),
        hinweis:
            "HINWEIS: Berechnung nach RVG 2023 (einfache Gebühr nach § 13 Abs. 1 RVG). " +
            "Streitwertfestsetzung, Rahmengebühren, Einigungsgebühr, besondere " +
            "Verfahrensgebühren sowie Honorarvereinbarungen (§ 3a RVG) nicht " +
            "berücksichtigt. Anwaltliche Überprüfung erforderlich.",
    };
}
