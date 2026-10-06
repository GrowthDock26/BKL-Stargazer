/**
 * GwG-Hinweisschreiben — automatischer erster Schritt nach Minimal-Anlage
 * einer Akte in einer GwG-relevanten Kategorie (kapitalmarktrecht, pro_real,
 * gesellschaftsrecht; siehe routes/matters.ts).
 *
 * Informiert den Mandanten über die Identifizierungspflicht nach §§ 10 ff.
 * GwG und bittet um eine Kopie des Personalausweises. Anders als die
 * Begleitmail zur Honorarvereinbarung (honorarBegleitmail.ts) ist dieser
 * Text ein FESTES TEMPLATE OHNE LLM — es handelt sich um reine
 * Compliance-Boilerplate ohne variablen Sachverhalt (Muster wie das
 * bestehende, ebenfalls feste PRE9/10-Anschreiben im Mitarbeiter-Handbuch).
 *
 * Versand bleibt manuell (Teil des GwG-Ablaufs in routes/gwg.ts — der
 * Nutzer bestätigt den Versand erst nach eigenständigem E-Mail-Versand).
 */

import { createServerSupabase } from "../supabase";

type Db = ReturnType<typeof createServerSupabase>;

export type GwgAnschreibenResult = {
    betreff: string;
    text: string;
};

export async function generateGwgAnschreiben(params: {
    matterId: string;
    orgId: string;
    bezeichnung: string;
    aktenzeichen: string | null;
    mandantName: string | null;
    userId: string;
    db: Db;
}): Promise<GwgAnschreibenResult> {
    const { matterId, orgId, bezeichnung, aktenzeichen, mandantName, userId, db } = params;

    const anrede = mandantName?.trim() ? `Sehr geehrte/r ${mandantName.trim()}` : "Sehr geehrte Damen und Herren";
    const betreff = `Angaben nach dem Geldwäschegesetz (GwG) — ${bezeichnung}${aktenzeichen ? ` (${aktenzeichen})` : ""}`;

    const text = [
        `${anrede},`,
        "",
        "vielen Dank für Ihr Vertrauen in unsere Kanzlei.",
        "",
        "Rechtsanwältinnen und Rechtsanwälte sind bei bestimmten Tätigkeiten (u.a. Vermögensverwaltung, " +
            "Kapitalanlagen, Gründung oder Verwaltung von Gesellschaften) gesetzlich verpflichtet, die " +
            "Identität ihrer Mandantinnen und Mandanten festzustellen (§§ 10 ff. Geldwäschegesetz — GwG). " +
            "Wir bitten Sie daher um eine gut lesbare Kopie Ihres gültigen Personalausweises oder " +
            "Reisepasses (bei Personalausweis Vorder- und Rückseite, bei Reisepass zusätzlich einen " +
            "aktuellen Meldenachweis).",
        "",
        "Sie können die Kopie als Antwort auf diese E-Mail übersenden oder über unser Mandantenportal " +
            "hochladen, sobald Sie hierzu von uns eingeladen wurden.",
        "",
        "Diese Angaben werden ausschließlich zur Erfüllung unserer gesetzlichen Sorgfaltspflichten nach " +
            "dem GwG verwendet und vertraulich im Rahmen der DSGVO sowie unserer anwaltlichen " +
            "Verschwiegenheitspflicht behandelt.",
        "",
        "Mit freundlichen Grüßen",
    ].join("\n");

    await db
        .from("matters")
        .update({ gwg_mail_betreff: betreff, gwg_mail_text: text, updated_at: new Date().toISOString() })
        .eq("id", matterId);

    await db.from("audit_log").insert({
        org_id: orgId,
        entity_type: "matter",
        entity_id: matterId,
        action: "gwg_anschreiben_erzeugt",
        actor_id: userId,
        details: { aktenzeichen },
    });

    return { betreff, text };
}
