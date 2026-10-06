/**
 * Matter (Mandat) API routes.
 *
 * All endpoints enforce:
 *  - Authentication via Supabase JWT
 *  - Organization membership check
 *  - Role-based transition gate via state-machine.ts
 *  - Audit log entry on every state change
 */

import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { uploadFile, downloadFile } from "../lib/storage";
import {
    validateTransition,
    isValidState,
    nextStates,
    type MatterState,
    type OrgRole,
} from "../lib/matter/state-machine";
import {
    generateOnboardingPaketUndBegleitmail,
    type OnboardingPaketResult,
} from "../lib/matter/onboardingPaket";
import { berechneReminderdatum } from "../lib/matter/deadline-engine";

export const mattersRouter = Router();

const KATEGORIEN = [
    "erbrecht",
    "gesellschaftsrecht",
    "kapitalmarktrecht",
    "pro_real",
    "steuerrecht",
    "sonstiges",
] as const;

// RA-Micro-Aktennummern haben die Form "123/24". Eingaben werden vor der
// Prüfung von Leerzeichen befreit ("123 / 24" → "123/24"), damit Tippvarianten
// nicht zu Dubletten führen. Strikte Prüfung ist hier gewollt: ein Tippfehler
// im Aktenzeichen bleibt sonst dauerhaft in der Akte stehen.
const AKTENZEICHEN_MUSTER = /^\d{1,6}\/\d{2}$/;

/**
 * Pflichtfristen für PRE9-/PRE10-Mandate, laut Ablaufplan „schon bei Anlage der
 * Akte einzutragen". Beides absolute Kampagnendaten, keine berechneten Fristen —
 * bei einer anderen Beteiligungsrunde müssen sie überprüft werden.
 *
 * Bewusst mit den Klartext-Typen aus der UI-Auswahlliste: die Fristen-Engine
 * eskaliert ausschließlich den technischen Typ ERWIDERUNGSFRIST. Eine
 * ablaufende Verjährungsfrist darf keinen Klage-Entwurf auslösen — benachrichtigt
 * wird trotzdem, denn die Benachrichtigung ist typunabhängig.
 */
const PRE_PFLICHTFRISTEN = [
    { typ: "Verjährungsfrist", fristende: "2026-12-31", notiz: "PRE9/PRE10 — Verjährung (Ablaufplan)" },
    { typ: "Notfrist", fristende: "2026-09-15", notiz: "PRE9/PRE10 — Vorfrist zur Verjährung (Ablaufplan)" },
] as const;

function normalisiereAktenzeichen(raw: unknown): string {
    return String(raw ?? "").replace(/\s+/g, "");
}

/**
 * Checkbox-Werte aus multipart-Formularen. Ein Browser sendet je nach Aufbau
 * "on", "true" oder "1"; ein fehlendes Feld heißt "nicht angekreuzt". Alles
 * andere gilt bewusst als false — bei einem unverstandenen Wert bleibt es beim
 * Verbrauchermandat und die Widerrufsbelehrung wird erzeugt.
 */
function istWahr(raw: unknown): boolean {
    if (typeof raw === "boolean") return raw;
    return ["true", "on", "1", "ja"].includes(String(raw ?? "").trim().toLowerCase());
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 10 },
});

type Db = ReturnType<typeof createServerSupabase>;

// ---------------------------------------------------------------------------
// Authorization helpers
// ---------------------------------------------------------------------------

type OrgMember = { role: OrgRole; org_id: string };

