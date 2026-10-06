/**
 * Aufnahmebogen (Intake) API.
 *
 * 7.1 — Mandanten-Aufnahmeformular mit Pflichtfeldern, Validierung, Upload.
 * Mounted at: /matters/:matterId/intake (mergeParams = true)
 *
 * Pflicht-Datenschutzhinweis (Art. 13 DSGVO) muss im UI angezeigt worden
 * sein, bevor dieses Endpoint aufgerufen werden darf.
 */

import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { uploadFile } from "../lib/storage";
import { extractPdfText, renderPdfPagesToBase64 } from "../lib/chatTools";
import { completeText, completeVision, DEFAULT_MAIN_MODEL } from "../lib/llm";
import { unterliegtGwgAblauf, GWG_OFFENE_ZUSTAENDE } from "../lib/tools/gwg";
import { bewerteTextebene } from "../lib/matter/textqualitaet";

// mergeParams allows access to :matterId from parent router
export const intakeRouter = Router({ mergeParams: true });

type Db = ReturnType<typeof createServerSupabase>;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 10 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "image/jpeg", "image/png", "image/tiff",
        ];
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

// ---------------------------------------------------------------------------
// POST /matters/:matterId/intake — submit intake form + optional document uploads
// Transitions matter: NEU → AUFNAHME_ERFASST
// ---------------------------------------------------------------------------

