/**
 * PRE9/PRE10-Fragebogen — Erfassung und Auswertung.
 *
 * Mounted at: /matters/:matterId/pre (mergeParams = true)
 *
 * Der Fragebogen kommt in aller Regel handschriftlich ausgefüllt zurück und
 * wird deshalb über die Vision-Strecke gelesen. Ausgelesen wird nur; gerechnet
 * und geprüft wird deterministisch in lib/tools/pre.ts.
 *
 * Ablauf: /analyse liefert einen Vorschlag, den jemand prüft und über
 * /uebernehmen speichert. Es wird nichts automatisch übernommen — die Zahlen
 * bestimmen den Streitwert und damit die Gebühren.
 */

import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { uploadFile } from "../lib/storage";
import { renderPdfPagesToBase64 } from "../lib/chatTools";
import { completeVision } from "../lib/llm";
import {
    berechneStreitwert,
    pruefeFragebogen,
    parseEuroBetrag,
    type PreBeteiligung,
    type PreAuszahlung,
    type FragebogenAngaben,
} from "../lib/tools/pre";

export const preRouter = Router({ mergeParams: true });

type Db = ReturnType<typeof createServerSupabase>;

const BILD_MIMES = ["image/jpeg", "image/png", "image/tiff", "image/webp"];
const MAX_SEITEN = 8;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 5 },
    fileFilter: (_req, file, cb) => {
        cb(null, file.mimetype === "application/pdf" || BILD_MIMES.includes(file.mimetype));
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

async function ladeAkte(matterId: string, db: Db) {
    const { data } = await db
        .from("matters")
        .select("id, org_id, kategorie, aktenzeichen, bezeichnung")
        .eq("id", matterId)
        .maybeSingle();
    return data;
}

/** Baut das Auswertungsergebnis aus den gespeicherten Zeilen. */
async function ladeAuswertung(matterId: string, db: Db) {
    const [{ data: kopf }, { data: bet }, { data: ausz }] = await Promise.all([
        db.from("pre_fragebogen").select("*").eq("matter_id", matterId).maybeSingle(),
        db.from("pre_beteiligungen").select("*").eq("matter_id", matterId).order("created_at"),
        db.from("pre_auszahlungen").select("*").eq("matter_id", matterId).order("datum", { nullsFirst: false }),
    ]);

    const beteiligungen = (bet ?? []) as Record<string, unknown>[];
    const auszahlungen = (ausz ?? []) as Record<string, unknown>[];

    const streitwert = berechneStreitwert(
        beteiligungen.map((b) => ({
            bezeichnung: b.bezeichnung as string | null,
            vertragsnummer: b.vertragsnummer as string | null,
            zeichnungssumme: b.zeichnungssumme,
            agio: b.agio,
        })),
        auszahlungen.map((a) => ({ betrag: a.betrag, datum: a.datum as string | null })),
        kopf?.auszahlungen_vollstaendig ?? false,
    );

    return { fragebogen: kopf ?? null, beteiligungen, auszahlungen, streitwert };
}

// ---------------------------------------------------------------------------
// GET / — aktueller Stand inkl. berechnetem Streitwert
// ---------------------------------------------------------------------------

preRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await ladeAkte(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });
    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const auswertung = await ladeAuswertung(matterId, db);

    const { data: mandant } = await db
        .from("mandanten")
        .select("vorname, nachname, geburtsdatum, strasse, hausnummer, plz, ort, telefon, email, rechtsschutzversicherung_name, rechtsschutzversicherung_nummer")
        .eq("matter_id", matterId)
        .maybeSingle();

    const pruefung = pruefeFragebogen({
        name: mandant?.nachname,
        vorname: mandant?.vorname,
        geburtsdatum: mandant?.geburtsdatum,
        strasse: mandant?.strasse,
        plz: mandant?.plz,
        ort: mandant?.ort,
        telefon: mandant?.telefon,
        email: mandant?.email,
        rsv_versicherer: mandant?.rechtsschutzversicherung_name,
        rsv_scheinnummer: mandant?.rechtsschutzversicherung_nummer,
        ...(auswertung.fragebogen ?? {}),
    } as FragebogenAngaben);

    res.json({ ...auswertung, pruefung });
});