async function getOrgMember(
    userId: string,
    orgId: string,
    db: Db,
): Promise<OrgMember | null> {
    const { data } = await db
        .from("org_members")
        .select("role, org_id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
    return data as OrgMember | null;
}

type MatterFull = {
    id: string;
    org_id: string;
    state: string;
    aktenzeichen: string | null;
    bezeichnung: string;
    kategorie: string;
    anfrage: string | null;
    mandant_name: string | null;
    mandant_email: string | null;
    begleitmail_betreff: string | null;
    begleitmail_text: string | null;
    gwg_mail_betreff: string | null;
    gwg_mail_text: string | null;
    gwg_uebersprungen_at: string | null;
    gwg_uebersprungen_grund: string | null;
    zustaendiger_anwalt_id: string | null;
    sachbearbeiter: string | null;
    unternehmensmandat: boolean;
    archiviert_am: string | null;
    created_at: string;
    updated_at: string;
};

async function getMatterWithOrg(matterId: string, db: Db): Promise<MatterFull | null> {
    const { data } = await db
        .from("matters")
        .select(
            "id, org_id, state, aktenzeichen, bezeichnung, kategorie, anfrage, mandant_name, mandant_email, " +
                "begleitmail_betreff, begleitmail_text, gwg_mail_betreff, gwg_mail_text, " +
                "gwg_uebersprungen_at, gwg_uebersprungen_grund, " +
                "zustaendiger_anwalt_id, sachbearbeiter, unternehmensmandat, archiviert_am, created_at, updated_at",
        )
        .eq("id", matterId)
        .maybeSingle();
    return data as MatterFull | null;
}

// ---------------------------------------------------------------------------
// GET /matters — list all matters in org
// ---------------------------------------------------------------------------

mattersRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const orgId = req.query.org_id as string | undefined;
    if (!orgId) return void res.status(400).json({ detail: "org_id required" });

    const db = createServerSupabase();
    const member = await getOrgMember(userId, orgId, db);
    if (!member) return void res.status(403).json({ detail: "Not a member of this organization" });

    let query = db
        .from("matters")
        .select(
            "id, aktenzeichen, bezeichnung, state, kategorie, zustaendiger_anwalt_id, archiviert_am, created_at, updated_at",
        )
        .eq("org_id", orgId);

    // Archivierte Akten stehen der Übersicht standardmäßig im Weg — vor allem
    // in der Testphase, wo sich schnell viele Test-Akten ansammeln. Explizit
    // per Query-Parameter einblendbar, nichts wird dabei gelöscht.
    if (req.query.mit_archivierten !== "true") {
        query = query.is("archiviert_am", null);
    }

    const { data, error } = await query.order("updated_at", { ascending: false });

    if (error) return void res.status(500).json({ detail: error.message });
    res.json(data ?? []);
});

// ---------------------------------------------------------------------------
// POST /matters — create a new matter (state: NEU)
//
// multipart/form-data: org_id, bezeichnung, aktenzeichen, zustaendiger_anwalt_id,
// kategorie (a-f), anfrage (Freitext, optional), mandant_name (optional),
// dateien[] (optional, bis zu 10).
//
// Für alle Kategorien außer 'pro_real' wird direkt im Anschluss automatisch
// eine Honorarvereinbarung erzeugt und ein Begleitmail-Entwurf verfasst
// (nur Entwurf — Versand bleibt Teil des bestehenden Onboarding-Ablaufs).
// Pro-Real-Mandate durchlaufen stattdessen den gesonderten
// Kapitalmarktrecht-Workflow.
// ---------------------------------------------------------------------------

