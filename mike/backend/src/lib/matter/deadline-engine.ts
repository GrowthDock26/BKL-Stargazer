/**
 * Fristen-Engine für Mandate.
 *
 * Berechnet und verwaltet fristgebundene Ereignisse pro Mandat.
 * Deterministische Berechnung — KEIN LLM.
 *
 * Der Scheduler prüft regelmäßig, ob Fristen abgelaufen sind, und
 * löst automatische Zustandsübergänge aus (FRIST_LAEUFT → FRIST_ABGELAUFEN).
 *
 * WICHTIG: Die anwaltliche Fristenkontrolle wird durch diesen Scheduler
 * NICHT ersetzt. Er ist nur ein technisches Hilfsmittel.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { berechneReaktionsfrist, type Bundesland } from "../tools/fristen";
import { validateTransition } from "./state-machine";

// ---------------------------------------------------------------------------
// Deadline record
// ---------------------------------------------------------------------------

export type FristTyp =
    | "ERWIDERUNGSFRIST"     // Frist zur Reaktion auf Anspruchsschreiben
    | "KSCHG_KLAGEFRIST"     // § 4 KSchG: 3 Wochen
    | "CUSTOM";              // Manuell gesetzt

/**
 * Der EINZIGE Fristtyp, der eine automatische Zustandseskalation auslöst.
 *
 * Wird beim Versand des Anspruchsschreibens gesetzt (routes/anspruch.ts) und
 * hier vom Scheduler ausgewertet. Manuell über die UI angelegte Fristen tragen
 * die dort gewählten Klartext-Bezeichnungen ("Verjährungsfrist", "Notfrist",
 * …) und werden bewusst NICHT eskaliert: eine ablaufende Verjährungsfrist darf
 * keinen Klage-Entwurf auslösen und schon gar nicht automatisch als erledigt
 * markiert werden.
 */
export const FRIST_TYP_ERWIDERUNG = "ERWIDERUNGSFRIST";

export type FristRecord = {
    id: string;
    matter_id: string;
    typ: FristTyp;
    startdatum: string;     // ISO date
    fristende: string;      // ISO date (deterministic)
    reminderdatum: string;  // ISO date (fristende - 7 Tage)
    werktage?: number;
    land?: string;
    notiz?: string;
    erledigt: boolean;
};

// ---------------------------------------------------------------------------
// Deadline calculation
// ---------------------------------------------------------------------------

/**
 * Erinnerungsdatum zu einem bereits bekannten Fristende: 7 Kalendertage davor,
 * aber nie in der Vergangenheit.
 *
 * Wird beim Anspruchsversand genutzt, wo der Anwalt das Fristende konkret
 * eingibt (im Unterschied zu berechneErwiderungsfrist(), das das Fristende
 * selbst aus Werktagen herleitet). Ohne die Untergrenze läge das
 * Erinnerungsdatum bei kurzen Fristen vor dem Versandtag und die Erinnerung
 * würde nie als "fällig" erkannt.
 */