// ---------------------------------------------------------------------------
// POST /analyse — Fragebogen hochladen und auslesen (speichert NICHT)
// ---------------------------------------------------------------------------

const FRAGEBOGEN_SCHEMA = `{
  "name": "Nachname",
  "vorname": "",
  "geburtsdatum": "YYYY-MM-DD oder ''",
  "strasse": "Straße mit Hausnummer",
  "plz": "",
  "ort": "",
  "telefon": "",
  "email": "",

  "zeichnungserklaerung_beigefuegt": true/false/null,
  "vib_beigefuegt": true/false/null,

  "beteiligungen": [
    { "bezeichnung": "z.B. Pro Real Europa 10", "vertragsnummer": "", "zeichnungssumme": "", "agio": "", "gesamt": "", "einzahlung_am": "" }
  ],

  "auszahlungen": [ { "betrag": "", "datum": "" } ],
  "auszahlungen_vollstaendig": true/false,

  "prospekt_erhalten_am": "",
  "prospekt_gelesen": true/false/null,
  "prospekt_durchgegangen": true/false/null,

  "rsv_versicherer": "",
  "rsv_versicherungsnehmer": "",
  "rsv_scheinnummer": "",
  "rsv_abgeschlossen_am": "",
  "rsv_kopie_beigefuegt": true/false/null,

  "anderweitig_geltend_gemacht": true/false/null,
  "andere_anlage_one_group": true/false/null,
  "andere_anlage_sonst": true/false/null,

  "konfidenz": "hoch | mittel | niedrig"
}`;