mattersRouter.post("/", requireAuth, upload.array("dateien", 10), async (req, res) => {
    const userId = res.locals.userId as string;
    const { org_id, bezeichnung, aktenzeichen, zustaendiger_anwalt_id, anfrage, mandant_name, mandant_email } =
        req.body ?? {};
    const kategorie = (req.body?.kategorie as string | undefined) ?? "sonstiges";
    // Kommt aus einem multipart-Formular und damit als String an ("true"/"on").
    const unternehmensmandat = istWahr(req.body?.unternehmensmandat);

    if (!org_id || !bezeichnung) {
        return void res.status(400).json({ detail: "org_id and bezeichnung are required" });
    }
    if (!KATEGORIEN.includes(kategorie as (typeof KATEGORIEN)[number])) {
        return void res.status(400).json({ detail: `kategorie muss einer von: ${KATEGORIEN.join(", ")} sein` });
    }
    // Die GwG-Strecke startet NICHT mehr bei der Aktenanlage, sondern erst mit
    // dem Rücklauf der Vollmacht ("GwG-Prüfung starten" auf der Akte).
    //
    // Grund ist der tatsächliche Ablauf der Kanzlei: Bei der Anlage steht noch
    // nicht fest, ob überhaupt ein Mandat zustande kommt. Erst mit der
    // unterzeichneten Vollmacht wird die Akte in RA-Micro geführt, erst dann
    // gibt es eine Aktennummer, und erst dann beginnt die Geschäftsbeziehung,
    // an die die Identifizierungspflicht anknüpft. Ein Hinweisschreiben mit der
    // Bitte um eine Ausweiskopie an jemanden zu schicken, der sich noch gar
    // nicht entschieden hat, ist der falsche erste Kontakt.
    //
    // Die Akte bleibt damit nach der Anlage in NEU; der Aufnahmebogen bleibt
    // bis zur bestätigten Risikoeinstufung gesperrt.

    const aktenzeichenNorm = normalisiereAktenzeichen(aktenzeichen);
    if (aktenzeichenNorm && !AKTENZEICHEN_MUSTER.test(aktenzeichenNorm)) {
        return void res.status(400).json({
            detail:
                `"${String(aktenzeichen).trim()}" ist keine gültige RA-Micro-Aktennummer. ` +
                "Erwartet wird die Form 123/24 (Nummer, Schrägstrich, zweistelliges Jahr).",
        });
    }

    const db = createServerSupabase();
    const member = await getOrgMember(userId, org_id, db);
    if (!member) return void res.status(403).json({ detail: "Not a member of this organization" });

    const { data, error } = await db
        .from("matters")
        .insert({
            org_id,
            bezeichnung: String(bezeichnung).trim(),
            aktenzeichen: aktenzeichenNorm || null,
            zustaendiger_anwalt_id: zustaendiger_anwalt_id ?? null,
            kategorie,
            anfrage: anfrage ? String(anfrage).trim() : null,
            mandant_name: mandant_name ? String(mandant_name).trim() : null,
            mandant_email: mandant_email ? String(mandant_email).trim() : null,
            unternehmensmandat,
            created_by: userId,
            state: "NEU",
        })
        .select("id, aktenzeichen, bezeichnung, state, kategorie, unternehmensmandat, created_at")
        .single();

    if (error) {
        // Spalte fehlt = Migration 2026-08-05 noch nicht eingespielt. Ohne diesen
        // Hinweis meldet PostgREST nur "column not found in schema cache", und die
        // Aktenanlage bliebe ohne erkennbaren Grund stehen. Bewusst ein Fehler und
        // kein stilles Weglassen des Feldes: sonst bekäme ein als
        // Unternehmensmandat angelegtes Mandat unbemerkt eine Widerrufsbelehrung.
        if (error.code === "PGRST204" && error.message?.includes("unternehmensmandat")) {
            return void res.status(500).json({
                detail:
                    "Die Datenbank kennt das Feld „Unternehmensmandat“ noch nicht. " +
                    "Bitte migration-2026-08-05.sql im Supabase-SQL-Editor ausführen.",
            });
        }
        // 23505 = unique_violation (partieller Unique-Index auf org_id, aktenzeichen).
        // Ohne diese Übersetzung sieht der Anwender die rohe Postgres-Meldung.
        if (error.code === "23505") {
            return void res.status(409).json({
                detail:
                    `Zu der Aktennummer ${aktenzeichenNorm} existiert in dieser Kanzlei bereits eine Akte. ` +
                    "Bitte die bestehende Akte öffnen oder die Aktennummer korrigieren.",
            });
        }
        return void res.status(500).json({ detail: error.message });
    }

    await db.from("audit_log").insert({
        org_id,
        entity_type: "matter",
        entity_id: data.id,
        action: "matter_created",
        actor_id: userId,
        actor_role: member.role,
    });

    // PRE9/PRE10: die beiden Pflichtfristen sofort anlegen. Der Ablaufplan
    // verlangt das ausdrücklich bei Aktenanlage; bislang war es reine manuelle
    // Disziplin, und ein Versäumnis bei der Verjährung führt zum Rechtsverlust.
    const pflichtfristen: { typ: string; fristende: string }[] = [];
    if (kategorie === "pro_real") {
        const heute = new Date().toISOString().slice(0, 10);
        for (const f of PRE_PFLICHTFRISTEN) {
            const { error: fristErr } = await db.from("fristen").insert({
                matter_id: data.id,
                org_id,
                typ: f.typ,
                startdatum: heute,
                fristende: f.fristende,
                reminderdatum: berechneReminderdatum(f.fristende, heute),
                notiz: f.notiz,
                erledigt: false,
                created_by: userId,
            });
            if (fristErr) {
                console.error(`[matters] PRE-Pflichtfrist ${f.typ} nicht angelegt`, fristErr);
            } else {
                pflichtfristen.push({ typ: f.typ, fristende: f.fristende });
            }
        }
        await db.from("audit_log").insert({
            org_id,
            entity_type: "matter",
            entity_id: data.id,
            action: "pre_pflichtfristen_angelegt",
            actor_id: userId,
            actor_role: member.role,
            details: { angelegt: pflichtfristen, erwartet: PRE_PFLICHTFRISTEN.length },
        });
    }

    // Optionale Uploads (Informationen zur Anfrage), direkt bei Aktenanlage
    const files = (req.files ?? []) as Express.Multer.File[];
    const uploadedDocs: { filename: string }[] = [];
    for (const file of files) {
        try {
            const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
            const storagePath = `orgs/${org_id}/matters/${data.id}/anfrage/${Date.now()}_${file.originalname}`;
            await uploadFile(storagePath, file.buffer, file.mimetype);
            await db.from("matter_documents").insert({
                matter_id: data.id,
                org_id,
                filename: file.originalname,
                storage_path: storagePath,
                file_hash_sha256: sha256,
                file_size_bytes: file.size,
                mime_type: file.mimetype,
                doc_type: "ANFRAGE_UPLOAD",
                uploaded_by: userId,
            });
            uploadedDocs.push({ filename: file.originalname });
        } catch (err) {
            console.error("[matters] Anfrage-Upload fehlgeschlagen", err);
        }
    }

    // Das vollständige generische Onboarding-Paket (Anschreiben, Honorar-
    // vereinbarung, Vollmacht, Widerrufsbelehrung) wird für alle Kategorien
    // außer Pro-Real erzeugt. Pro-Real-Mandate haben ihr eigenes, vollständiges
    // Dokumentpaket (Informationsschreiben, Fragebogen, Vollmacht,
    // Beschränkungsvereinbarung, Widerrufsbelehrung, Datenschutzhinweise —
    // siehe lib/interessent/unterlagen.ts), das bereits VOR der Aktenanlage im
    // Interessenten-Workflow verschickt wurde. Das generische Paket passt
    // fachlich nicht: ProReal-Mandate laufen als reines RVG-Mandat ohne
    // gesondert unterschriebene Honorarvereinbarung — das generische Anschreiben
    // würde um die Rücksendung eines Dokuments bitten, das es für dieses Mandat
    // gar nicht gibt.
    const onboardingPaket: OnboardingPaketResult =
        kategorie === "pro_real"
            ? {
                  ok: false,
                  hinweis:
                      "Pro-Real-Mandate erhalten kein generisches Onboarding-Paket — die " +
                      "Mandatsunterlagen (Informationsschreiben, Fragebogen, Vollmacht, " +
                      "Widerrufsbelehrung) wurden bereits vor der Aktenanlage im " +
                      "Interessenten-Workflow verschickt.",
              }
            : await generateOnboardingPaketUndBegleitmail({
                  matterId: data.id,
                  orgId: org_id,
                  bezeichnung: data.bezeichnung,
                  aktenzeichen: data.aktenzeichen,
                  kategorie,
                  anfrage: anfrage ? String(anfrage).trim() : null,
                  mandantName: mandant_name ? String(mandant_name).trim() : null,
                  unternehmensmandat,
                  userId,
                  db,
              });

    res.status(201).json({
        ...data,
        uploaded_documents: uploadedDocs.length,
        onboarding_paket: onboardingPaket,
        // Bleibt null: Die GwG-Strecke startet erst mit dem Rücklauf der
        // Vollmacht über "GwG-Prüfung starten" auf der Akte.
        gwg_anschreiben: null,
        pro_real_workflow: kategorie === "pro_real",
        pflichtfristen,
    });
});

