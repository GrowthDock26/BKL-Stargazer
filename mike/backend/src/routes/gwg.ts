/**
 * GwG-Ablauf: GwG-Hinweisschreiben, Personalausweis-Upload (KI-Vision-
 * Extraktion), Risikoeinstufung (deterministisch, lib/tools/gwg.ts).
 *
 * Mounted at: /matters/:matterId/gwg (mergeParams = true)
 *
 * Nur für Kategorien kapitalmarktrecht, pro_real, gesellschaftsrecht
 * relevant (siehe matters.ts) — für andere Kategorien liefert GET / einfach
 * leere Felder, die Endpunkte funktionieren aber unabhängig davon.
 */

import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { uploadFile } from "../lib/storage";
import { completeLogiccVision } from "../lib/llm/logicc";
import { classifyGwgRisiko, unterliegtGwgAblauf, GWG_OFFENE_ZUSTAENDE } from "../lib/tools/gwg";
import { generateGwgAnschreiben } from "../lib/matter/gwgAnschreiben";
import { validateTransition, type MatterState, type OrgRole } from "../lib/matter/state-machine";

export const gwgRouter = Router({ mergeParams: true });

type Db = ReturnType<typeof createServerSupabase>;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const allowed = ["application/pdf", "image/jpeg", "image/png", "image/tiff", "image/webp"];
        cb(null, allowed.includes(file.mimetype));
    },
});

async function getOrgMember(userId: string, orgId: string, db: Db) {
    const { data } = await db
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
    return data as { role: string } | null;
}

async function loadMatter(matterId: string, db: Db) {
    const { data } = await db
        .from("matters")
        .select("id, org_id, state, kategorie, bezeichnung, aktenzeichen, mandant_name, mandant_email, gwg_mail_betreff, gwg_mail_text")
        .eq("id", matterId)
        .maybeSingle();
    return data;
}

// ---------------------------------------------------------------------------
// GET / — GwG-Status der Akte (Anschreiben, PA-Upload, letzte Einstufung)
// ---------------------------------------------------------------------------

gwgRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await loadMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const { data: personalausweisDoc } = await db
        .from("matter_documents")
        .select("id, filename, created_at")
        .eq("matter_id", matterId)
        .eq("doc_type", "GWG_PERSONALAUSWEIS")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    const { data: pruefung } = await db
        .from("gwg_pruefungen")
        .select(
            "id, land_code, pep, wirtschaftlich_berechtigter_identisch, transaktionsland, " +
                "risikoklasse, ausgeloeste_faktoren, dokumentationsluecken, hinweis, " +
                "bestaetigt_von, bestaetigt_at, created_at",
        )
        .eq("matter_id", matterId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    res.json({
        gwg_mail_betreff: matter.gwg_mail_betreff,
        gwg_mail_text: matter.gwg_mail_text,
        mandant_email: matter.mandant_email,
        state: matter.state,
        personalausweis: personalausweisDoc ?? null,
        pruefung: pruefung ?? null,
    });
});

// ---------------------------------------------------------------------------
// POST /anschreiben — GwG-Ablauf für eine Akte im Zustand NEU nachholen
//
// Normalerweise entsteht das GwG-Anschreiben bei der Aktenanlage. Dieser
// Endpunkt deckt zwei Fälle ab, in denen das nicht passiert ist:
//   1. Die Kategorie wurde erst nachträglich GwG-pflichtig (z.B. Erbrecht).
//      Bestandsakten stünden sonst in einer Sackgasse: der Aufnahmebogen ist
//      gesperrt, aber es gäbe keinen Weg in den GwG-Ablauf.
//   2. Die Erzeugung bei der Anlage ist fehlgeschlagen.
//
// mandant_email darf hier nachgereicht werden, weil Altakten sie nicht haben.
// ---------------------------------------------------------------------------

