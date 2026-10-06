/**
 * Pro Real Europa 9/10 — Fragebogenauswertung.
 *
 * Deterministisch, KEIN LLM. Das Sprachmodell liest den handschriftlichen
 * Fragebogen aus; gerechnet und geprüft wird ausschließlich hier.
 *
 * Grundlage ist der Ablaufplan „Mandate bei Schadensersatz wegen Pro Real
 * Europa 9 (PRE9) oder Pro Real Europa 10 (PRE10)":
 *
 *     Streitwert = Zeichnungssumme + Agio − Summe der Auszahlungen
 *
 * WICHTIG: Der Streitwert bestimmt Geschäfts- und Verfahrensgebühr sowie den
 * Gerichtskostenvorschuss. Ein falsch gelesener Betrag pflanzt sich damit bis
 * in die Rechnung fort — deshalb liefert dieses Modul zu jedem Ergebnis die
 * Lücken und Widersprüche mit, statt eine Zahl ohne Vorbehalt auszugeben.
 */

// ---------------------------------------------------------------------------
// Betragsparser
// ---------------------------------------------------------------------------

/**
 * Liest einen Geldbetrag aus einer handschriftlich erfassten Zeichenkette.
 *
 * Muss mit dem umgehen, was Mandanten tatsächlich schreiben:
 *   "50.000,00 €"  → 50000     (deutsches Format)
 *   "1.750,00"     → 1750
 *   "10 000,-"     → 10000     (Tausender-Leerzeichen, ",-" für volle Euro)
 *   "20000"        → 20000
 *   "1.750"        → 1750      (Punkt + 3 Ziffern = Tausendertrennzeichen)
 *   "1.75"         → 1.75      (Punkt + 2 Ziffern = Dezimaltrennzeichen)
 *
 * Gibt null zurück, wenn sich kein Betrag erkennen lässt. Der Aufrufer meldet
 * das als Lücke — raten wäre hier der gefährlichere Weg.
 */