// ---------------------------------------------------------------------------
// PATCH /matters/:matterId — RA-Micro-Aktennummer nachtragen oder korrigieren
//
// Die Nummer entsteht erst, wenn die Akte nach Rücklauf der Vollmacht in
// RA-Micro angelegt wird — bei der Anlage hier ist sie deshalb leer. Geprüft
// wird mit demselben Muster und derselben Dublettensperre wie bei der Anlage;
// eine zweite, laxere Eingabestelle würde die Prüfung wertlos machen.
// ---------------------------------------------------------------------------

mattersRouter.patch("/:matterId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await getMatterWithOrg(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });
    if (!["Admin", "Anwalt", "Referendar", "ReFa"].includes(member.role)) {
        return void res.status(403).json({ detail: "Unzureichende Berechtigung" });
    }

    if (req.body?.aktenzeichen === undefined) {
        return void res.status(400).json({ detail: "aktenzeichen fehlt" });
    }

    const roh = String(req.body.aktenzeichen ?? "").trim();
    const aktenzeichenNorm = normalisiereAktenzeichen(roh);
    if (aktenzeichenNorm && !AKTENZEICHEN_MUSTER.test(aktenzeichenNorm)) {
        return void res.status(400).json({
            detail:
                `"${roh}" ist keine gültige RA-Micro-Aktennummer. ` +
                "Erwartet wird die Form 123/24 (Nummer, Schrägstrich, zweistelliges Jahr).",
        });
    }

    const neu = aktenzeichenNorm || null;
    const { data, error } = await db
        .from("matters")
        .update({ aktenzeichen: neu, updated_at: new Date().toISOString() })
        .eq("id", matterId)
        .select("id, aktenzeichen")
        .single();

    if (error) {
        if (error.code === "23505") {
            return void res.status(409).json({
                detail:
                    `Zu der Aktennummer ${aktenzeichenNorm} existiert in dieser Kanzlei bereits eine Akte. ` +
                    "Bitte die bestehende Akte öffnen oder die Aktennummer korrigieren.",
            });
        }
        return void res.status(500).json({ detail: error.message });
    }

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "aktenzeichen_geaendert",
        actor_id: userId,
        actor_role: member.role,
        details: { von: matter.aktenzeichen, nach: neu },
    });

    res.json(data);
});