intakeRouter.post(
    "/",
    requireAuth,
    upload.array("dateien", 10),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const { matterId } = req.params;
        const db = createServerSupabase();

        const { data: matter } = await db
            .from("matters")
            .select("id, org_id, state, kategorie")
            .eq("id", matterId)
            .maybeSingle();

        if (!matter) return void res.status(404).json({ detail: "Matter not found" });

        const member = await getOrgMember(userId, matter.org_id, db);
        if (!member) return void res.status(403).json({ detail: "Access denied" });

        // GwG-Gate: Der Aufnahmebogen ist gesperrt, solange die
        // Identifizierungsstrecke offen ist. Ohne diesen Guard ließe sich der
        // Ablauf durch direkten Aufruf von /mandate/<id>/aufnahme umgehen — die
        // Zustandsmaschine allein verhindert das nicht, weil
        // NEU → AUFNAHME_ERFASST weiterhin erlaubt ist.
        //
        // Freigabe entweder durch abgeschlossene Prüfung oder durch die
        // anwaltliche Abwahl (POST /gwg/uebergehen) — beide führen nach
        // GWG_GEPRUEFT und damit aus GWG_OFFENE_ZUSTAENDE heraus.
        if (
            unterliegtGwgAblauf(matter.kategorie) &&
            (GWG_OFFENE_ZUSTAENDE as readonly string[]).includes(matter.state)
        ) {
            return void res.status(422).json({
                detail:
                    "Für dieses Mandat ist die GwG-Prüfung noch nicht abgeschlossen. " +
                    "Bitte zuerst das GwG-Hinweisschreiben versenden, den Personalausweis " +
                    "hochladen und die Risikoeinstufung anwaltlich bestätigen lassen — " +
                    "oder die Prüfung durch einen Anwalt mit Begründung übergehen lassen.",
            });
        }

        const body = req.body as Record<string, string>;

        // Validate required fields
        for (const field of ["vorname", "nachname", "beratungskurzbeschreibung"] as const) {
            if (!body[field]?.trim()) {
                return void res.status(400).json({ detail: `Pflichtfeld fehlt: ${field}` });
            }
        }

        // Art. 13 DSGVO — privacy notice must have been shown in the UI
        if (body.datenschutz_hinweis_bestaetigt !== "true") {
            return void res.status(400).json({
                detail: "Datenschutzhinweis (Art. 13 DSGVO) muss angezeigt und bestätigt worden sein",
            });
        }

        const mandantData = {
            matter_id: matterId,
            org_id: matter.org_id,
            anrede: body.anrede?.trim() || null,
            vorname: body.vorname.trim(),
            nachname: body.nachname.trim(),
            geburtsdatum: body.geburtsdatum || null,
            beruf: body.beruf?.trim() || null,
            email: body.email?.trim() || null,
            telefon: body.telefon?.trim() || null,
            strasse: body.strasse?.trim() || null,
            hausnummer: body.hausnummer?.trim() || null,
            plz: body.plz?.trim() || null,
            ort: body.ort?.trim() || null,
            beratungskurzbeschreibung: body.beratungskurzbeschreibung?.trim() || null,
            sachverhalt_seit: body.sachverhalt_seit || null,
            gegner: body.gegner?.trim() || null,
            bisherige_schritte: body.bisherige_schritte?.trim() || null,
            mandatsziel: body.mandatsziel?.trim() || null,
            rechtsschutzversicherung: body.rechtsschutzversicherung === "true",
            rechtsschutzversicherung_name: body.rechtsschutzversicherung_name?.trim() || null,
            rechtsschutzversicherung_nummer: body.rechtsschutzversicherung_nummer?.trim() || null,
            prospekt_uebergabe: body.prospekt_uebergabe === "true",
            prospekt_uebergabe_datum: body.prospekt_uebergabe_datum || null,
            datenschutz_hinweis_angezeigt: true,
            datenschutz_hinweis_version: "1.0",
            updated_at: new Date().toISOString(),
        };

        const { data: mandant, error: mErr } = await db
            .from("mandanten")
            .upsert(mandantData, { onConflict: "matter_id" })
            .select("id")
            .single();

        if (mErr) return void res.status(500).json({ detail: mErr.message });

        // Upload attached documents
        const files = req.files as Express.Multer.File[];
        const uploadedDocs: { filename: string; sha256: string }[] = [];

        for (const file of files ?? []) {
            const sha256 = crypto
                .createHash("sha256")
                .update(file.buffer)
                .digest("hex");

            const storagePath =
                `orgs/${matter.org_id}/matters/${matterId}/intake/${Date.now()}_${file.originalname}`;

            try {
                await uploadFile(storagePath, file.buffer, file.mimetype);
            } catch {
                return void res
                    .status(500)
                    .json({ detail: `Upload fehlgeschlagen: ${file.originalname}` });
            }

            await db.from("matter_documents").insert({
                matter_id: matterId,
                org_id: matter.org_id,
                filename: file.originalname,
                storage_path: storagePath,
                file_hash_sha256: sha256,
                file_size_bytes: file.size,
                mime_type: file.mimetype,
                doc_type: "INTAKE_UPLOAD",
                uploaded_by: userId,
            });

            uploadedDocs.push({ filename: file.originalname, sha256 });
        }

        // Transition to AUFNAHME_ERFASST — entweder direkt von NEU (Kategorien
        // ohne GwG-Ablauf) oder von GWG_GEPRUEFT (GwG-relevante Kategorien,
        // nach abgeschlossener Risikoeinstufung — siehe routes/gwg.ts).
        if (matter.state === "NEU" || matter.state === "GWG_GEPRUEFT") {
            await db.from("matter_transitions").insert({
                matter_id: matterId,
                from_state: matter.state,
                to_state: "AUFNAHME_ERFASST",
                triggered_by: userId,
                role: member.role,
                description: "Aufnahmebogen ausgefüllt und gespeichert",
            });
            await db
                .from("matters")
                .update({ state: "AUFNAHME_ERFASST", updated_at: new Date().toISOString() })
                .eq("id", matterId);
        }

        await db.from("audit_log").insert({
            org_id: matter.org_id,
            entity_type: "matter",
            entity_id: matterId,
            action: "intake_submitted",
            actor_id: userId,
            actor_role: member.role,
            details: {
                mandant_id: mandant.id,
                dokumente: uploadedDocs.length,
                dokument_hashes: uploadedDocs,
            },
        });

        res.status(201).json({
            mandant_id: mandant.id,
            state: "AUFNAHME_ERFASST",
            uploaded_documents: uploadedDocs.length,
        });
    },
);