gwgRouter.post("/anschreiben", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await loadMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    if (!unterliegtGwgAblauf(matter.kategorie)) {
        return void res.status(422).json({
            detail: `Kategorie "${matter.kategorie}" unterliegt nicht dem GwG-Ablauf.`,
        });
    }
    if (matter.state !== "NEU") {
        return void res.status(422).json({
            detail: `Der GwG-Ablauf kann nur aus dem Zustand "Neu" gestartet werden (aktuell: ${matter.state}).`,
        });
    }

    const eingabeEmail = String((req.body as { mandant_email?: string })?.mandant_email ?? "").trim();
    const email = eingabeEmail || matter.mandant_email;
    if (!email) {
        return void res.status(400).json({
            detail: "E-Mail-Adresse des Mandanten erforderlich — sie wird für das GwG-Hinweisschreiben benötigt.",
        });
    }
    if (eingabeEmail && eingabeEmail !== matter.mandant_email) {
        await db.from("matters").update({ mandant_email: eingabeEmail }).eq("id", matterId);
    }

    const result = validateTransition(
        matter.state as MatterState,
        "GWG_ANSCHREIBEN_ERZEUGT" as MatterState,
        member.role as OrgRole,
    );
    if (!result.ok) return void res.status(422).json({ detail: result.reason });

    const anschreiben = await generateGwgAnschreiben({
        matterId,
        orgId: matter.org_id,
        bezeichnung: matter.bezeichnung,
        aktenzeichen: matter.aktenzeichen,
        mandantName: matter.mandant_name,
        userId,
        db,
    });

    await db.from("matter_transitions").insert({
        matter_id: matterId,
        from_state: "NEU",
        to_state: "GWG_ANSCHREIBEN_ERZEUGT",
        triggered_by: userId,
        role: member.role,
        description: "GwG-Ablauf nachträglich gestartet; Hinweisschreiben erzeugt",
    });
    await db
        .from("matters")
        .update({ state: "GWG_ANSCHREIBEN_ERZEUGT", updated_at: new Date().toISOString() })
        .eq("id", matterId);

    res.status(201).json({ ok: true, state: "GWG_ANSCHREIBEN_ERZEUGT", ...anschreiben });
});

// ---------------------------------------------------------------------------
// POST /uebergehen — GwG-Prüfung durch den Anwalt abwählen
//
// Für Fälle, in denen die Identifizierung des Mandanten bereits vorliegt —
// typischerweise aus einem früheren Mandat. Die Entscheidung trifft
// ausschließlich ein Anwalt oder Admin (§ 10 Abs. 2 GwG: die Bewertungshoheit
// liegt bei der Kanzlei) und sie wird mit Person, Zeitpunkt und Begründung
// festgehalten — ohne Begründung ist die Abwahl später nicht nachvollziehbar.
//
// Danach steht die Akte auf GWG_GEPRUEFT und der Aufnahmebogen ist frei.
// ---------------------------------------------------------------------------

gwgRouter.post("/uebergehen", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await loadMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member || !["Anwalt", "Admin"].includes(member.role)) {
        return void res.status(403).json({ detail: "Nur Anwalt oder Admin darf die GwG-Prüfung übergehen" });
    }

    const grund = String((req.body as { grund?: string })?.grund ?? "").trim();
    if (grund.length < 10) {
        return void res.status(400).json({
            detail:
                "Bitte eine nachvollziehbare Begründung angeben (mindestens 10 Zeichen), " +
                "z. B. \"Legitimierung liegt aus Akte 44/25 vom 12.03.2026 vor\".",
        });
    }

    if (!(GWG_OFFENE_ZUSTAENDE as readonly string[]).includes(matter.state)) {
        return void res.status(422).json({
            detail: `Die GwG-Prüfung ist in diesem Zustand nicht mehr offen (aktuell: ${matter.state}).`,
        });
    }

    const result = validateTransition(
        matter.state as MatterState,
        "GWG_GEPRUEFT" as MatterState,
        member.role as OrgRole,
    );
    if (!result.ok) return void res.status(422).json({ detail: result.reason });

    const jetzt = new Date().toISOString();
    await db
        .from("matters")
        .update({
            state: "GWG_GEPRUEFT",
            gwg_uebersprungen_at: jetzt,
            gwg_uebersprungen_von: userId,
            gwg_uebersprungen_grund: grund,
            updated_at: jetzt,
        })
        .eq("id", matterId);

    await db.from("matter_transitions").insert({
        matter_id: matterId,
        from_state: matter.state,
        to_state: "GWG_GEPRUEFT",
        triggered_by: userId,
        role: member.role,
        description: `GwG-Prüfung übergangen: ${grund}`,
    });

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "gwg_pruefung_uebergangen",
        actor_id: userId,
        actor_role: member.role,
        details: { grund, von_zustand: matter.state },
    });

    res.json({ ok: true, state: "GWG_GEPRUEFT", grund, uebersprungen_at: jetzt });
});