// ---------------------------------------------------------------------------
// GET /matters/:matterId — get matter detail with transitions
// ---------------------------------------------------------------------------

mattersRouter.get("/:matterId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await getMatterWithOrg(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const { data: transitions } = await db
        .from("matter_transitions")
        .select("from_state, to_state, triggered_by, role, description, created_at")
        .eq("matter_id", matterId)
        .order("created_at", { ascending: true });

    const { data: fristen } = await db
        .from("fristen")
        .select(
            "id, typ, startdatum, fristende, reminderdatum, erledigt, notiz, " +
                "reminder_gesendet_at, ablauf_benachrichtigt_at",
        )
        .eq("matter_id", matterId)
        .order("fristende", { ascending: true });

    res.json({
        ...matter,
        // Rolle des aufrufenden Nutzers, damit das Frontend Aktionen ausblenden
        // kann, die serverseitig ohnehin mit 403 abgelehnt würden. Die
        // Durchsetzung bleibt ausschließlich serverseitig.
        user_role: member.role,
        possible_next_states: nextStates(matter.state as MatterState),
        transitions: transitions ?? [],
        fristen: fristen ?? [],
    });
});

// ---------------------------------------------------------------------------
// POST /matters/:matterId/archivieren, POST /matters/:matterId/entarchivieren
//
// Nur Admin. Blendet die Akte aus der Standardübersicht aus (bzw. wieder ein) —
// löscht nichts. Echtes Löschen ist für eine Kanzlei-Akte bewusst nicht
// vorgesehen: Dokumente, Fristen und der Audit-Trail bleiben vollständig
// erhalten, auch wegen der berufsrechtlichen Aufbewahrungspflicht (§ 50 BRAO),
// sobald echte (nicht nur Test-)Mandate im System stehen.
// ---------------------------------------------------------------------------