// ---------------------------------------------------------------------------
// POST /matters/:matterId/intake/analyze — KI-Analyse hochgeladener Dokumente
// Extrahiert Mandantendaten aus Beitrittserklärungen, Anwaltsschreiben etc.
// ---------------------------------------------------------------------------

const BILD_MIMES = ["image/jpeg", "image/png", "image/tiff", "image/webp"];

/** Höchstzahl an Seitenbildern über alle Dateien — begrenzt Kosten und Antwortzeit. */
const MAX_BILDER = 8;

type Dokumentinhalt =
    | { art: "text"; text: string }
    | { art: "bilder"; bilder: string[] };

/**
 * Ermittelt, ob eine Datei als Text oder als Bild ausgewertet wird.
 *
 * Handschriftliche und eingescannte Unterlagen haben keine brauchbare
 * Textebene; sie werden seitenweise gerendert und über die Vision-Strecke
 * gelesen — dieselbe, die auch die Ausweiserkennung im GwG-Ablauf nutzt.
 *
 * Vorher lieferte diese Funktion für Bilddateien einen Platzhaltertext
 * ("[Bilddokument: … Text nicht extrahierbar]"). Der ging als vermeintlicher
 * Dokumenteninhalt an das Modell, das daraufhin leere oder erfundene Felder
 * zurückgab — ohne Fehlermeldung.
 */
async function ladeDokumentinhalt(file: Express.Multer.File): Promise<Dokumentinhalt | null> {
    const mime = file.mimetype;

    if (BILD_MIMES.includes(mime)) {
        return { art: "bilder", bilder: [file.buffer.toString("base64")] };
    }

    if (
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mime === "application/msword"
    ) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value.trim() ? { art: "text", text: result.value } : null;
    }

    if (mime === "application/pdf") {
        // Auf den tatsächlichen Ausschnitt beschränken — Multer-Buffer teilen
        // sich einen größeren ArrayBuffer, ein direktes .buffer liefert sonst
        // Fremddaten mit.
        const arrayBuffer = file.buffer.buffer.slice(
            file.buffer.byteOffset,
            file.buffer.byteOffset + file.buffer.byteLength,
        ) as ArrayBuffer;

        let text = "";
        try {
            text = await extractPdfText(arrayBuffer);
        } catch (err) {
            console.warn(`[intake/analyze] Textebene nicht lesbar (${file.originalname}):`, err);
        }

        // Nicht die Länge entscheidet, sondern die Wortstruktur: gescannte
        // Handschrift kommt oft MIT Textebene an, weil der Scanner eine OCR
        // laufen ließ, die nur Zeichensalat produziert hat.
        const bewertung = bewerteTextebene(text);
        console.log(`[intake/analyze] ${file.originalname}: ${bewertung.grund}`);
        if (bewertung.brauchbar) return { art: "text", text };

        const bilder = await renderPdfPagesToBase64(arrayBuffer, 4);
        if (bilder.length > 0) return { art: "bilder", bilder };

        // Kein Bild renderbar — dann lieber der schlechte Text als gar nichts.
        return text.trim() ? { art: "text", text } : null;
    }

    return null;
}

