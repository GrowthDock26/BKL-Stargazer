/**
 * Datenminimierung von Mandantendaten vor LLM-Egress.
 *
 * WAS DIESES MODUL LEISTET: Es ersetzt die strukturierten direkten
 * Identifikatoren (Vor-/Nachname, Geburtsdatum, Adresse) durch ein
 * deterministisches Pseudonym, sodass diese Felder nicht an LOGICC übermittelt
 * werden. Das ist Datenminimierung nach Art. 5 Abs. 1 lit. c DSGVO.
 *
 * WAS ES NICHT LEISTET — ausdrücklich keine Anonymisierung oder
 * Pseudonymisierung im Sinne des Art. 4 Nr. 5 DSGVO: Die freien Textfelder
 * (Sachverhalt, bisherige Schritte, Mandatsziel) werden im Klartext
 * weitergegeben und enthalten in der Praxis regelmäßig Klarnamen von Mandant,
 * Gegenseite und Dritten. Ein Rückschluss auf die betroffene Person bleibt
 * dadurch möglich.
 *
 * Die Zulässigkeit der Übermittlung beruht deshalb NICHT auf diesem Modul,
 * sondern auf dem Auftragsverarbeitungsvertrag mit LOGICC (Art. 28 DSGVO) und
 * der Dienstleisterbeauftragung nach § 43e BRAO. Siehe die offenen Punkte 5.1
 * bis 5.3 in SETUP-UND-OFFENE-PUNKTE.md.
 */

import crypto from "crypto";

export type AnonymizedMandant = {
    pseudonym: string;          // z.B. "Mandant-A3F2"
    anrede: string | null;
    beratungskurzbeschreibung: string | null;
    // Kein Klarname, kein Geburtsdatum, keine Adresse
};

/**
 * Erzeugt ein deterministisches Pseudonym aus der matter_id.
 * Gleiche matter_id → gleiches Pseudonym (konsistentes Logging).
 */
export function pseudonymisiere(matterId: string): string {
    const hash = crypto.createHash("sha256").update(matterId).digest("hex").slice(0, 4).toUpperCase();
    return `Mandant-${hash}`;
}

/**
 * Gibt eine datenminimierte Version der Mandantendaten für LLM-Prompts zurück:
 * ohne Namensfelder, ohne Geburtsdatum, ohne Adresse.
 *
 * Achtung: `beratungskurzbeschreibung` wird unverändert durchgereicht und kann
 * Klarnamen enthalten — siehe Modul-Header. "Sicher" ist die Ausgabe also nur
 * im Hinblick auf die strukturierten Felder.
 *
 * Hinweis: Derzeit von keiner Codestelle aufgerufen; die Aufrufer nutzen
 * `pseudonymisiere()` direkt.
 */
export function anonymisiereFuerPrompt(
    matterId: string,
    mandant: {
        anrede?: string | null;
        vorname?: string;
        nachname?: string;
        beratungskurzbeschreibung?: string | null;
        ort?: string | null;
    },
): AnonymizedMandant {
    return {
        pseudonym: pseudonymisiere(matterId),
        anrede: mandant.anrede ?? null,
        // Der Sachverhalt bleibt erhalten, weil er für die inhaltliche Arbeit
        // notwendig ist. Er kann Klarnamen enthalten; abgedeckt durch den AVV
        // mit LOGICC (Art. 28 DSGVO), nicht durch eine Pseudonymisierung.
        beratungskurzbeschreibung: mandant.beratungskurzbeschreibung ?? null,
    };
}