export function parseEuroBetrag(roh: unknown): number | null {
    if (typeof roh === "number") return Number.isFinite(roh) ? roh : null;
    let s = String(roh ?? "").trim();
    if (!s) return null;

    // Währung und Tausender-Leerzeichen entfernen
    s = s.replace(/€|EUR|eur/g, "").replace(/\s+/g, "").trim();
    // ",-" und ".-" bedeuten "volle Euro, keine Cent"
    s = s.replace(/[.,]-$/, "");
    if (!s) return null;

    const hatKomma = s.includes(",");
    const hatPunkt = s.includes(".");

    if (hatKomma) {
        // Deutsches Format: Punkte sind Tausendertrennzeichen, Komma trennt Cent
        s = s.replace(/\./g, "").replace(",", ".");
    } else if (hatPunkt) {
        const letzterPunkt = s.lastIndexOf(".");
        const nachkomma = s.length - letzterPunkt - 1;
        // Genau drei Ziffern nach dem letzten Punkt → Tausendertrennzeichen
        if (nachkomma === 3) s = s.replace(/\./g, "");
        // sonst: Punkt bleibt Dezimaltrennzeichen
    }

    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

/** Formatiert einen Betrag deutsch, z.B. 62100 → "62.100,00". */
export function formatEuro(n: number): string {
    return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type PreBeteiligung = {
    bezeichnung?: string | null;
    vertragsnummer?: string | null;
    zeichnungssumme?: unknown;
    agio?: unknown;
    /** Vom Mandanten selbst gebildete Summe — dient nur der Gegenprobe. */
    gesamt?: unknown;
};

export type PreAuszahlung = {
    betrag?: unknown;
    datum?: string | null;
};

export type StreitwertErgebnis = {
    zeichnungssummeGesamt: number;
    agioGesamt: number;
    auszahlungenGesamt: number;
    streitwert: number;
    /** false, sobald eine Angabe fehlt oder unlesbar war. */
    belastbar: boolean;
    hinweise: string[];
};

// ---------------------------------------------------------------------------
// Streitwert
// ---------------------------------------------------------------------------

/**
 * Streitwert nach dem Ablaufplan: Zeichnungssumme + Agio − Auszahlungen.
 *
 * `belastbar` ist nur dann true, wenn jede einzelne Angabe gelesen werden
 * konnte. Fehlt etwas — im Fragebogen etwa der Verweis „s. Anlage" bei den
 * Auszahlungen —, ist die Zahl ein Zwischenstand und darf nicht ungeprüft in
 * die Gebührenrechnung wandern.
 */
export function berechneStreitwert(
    beteiligungen: PreBeteiligung[],
    auszahlungen: PreAuszahlung[],
    auszahlungenVollstaendig = true,
): StreitwertErgebnis {
    const hinweise: string[] = [];
    let zeichnungssummeGesamt = 0;
    let agioGesamt = 0;
    let belastbar = true;

    if (beteiligungen.length === 0) {
        hinweise.push("Keine Beteiligung erfasst — Streitwert kann nicht berechnet werden.");
        belastbar = false;
    }

    beteiligungen.forEach((b, i) => {
        const nr = b.vertragsnummer || b.bezeichnung || `Beteiligung ${i + 1}`;

        const zs = parseEuroBetrag(b.zeichnungssumme);
        if (zs === null) {
            hinweise.push(`${nr}: Zeichnungssumme fehlt oder ist nicht lesbar.`);
            belastbar = false;
        } else {
            zeichnungssummeGesamt += zs;
        }

        // Agio darf fehlen (nicht jede Beteiligung hat eines) — dann 0, aber
        // als Hinweis, damit es niemand stillschweigend übersieht.
        const agio = parseEuroBetrag(b.agio);
        if (agio === null) {
            if (b.agio !== undefined && String(b.agio ?? "").trim() !== "") {
                hinweise.push(`${nr}: Agio ist nicht lesbar.`);
                belastbar = false;
            } else {
                hinweise.push(`${nr}: Kein Agio angegeben — mit 0 gerechnet.`);
            }
        } else {
            agioGesamt += agio;
        }

        // Gegenprobe gegen die vom Mandanten selbst gebildete Summe
        const gesamt = parseEuroBetrag(b.gesamt);
        if (gesamt !== null && zs !== null && agio !== null) {
            const erwartet = zs + agio;
            if (Math.abs(gesamt - erwartet) > 0.01) {
                hinweise.push(
                    `${nr}: Die im Fragebogen angegebene Summe (${formatEuro(gesamt)}) weicht von ` +
                        `Zeichnungssumme + Agio (${formatEuro(erwartet)}) ab — bitte gegen das Original prüfen.`,
                );
                belastbar = false;
            }
        }
    });

    let auszahlungenGesamt = 0;
    auszahlungen.forEach((a, i) => {
        const betrag = parseEuroBetrag(a.betrag);
        if (betrag === null) {
            hinweise.push(`Auszahlung ${i + 1}: Betrag ist nicht lesbar.`);
            belastbar = false;
        } else {
            auszahlungenGesamt += betrag;
        }
    });

    if (!auszahlungenVollstaendig) {
        hinweise.push(
            "Die Auszahlungen sind laut Fragebogen nicht vollständig aufgeführt " +
                "(z.B. Verweis auf eine Anlage). Der Streitwert ist damit vorläufig.",
        );
        belastbar = false;
    } else if (auszahlungen.length === 0) {
        hinweise.push("Keine Auszahlungen angegeben — mit 0 gerechnet. Bitte bestätigen.");
    }

    const streitwert = zeichnungssummeGesamt + agioGesamt - auszahlungenGesamt;

    if (streitwert < 0) {
        hinweise.push(
            "Rechnerischer Streitwert ist negativ — die Auszahlungen übersteigen " +
                "Zeichnungssumme und Agio. Bitte Angaben prüfen.",
        );
        belastbar = false;
    }

    return { zeichnungssummeGesamt, agioGesamt, auszahlungenGesamt, streitwert, belastbar, hinweise };
}

// ---------------------------------------------------------------------------
// Vollständigkeit und Widersprüche
// ---------------------------------------------------------------------------

export type FragebogenAngaben = {
    name?: string | null;
    vorname?: string | null;
    geburtsdatum?: string | null;
    strasse?: string | null;
    plz?: string | null;
    ort?: string | null;
    telefon?: string | null;
    email?: string | null;

    zeichnungserklaerung_beigefuegt?: boolean | null;
    vib_beigefuegt?: boolean | null;

    prospekt_erhalten_am?: string | null;
    prospekt_gelesen?: boolean | null;
    prospekt_durchgegangen?: boolean | null;

    rsv_versicherer?: string | null;
    rsv_versicherungsnehmer?: string | null;
    rsv_scheinnummer?: string | null;
    rsv_abgeschlossen_am?: string | null;
    rsv_kopie_beigefuegt?: boolean | null;

    anderweitig_geltend_gemacht?: boolean | null;
    andere_anlage_one_group?: boolean | null;
    andere_anlage_sonst?: boolean | null;
};

export type FragebogenPruefung = {
    vollstaendig: boolean;
    /** Fehlende Pflichtangaben und Anlagen — Grundlage für die Nachfrage beim Mandanten. */
    luecken: string[];
    /** In sich widersprüchliche Angaben, die jemand klären muss. */
    widersprueche: string[];
};

/**
 * Prüft den Fragebogen nach der Checkliste des Ablaufplans (Abschnitt
 * „Rücklauf Fragebogen"): sind alle Felder ausgefüllt, liegen die Anlagen bei,
 * ist bei Rechtsschutz der Versicherungsschein dabei.
 */
export function pruefeFragebogen(a: FragebogenAngaben): FragebogenPruefung {
    const luecken: string[] = [];
    const widersprueche: string[] = [];

    const fehlt = (wert: unknown) => !String(wert ?? "").trim();

    if (fehlt(a.name) || fehlt(a.vorname)) luecken.push("Name oder Vorname fehlt.");
    if (fehlt(a.geburtsdatum)) luecken.push("Geburtsdatum fehlt.");
    if (fehlt(a.strasse) || fehlt(a.plz) || fehlt(a.ort)) luecken.push("Anschrift ist unvollständig.");
    if (fehlt(a.telefon) && fehlt(a.email)) luecken.push("Weder Telefonnummer noch E-Mail-Adresse angegeben.");

    // Ohne Zeichnungserklärung geht es laut Fragebogen ausdrücklich nicht.
    if (a.zeichnungserklaerung_beigefuegt !== true) {
        luecken.push("Zeichnungserklärung ist nicht als beigefügt markiert — ohne sie geht es nicht.");
    }
    if (a.vib_beigefuegt !== true) {
        luecken.push("Vermögensanlagen-Informationsblatt (Seite 1) ist nicht als beigefügt markiert.");
    }

    if (fehlt(a.prospekt_erhalten_am)) {
        luecken.push("Datum der Prospektübergabe fehlt.");
    }

    // Die beiden Prospektfragen schließen einander aus.
    if (a.prospekt_gelesen === true && a.prospekt_durchgegangen === true) {
        widersprueche.push(
            "Sowohl \"Prospekt gelesen\" als auch \"Prospekt nicht gelesen, aber vom Berater erklärt\" " +
                "sind mit ja angekreuzt. Bitte beim Mandanten klären, was zutrifft.",
        );
    }
    if (a.prospekt_gelesen !== true && a.prospekt_durchgegangen !== true) {
        luecken.push("Keine der beiden Fragen zur Prospektübergabe ist beantwortet.");
    }

    // Rechtsschutz: entweder gar nichts, oder vollständig.
    const rsvAngaben = [a.rsv_versicherer, a.rsv_scheinnummer, a.rsv_versicherungsnehmer, a.rsv_abgeschlossen_am];
    const rsvTeilweise = rsvAngaben.some((w) => !fehlt(w));
    if (rsvTeilweise) {
        if (fehlt(a.rsv_versicherer)) luecken.push("Rechtsschutz: Versicherer fehlt.");
        if (fehlt(a.rsv_scheinnummer)) luecken.push("Rechtsschutz: Versicherungsscheinnummer fehlt.");
        if (a.rsv_kopie_beigefuegt !== true) {
            luecken.push("Rechtsschutz: Kopie des Versicherungsscheins ist nicht als beigefügt markiert.");
        }
    }

    for (const [wert, frage] of [
        [a.anderweitig_geltend_gemacht, "Ansprüche wegen dieser Beteiligung bereits anderweitig geltend gemacht?"],
        [a.andere_anlage_one_group, "Ansprüche wegen einer anderen Vermögensanlage bei der One Group?"],
        [a.andere_anlage_sonst, "Ansprüche wegen einer anderen Vermögensanlage?"],
    ] as [boolean | null | undefined, string][]) {
        if (wert === null || wert === undefined) luecken.push(`Unbeantwortet: ${frage}`);
    }

    return { vollstaendig: luecken.length === 0 && widersprueche.length === 0, luecken, widersprueche };
}