intakeRouter.post(
    "/analyze",
    requireAuth,
    upload.array("dateien", 5),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const { matterId } = req.params;
        const db = createServerSupabase();

        const { data: matter } = await db
            .from("matters")
            .select("id, org_id")
            .eq("id", matterId)
            .maybeSingle();

        if (!matter) return void res.status(404).json({ detail: "Matter not found" });

        const member = await getOrgMember(userId, matter.org_id, db);
        if (!member) return void res.status(403).json({ detail: "Access denied" });

        const files = req.files as Express.Multer.File[];
        if (!files?.length) {
            return void res.status(400).json({ detail: "Mindestens eine Datei erforderlich" });
        }

        // Inhalte einlesen — je Datei entweder Text oder Seitenbilder.
        // Das Rendern gescannter Seiten dauert länger als reine Textextraktion,
        // deshalb 30 s statt der früheren 8 s.
        const texte: string[] = [];
        const bilder: string[] = [];
        for (const file of files) {
            try {
                const inhalt = await Promise.race([
                    ladeDokumentinhalt(file),
                    new Promise<null>((_, reject) =>
                        setTimeout(() => reject(new Error("Zeitüberschreitung beim Einlesen")), 30000)
                    ),
                ]);
                if (!inhalt) {
                    console.warn(`[intake/analyze] Kein Inhalt lesbar: ${file.originalname}`);
                    continue;
                }
                if (inhalt.art === "text") {
                    texte.push(`--- Dokument: ${file.originalname} ---\n${inhalt.text}`);
                } else {
                    bilder.push(...inhalt.bilder);
                }
            } catch (extractErr) {
                console.warn(`[intake/analyze] Übersprungen (${file.originalname}):`, extractErr instanceof Error ? extractErr.message : extractErr);
            }
        }

        if (texte.length === 0 && bilder.length === 0) {
            return void res.status(422).json({
                detail:
                    "Aus den Dokumenten ließ sich nichts auslesen — weder Text noch darstellbare Seiten. " +
                    "Bitte prüfen, ob die Datei beschädigt ist, oder ein Foto der Seite hochladen.",
            });
        }

        const seitenbilder = bilder.slice(0, MAX_BILDER);
        // Sobald Bilder im Spiel sind, entscheidet die Vision-Strecke — sie sieht
        // Handschrift, Unterschriften und Tabellen, die in keiner Textebene stehen.
        const nutzeVision = seitenbilder.length > 0;
        const dokumentText = texte.join("\n\n").slice(0, 12000); // Tokens begrenzen

        // Hinweis: Dokumenttext wird für Datenextraktion an LOGICC übermittelt.
        // Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) + AVV mit LOGICC.
        // Klarnamen aus den Dokumenten sind für die Extraktion notwendig.
        const prompt = `Du analysierst ein oder mehrere juristische Dokumente (z.B. Beitrittserklärungen, Anwaltsschreiben, Vollmachten, Verträge) und extrahierst die Daten des Mandanten.

Antworte AUSSCHLIESSLICH als gültiges JSON-Objekt mit genau diesen Feldern.
Felder die nicht gefunden wurden: leerer String "".
Datum-Format: YYYY-MM-DD oder "".

{
  "anrede": "Herr | Frau | Divers | ''",
  "vorname": "",
  "nachname": "",
  "geburtsdatum": "",
  "beruf": "",
  "email": "",
  "telefon": "",
  "strasse": "",
  "hausnummer": "",
  "plz": "",
  "ort": "",
  "beratungskurzbeschreibung": "2-3 Sätze: Worum geht es? Was ist der Sachverhalt?",
  "sachverhalt_seit": "Datum, seit wann/wann eingetreten, falls erkennbar",
  "gegner": "Name der Gegenpartei, falls vorhanden",
  "bisherige_schritte": "bereits erfolgte Schritte (Schreiben, Fristen, Kontakt mit Gegenseite)",
  "mandatsziel": "was der Mandant erreichen möchte, falls erkennbar",
  "rechtsschutzversicherung_name": "Name des Rechtsschutzversicherers, falls erkennbar",
  "rechtsschutzversicherung_nummer": "Versicherungsschein-/Vertragsnummer, falls erkennbar",
  "vermittler": "Name der vermittelnden Bank/Gesellschaft, falls genannt",
  "beteiligungen": [
    { "bezeichnung": "z.B. Pro Real 10", "nummer": "Vertrags-/Beteiligungsnummer wie im Dokument", "betrag": "Zeichnungssumme nur als Zahl, z.B. 20000" }
  ],
  "konfidenz": "hoch | mittel | niedrig",
  "erkannte_felder": ["liste", "der", "tatsaechlich", "gefundenen", "felder"]
}

Regeln für "beteiligungen": Leeres Array, wenn keine Anlagen/Beteiligungen genannt sind.
Jede Zeile einer Aufstellung ist ein eigener Eintrag — auch bei gleichem Betrag.
Nummern zeichengenau übernehmen, nicht vereinheitlichen.

WICHTIG bei handschriftlichen oder gescannten Vorlagen: Nur übernehmen, was
zweifelsfrei lesbar ist. Unsichere Stellen leer lassen statt zu raten, und in
diesem Fall "konfidenz" auf "niedrig" setzen. Erfinde niemals Ziffern in
Beträgen oder Vertragsnummern.`;

        const textPrompt = `${prompt}

Dokumente:
${dokumentText}`;

        const bildPrompt = dokumentText
            ? `${prompt}

Die Angaben stehen auf den beigefügten Seitenbildern. Zusätzlich vorliegender Text:
${dokumentText}`
            : `${prompt}

Die Angaben stehen ausschließlich auf den beigefügten Seitenbildern.`;

        const systemPrompt =
            "Du bist ein präziser juristischer Datenextraktions-Assistent. " +
            "Antworte NUR mit dem JSON-Objekt selbst — kein Markdown, " +
            "keine Erklärungen, kein Text davor oder danach.";

        type Beteiligung = { bezeichnung?: string; nummer?: string; betrag?: string };
        let extracted: Record<string, string> & {
            konfidenz?: string;
            erkannte_felder?: string[];
            beteiligungen?: Beteiligung[];
        } = {};

        try {
            // gemini-2.5-pro (DEFAULT_MAIN_MODEL) kann sein Reasoning-Budget
            // vor dem sichtbaren Text ausschöpfen, wenn max_tokens zu niedrig
            // ist (siehe onboarding.ts — dort verifiziert: 400 lieferte nur
            // "{\n" zurück). 3000 lässt genug Spielraum für Reasoning + Text.
            const raw = nutzeVision
                ? await completeVision({
                      systemPrompt,
                      user: bildPrompt,
                      imageBase64s: seitenbilder,
                      maxTokens: 3000,
                      jsonMode: true,
                  })
                : await completeText({
                      model: DEFAULT_MAIN_MODEL,
                      systemPrompt,
                      user: textPrompt,
                      maxTokens: 3000,
                      jsonMode: true,
                  });

            console.log("[intake/analyze] raw response (first 500):", raw?.slice(0, 500));
            if (!raw?.trim()) throw new Error("Leere Antwort vom Modell");

            // Robuste JSON-Extraktion:
            // 1. Versuche direkte JSON-Parsung
            // 2. Suche nach Markdown-Code-Block (```json ... ```)
            // 3. Suche nach erstem {...} Block
            let jsonStr = raw.trim();
            let parseError: unknown = null;

            try {
                extracted = JSON.parse(jsonStr) as typeof extracted;
            } catch (e) {
                parseError = e;
                // Markdown-Codeblock entfernen
                const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (codeBlock) {
                    try {
                        extracted = JSON.parse(codeBlock[1].trim()) as typeof extracted;
                        parseError = null;
                    } catch { /* weiter */ }
                }
                // Rohen JSON-Block extrahieren
                if (parseError !== null) {
                    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) throw new Error("Kein JSON in der Antwort des Modells");
                    extracted = JSON.parse(jsonMatch[0]) as typeof extracted;
                }
            }
        } catch (err) {
            return void res.status(500).json({
                detail: `KI-Analyse fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
            });
        }

        // Beteiligungen normalisieren. Sie passen in kein Feld des
        // Aufnahmebogens, gehen aber sonst verloren — deshalb zusätzlich als
        // Klartext in die Sachverhaltsbeschreibung, die gespeichert wird.
        const beteiligungen = (Array.isArray(extracted.beteiligungen) ? extracted.beteiligungen : [])
            .map((b) => ({
                bezeichnung: String(b?.bezeichnung ?? "").trim(),
                nummer: String(b?.nummer ?? "").trim(),
                betrag: String(b?.betrag ?? "").trim(),
            }))
            .filter((b) => b.bezeichnung || b.nummer || b.betrag);

        let beschreibung = extracted.beratungskurzbeschreibung ?? "";
        if (beteiligungen.length > 0) {
            const zeilen = beteiligungen.map((b) => {
                const teile = [b.bezeichnung, b.nummer && `Nr. ${b.nummer}`, b.betrag && `${b.betrag} EUR`];
                return `- ${teile.filter(Boolean).join(", ")}`;
            });
            beschreibung = [
                beschreibung.trim(),
                "",
                "Angegebene Beteiligungen (aus dem Dokument gelesen, bitte prüfen):",
                ...zeilen,
            ]
                .join("\n")
                .trim();
        }
        if (extracted.vermittler?.trim()) {
            beschreibung = `${beschreibung}\n\nVermittler laut Dokument: ${extracted.vermittler.trim()}`.trim();
        }

        await db.from("audit_log").insert({
            org_id: matter.org_id,
            entity_type: "matter",
            entity_id: matterId,
            action: "intake_ki_analyse",
            actor_id: userId,
            actor_role: member.role,
            model_id: nutzeVision ? "gpt-4o (vision)" : DEFAULT_MAIN_MODEL,
            details: {
                dateien: files.map((f) => f.originalname),
                methode: nutzeVision ? "vision" : "text",
                seitenbilder: seitenbilder.length,
                konfidenz: extracted.konfidenz,
                erkannte_felder: extracted.erkannte_felder,
                beteiligungen_erkannt: beteiligungen.length,
            },
        });

        res.json({
            vorschlag: {
                anrede: extracted.anrede ?? "",
                vorname: extracted.vorname ?? "",
                nachname: extracted.nachname ?? "",
                geburtsdatum: extracted.geburtsdatum ?? "",
                beruf: extracted.beruf ?? "",
                email: extracted.email ?? "",
                telefon: extracted.telefon ?? "",
                strasse: extracted.strasse ?? "",
                hausnummer: extracted.hausnummer ?? "",
                plz: extracted.plz ?? "",
                ort: extracted.ort ?? "",
                beratungskurzbeschreibung: beschreibung,
                sachverhalt_seit: extracted.sachverhalt_seit ?? "",
                gegner: extracted.gegner ?? "",
                bisherige_schritte: extracted.bisherige_schritte ?? "",
                mandatsziel: extracted.mandatsziel ?? "",
                rechtsschutzversicherung_name: extracted.rechtsschutzversicherung_name ?? "",
                rechtsschutzversicherung_nummer: extracted.rechtsschutzversicherung_nummer ?? "",
            },
            // Bewusst NICHT in "vorschlag": die Aufnahmeseite iteriert über alle
            // Felder des Vorschlags und ruft .trim() auf — ein Array darin würde
            // das Formular zum Absturz bringen.
            beteiligungen,
            /** "vision" = aus Seitenbildern gelesen (Handschrift/Scan) — erhöhte Prüfpflicht. */
            methode: nutzeVision ? "vision" : "text",
            konfidenz: extracted.konfidenz ?? "niedrig",
            erkannte_felder: Array.isArray(extracted.erkannte_felder)
                ? extracted.erkannte_felder
                : [],
            dateien: files.map((f) => f.originalname),
        });
    },
);

// ---------------------------------------------------------------------------
// GET /matters/:matterId/intake — retrieve intake data
// ---------------------------------------------------------------------------

intakeRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const { data: matter } = await db
        .from("matters")
        .select("id, org_id")
        .eq("id", matterId)
        .maybeSingle();

    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const { data: mandant } = await db
        .from("mandanten")
        .select(
            "vorname, nachname, email, telefon, beruf, geburtsdatum, " +
            "strasse, hausnummer, plz, ort, beratungskurzbeschreibung, " +
            "sachverhalt_seit, gegner, bisherige_schritte, mandatsziel, " +
            "rechtsschutzversicherung, rechtsschutzversicherung_name, rechtsschutzversicherung_nummer, " +
            "prospekt_uebergabe, prospekt_uebergabe_datum, created_at",
        )
        .eq("matter_id", matterId)
        .maybeSingle();

    res.json(mandant ?? null);
});