mattersRouter.post("/:matterId/archivieren", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await getMatterWithOrg(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });
    if (member.role !== "Admin") {
        return void res.status(403).json({ detail: "Nur Admins dürfen Akten archivieren" });
    }

    if (matter.archiviert_am) {
        return void res.status(422).json({ detail: "Akte ist bereits archiviert" });
    }

    const { data, error } = await db
        .from("matters")
        .update({ archiviert_am: new Date().toISOString(), archiviert_von: userId })
        .eq("id", matterId)
        .select("id, archiviert_am")
        .single();
    if (error) return void res.status(500).json({ detail: error.message });

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "archiviert",
        actor_id: userId,
        actor_role: member.role,
    });

    res.json(data);
});

mattersRouter.post("/:matterId/entarchivieren", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await getMatterWithOrg(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });
    if (member.role !== "Admin") {
        return void res.status(403).json({ detail: "Nur Admins dürfen Akten wiederherstellen" });
    }

    if (!matter.archiviert_am) {
        return void res.status(422).json({ detail: "Akte ist nicht archiviert" });
    }

    const { data, error } = await db
        .from("matters")
        .update({ archiviert_am: null, archiviert_von: null })
        .eq("id", matterId)
        .select("id, archiviert_am")
        .single();
    if (error) return void res.status(500).json({ detail: error.message });

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "entarchiviert",
        actor_id: userId,
        actor_role: member.role,
    });

    res.json(data);
});

// ---------------------------------------------------------------------------
// POST /matters/:matterId/transition — perform a state transition
// ---------------------------------------------------------------------------

mattersRouter.post("/:matterId/transition", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const { to_state, beschreibung } = req.body ?? {};

    if (!to_state || !isValidState(to_state)) {
        return void res.status(400).json({ detail: "Valid to_state is required" });
    }

    const db = createServerSupabase();
    const matter = await getMatterWithOrg(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const result = validateTransition(
        matter.state as MatterState,
        to_state as MatterState,
        member.role,
    );

    if (!result.ok) {
        return void res.status(422).json({ detail: result.reason });
    }

    // Write transition + update matter state atomically (best-effort in Supabase)
    const { error: tErr } = await db.from("matter_transitions").insert({
        matter_id: matterId,
        from_state: matter.state,
        to_state,
        triggered_by: userId,
        role: member.role,
        description: beschreibung || result.description,
    });
    if (tErr) return void res.status(500).json({ detail: tErr.message });

    const { error: mErr } = await db
        .from("matters")
        .update({ state: to_state, updated_at: new Date().toISOString() })
        .eq("id", matterId);
    if (mErr) return void res.status(500).json({ detail: mErr.message });

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "state_transition",
        actor_id: userId,
        actor_role: member.role,
        details: { from: matter.state, to: to_state },
    });

    res.json({ ok: true, from: matter.state, to: to_state });
});

// ---------------------------------------------------------------------------
// POST /matters/:matterId/fristen — create a deadline entry
// ---------------------------------------------------------------------------

mattersRouter.post("/:matterId/fristen", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const { typ, startdatum, fristende, reminderdatum, notiz } = req.body ?? {};

    if (!typ || !startdatum || !fristende) {
        return void res.status(400).json({ detail: "typ, startdatum und fristende sind erforderlich" });
    }

    const db = createServerSupabase();
    const matter = await getMatterWithOrg(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const { data, error } = await db
        .from("fristen")
        .insert({
            matter_id: matterId,
            org_id: matter.org_id,
            typ,
            startdatum,
            fristende,
            reminderdatum: reminderdatum || null,
            notiz: notiz || null,
            erledigt: false,
        })
        .select("id, typ, startdatum, fristende, reminderdatum, erledigt, notiz")
        .single();

    if (error) return void res.status(500).json({ detail: error.message });

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "frist",
        entity_id: data.id,
        action: "frist_created",
        actor_id: userId,
        actor_role: member.role,
        details: { typ, fristende },
    });

    res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// PATCH /matters/:matterId/fristen/:fristId — Frist bearbeiten oder abhaken
