/**
 * Fristen-Benachrichtigung (Phase 2).
 *
 * Ohne dieses Modul war die Fristüberwachung stumm: die Engine setzte lediglich
 * Zustände in der Datenbank und schrieb nach stdout. Wer nicht von sich aus in
 * die Fristenliste sah, erfuhr von einem Fristablauf nichts.
 *
 * Zwei Läufe, beide idempotent über Zeitstempel-Spalten in `fristen`:
 *   1. Vorfrist  — reminderdatum erreicht, Frist noch offen und nicht abgelaufen
 *   2. Ablauf    — fristende erreicht
 *
 * Deterministisch, kein LLM. Versand über das vorhandene EU-SMTP (lib/mail.ts).
 *
 * WICHTIG — kein stiller Fehlschlag: Ein Zeitstempel wird ausschließlich dann
 * gesetzt, wenn tatsächlich eine E-Mail rausgegangen ist. Fehlt die
 * SMTP-Konfiguration oder lässt sich kein Empfänger ermitteln, bleibt die Zeile
 * unmarkiert und der nächste Lauf versucht es erneut. Lieber ein wiederholter
 * Log-Eintrag als eine verlorene Frist.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendFristenMail, smtpEnabled, type FristenMailAnlass } from "../mail";
import { FRIST_TYP_ERWIDERUNG } from "./deadline-engine";

type FristZeile = {
    id: string;
    matter_id: string;
    org_id: string;
    typ: string;
    fristende: string;
    reminderdatum: string | null;
    notiz: string | null;
};

type AkteInfo = {
    id: string;
    aktenzeichen: string | null;
    bezeichnung: string;
    zustaendiger_anwalt_id: string | null;
};

/**
 * Kanzleiinterne Sammeladresse(n) für Fristenhinweise, komma-separiert.
 * Ohne diese Variable wird nur der auf der Akte hinterlegte zuständige Anwalt
 * benachrichtigt — für die Sekretariats-Wiedervorlage sollte sie gesetzt sein.
 */
