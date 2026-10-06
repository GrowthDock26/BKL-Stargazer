/**
 * PRE9/PRE10 — Zustandsmaschine des Vorgangs VOR der Akte.
 *
 * Bildet WF-001 bis WF-003 des Lastenhefts ab. Ab dem Zustand AKTE_ANGELEGT
 * übernimmt lib/matter/state-machine.ts.
 *
 * Deterministisch und ohne Nebenwirkungen: kein Datenbankzugriff, kein LLM,
 * keine Uhrzeit außer der übergebenen. Das macht den Ablauf prüfbar — und die
 * Fristenarithmetik ist genau die Stelle, an der ein Fehler teuer wird.
 *
 * PHASE 1 VERSENDET NICHTS. Das System hat derzeit keinen Mailausgang; jede
 * Aktion hier heißt „das Sekretariat hat das getan", nicht „das System hat das
 * getan". Deshalb rückt auch keine Eskalationsstufe von selbst weiter: Ein
 * Vorgang wird fällig und erscheint in der Arbeitsliste, weiter geht es erst
 * durch eine bestätigte Handlung. Ein automatisches Weiterschalten ohne
 * tatsächlichen Versand würde ein Protokoll erzeugen, das nicht stimmt.
 *
 * KEIN EIGENER STATUS „MANDAT ANGENOMMEN": Die Annahme-Entscheidung fällt
 * fachlich erst mit dem bestätigten Rücklauf, nicht vorher — ein früherer
 * „angenommen"-Status hätte suggeriert, ein Vorgang sei schon entschieden,
 * obwohl weiterhin Unterlagen fehlen können. Bis der Rücklauf bestätigt ist
 * (UNTERLAGEN_VOLLSTAENDIG), bleibt der Vorgang durchgehend „Interessent" im
 * fachlichen Sinn — er läuft nur durch die Zwischenstände dieser Phase
 * (Telefontermin, Unterlagen versendet, Nachforderung) und wird dabei über
 * die Nachfassschleife laufend erinnert. UNTERLAGEN_VOLLSTAENDIG IST die
 * Annahme faktisch: Von dort aus wird die Akte angelegt (WF-003), ohne einen
 * weiteren Zwischenschritt.
 */

export type InteressentStatus =
    | "INTERESSENT"
    | "TELEFONTERMIN"
    | "UNTERLAGEN_VERSENDET"
    | "NACHFORDERUNG"
    | "UNTERLAGEN_VOLLSTAENDIG"
    | "AKTE_ANGELEGT"
    | "KEIN_INTERESSE";

export type OrgRole = "Admin" | "Anwalt" | "Referendar" | "ReFa";

/** Wiedervorlagefrist des Ablaufplans — WF-001 und jede Stufe aus WF-002. */
export const WIEDERVORLAGE_TAGE = 10;

/** Nach der dritten erfolglosen Nachfassung wird nicht weiter nachgefasst. */
export const MAX_NACHFASS_STUFE = 3;

export const ALLE_STATUS: InteressentStatus[] = [
    "INTERESSENT",
    "TELEFONTERMIN",
    "UNTERLAGEN_VERSENDET",
    "NACHFORDERUNG",
    "UNTERLAGEN_VOLLSTAENDIG",
    "AKTE_ANGELEGT",
    "KEIN_INTERESSE",
];

export const STATUS_LABEL: Record<InteressentStatus, string> = {
    INTERESSENT: "Interessent",
    TELEFONTERMIN: "Telefontermin",
    UNTERLAGEN_VERSENDET: "Unterlagen versendet",
    NACHFORDERUNG: "Nachforderung",
    UNTERLAGEN_VOLLSTAENDIG: "Unterlagen vollständig",
    AKTE_ANGELEGT: "Akte angelegt",
    KEIN_INTERESSE: "Kein Interesse",
};