// ---------------------------------------------------------------------------
// POST /versendet — GwG-Anschreiben wurde manuell versandt
// ---------------------------------------------------------------------------

gwgRouter.post("/versendet", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await loadMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const result = validateTransition(
        matter.state as MatterState,
        "GWG_ANSCHREIBEN_VERSANDT" as MatterState,
        member.role as OrgRole,
    );
    if (!result.ok) return void res.status(422).json({ detail: result.reason });

    await db.from("matter_transitions").insert({
        matter_id: matterId,
        from_state: matter.state,
        to_state: "GWG_ANSCHREIBEN_VERSANDT",
        triggered_by: userId,
        role: member.role,
        description: `GwG-Hinweisschreiben an ${matter.mandant_email ?? "Mandant"} versandt`,
    });
    await db
        .from("matters")
        .update({ state: "GWG_ANSCHREIBEN_VERSANDT", updated_at: new Date().toISOString() })
        .eq("id", matterId);

    res.json({ ok: true, state: "GWG_ANSCHREIBEN_VERSANDT" });
});

// ---------------------------------------------------------------------------
// POST /personalausweis — Upload + KI-Vision-Extraktion (kein Auto-Save)
// ---------------------------------------------------------------------------

gwgRouter.post("/personalausweis", requireAuth, upload.single("datei"), async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await loadMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const file = req.file;
    if (!file) return void res.status(400).json({ detail: "Datei erforderlich (Feld: datei)" });
    if (file.mimetype === "application/pdf") {
        return void res.status(400).json({
            detail: "PDF wird für die Ausweis-Erkennung derzeit nicht unterstützt — bitte als Bild (JPEG/PNG) hochladen.",
        });
    }

    // Datei dauerhaft ablegen — unabhängig vom Ergebnis der KI-Extraktion,
    // damit der Ausweis in jedem Fall als Nachweis in der Akte liegt.
    const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const storagePath = `orgs/${matter.org_id}/matters/${matterId}/gwg/${Date.now()}_${file.originalname}`;
    await uploadFile(storagePath, file.buffer, file.mimetype);
    await db.from("matter_documents").insert({
        matter_id: matterId,
        org_id: matter.org_id,
        filename: file.originalname,
        storage_path: storagePath,
        file_hash_sha256: sha256,
        file_size_bytes: file.size,
        mime_type: file.mimetype,
        doc_type: "GWG_PERSONALAUSWEIS",
        uploaded_by: userId,
    });

    // Hinweis: Ausweisbild wird zur Datenextraktion an LOGICC übermittelt.
    // Rechtsgrundlage: Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung
    // nach §§ 10 ff. GwG) + AVV mit LOGICC. Keine Pseudonymisierung möglich,
    // da die Extraktion gerade den Klarnamen liefern soll (wie intake/analyze).
    const prompt = `Du liest einen deutschen Personalausweis oder Reisepass aus dem Bild aus.

Antworte AUSSCHLIESSLICH als gültiges JSON-Objekt mit genau diesen Feldern.
Felder die nicht lesbar/vorhanden sind: leerer String "".
Datum-Format: YYYY-MM-DD oder "".
Land als ISO-3166-1-alpha-2-Code (z.B. "DE"), sonst "".

{
  "vorname": "",
  "nachname": "",
  "geburtsdatum": "",
  "strasse": "",
  "hausnummer": "",
  "plz": "",
  "ort": "",
  "land_code": "Wohnsitzland laut Anschrift auf dem Ausweis, ISO-Code",
  "staatsangehoerigkeit_code": "Staatsangehörigkeit laut Ausweis, ISO-Code",
  "konfidenz": "hoch | mittel | niedrig"
}`;

    let extracted: Record<string, string> = {};
    try {
        const base64 = file.buffer.toString("base64");
        const raw = await completeLogiccVision({
            systemPrompt:
                "Du bist ein präziser Assistent zum Auslesen von Ausweisdokumenten. Antworte NUR mit " +
                "dem JSON-Objekt selbst — kein Markdown, keine Erklärungen.",
            user: prompt,
            imageBase64s: [base64],
            maxTokens: 1000,
            jsonMode: true,
        });

        let jsonStr = raw.trim();
        try {
            extracted = JSON.parse(jsonStr) as typeof extracted;
        } catch {
            const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlock) {
                extracted = JSON.parse(codeBlock[1].trim()) as typeof extracted;
            } else {
                const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error("Kein JSON in der Antwort des Modells");
                extracted = JSON.parse(jsonMatch[0]) as typeof extracted;
            }
        }
    } catch (err) {
        return void res.status(500).json({
            detail: `KI-Erkennung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}. ` +
                "Der Ausweis wurde trotzdem gespeichert — Daten bitte manuell im Aufnahmebogen ergänzen.",
        });
    }

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "gwg_personalausweis_ki_analyse",
        actor_id: userId,
        actor_role: member.role,
        model_id: "gpt-4o",
        details: { dateiname: file.originalname, konfidenz: extracted.konfidenz },
    });

    res.json({
        vorschlag: {
            vorname: extracted.vorname ?? "",
            nachname: extracted.nachname ?? "",
            geburtsdatum: extracted.geburtsdatum ?? "",
            strasse: extracted.strasse ?? "",
            hausnummer: extracted.hausnummer ?? "",
            plz: extracted.plz ?? "",
            ort: extracted.ort ?? "",
            land_code: extracted.land_code ?? "",
            staatsangehoerigkeit_code: extracted.staatsangehoerigkeit_code ?? "",
        },
        konfidenz: extracted.konfidenz ?? "niedrig",
    });
});

