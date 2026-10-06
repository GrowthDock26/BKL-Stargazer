/**
 * GwG-Risikocheck (vereinfacht, TypeScript-Port nach dem `gwg-risiko-check`-
 * Skill aus dem Open-Source-Projekt legal-ops-germany).
 *
 * Automatisierte Geldwäsche-Risikoeinstufung für Mandate nach dem
 * Geldwäschegesetz (GwG). Rein regelbasiert — KEIN LLM.
 *
 * WICHTIG: Die Bewertungshoheit verbleibt nach § 10 Abs. 2 GwG stets bei der
 * Kanzlei. Dieses Tool liefert einen dokumentierten Einstufungsvorschlag mit
 * Rechtsgrundlagen, keine verbindliche Entscheidung. Ergebnis ist stets
 * anwaltlich zu bestätigen (siehe routes/gwg.ts: /pruefung/bestaetigen).
 */

// ---------------------------------------------------------------------------
// Länderlisten
//
// ACHTUNG: Dies sind BEISPIELHAFTE STARTLISTEN, keine tagesaktuelle
// Rechtsquelle. EU-Hochrisikostaaten (Delegierte VO (EU) 2016/1675 und deren
// Änderungen) und die FATF-Grey-List ändern sich mehrfach jährlich. Vor
// Produktivbetrieb und danach mindestens halbjährlich gegen die aktuelle
// Fassung im Amtsblatt der EU bzw. die aktuellen FATF-Plenarbeschlüsse
// prüfen und aktualisieren. Nur Länder mit seit vielen Jahren unveränderter
// Hochrisiko-Einstufung sind hier vorbelegt.
// ---------------------------------------------------------------------------

export const LAENDERLISTEN_STAND = "2026-07-17 (Platzhalter-Startliste, siehe Hinweis oben)";

/** EU-Hochrisiko-Drittstaaten — lösen zwingend verstärkte Sorgfaltspflichten aus (§ 15 Abs. 3 Nr. 2 GwG). */
export const EU_HOCHRISIKO_DRITTSTAATEN: string[] = [
    "KP", // Nordkorea
    "IR", // Iran
];

/** FATF "Grey List" (Increased Monitoring) — Risikofaktor, keine automatische Pflicht zu verstärkter Sorgfalt. */
export const FATF_GREYLIST: string[] = [];

if (FATF_GREYLIST.length === 0) {
    console.warn(
        "[gwg] FATF_GREYLIST ist leer — Platzhalter. Vor Produktivbetrieb mit der " +
            "aktuellen FATF-Liste ('Jurisdictions under Increased Monitoring') befüllen.",
    );
}

// ---------------------------------------------------------------------------
// GwG-Katalogtätigkeiten (§ 2 Abs. 1 Nr. 10 GwG) — grobe Zuordnung nach
// Mandatskategorie. Ersetzt keine Einzelfallprüfung: auch außerhalb dieser
// Kategorien kann im Einzelfall eine Katalogtätigkeit vorliegen (z.B.
// Treuhandtätigkeit im Erbrecht) — dann ist die Prüfung manuell anzustoßen.
// ---------------------------------------------------------------------------

// ACHTUNG — zwei getrennte Begriffe, die nicht vermischt werden dürfen:
//
//   1. GWG_KATALOGTAETIGKEIT (hier): ob das Mandat rechtlich unter die
//      Katalogtätigkeiten des § 2 Abs. 1 Nr. 10 GwG fällt. Steuert allein die
//      Risikoeinstufung — bei "false" lautet das Ergebnis "nicht_verpflichtet".
//
//   2. Der Verfahrensablauf (unterliegtGwgAblauf): ob die Akte vor dem
//      Aufnahmebogen die Identifizierungsstrecke durchläuft. Das ist eine
//      Hausregel der Kanzlei und gilt für ALLE Mandate.
//
// Würde man beides gleichsetzen und pauschal auf "true" stellen, behauptete
// die Einstufung auch bei einem reinen Beratungsmandat eine gesetzliche
// Pflicht, die nicht besteht.
const GWG_KATALOGTAETIGKEIT: Record<string, boolean> = {
    kapitalmarktrecht: true, // Vermögensverwaltung/Kapitalanlage, § 2 Abs. 1 Nr. 10 lit. c GwG
    pro_real: true, // Vermittlung/Beratung zu Vermögensanlagen, § 2 Abs. 1 Nr. 10 lit. c GwG
    gesellschaftsrecht: true, // Gründung/Verwaltung von Gesellschaften, § 2 Abs. 1 Nr. 10 lit. d/e GwG
    // Erbrecht: Nachlassverwaltung und Testamentsvollstreckung sind Verwaltung
    // von Vermögenswerten (§ 2 Abs. 1 Nr. 10 lit. b/c GwG); Nachlässe enthalten
    // regelmäßig Immobilien und Konten.
    erbrecht: true,
    arbeitsrecht: false,
    steuerrecht: false,
    sonstiges: false,
};