export function berechneReminderdatum(fristende: string, heute: string): string {
    const d = new Date(`${fristende}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    const reminder = d.toISOString().slice(0, 10);
    return reminder < heute ? heute : reminder;
}

export function berechneErwiderungsfrist(
    versandDatum: string,
    werktageFrist: number = 14,
    land: Bundesland = "NW",
): { fristende: string; reminderdatum: string } {
    const result = berechneReaktionsfrist(versandDatum, werktageFrist, land);
    // Reminder 7 Kalendertage vor Fristende
    const fristende = new Date(result.endDate + "T00:00:00");
    const reminder = new Date(fristende);
    reminder.setDate(reminder.getDate() - 7);

    return {
        fristende: result.endDate,
        reminderdatum: reminder.toISOString().slice(0, 10),
    };
}

// ---------------------------------------------------------------------------
// Scheduler: check expired deadlines
// ---------------------------------------------------------------------------

export type ExpiredFrist = {
    matterId: string;
    fristId: string;
    typ: FristTyp;
    fristende: string;
};

/**
 * Returns all matters where the Erwiderungsfrist has passed and the matter
 * is still in FRIST_LAEUFT state. Called by the cron scheduler.
 *
 * Filtert bewusst auf FRIST_TYP_ERWIDERUNG: ohne diesen Filter würde jede
 * beliebige ablaufende Frist einer Akte im Zustand FRIST_LAEUFT (z.B. eine
 * manuell notierte Verjährungsfrist) als erledigt markiert und einen
 * Klage-Entwurf auslösen.
 */
export async function findExpiredFristen(
    db: SupabaseClient,
): Promise<ExpiredFrist[]> {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await db
        .from("fristen")
        .select("id, matter_id, typ, fristende")
        .eq("erledigt", false)
        .eq("typ", FRIST_TYP_ERWIDERUNG)
        .lte("fristende", today);

    if (error) {
        console.error("[deadline-engine] Error querying fristen:", error);
        return [];
    }

    // Only return matters still in FRIST_LAEUFT
    const matterIds = [...new Set((data ?? []).map((r: { matter_id: string }) => r.matter_id))];
    if (matterIds.length === 0) return [];

    const { data: matters } = await db
        .from("matters")
        .select("id, state")
        .in("id", matterIds)
        .eq("state", "FRIST_LAEUFT");

    const activeMatterIds = new Set((matters ?? []).map((m: { id: string }) => m.id));

    return (data ?? [])
        .filter((r: { matter_id: string }) => activeMatterIds.has(r.matter_id))
        .map((r: { id: string; matter_id: string; typ: string; fristende: string }) => ({
            matterId: r.matter_id,
            fristId: r.id,
            typ: r.typ as FristTyp,
            fristende: r.fristende,
        }));
}

/**
 * Processes expired deadlines: transitions matter to FRIST_ABGELAUFEN,
 * then to KLAGE_ENTWURF. Logs each transition.
 *
 * WICHTIG — was hier NICHT passiert: es wird KEIN Klage-Dokument erzeugt
 * (eine Generierung aus der Vorlage KLAGE_SCHRIFT existiert derzeit nicht) und
 * es wird NIEMAND benachrichtigt. Der Zustand KLAGE_ENTWURF bedeutet
 * ausschließlich "Frist ist abgelaufen, Akte zur Klagevorbereitung markiert".
 * Nichts wird automatisch versandt oder eingereicht.
 */
export async function processExpiredFristen(db: SupabaseClient): Promise<void> {
    const expired = await findExpiredFristen(db);
    if (expired.length === 0) return;

    console.log(`[deadline-engine] Processing ${expired.length} expired fristen`);

    // org_id je Akte, damit die Audit-Einträge des Schedulers in
    // org-gefilterten Auswertungen auftauchen (vorher fehlte org_id ganz).
    const { data: matterOrgs } = await db
        .from("matters")
        .select("id, org_id")
        .in("id", [...new Set(expired.map((f) => f.matterId))]);
    const orgByMatter = new Map<string, string>(
        (matterOrgs ?? []).map((m: { id: string; org_id: string }) => [m.id, m.org_id]),
    );

    for (const frist of expired) {
        try {
            const v1 = validateTransition("FRIST_LAEUFT", "FRIST_ABGELAUFEN", "scheduler");
            const v2 = validateTransition("FRIST_ABGELAUFEN", "KLAGE_ENTWURF", "scheduler");

            if (!v1.ok || !v2.ok) {
                console.error("[deadline-engine] Transition validation failed", { frist, v1, v2 });
                continue;
            }

            // Transition: FRIST_LAEUFT → FRIST_ABGELAUFEN
            await db.from("matter_transitions").insert({
                matter_id: frist.matterId,
                from_state: "FRIST_LAEUFT",
                to_state: "FRIST_ABGELAUFEN",
                triggered_by: "scheduler",
                role: "scheduler",
                description: `Erwiderungsfrist abgelaufen (${frist.fristende})`,
            });
            await db
                .from("matters")
                .update({ state: "FRIST_ABGELAUFEN", updated_at: new Date().toISOString() })
                .eq("id", frist.matterId);

            // Transition: FRIST_ABGELAUFEN → KLAGE_ENTWURF
            await db.from("matter_transitions").insert({
                matter_id: frist.matterId,
                from_state: "FRIST_ABGELAUFEN",
                to_state: "KLAGE_ENTWURF",
                triggered_by: "scheduler",
                role: "scheduler",
                description:
                    "Frist abgelaufen — Akte zur Klagevorbereitung markiert " +
                    "(kein Dokument erzeugt, keine Benachrichtigung versandt)",
            });
            await db
                .from("matters")
                .update({ state: "KLAGE_ENTWURF", updated_at: new Date().toISOString() })
                .eq("id", frist.matterId);

            // Mark frist as erledigt
            await db
                .from("fristen")
                .update({ erledigt: true })
                .eq("id", frist.fristId);

            // Audit log
            await db.from("audit_log").insert({
                org_id: orgByMatter.get(frist.matterId) ?? null,
                entity_type: "matter",
                entity_id: frist.matterId,
                action: "frist_abgelaufen_klage_initiiert",
                actor_id: "scheduler",
                actor_role: "scheduler",
                details: { fristId: frist.fristId, fristende: frist.fristende, typ: frist.typ },
            });

            console.log(`[deadline-engine] Matter ${frist.matterId}: FRIST_LAEUFT → KLAGE_ENTWURF`);
        } catch (err) {
            console.error(`[deadline-engine] Error processing frist ${frist.fristId}:`, err);
        }
    }
}
