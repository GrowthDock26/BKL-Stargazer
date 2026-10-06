/**
 * Anspruchsschreiben-Route.
 *
 * Workflow:
 *   generate → (lawyer edits via PATCH) → approve → send
 *
 * LLM (LOGICC) ist ausschließlich für den Entwurfstext zuständig.
 * Freigabe und Versand erfordern Anwalt/Admin-Rolle.
 * Pflichthinweis: Jedes versendete Schreiben erhält einen KI-Disclosure-Text.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { completeText, DEFAULT_MAIN_MODEL } from "../lib/llm";
import { buildLegalSystemPrompt } from "../lib/klotzkette/system-prompt";
import { sendAnspruchMail, smtpEnabled } from "../lib/mail";
import { pseudonymisiere } from "../lib/matter/anonymize";
import { FRIST_TYP_ERWIDERUNG, berechneReminderdatum } from "../lib/matter/deadline-engine";

export const anspruchRouter = Router({ mergeParams: true });

type Db = ReturnType<typeof createServerSupabase>;

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

async function getMatter(matterId: string, db: Db) {
    const { data } = await db
        .from("matters")
        .select("id, org_id, state, aktenzeichen, bezeichnung")
        .eq("id", matterId)
        .maybeSingle();
    return data;
}

async function getMember(userId: string, orgId: string, db: Db) {
    const { data } = await db
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
    return data as { role: string } | null;
}

// ---------------------------------------------------------------------------
// POST /anspruch/:matterId/generate — KI-Entwurf erzeugen
// ---------------------------------------------------------------------------

anspruchRouter.post("/generate", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await getMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });
    if (!["Anwalt"].includes(member.role)) {
        return void res.status(403).json({ detail: "Nur Anwalt darf Anspruchsschreiben erzeugen" });
    }

    if (matter.state !== "RUECKLAUF_BESTAETIGT") {
        return void res.status(422).json({
            detail: `Anspruchsschreiben nur im Zustand RUECKLAUF_BESTAETIGT möglich (aktuell: ${matter.state})`,
        });
    }

    const { data: mandant } = await db
        .from("mandanten")
        .select("*")
        .eq("matter_id", matterId)
        .maybeSingle();

    if (!mandant) {
        return void res.status(422).json({ detail: "Aufnahmebogen fehlt" });
    }

    let entwurfText = "";
    try {
        entwurfText = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: buildLegalSystemPrompt(
                "Du bist ein deutschsprachiger Rechtsanwalt. " +
                "Erstelle ein vollständiges anwaltliches Anspruchsschreiben (Abmahnschreiben) " +
                "auf Basis des Sachverhalts. Das Schreiben richtet sich an die Gegenseite. " +
                "Struktur: Betreff, Sachverhaltsdarstellung, Rechtliche Bewertung, Forderung, " +
                "Reaktionsfrist (14 Tage), Ankündigung gerichtlicher Schritte. " +
                "Keine Platzhalter verwenden — schreibe vollständige, rechtlich klare Sätze. " +
                "Hinweis am Ende: 'Dieses Schreiben wurde mit KI-Unterstützung erstellt und " +
                "vom zuständigen Anwalt geprüft.'",
            ),
            // Datenminimierung (Art. 5 Abs. 1 lit. c DSGVO): Name, Geburtsdatum
            // und Adresse werden NICHT als Felder übermittelt, sondern durch ein
            // Pseudonym ersetzt.
            //
            // KEINE Anonymisierung: der Sachverhaltstext geht im Klartext an
            // LOGICC und enthält typischerweise Namen von Mandant und
            // Gegenseite. Die Zulässigkeit beruht daher auf dem AVV mit LOGICC
            // (Art. 28 DSGVO) und § 43e BRAO, nicht auf einer Pseudonymisierung.
            user:
                `Mandant-Referenz: ${pseudonymisiere(matterId)}\n` +
                `Aktenzeichen: ${matter.aktenzeichen || "—"}\n` +
                `Sachverhalt: ${mandant.beratungskurzbeschreibung || "(nicht angegeben)"}\n` +
                `Bezeichnung: ${matter.bezeichnung}`,
            maxTokens: 1500,
        });
    } catch (err) {
        return void res.status(500).json({ detail: `LLM-Fehler: ${err}` });
    }

    // Vorherigen Entwurf löschen, neuen anlegen
    await db.from("anspruch_drafts").delete().eq("matter_id", matterId);

    const { data: draft, error } = await db
        .from("anspruch_drafts")
        .insert({
            matter_id: matterId,
            org_id: matter.org_id,
            entwurf_text: entwurfText,
            model_id: DEFAULT_MAIN_MODEL,
            created_by: userId,
        })
        .select("id, entwurf_text, created_at")
        .single();

    if (error) return void res.status(500).json({ detail: error.message });

    // State transition → ANSPRUCH_ENTWURF
    await db.from("matter_transitions").insert({
        matter_id: matterId,
        from_state: "RUECKLAUF_BESTAETIGT",
        to_state: "ANSPRUCH_ENTWURF",
        triggered_by: userId,
        role: member.role,
        description: `Anspruchsschreiben-Entwurf via LOGICC (${DEFAULT_MAIN_MODEL}) erzeugt`,
    });
    await db
        .from("matters")
        .update({ state: "ANSPRUCH_ENTWURF", updated_at: new Date().toISOString() })
        .eq("id", matterId);

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "anspruch_draft",
        entity_id: draft.id,
        action: "anspruch_generated",
        actor_id: userId,
        actor_role: member.role,
        model_id: DEFAULT_MAIN_MODEL,
        details: { draft_id: draft.id },
    });

    res.json({ draft_id: draft.id, entwurf_text: draft.entwurf_text, state: "ANSPRUCH_ENTWURF" });
});

// ---------------------------------------------------------------------------
// GET /anspruch/:matterId — aktuellen Entwurf laden
// ---------------------------------------------------------------------------

anspruchRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await getMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const { data: draft } = await db
        .from("anspruch_drafts")
        .select("id, entwurf_text, model_id, approved_by, approved_at, created_at, updated_at")
        .eq("matter_id", matterId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!draft) return void res.status(404).json({ detail: "Kein Entwurf vorhanden" });
    res.json(draft);
});

// ---------------------------------------------------------------------------
// PATCH /anspruch/:matterId — Entwurf bearbeiten (Anwalt)
// ---------------------------------------------------------------------------

anspruchRouter.patch("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const { entwurf_text } = req.body ?? {};

    if (!entwurf_text?.trim()) {
        return void res.status(400).json({ detail: "entwurf_text ist erforderlich" });
    }

    const db = createServerSupabase();
    const matter = await getMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getMember(userId, matter.org_id, db);
    if (!member || !["Anwalt", "Admin"].includes(member.role)) {
        return void res.status(403).json({ detail: "Nur Anwalt oder Admin darf bearbeiten" });
    }

    if (!["ANSPRUCH_ENTWURF", "ANSPRUCH_FREIGEGEBEN"].includes(matter.state)) {
        return void res.status(422).json({ detail: "Entwurf in diesem Zustand nicht bearbeitbar" });
    }

    const { data, error } = await db
        .from("anspruch_drafts")
        .update({ entwurf_text, updated_at: new Date().toISOString() })
        .eq("matter_id", matterId)
        .select("id, entwurf_text, updated_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (error) return void res.status(500).json({ detail: error.message });
    res.json(data);
});

// ---------------------------------------------------------------------------
// POST /anspruch/:matterId/approve — Entwurf freigeben
// ---------------------------------------------------------------------------

anspruchRouter.post("/approve", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await getMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getMember(userId, matter.org_id, db);
    if (!member || !["Anwalt"].includes(member.role)) {
        return void res.status(403).json({ detail: "Nur Anwalt darf freigeben" });
    }

    if (matter.state !== "ANSPRUCH_ENTWURF") {
        return void res.status(422).json({ detail: "Matter not in ANSPRUCH_ENTWURF state" });
    }

    await db
        .from("anspruch_drafts")
        .update({ approved_by: userId, approved_at: new Date().toISOString() })
        .eq("matter_id", matterId);

    await db.from("matter_transitions").insert({
        matter_id: matterId,
        from_state: "ANSPRUCH_ENTWURF",
        to_state: "ANSPRUCH_FREIGEGEBEN",
        triggered_by: userId,
        role: member.role,
        description: "Anspruchsschreiben durch Anwalt geprüft und freigegeben",
    });
    await db
        .from("matters")
        .update({ state: "ANSPRUCH_FREIGEGEBEN", updated_at: new Date().toISOString() })
        .eq("id", matterId);

    res.json({ ok: true, state: "ANSPRUCH_FREIGEGEBEN" });
});

// ---------------------------------------------------------------------------
// POST /anspruch/:matterId/send — Anspruchsschreiben versenden
// ---------------------------------------------------------------------------

anspruchRouter.post("/send", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const { empfaenger_email, empfaenger_name, fristende } = req.body ?? {};

    if (!empfaenger_email || !fristende) {
        return void res.status(400).json({
            detail: "empfaenger_email und fristende (YYYY-MM-DD) sind erforderlich",
        });
    }

    // Die Reaktionsfrist wird gleich als überwachte Frist angelegt — deshalb
    // hier strikt validieren statt ein unbrauchbares Datum durchzulassen.
    const heute = new Date().toISOString().slice(0, 10);
    const fristendeStr = String(fristende);
    if (!ISO_DATUM.test(fristendeStr) || Number.isNaN(Date.parse(`${fristendeStr}T00:00:00Z`))) {
        return void res.status(400).json({
            detail: `fristende muss ein gültiges Datum im Format YYYY-MM-DD sein (erhalten: "${fristendeStr}")`,
        });
    }
    if (fristendeStr < heute) {
        return void res.status(400).json({
            detail: `Das Fristende (${fristendeStr}) liegt in der Vergangenheit. Bitte die tatsächliche Reaktionsfrist eintragen.`,
        });
    }

    const db = createServerSupabase();
    const matter = await getMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getMember(userId, matter.org_id, db);
    if (!member || !["Anwalt", "Admin"].includes(member.role)) {
        return void res.status(403).json({ detail: "Nur Anwalt oder Admin darf versenden" });
    }

    if (matter.state !== "ANSPRUCH_FREIGEGEBEN") {
        return void res.status(422).json({ detail: "Matter not in ANSPRUCH_FREIGEGEBEN state" });
    }

    const { data: draft } = await db
        .from("anspruch_drafts")
        .select("entwurf_text, approved_by")
        .eq("matter_id", matterId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!draft?.entwurf_text) {
        return void res.status(422).json({ detail: "Kein freigegebener Entwurf vorhanden" });
    }

    if (!draft.approved_by) {
        return void res.status(422).json({ detail: "Entwurf muss vor Versand freigegeben sein" });
    }

    const fristDe = new Date(fristende).toLocaleDateString("de-DE");
    const textContent = draft.entwurf_text;
    const attachment = Buffer.from(textContent, "utf-8");
    const filename = `Anspruchsschreiben_${matter.aktenzeichen ?? matterId}_${Date.now()}.txt`;

    let smtpMessageId: string | undefined;
    if (smtpEnabled) {
        try {
            smtpMessageId = await sendAnspruchMail({
                to: empfaenger_email as string,
                mandantName: (empfaenger_name as string) || empfaenger_email as string,
                attachment: { filename, content: attachment },
                fristende: fristDe,
            });
        } catch (err) {
            return void res.status(500).json({ detail: `E-Mail-Versand fehlgeschlagen: ${err}` });
        }
    }

    await db.from("mail_log").insert({
        matter_id: matterId,
        org_id: matter.org_id,
        empfaenger: empfaenger_email,
        betreff: "Anspruchsschreiben",
        smtp_message_id: smtpMessageId,
        sent_by: userId,
    });

    await db.from("matter_transitions").insert({
        matter_id: matterId,
        from_state: "ANSPRUCH_FREIGEGEBEN",
        to_state: "ANSPRUCH_VERSANDT",
        triggered_by: userId,
        role: member.role,
        description: `Anspruchsschreiben an ${empfaenger_email} versandt; Frist: ${fristDe}`,
    });

    // Reaktionsfrist als überwachte Frist anlegen und die Akte nach
    // FRIST_LAEUFT überführen.
    //
    // Ohne diese beiden Schritte lief die Fristüberwachung nach dem
    // Anspruchsversand faktisch nie an: der Scheduler betrachtet ausschließlich
    // Akten im Zustand FRIST_LAEUFT, in den vorher niemand wechselte, und es
    // existierte überhaupt keine fristen-Zeile. Ein Fristversäumnis wäre
    // unbemerkt geblieben.
    //
    // Der Typ FRIST_TYP_ERWIDERUNG ist der einzige, den die Engine eskaliert
    // (siehe deadline-engine.ts).
    const fristAngelegt = { fristende: fristendeStr, reminderdatum: berechneReminderdatum(fristendeStr, heute) };
    const { error: fristErr } = await db.from("fristen").insert({
        matter_id: matterId,
        org_id: matter.org_id,
        typ: FRIST_TYP_ERWIDERUNG,
        startdatum: heute,
        fristende: fristAngelegt.fristende,
        reminderdatum: fristAngelegt.reminderdatum,
        notiz: `Reaktionsfrist Anspruchsschreiben (${empfaenger_email})`,
        erledigt: false,
        created_by: userId,
    });

    // Schlägt das Anlegen der Frist fehl, darf die Akte NICHT als "Frist läuft"
    // gelten — sonst entstünde genau der stille Zustand, den dieser Block
    // verhindern soll. Der Versand ist bereits erfolgt, deshalb kein 500:
    // stattdessen bleibt die Akte in ANSPRUCH_VERSANDT und der Anwender wird
    // ausdrücklich zur manuellen Fristnotierung aufgefordert.
    const fristOk = !fristErr;
    if (fristErr) {
        console.error("[anspruch] Frist konnte nicht angelegt werden", fristErr);
    }

    await db
        .from("matters")
        .update({
            state: fristOk ? "FRIST_LAEUFT" : "ANSPRUCH_VERSANDT",
            updated_at: new Date().toISOString(),
        })
        .eq("id", matterId);

    if (fristOk) {
        await db.from("matter_transitions").insert({
            matter_id: matterId,
            from_state: "ANSPRUCH_VERSANDT",
            to_state: "FRIST_LAEUFT",
            triggered_by: userId,
            role: member.role,
            description: `Reaktionsfrist läuft bis ${fristDe} (Erinnerung ${fristAngelegt.reminderdatum})`,
        });
    }

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "anspruch_versandt",
        actor_id: userId,
        actor_role: member.role,
        details: {
            empfaenger: empfaenger_email,
            fristende: fristAngelegt.fristende,
            reminderdatum: fristAngelegt.reminderdatum,
            frist_angelegt: fristOk,
        },
    });

    const hinweise: string[] = [];
    if (!smtpEnabled) {
        hinweise.push(`Bitte Anspruchsschreiben manuell per E-Mail an ${empfaenger_email} senden.`);
    }
    if (!fristOk) {
        hinweise.push(
            "ACHTUNG: Die Reaktionsfrist konnte nicht automatisch angelegt werden. " +
                "Bitte die Frist sofort manuell in der Akte eintragen und im Fristenkalender notieren.",
        );
    }

    res.json({
        ok: true,
        state: fristOk ? "FRIST_LAEUFT" : "ANSPRUCH_VERSANDT",
        empfaenger: empfaenger_email,
        frist_angelegt: fristOk,
        fristende: fristAngelegt.fristende,
        reminderdatum: fristAngelegt.reminderdatum,
        manuell_versenden: !smtpEnabled,
        hinweis: hinweise.length ? hinweise.join(" ") : undefined,
    });
});