/**
 * Hausregel: JEDES Mandat durchläuft vor dem Aufnahmebogen die
 * Identifizierungsstrecke (Hinweisschreiben → Personalausweis →
 * Risikoeinstufung), unabhängig von der Kategorie.
 *
 * Ein Anwalt kann den Ablauf im Einzelfall mit Begründung abwählen — etwa
 * wenn die Legitimierung des Mandanten bereits aus einem anderen Mandat
 * vorliegt (siehe routes/gwg.ts, POST /uebergehen). Die Abwahl wird mit
 * Person, Zeitpunkt und Grund protokolliert.
 *
 * Einzige Wahrheitsquelle für routes/matters.ts (Auslösung) und
 * routes/intake.ts (Sperre des Aufnahmebogens).
 */
export function unterliegtGwgAblauf(_kategorie: string): boolean {
    return true;
}

/**
 * Ob die Kategorie rechtlich eine Katalogtätigkeit nach § 2 Abs. 1 Nr. 10 GwG
 * ist. Nur für die Risikoeinstufung — nicht für den Verfahrensablauf.
 */
export function istGwgKatalogtaetigkeit(kategorie: string): boolean {
    return GWG_KATALOGTAETIGKEIT[kategorie] ?? false;
}

/** Zustände, in denen die GwG-Prüfung einer Akte noch nicht abgeschlossen ist. */
export const GWG_OFFENE_ZUSTAENDE = [
    "NEU",
    "GWG_ANSCHREIBEN_ERZEUGT",
    "GWG_ANSCHREIBEN_VERSANDT",
] as const;

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type GwgPruefungInput = {
    kategorie: string;
    /** Wohnsitz-/Sitzland des Mandanten, ISO 3166-1 alpha-2 (z.B. "DE"). */
    landCode: string | null;
    /** Politisch exponierte Person, deren Familienmitglied oder bekanntermaßen nahestehende Person. */
    pep: boolean | null;
    /** Ist der wirtschaftlich Berechtigte identisch mit dem auftretenden Mandanten? */
    wirtschaftlichBerechtigterIdentisch: boolean | null;
    /** Land, in dem die Vermögenswerte/die Transaktion belegen sind, falls abweichend. */
    transaktionsland: string | null;
};

export type GwgRisikoklasse = "niedrig" | "mittel" | "hoch" | "unvollstaendig" | "nicht_verpflichtet";

export type GwgFaktor = { faktor: string; rechtsgrundlage: string };

export type GwgEinstufung = {
    risikoklasse: GwgRisikoklasse;
    anwendbar: boolean;
    ausgeloesteFaktoren: GwgFaktor[];
    dokumentationsluecken: string[];
    hinweis: string;
};

const BEWERTUNGSHOHEIT_HINWEIS =
    "Die abschließende Risikobewertung und die Entscheidung über Aufnahme oder Ablehnung " +
    "des Mandats verbleiben nach § 10 Abs. 2 GwG bei der Kanzlei; dieses Tool liefert " +
    "lediglich einen dokumentierten Vorschlag und ersetzt keine anwaltliche Prüfung.";

// ---------------------------------------------------------------------------
// Kernfunktion
// ---------------------------------------------------------------------------

/**
 * Klassifiziert das GwG-Risiko eines Mandats anhand von Mandatskategorie,
 * Land, PEP-Status und wirtschaftlich Berechtigtem. Deterministisch, keine
 * KI-Nutzung.
 */