//
// Alle Felder sind optional; nur mitgesendete Felder werden geändert.
// Ändert sich fristende oder reminderdatum, werden die Benachrichtigungs-
// Zeitstempel zurückgesetzt, damit eine verlängerte Frist erneut erinnert wird.
// Jede Änderung wird protokolliert (Fristen sind haftungsrelevant).
// ---------------------------------------------------------------------------

const FRIST_ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

mattersRouter.patch("/:matterId/fristen/:fristId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId, fristId } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const db = createServerSupabase();
    const matter = await getMatterWithOrg(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const { data: vorher } = await db
        .from("fristen")
        .select("id, typ, startdatum, fristende, reminderdatum, erledigt, notiz")
        .eq("id", fristId)
        .eq("matter_id", matterId)
        .maybeSingle();

    if (!vorher) return void res.status(404).json({ detail: "Frist nicht gefunden" });

    const patch: Record<string, unknown> = {};

    if ("erledigt" in body) patch.erledigt = body.erledigt === true;
    if ("typ" in body) {
        const typ = String(body.typ ?? "").trim();
        if (!typ) return void res.status(400).json({ detail: "typ darf nicht leer sein" });
        patch.typ = typ;
    }
    if ("notiz" in body) patch.notiz = String(body.notiz ?? "").trim() || null;

    for (const feld of ["startdatum", "fristende", "reminderdatum"] as const) {
        if (!(feld in body)) continue;
        const rohwert = body[feld];
        // reminderdatum darf ausdrücklich geleert werden, die anderen nicht.
        if (rohwert === null || rohwert === "") {
            if (feld === "reminderdatum") {
                patch.reminderdatum = null;
                continue;
            }
            return void res.status(400).json({ detail: `${feld} darf nicht leer sein` });
        }
        const wert = String(rohwert);
        if (!FRIST_ISO_DATUM.test(wert) || Number.isNaN(Date.parse(`${wert}T00:00:00Z`))) {
            return void res.status(400).json({
                detail: `${feld} muss ein gültiges Datum im Format YYYY-MM-DD sein (erhalten: "${wert}")`,
            });
        }
        patch[feld] = wert;
    }

    if (Object.keys(patch).length === 0) {
        return void res.status(400).json({ detail: "Keine Änderungen übergeben" });
    }

    // Plausibilität gegen den zusammengeführten Endzustand prüfen, nicht nur
    // gegen die übergebenen Felder.
    const neuStart = (patch.startdatum as string) ?? vorher.startdatum;
    const neuEnde = (patch.fristende as string) ?? vorher.fristende;
    const neuReminder =
        "reminderdatum" in patch ? (patch.reminderdatum as string | null) : vorher.reminderdatum;

    if (neuEnde < neuStart) {
        return void res.status(400).json({
            detail: `Das Fristende (${neuEnde}) darf nicht vor dem Startdatum (${neuStart}) liegen.`,
        });
    }
    if (neuReminder && neuReminder > neuEnde) {
        return void res.status(400).json({
            detail: `Das Erinnerungsdatum (${neuReminder}) darf nicht nach dem Fristende (${neuEnde}) liegen.`,
        });
    }

    // Datumsänderung → Benachrichtigungen neu bewaffnen.
    const datumGeaendert = neuEnde !== vorher.fristende || neuReminder !== vorher.reminderdatum;
    if (datumGeaendert) {
        patch.reminder_gesendet_at = null;
        patch.ablauf_benachrichtigt_at = null;
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await db
        .from("fristen")
        .update(patch)
        .eq("id", fristId)
        .eq("matter_id", matterId)
        .select(
            "id, typ, startdatum, fristende, reminderdatum, erledigt, notiz, " +
                "reminder_gesendet_at, ablauf_benachrichtigt_at",
        )
        .single();

    if (error) return void res.status(500).json({ detail: error.message });

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "frist",
        entity_id: fristId,
        action: "frist_geaendert",
        actor_id: userId,
        actor_role: member.role,
        details: {
            vorher: {
                typ: vorher.typ,
                startdatum: vorher.startdatum,
                fristende: vorher.fristende,
                reminderdatum: vorher.reminderdatum,
                erledigt: vorher.erledigt,
                notiz: vorher.notiz,
            },
            nachher: data,
            benachrichtigung_zurueckgesetzt: datumGeaendert,
        },
    });

    res.json(data);
});