// ---------------------------------------------------------------------------
// POST /personalausweis/uebernehmen — bestätigte/korrigierte Daten speichern
// ---------------------------------------------------------------------------

gwgRouter.post("/personalausweis/uebernehmen", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await loadMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const body = req.body as Record<string, string>;
    if (!body.vorname?.trim() || !body.nachname?.trim()) {
        return void res.status(400).json({ detail: "vorname und nachname sind erforderlich" });
    }

    const { data: mandant, error } = await db
        .from("mandanten")
        .upsert(
            {
                matter_id: matterId,
                org_id: matter.org_id,
                vorname: body.vorname.trim(),
                nachname: body.nachname.trim(),
                geburtsdatum: body.geburtsdatum || null,
                strasse: body.strasse?.trim() || null,
                hausnummer: body.hausnummer?.trim() || null,
                plz: body.plz?.trim() || null,
                ort: body.ort?.trim() || null,
                land_code: body.land_code?.trim() || "DE",
                email: matter.mandant_email ?? null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "matter_id" },
        )
        .select("id")
        .single();

    if (error) return void res.status(500).json({ detail: error.message });

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "gwg_personalausweis_daten_uebernommen",
        actor_id: userId,
        actor_role: member.role,
        details: { mandant_id: mandant.id },
    });

    res.json({ ok: true, mandant_id: mandant.id });
});