export function sammelEmpfaenger(): string[] {
    return (process.env.FRISTEN_NOTIFY_EMAIL ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/** E-Mail-Adresse eines Nutzers über die Supabase-Admin-API (Service-Role). */
async function userEmail(db: SupabaseClient, userId: string): Promise<string | null> {
    try {
        const { data, error } = await db.auth.admin.getUserById(userId);
        if (error) {
            console.warn(`[fristen-notify] Nutzer ${userId} nicht auflösbar: ${error.message}`);
            return null;
        }
        return data.user?.email ?? null;
    } catch (err) {
        console.warn(`[fristen-notify] Nutzer ${userId} nicht auflösbar:`, err);
        return null;
    }
}

async function ermittleEmpfaenger(db: SupabaseClient, akte: AkteInfo): Promise<string[]> {
    const empfaenger = new Set(sammelEmpfaenger());
    if (akte.zustaendiger_anwalt_id) {
        const mail = await userEmail(db, akte.zustaendiger_anwalt_id);
        if (mail) empfaenger.add(mail);
    }
    return [...empfaenger];
}

/**
 * Versendet eine Benachrichtigung und markiert die Frist erst danach.
 * Gibt zurück, ob markiert wurde.
 */
async function benachrichtige(
    db: SupabaseClient,
    frist: FristZeile,
    akte: AkteInfo,
    anlass: FristenMailAnlass,
    spalte: "reminder_gesendet_at" | "ablauf_benachrichtigt_at",
): Promise<boolean> {
    const to = await ermittleEmpfaenger(db, akte);
    if (to.length === 0) {
        console.error(
            `[fristen-notify] KEIN EMPFÄNGER für Frist ${frist.id} (Akte ${akte.aktenzeichen ?? akte.id}). ` +
                "FRISTEN_NOTIFY_EMAIL setzen oder zuständigen Anwalt auf der Akte hinterlegen.",
        );
        return false;
    }

    let messageId: string;
    try {
        messageId = await sendFristenMail({
            to,
            anlass,
            typ: frist.typ,
            fristende: frist.fristende,
            notiz: frist.notiz,
            aktenzeichen: akte.aktenzeichen,
            bezeichnung: akte.bezeichnung,
            eskalationsHinweis: anlass === "ablauf" && frist.typ === FRIST_TYP_ERWIDERUNG,
        });
    } catch (err) {
        console.error(`[fristen-notify] Versand für Frist ${frist.id} fehlgeschlagen:`, err);
        return false;
    }

    const jetzt = new Date().toISOString();
    await db.from("fristen").update({ [spalte]: jetzt }).eq("id", frist.id);

    await db.from("mail_log").insert({
        matter_id: frist.matter_id,
        org_id: frist.org_id,
        empfaenger: to.join(", "),
        betreff: anlass === "ablauf" ? "Fristablauf-Benachrichtigung" : "Fristerinnerung",
        smtp_message_id: messageId,
        sent_by: null,
    });

    await db.from("audit_log").insert({
        org_id: frist.org_id,
        entity_type: "frist",
        entity_id: frist.id,
        action: anlass === "ablauf" ? "frist_ablauf_benachrichtigt" : "frist_erinnerung_versandt",
        actor_id: "scheduler",
        actor_role: "scheduler",
        details: { empfaenger: to, typ: frist.typ, fristende: frist.fristende },
    });

    console.log(
        `[fristen-notify] ${anlass} für Frist ${frist.id} an ${to.length} Empfänger versandt ` +
            `(Akte ${akte.aktenzeichen ?? akte.id}, ${frist.typ}, ${frist.fristende})`,
    );
    return true;
}

/** Lädt die Aktendaten zu einer Menge von Fristen in einem Zug. */
async function ladeAkten(db: SupabaseClient, matterIds: string[]): Promise<Map<string, AkteInfo>> {
    if (matterIds.length === 0) return new Map();
    const { data } = await db
        .from("matters")
        .select("id, aktenzeichen, bezeichnung, zustaendiger_anwalt_id")
        .in("id", matterIds);
    return new Map((data ?? []).map((m: AkteInfo) => [m.id, m]));
}

/**
 * Einstiegspunkt für den Scheduler.
 *
 * MUSS vor processExpiredFristen() laufen: jene Funktion markiert eskalierte
 * Erwiderungsfristen als erledigt, wodurch der Reminder-Lauf sie überspringen
 * würde.
 */
export async function processFristenBenachrichtigungen(db: SupabaseClient): Promise<void> {
    const heute = new Date().toISOString().slice(0, 10);

    // --- 1. Vorfrist-Erinnerungen -----------------------------------------
    const { data: reminderFristen, error: reminderErr } = await db
        .from("fristen")
        .select("id, matter_id, org_id, typ, fristende, reminderdatum, notiz")
        .eq("erledigt", false)
        .is("reminder_gesendet_at", null)
        .not("reminderdatum", "is", null)
        .lte("reminderdatum", heute)
        .gte("fristende", heute);

    if (reminderErr) {
        console.error("[fristen-notify] Reminder-Abfrage fehlgeschlagen:", reminderErr);
    }

    // --- 2. Ablauf-Benachrichtigungen -------------------------------------
    // Ohne erledigt-Filter: eine eskalierte Erwiderungsfrist wird von
    // processExpiredFristen auf erledigt gesetzt, soll aber trotzdem genau
    // einmal gemeldet werden. Die Idempotenz kommt allein aus
    // ablauf_benachrichtigt_at.
    const { data: ablaufFristen, error: ablaufErr } = await db
        .from("fristen")
        .select("id, matter_id, org_id, typ, fristende, reminderdatum, notiz")
        .is("ablauf_benachrichtigt_at", null)
        .lte("fristende", heute);

    if (ablaufErr) {
        console.error("[fristen-notify] Ablauf-Abfrage fehlgeschlagen:", ablaufErr);
    }

    const alle = [...(reminderFristen ?? []), ...(ablaufFristen ?? [])] as FristZeile[];
    if (alle.length === 0) return;

    if (!smtpEnabled) {
        // Eine aggregierte Meldung statt einer pro Zeile — der Scheduler läuft
        // alle 5 Minuten und würde das Log sonst zumüllen. Die Zeilen bleiben
        // unmarkiert, damit nach dem Konfigurieren von SMTP nachversandt wird.
        console.warn(
            `[fristen-notify] SMTP ist nicht konfiguriert — ${alle.length} Fristen-Benachrichtigung(en) ` +
                "können nicht versandt werden. SMTP_HOST/SMTP_USER/SMTP_PASS setzen.",
        );
        return;
    }

    const akten = await ladeAkten(db, [...new Set(alle.map((f) => f.matter_id))]);

    for (const frist of (reminderFristen ?? []) as FristZeile[]) {
        const akte = akten.get(frist.matter_id);
        if (!akte) continue;
        await benachrichtige(db, frist, akte, "erinnerung", "reminder_gesendet_at");
    }

    for (const frist of (ablaufFristen ?? []) as FristZeile[]) {
        const akte = akten.get(frist.matter_id);
        if (!akte) continue;
        await benachrichtige(db, frist, akte, "ablauf", "ablauf_benachrichtigt_at");
    }
}