// ---------------------------------------------------------------------------
// GET /matters/:matterId/documents — list matter documents
// ---------------------------------------------------------------------------

mattersRouter.get("/:matterId/documents", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await getMatterWithOrg(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const { data, error } = await db
        .from("matter_documents")
        .select("id, filename, doc_type, version_number, file_hash_sha256, docx_storage_path, created_at")
        .eq("matter_id", matterId)
        .order("created_at", { ascending: false });

    if (error) return void res.status(500).json({ detail: error.message });

    const withUrls = (data ?? []).map(({ docx_storage_path, ...d }) => ({
        ...d,
        download_url: `/matters/${matterId}/documents/${d.id}/download`,
        download_docx_url: docx_storage_path
            ? `/matters/${matterId}/documents/${d.id}/download?format=docx`
            : null,
    }));
    res.json(withUrls);
});

// ---------------------------------------------------------------------------
// GET /matters/:matterId/documents/:docId/download — Onboarding-/Aktendokument
// herunterladen (matter_documents; separat vom allgemeinen /download/:token-
// Mechanismus, der für die andere Dokumentenablage aus mike gebaut ist).
// ---------------------------------------------------------------------------

mattersRouter.get("/:matterId/documents/:docId/download", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId, docId } = req.params;
    const db = createServerSupabase();

    const matter = await getMatterWithOrg(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const { data: doc } = await db
        .from("matter_documents")
        .select("filename, storage_path, docx_storage_path, mime_type")
        .eq("id", docId)
        .eq("matter_id", matterId)
        .maybeSingle();
    if (!doc) return void res.status(404).json({ detail: "Document not found" });

    const wantsDocx = req.query.format === "docx";
    if (wantsDocx && !doc.docx_storage_path) {
        return void res.status(404).json({ detail: "Keine Word-Fassung für dieses Dokument vorhanden" });
    }

    const raw = await downloadFile(wantsDocx ? doc.docx_storage_path! : doc.storage_path);
    if (!raw) return void res.status(404).json({ detail: "File not found in storage" });

    const filename = wantsDocx
        ? doc.filename.replace(/\.pdf$/i, ".docx")
        : doc.filename;
    res.setHeader(
        "Content-Type",
        wantsDocx
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : doc.mime_type || "application/octet-stream",
    );
    res.setHeader(
        "Content-Disposition",
        `${wantsDocx ? "attachment" : "inline"}; filename="${filename.replace(/"/g, "")}"`,
    );
    res.send(Buffer.from(raw));
});

// ---------------------------------------------------------------------------
// DELETE /matters/:matterId/mandant — Art. 17 DSGVO: Mandantendaten loeschen
// Nur Admin. Akte bleibt fuer Buchfuehrungspflicht (§ 257 HGB).
// ---------------------------------------------------------------------------

mattersRouter.delete("/:matterId/mandant", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await getMatterWithOrg(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member || member.role !== "Admin") {
        return void res.status(403).json({ detail: "Nur Admin darf Mandantendaten loeschen (Art. 17 DSGVO)" });
    }

    const { error: delErr } = await db
        .from("mandanten")
        .update({
            vorname: "[geloescht]",
            nachname: "[geloescht]",
            anrede: null, geburtsdatum: null, beruf: null, email: null,
            telefon: null, strasse: null, hausnummer: null, plz: null, ort: null,
            beratungskurzbeschreibung: "[geloescht gem. Art. 17 DSGVO]",
            updated_at: new Date().toISOString(),
        })
        .eq("matter_id", matterId);

    if (delErr) return void res.status(500).json({ detail: delErr.message });

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "mandant_dsgvo_loeschung",
        actor_id: userId,
        actor_role: member.role,
        details: { grund: "Art. 17 DSGVO", zeitpunkt: new Date().toISOString() },
    });

    res.json({ ok: true, hinweis: "Personenbezogene Daten ueberschrieben. Akte bleibt erhalten (§ 257 HGB)." });
});