preRouter.post("/analyse", requireAuth, upload.array("dateien", 5), async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await ladeAkte(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });
    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) {
        return void res.status(400).json({ detail: "Mindestens eine Datei erforderlich" });
    }

    // Seitenbilder sammeln. Der Fragebogen kommt als Scan zurück; die
    // Textebene ist deshalb bedeutungslos und wird gar nicht erst versucht.
    const seiten: string[] = [];
    for (const file of files) {
        if (BILD_MIMES.includes(file.mimetype)) {
            seiten.push(file.buffer.toString("base64"));
            continue;
        }
        const arrayBuffer = file.buffer.buffer.slice(
            file.buffer.byteOffset,
            file.buffer.byteOffset + file.buffer.byteLength,
        ) as ArrayBuffer;
        seiten.push(...(await renderPdfPagesToBase64(arrayBuffer, MAX_SEITEN)));
    }

    if (seiten.length === 0) {
        return void res.status(422).json({
            detail: "Aus den Dateien ließen sich keine Seiten darstellen. Bitte ein Foto oder einen anderen Scan hochladen.",
        });
    }

    // Datei als Nachweis in der Akte ablegen — unabhängig vom Ergebnis der Erkennung.
    for (const file of files) {
        const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
        const pfad = `orgs/${matter.org_id}/matters/${matterId}/pre/${Date.now()}_${file.originalname}`;
        try {
            await uploadFile(pfad, file.buffer, file.mimetype);
            await db.from("matter_documents").insert({
                matter_id: matterId,
                org_id: matter.org_id,
                filename: file.originalname,
                storage_path: pfad,
                file_hash_sha256: sha256,
                file_size_bytes: file.size,
                mime_type: file.mimetype,
                doc_type: "PRE_FRAGEBOGEN",
                uploaded_by: userId,
            });
        } catch (err) {
            console.error("[pre/analyse] Ablage fehlgeschlagen", err);
        }
    }

    const prompt = `Du liest einen ausgefüllten Fragebogen der Kanzlei BKL zu einer Beteiligung an
"Pro Real Europa 9" oder "Pro Real Europa 10" aus. Der Fragebogen ist in aller Regel
HANDSCHRIFTLICH ausgefüllt und liegt als Scan vor. Beigefügt sein können außerdem
Zeichnungserklärung, Vermögensanlagen-Informationsblatt und Versicherungsschein.

Antworte AUSSCHLIESSLICH als gültiges JSON mit genau dieser Struktur:

${FRAGEBOGEN_SCHEMA}

Regeln:
- Beträge zeichengenau so übernehmen, wie sie dastehen (z.B. "50.000,00" oder "10 000,-").
  NICHT umrechnen, NICHT runden, NICHT formatieren. Die Berechnung erfolgt separat.
- Im Abschnitt "Beteiligung" können MEHRERE Beteiligungen nebeneinander in Spalten
  eingetragen sein, oft mit "1.)" und "2.)" markiert. Jede Spalte ist ein eigener
  Eintrag in "beteiligungen".
- Steht bei den Auszahlungen ein Verweis wie "s. Anlage" oder "siehe Anlage" statt
  konkreter Beträge, setze "auszahlungen" auf [] und "auszahlungen_vollstaendig" auf false.
  Sind alle Auszahlungen konkret aufgeführt (oder ausdrücklich keine vorhanden),
  setze "auszahlungen_vollstaendig" auf true.
- Ankreuzfelder: true wenn angekreuzt, false wenn ausdrücklich das Gegenteil angekreuzt
  ist, null wenn nichts angekreuzt ist. Rate nicht.
- Es kann vorkommen, dass sich ausschließende Felder BEIDE angekreuzt sind. Gib das
  dann genau so wieder (beide true) — den Widerspruch bewertet die Kanzlei.
- Unleserliches Feld: leerer String bzw. null, und "konfidenz" auf "niedrig".
- Erfinde niemals Ziffern in Beträgen, Vertrags- oder Versicherungsscheinnummern.`;

    let roh: Record<string, unknown> = {};
    try {
        const antwort = await completeVision({
            systemPrompt:
                "Du bist ein präziser Assistent zum Auslesen handschriftlich ausgefüllter Formulare. " +
                "Antworte NUR mit dem JSON-Objekt selbst — kein Markdown, keine Erklärungen.",
            user: prompt,
            imageBase64s: seiten.slice(0, MAX_SEITEN),
            maxTokens: 4000,
            jsonMode: true,
        });

        let text = antwort.trim();
        const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (block) text = block[1].trim();
        else {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) text = m[0];
        }
        roh = JSON.parse(text) as Record<string, unknown>;
    } catch (err) {
        return void res.status(500).json({
            detail:
                `Auslesen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}. ` +
                "Die hochgeladene Datei liegt trotzdem in der Akte.",
        });
    }

    const beteiligungen = (Array.isArray(roh.beteiligungen) ? roh.beteiligungen : []) as PreBeteiligung[];
    const auszahlungen = (Array.isArray(roh.auszahlungen) ? roh.auszahlungen : []) as PreAuszahlung[];
    const auszahlungenVollstaendig = roh.auszahlungen_vollstaendig === true;

    const streitwert = berechneStreitwert(beteiligungen, auszahlungen, auszahlungenVollstaendig);
    const pruefung = pruefeFragebogen(roh as FragebogenAngaben);

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "pre_fragebogen_ausgelesen",
        actor_id: userId,
        actor_role: member.role,
        model_id: "gpt-4o (vision)",
        details: {
            dateien: files.map((f) => f.originalname),
            seiten: seiten.length,
            konfidenz: roh.konfidenz,
            beteiligungen: beteiligungen.length,
            streitwert: streitwert.streitwert,
            belastbar: streitwert.belastbar,
        },
    });

    res.json({ vorschlag: roh, beteiligungen, auszahlungen, streitwert, pruefung, seiten: seiten.length });
});