// ---------------------------------------------------------------------------
// POST /pruefung — Risikoeinstufung durchführen (deterministisch)
// ---------------------------------------------------------------------------

gwgRouter.post("/pruefung", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const { data: matter } = await db
        .from("matters")
        .select("id, org_id, kategorie")
        .eq("id", matterId)
        .maybeSingle();
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const body = req.body as {
        pep?: boolean | null;
        wirtschaftlich_berechtigter_identisch?: boolean | null;
        transaktionsland?: string | null;
    };

    const { data: mandant } = await db
        .from("mandanten")
        .select("land_code")
        .eq("matter_id", matterId)
        .maybeSingle();

    const input = {
        kategorie: matter.kategorie,
        landCode: mandant?.land_code ?? null,
        pep: body.pep ?? null,
        wirtschaftlichBerechtigterIdentisch: body.wirtschaftlich_berechtigter_identisch ?? null,
        transaktionsland: body.transaktionsland?.trim() || null,
    };

    const einstufung = classifyGwgRisiko(input);

    const { data: pruefung, error } = await db
        .from("gwg_pruefungen")
        .insert({
            matter_id: matterId,
            org_id: matter.org_id,
            kategorie_snapshot: matter.kategorie,
            land_code: input.landCode,
            pep: input.pep,
            wirtschaftlich_berechtigter_identisch: input.wirtschaftlichBerechtigterIdentisch,
            transaktionsland: input.transaktionsland,
            risikoklasse: einstufung.risikoklasse,
            ausgeloeste_faktoren: einstufung.ausgeloesteFaktoren,
            dokumentationsluecken: einstufung.dokumentationsluecken,
            hinweis: einstufung.hinweis,
            created_by: userId,
        })
        .select(
            "id, risikoklasse, ausgeloeste_faktoren, dokumentationsluecken, hinweis, created_at",
        )
        .single();

    if (error) return void res.status(500).json({ detail: error.message });

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "gwg_pruefung_durchgefuehrt",
        actor_id: userId,
        actor_role: member.role,
        details: { risikoklasse: einstufung.risikoklasse, pruefung_id: pruefung.id },
    });

    res.status(201).json(pruefung);
});

// ---------------------------------------------------------------------------
// POST /pruefung/bestaetigen — Anwalt bestätigt Einstufung (§ 10 Abs. 2 GwG)
// ---------------------------------------------------------------------------

gwgRouter.post("/pruefung/bestaetigen", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await loadMatter(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member || !["Anwalt", "Admin"].includes(member.role)) {
        return void res.status(403).json({ detail: "Nur Anwalt oder Admin darf die GwG-Einstufung bestätigen" });
    }

    const { data: pruefung } = await db
        .from("gwg_pruefungen")
        .select("id")
        .eq("matter_id", matterId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!pruefung) {
        return void res.status(422).json({ detail: "Es liegt noch keine Risikoeinstufung vor (POST /pruefung zuerst)" });
    }

    const result = validateTransition(
        matter.state as MatterState,
        "GWG_GEPRUEFT" as MatterState,
        member.role as OrgRole,
    );
    if (!result.ok) return void res.status(422).json({ detail: result.reason });

    await db
        .from("gwg_pruefungen")
        .update({ bestaetigt_von: userId, bestaetigt_at: new Date().toISOString() })
        .eq("id", pruefung.id);

    await db.from("matter_transitions").insert({
        matter_id: matterId,
        from_state: matter.state,
        to_state: "GWG_GEPRUEFT",
        triggered_by: userId,
        role: member.role,
        description: "GwG-Risikoeinstufung durch Anwalt bestätigt",
    });
    await db
        .from("matters")
        .update({ state: "GWG_GEPRUEFT", updated_at: new Date().toISOString() })
        .eq("id", matterId);

    res.json({ ok: true, state: "GWG_GEPRUEFT" });
});