export function istStatus(s: string): s is InteressentStatus {
    return (ALLE_STATUS as string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

/**
 * Was jemand mit einem Vorgang tun kann. Aktionen, nicht Zustände: Das
 * Protokoll soll lesbar machen, was geschehen ist („nachgefasst"), nicht nur,
 * wo der Vorgang danach steht.
 */
export type InteressentAktion =
    | "telefontermin_vereinbart"
    | "unterlagen_versendet"
    | "nachgefasst"
    | "unterlagen_vollstaendig"
    | "kein_interesse"
    | "wiederaufnehmen";

type AktionDef = {
    /** Zulässige Ausgangszustände. */
    von: InteressentStatus[];
    nach: InteressentStatus;
    rollen: OrgRole[];
    beschreibung: string;
};

const AKTIONEN: Record<InteressentAktion, AktionDef> = {
    telefontermin_vereinbart: {
        von: ["INTERESSENT"],
        nach: "TELEFONTERMIN",
        rollen: ["Admin", "Anwalt", "Referendar", "ReFa"],
        beschreibung: "Telefontermin vereinbart",
    },
    // WF-001: Infomail mit Fragebogen, Vollmacht, Widerrufsbelehrung und
    // Kostenaufklärung ist raus. Setzt die erste Wiedervorlage.
    unterlagen_versendet: {
        von: ["INTERESSENT", "TELEFONTERMIN"],
        nach: "UNTERLAGEN_VERSENDET",
        rollen: ["Admin", "Anwalt", "Referendar", "ReFa"],
        beschreibung: "Unterlagen an den Interessenten versendet",
    },
    // WF-002 b/c: Wiedervorlage war fällig, es fehlt weiterhin etwas.
    nachgefasst: {
        von: ["UNTERLAGEN_VERSENDET", "NACHFORDERUNG"],
        nach: "NACHFORDERUNG",
        rollen: ["Admin", "Anwalt", "Referendar", "ReFa"],
        beschreibung: "Nachgefasst",
    },
    // WF-002 a: Rücklauf vollständig — Übergabe an WF-003. Das ist zugleich
    // der Moment der Mandatsannahme: Es gibt keinen weiteren Zwischenschritt
    // dafür, weil die Annahme-Entscheidung fachlich erst mit dem bestätigten
    // Rücklauf fällt.
    unterlagen_vollstaendig: {
        von: ["UNTERLAGEN_VERSENDET", "NACHFORDERUNG"],
        nach: "UNTERLAGEN_VOLLSTAENDIG",
        rollen: ["Admin", "Anwalt", "Referendar", "ReFa"],
        beschreibung: "Unterlagen vollständig eingegangen",
    },
    kein_interesse: {
        von: [
            "INTERESSENT",
            "TELEFONTERMIN",
            "UNTERLAGEN_VERSENDET",
            "NACHFORDERUNG",
        ],
        nach: "KEIN_INTERESSE",
        rollen: ["Admin", "Anwalt", "Referendar", "ReFa"],
        beschreibung: "Vorgang abgeschlossen — kein Interesse",
    },
    // Meldet sich jemand nach dem Abschluss doch noch, wird der Vorgang wieder
    // geöffnet statt doppelt angelegt. Die Nachfassstufe bleibt erhalten: Der
    // Verlauf gehört zum Vorgang, auch wenn er neu aufgenommen wird.
    wiederaufnehmen: {
        von: ["KEIN_INTERESSE"],
        nach: "INTERESSENT",
        rollen: ["Admin", "Anwalt", "Referendar", "ReFa"],
        beschreibung: "Vorgang wieder aufgenommen",
    },
};

export const AKTION_LABEL: Record<InteressentAktion, string> = {
    telefontermin_vereinbart: "Telefontermin vereinbart",
    unterlagen_versendet: "Unterlagen versendet",
    nachgefasst: "Nachgefasst",
    unterlagen_vollstaendig: "Unterlagen vollständig",
    kein_interesse: "Kein Interesse",
    wiederaufnehmen: "Wieder aufnehmen",
};

/**
 * Welche Aktionen in diesem Zustand zulässig sind — mit derselben Prüfung, die
 * auch der Aufruf durchläuft. Das Frontend rendert daraus seine Schaltflächen
 * und muss den Ablauf nicht ein zweites Mal kennen.
 */
export function moeglicheAktionen(params: {
    status: InteressentStatus;
    nachfassStufe: number;
    rolle: OrgRole;
    heute: string;
}): { aktion: InteressentAktion; label: string }[] {
    const alle = Object.keys(AKTIONEN) as InteressentAktion[];
    return alle
        .filter((a) => wendeAktionAn({ ...params, aktion: a }).ok)
        .map((a) => ({
            aktion: a,
            label:
                a === "nachgefasst"
                    ? `${params.nachfassStufe + 1}. Nachfassung`
                    : AKTION_LABEL[a],
        }));
}

export type AktionErgebnis =
    | {
          ok: true;
          nach: InteressentStatus;
          beschreibung: string;
          /** null = keine Wiedervorlage mehr (Endzustand oder Stufe erschöpft). */
          wiedervorlageAm: string | null;
          nachfassStufe: number;
          /** true, wenn mit dieser Aktion der Hinweis an den Vertrieb fällig wird. */
          vertriebInformieren: boolean;
      }
    | { ok: false; grund: string };

/**
 * Rechnet eine Aktion durch: Zielzustand, neue Wiedervorlage, Eskalationsstufe.
 *
 * @param heute ISO-Datum (YYYY-MM-DD) als Bezugstag — explizit übergeben,
 *              damit die Berechnung testbar bleibt.
 */
export function wendeAktionAn(params: {
    status: InteressentStatus;
    nachfassStufe: number;
    aktion: InteressentAktion;
    rolle: OrgRole;
    heute: string;
}): AktionErgebnis {
    const { status, nachfassStufe, aktion, rolle, heute } = params;
    const def = AKTIONEN[aktion];

    if (!def) return { ok: false, grund: `Unbekannte Aktion: ${aktion}` };

    if (!def.von.includes(status)) {
        return {
            ok: false,
            grund:
                `„${def.beschreibung}" ist im Status „${STATUS_LABEL[status]}" nicht möglich. ` +
                `Zulässig ab: ${def.von.map((s) => STATUS_LABEL[s]).join(", ")}.`,
        };
    }

    if (!def.rollen.includes(rolle)) {
        return {
            ok: false,
            grund: `Rolle „${rolle}" darf „${def.beschreibung}" nicht auslösen.`,
        };
    }

    if (aktion === "nachgefasst" && nachfassStufe >= MAX_NACHFASS_STUFE) {
        return {
            ok: false,
            grund:
                `Es wurde bereits ${MAX_NACHFASS_STUFE}-mal nachgefasst. ` +
                "Der Ablaufplan sieht keine weitere Nachfassung vor — bitte den Vorgang " +
                "abschließen („kein Interesse“) oder die Unterlagen als vollständig melden.",
        };
    }

    const neueStufe = aktion === "nachgefasst" ? nachfassStufe + 1 : nachfassStufe;

    // Wiedervorlage nur, solange auf etwas gewartet wird. Nach der dritten
    // Nachfassung läuft noch eine letzte Frist: Der Ablaufplan kündigt dem
    // Interessenten an, dass ohne Rückmeldung binnen 10 Tagen von fehlendem
    // Interesse ausgegangen wird — diese Frist muss überwacht werden.
    const brauchtWiedervorlage =
        aktion === "unterlagen_versendet" || aktion === "nachgefasst";

    return {
        ok: true,
        nach: def.nach,
        beschreibung:
            aktion === "nachgefasst"
                ? `${def.beschreibung} (${neueStufe}. Nachfassung)`
                : def.beschreibung,
        wiedervorlageAm: brauchtWiedervorlage ? addiereTage(heute, WIEDERVORLAGE_TAGE) : null,
        nachfassStufe: neueStufe,
        // WF-002 c: Mit der dritten Nachfassung geht der Hinweis an den
        // Finanzvertrieb, er möge noch einmal nachhaken.
        vertriebInformieren: aktion === "nachgefasst" && neueStufe === MAX_NACHFASS_STUFE,
    };
}

// ---------------------------------------------------------------------------
// Fälligkeit und Arbeitsanweisung
// ---------------------------------------------------------------------------

export type Faelligkeit = "ueberfaellig" | "heute" | "offen" | "keine";

export function bewerteFaelligkeit(wiedervorlageAm: string | null, heute: string): Faelligkeit {
    if (!wiedervorlageAm) return "keine";
    if (wiedervorlageAm < heute) return "ueberfaellig";
    if (wiedervorlageAm === heute) return "heute";
    return "offen";
}

/**
 * Klartext-Handlungsanweisung für die Arbeitsliste — dasselbe Prinzip wie die
 * „Nächste Aufgabe"-Karte der Akte. Wer die Liste öffnet, soll ohne Rückfrage
 * wissen, was zu tun ist.
 */
export function naechsteAufgabe(params: {
    status: InteressentStatus;
    nachfassStufe: number;
    wiedervorlageAm: string | null;
    heute: string;
}): { text: string; faellig: boolean } {
    const { status, nachfassStufe, wiedervorlageAm, heute } = params;
    const faelligkeit = bewerteFaelligkeit(wiedervorlageAm, heute);
    const faellig = faelligkeit === "ueberfaellig" || faelligkeit === "heute";

    switch (status) {
        case "INTERESSENT":
            return { text: "Telefontermin vereinbaren oder Unterlagen versenden", faellig: true };
        case "TELEFONTERMIN":
            return { text: "Telefonat führen, danach Unterlagen versenden", faellig: true };
        case "UNTERLAGEN_VERSENDET":
            return faellig
                ? { text: "Rücklauf prüfen — bei fehlenden Unterlagen 1. Nachfassung", faellig: true }
                : { text: `Rücklauf abwarten (Wiedervorlage ${formatDE(wiedervorlageAm)})`, faellig: false };
        case "NACHFORDERUNG":
            if (nachfassStufe >= MAX_NACHFASS_STUFE) {
                return faellig
                    ? { text: "Letzte Frist abgelaufen — Vorgang abschließen oder Rücklauf melden", faellig: true }
                    : { text: `Letzte Frist läuft (bis ${formatDE(wiedervorlageAm)})`, faellig: false };
            }
            return faellig
                ? { text: `Rücklauf prüfen — bei fehlenden Unterlagen ${nachfassStufe + 1}. Nachfassung`, faellig: true }
                : { text: `Rücklauf abwarten (Wiedervorlage ${formatDE(wiedervorlageAm)})`, faellig: false };
        case "UNTERLAGEN_VOLLSTAENDIG":
            return { text: "Mandat angenommen — Akte anlegen (WF-003)", faellig: true };
        case "AKTE_ANGELEGT":
            return { text: "In der Akte weiterbearbeiten", faellig: false };
        case "KEIN_INTERESSE":
            return { text: "Abgeschlossen", faellig: false };
    }
}

// ---------------------------------------------------------------------------
// Datumshilfen
//
// Kalendertage, keine Werktage: Der Ablaufplan spricht von „Wiedervorlage 10
// Tage". Das ist eine Organisationsfrist, keine Notfrist — eine
// Werktagsberechnung würde eine Genauigkeit vortäuschen, die der Plan nicht
// hergibt. Für echte Fristen bleibt die Fristen-Engine der Akte zuständig.
// ---------------------------------------------------------------------------

export function addiereTage(isoDatum: string, tage: number): string {
    const d = new Date(`${isoDatum}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + tage);
    return d.toISOString().slice(0, 10);
}

export function heuteIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function formatDE(isoDatum: string | null): string {
    if (!isoDatum) return "—";
    const [j, m, t] = isoDatum.split("-");
    return `${t}.${m}.${j}`;
}