// ---------------------------------------------------------------------------
// POST /uebernehmen — geprüfte Angaben speichern
// ---------------------------------------------------------------------------

preRouter.post("/uebernehmen", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const matter = await ladeAkte(matterId, db);
    if (!matter) return void res.status(404).json({ detail: "Matter not found" });
    const member = await getOrgMember(userId, matter.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const body = req.body as {
        fragebogen?: Record<string, unknown>;
        beteiligungen?: PreBeteiligung[];
        auszahlungen?: PreAuszahlung[];
    };

    const bet = Array.isArray(body.beteiligungen) ? body.beteiligungen : [];
    const ausz = Array.isArray(body.auszahlungen) ? body.auszahlungen : [];

    // Beträge serverseitig parsen — die Oberfläche schickt das, was im Feld
    // steht, und das kann weiterhin deutsche Schreibweise sein.
    const betragOderNull = (w: unknown) => parseEuroBetrag(w);

    const k = body.fragebogen ?? {};
    const { error: kopfErr } = await db.from("pre_fragebogen").upsert(
        {
            matter_id: matterId,
            org_id: matter.org_id,
            zeichnungserklaerung_beigefuegt: k.zeichnungserklaerung_beigefuegt ?? null,
            vib_beigefuegt: k.vib_beigefuegt ?? null,
            rsv_kopie_beigefuegt: k.rsv_kopie_beigefuegt ?? null,
            prospekt_erhalten_am: k.prospekt_erhalten_am || null,
            prospekt_gelesen: k.prospekt_gelesen ?? null,
            prospekt_durchgegangen: k.prospekt_durchgegangen ?? null,
            rsv_versicherungsnehmer: (k.rsv_versicherungsnehmer as string) || null,
            rsv_abgeschlossen_am: k.rsv_abgeschlossen_am || null,
            anderweitig_geltend_gemacht: k.anderweitig_geltend_gemacht ?? null,
            andere_anlage_one_group: k.andere_anlage_one_group ?? null,
            andere_anlage_sonst: k.andere_anlage_sonst ?? null,
            auszahlungen_vollstaendig: k.auszahlungen_vollstaendig === true,
            quelle: "ki_fragebogen",
            konfidenz: (k.konfidenz as string) || null,
            erfasst_von: userId,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "matter_id" },
    );
    if (kopfErr) return void res.status(500).json({ detail: kopfErr.message });

    // Beteiligungen und Auszahlungen vollständig ersetzen — die Oberfläche
    // schickt immer den gesamten geprüften Stand.
    await db.from("pre_beteiligungen").delete().eq("matter_id", matterId);
    if (bet.length > 0) {
        const { error } = await db.from("pre_beteiligungen").insert(
            bet.map((b) => ({
                matter_id: matterId,
                org_id: matter.org_id,
                bezeichnung: b.bezeichnung || null,
                vertragsnummer: b.vertragsnummer || null,
                zeichnungssumme: betragOderNull(b.zeichnungssumme),
                agio: betragOderNull(b.agio),
                created_by: userId,
            })),
        );
        if (error) return void res.status(500).json({ detail: error.message });
    }

    await db.from("pre_auszahlungen").delete().eq("matter_id", matterId);
    if (ausz.length > 0) {
        const { error } = await db.from("pre_auszahlungen").insert(
            ausz.map((a) => ({
                matter_id: matterId,
                org_id: matter.org_id,
                betrag: betragOderNull(a.betrag),
                datum: a.datum || null,
                created_by: userId,
            })),
        );
        if (error) return void res.status(500).json({ detail: error.message });
    }

    const auswertung = await ladeAuswertung(matterId, db);

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "pre_fragebogen_uebernommen",
        actor_id: userId,
        actor_role: member.role,
        details: {
            beteiligungen: bet.length,
            auszahlungen: ausz.length,
            streitwert: auswertung.streitwert.streitwert,
            belastbar: auswertung.streitwert.belastbar,
        },
    });

    res.json(auswertung);
});