export function classifyGwgRisiko(input: GwgPruefungInput): GwgEinstufung {
    const anwendbar = istGwgKatalogtaetigkeit(input.kategorie);

    if (!anwendbar) {
        return {
            risikoklasse: "nicht_verpflichtet",
            anwendbar: false,
            ausgeloesteFaktoren: [],
            dokumentationsluecken: [],
            hinweis:
                `Mandatskategorie "${input.kategorie}" fällt nach derzeitiger Einschätzung nicht unter ` +
                "die GwG-Katalogtätigkeiten des § 2 Abs. 1 Nr. 10 GwG. Bei abweichendem Sachverhalt im " +
                "Einzelfall (z.B. Treuhandtätigkeit, Vermögensverwaltung) ist die Anwendbarkeit " +
                "anwaltlich gesondert zu prüfen.",
        };
    }

    const faktoren: GwgFaktor[] = [];
    const luecken: string[] = [];
    const ausgeloesteStufen: ("mittel" | "hoch")[] = [];

    if (input.pep === true) {
        faktoren.push({
            faktor: "Politisch exponierte Person (PEP), deren Familienmitglied oder bekanntermaßen nahestehende Person",
            rechtsgrundlage: "§ 15 Abs. 3 Nr. 1 GwG — verstärkte Sorgfaltspflichten zwingend",
        });
        ausgeloesteStufen.push("hoch");
    } else if (input.pep === null) {
        luecken.push("PEP-Status nicht abgefragt/geklärt");
    }

    const laender = [input.landCode, input.transaktionsland]
        .filter((l): l is string => !!l)
        .map((l) => l.toUpperCase());

    if (laender.some((l) => EU_HOCHRISIKO_DRITTSTAATEN.includes(l))) {
        faktoren.push({
            faktor: "Bezug zu einem von der EU als Hochrisiko-Drittstaat gelisteten Land",
            rechtsgrundlage:
                "§ 15 Abs. 3 Nr. 2 GwG i.V.m. Delegierter VO (EU) 2016/1675 — verstärkte Sorgfaltspflichten zwingend",
        });
        ausgeloesteStufen.push("hoch");
    } else if (laender.some((l) => FATF_GREYLIST.includes(l))) {
        faktoren.push({
            faktor: "Bezug zu einem Staat mit erhöhtem FATF-Monitoring ('Grey List')",
            rechtsgrundlage: "Anlage 2 Nr. 1 GwG — Risikofaktor, keine automatische Pflicht zu verstärkter Sorgfalt",
        });
        ausgeloesteStufen.push("mittel");
    }

    if (input.wirtschaftlichBerechtigterIdentisch === false) {
        faktoren.push({
            faktor: "Wirtschaftlich Berechtigter weicht vom auftretenden Mandanten ab",
            rechtsgrundlage: "§ 10 Abs. 1 Nr. 2, § 11 Abs. 5 GwG — Identifizierung des wirtschaftlich Berechtigten erforderlich",
        });
        ausgeloesteStufen.push("mittel");
    } else if (input.wirtschaftlichBerechtigterIdentisch === null) {
        luecken.push("Angabe zum wirtschaftlich Berechtigten fehlt");
    }

    if (!input.landCode) {
        luecken.push("Wohnsitz-/Sitzland des Mandanten nicht erfasst");
    }

    const stufe: "niedrig" | "mittel" | "hoch" = ausgeloesteStufen.includes("hoch")
        ? "hoch"
        : ausgeloesteStufen.includes("mittel")
          ? "mittel"
          : "niedrig";

    // Kritische Lücken → "unvollstaendig", es sei denn ein "hoch"-Faktor steht
    // bereits unabhängig davon sicher fest (z.B. PEP bejaht, Land trotzdem
    // unbekannt) — dann hat der bekannte Risikofaktor Vorrang.
    if (luecken.length > 0 && stufe !== "hoch") {
        return {
            risikoklasse: "unvollstaendig",
            anwendbar: true,
            ausgeloesteFaktoren: faktoren,
            dokumentationsluecken: luecken,
            hinweis:
                "Für eine abschließende Einstufung fehlen Angaben (siehe Dokumentationslücken). " +
                BEWERTUNGSHOHEIT_HINWEIS,
        };
    }

    const stufenHinweis =
        stufe === "hoch"
            ? "Verstärkte Sorgfaltspflichten nach § 15 GwG zwingend erforderlich. "
            : stufe === "mittel"
              ? "Erhöhte Aufmerksamkeit im Rahmen der allgemeinen Sorgfaltspflichten (§ 10 GwG) angezeigt. "
              : "Keine risikoerhöhenden Faktoren festgestellt — allgemeine Sorgfaltspflichten nach § 10 GwG gelten unverändert. ";

    return {
        risikoklasse: stufe,
        anwendbar: true,
        ausgeloesteFaktoren: faktoren,
        dokumentationsluecken: luecken,
        hinweis: stufenHinweis + BEWERTUNGSHOHEIT_HINWEIS,
    };
}
