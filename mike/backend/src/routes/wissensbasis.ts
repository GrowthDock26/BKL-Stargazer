/**
 * Wissensdatenbank — Urteile, Aufsätze, Kommentare.
 * Upload → Textextraktion → KI-Zusammenfassung → durchsuchbare Bibliothek.
 */

import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { uploadFile } from "../lib/storage";
import { completeText, DEFAULT_MAIN_MODEL } from "../lib/llm";
import { extractPdfText } from "../lib/chatTools";

export const wissensbasisRouter = Router();

/**
 * Herkunft eines Eintrags. „eigenes" ist kanzleieigenes Material und der
 * langjährige Normalfall; die beiden anderen kennzeichnen vom Nutzer manuell
 * heruntergeladenes lizenziertes Fremdmaterial (z.B. beck-online) — dafür ist
 * eine Fundstelle Pflicht, siehe requireFundstelle() unten.
 */
const QUELLEN = ["eigenes", "beck-online", "sonstige-lizenzquelle"] as const;
type Quelle = (typeof QUELLEN)[number];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const ok = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        cb(null, ok.includes(file.mimetype));
    },
});

async function extractText(file: Express.Multer.File): Promise<string> {
    if (file.mimetype === "application/pdf") {
        return extractPdfText(file.buffer.buffer as ArrayBuffer);
    }
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
}

async function getOrgId(userId: string, db: ReturnType<typeof createServerSupabase>) {
    const { data } = await db
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
    return data?.org_id as string | null;
}

// ---------------------------------------------------------------------------
// POST /wissensbasis/upload
// ---------------------------------------------------------------------------

wissensbasisRouter.post(
    "/upload",
    requireAuth,
    upload.single("datei"),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const file = req.file;
        if (!file) return void res.status(400).json({ detail: "Keine Datei hochgeladen" });

        const {
            titel, rechtsgebiet, dokumenttyp, gericht, aktenzeichen, entscheidungsdatum,
            quelle: quelleInput, fundstelle, matter_id: matterId,
        } = req.body ?? {};

        if (!titel?.trim() || !rechtsgebiet || !dokumenttyp) {
            return void res.status(400).json({ detail: "titel, rechtsgebiet und dokumenttyp sind erforderlich" });
        }

        const quelle = (quelleInput?.trim() || "eigenes") as Quelle;
        if (!QUELLEN.includes(quelle)) {
            return void res.status(400).json({ detail: `quelle muss einer von: ${QUELLEN.join(", ")} sein` });
        }
        // Lizenziertes Fremdmaterial ohne Fundstelle wäre nicht mehr von
        // kanzleieigenem Material zu unterscheiden — genau das darf nicht passieren.
        if (quelle !== "eigenes" && !fundstelle?.trim()) {
            return void res.status(400).json({
                detail: "Bei einer lizenzierten Quelle (z.B. beck-online) ist die Fundstelle erforderlich.",
            });
        }

        const db = createServerSupabase();
        const orgId = await getOrgId(userId, db);
        if (!orgId) return void res.status(403).json({ detail: "Keine Organisation gefunden" });

        // Verknüpfung mit einer Akte ist optional — aber wenn angegeben, muss
        // sie zur eigenen Organisation gehören. Sonst könnte ein Dokument an
        // eine fremde Akte gehängt werden, deren ID man errät.
        let verifiedMatterId: string | null = null;
        if (matterId?.trim()) {
            const { data: matter } = await db
                .from("matters")
                .select("id")
                .eq("id", matterId.trim())
                .eq("org_id", orgId)
                .maybeSingle();
            if (!matter) return void res.status(404).json({ detail: "Akte nicht gefunden" });
            verifiedMatterId = matter.id as string;
        }

        // Text extrahieren
        let extractedText = "";
        try {
            extractedText = await extractText(file);
        } catch { /* weiter ohne Text */ }

        // Datei speichern
        const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
        const storagePath = `orgs/${orgId}/wissensdatenbank/${Date.now()}_${file.originalname}`;
        try {
            await uploadFile(storagePath, file.buffer, file.mimetype);
        } catch (err) {
            return void res.status(500).json({ detail: `Upload fehlgeschlagen: ${err}` });
        }

        // KI-Zusammenfassung (im Hintergrund, max. 500 Tokens)
        let kiZusammenfassung = "";
        let kiKernaussagen = "";
        if (extractedText.trim().length > 100) {
            const textKurz = extractedText.slice(0, 8000);
            const typ = dokumenttyp === "urteil" ? "Gerichtsentscheidung" :
                       dokumenttyp === "aufsatz" ? "Fachaufsatz" :
                       dokumenttyp === "kommentar" ? "Kommentierung" :
                       dokumenttyp === "muster" ? "Mustertestament / Vorlage" :
                       dokumenttyp === "hinweis" ? "Kanzleihinweis / Checkliste" :
                       dokumenttyp === "handbuch" ? "Kanzleihandbuch / Verfahrensanweisung" : "Dokument";
            try {
                const analyse = await completeText({
                    model: DEFAULT_MAIN_MODEL,
                    systemPrompt:
                        "Du bist ein juristischer Assistent. Antworte ausschließlich als JSON. " +
                        "Keine Erklärungen, kein Markdown außer im JSON.",
                    user: (dokumenttyp === "muster" || dokumenttyp === "hinweis"
                        ? `Analysiere folgende Vorlage/Checkliste (${typ}) und antworte als JSON:\n` +
                          `{\n` +
                          `  "zusammenfassung": "2-3 Sätze: Wofür ist diese Vorlage geeignet?",\n` +
                          `  "kernaussagen": ["Klausel/Punkt 1", "Klausel/Punkt 2", "Klausel/Punkt 3"],\n` +
                          `  "rechtsgrundlagen": ["§ X Gesetz"],\n` +
                          `  "schlagwoerter": ["Begriff1", "Begriff2", "Begriff3"]\n` +
                          `}\n\nDokument:\n${textKurz}`
                        : `Analysiere folgendes juristische Dokument (${typ}) und antworte als JSON:\n` +
                          `{\n` +
                          `  "zusammenfassung": "2-3 Sätze Kerninhalt",\n` +
                          `  "kernaussagen": ["Kernaussage 1", "Kernaussage 2", "Kernaussage 3"],\n` +
                          `  "rechtsgrundlagen": ["§ X Gesetz", "§ Y Gesetz"],\n` +
                          `  "schlagwoerter": ["Begriff1", "Begriff2", "Begriff3"]\n` +
                          `}\n\nDokument:\n${textKurz}`),
                    maxTokens: 600,
                    jsonMode: true,
                });
                const match = analyse.match(/\{[\s\S]*\}/);
                if (match) {
                    const parsed = JSON.parse(match[0]) as {
                        zusammenfassung?: string;
                        kernaussagen?: string[];
                        schlagwoerter?: string[];
                    };
                    kiZusammenfassung = parsed.zusammenfassung ?? "";
                    kiKernaussagen = JSON.stringify(parsed.kernaussagen ?? []);
                }
            } catch { /* KI-Fehler ignorieren, Dokument trotzdem speichern */ }
        }

        const { data, error } = await db
            .from("wissensdatenbank")
            .insert({
                org_id: orgId,
                titel: titel.trim(),
                rechtsgebiet,
                dokumenttyp,
                gericht: gericht?.trim() || null,
                aktenzeichen: aktenzeichen?.trim() || null,
                entscheidungsdatum: entscheidungsdatum || null,
                storage_path: storagePath,
                extracted_text: extractedText.slice(0, 50000) || null,
                ki_zusammenfassung: kiZusammenfassung || null,
                ki_kernaussagen: kiKernaussagen || null,
                file_size_bytes: file.size,
                mime_type: file.mimetype,
                uploaded_by: userId,
                quelle,
                fundstelle: fundstelle?.trim() || null,
                matter_id: verifiedMatterId,
            })
            .select("id, titel, rechtsgebiet, dokumenttyp, ki_zusammenfassung, quelle, fundstelle, matter_id")
            .single();

        if (error) return void res.status(500).json({ detail: error.message });
        res.status(201).json(data);
    },
);

// ---------------------------------------------------------------------------
// GET /wissensbasis — Bibliothek
// ---------------------------------------------------------------------------

wissensbasisRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { rechtsgebiet, dokumenttyp, suche, matter_id: matterId } = req.query;

    const db = createServerSupabase();
    const orgId = await getOrgId(userId, db);
    if (!orgId) return void res.status(403).json({ detail: "Keine Organisation gefunden" });

    let query = db
        .from("wissensdatenbank")
        .select(
            "id, titel, rechtsgebiet, dokumenttyp, gericht, aktenzeichen, " +
            "entscheidungsdatum, ki_zusammenfassung, ki_kernaussagen, " +
            "quelle, fundstelle, matter_id, " +
            "file_size_bytes, created_at",
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

    if (rechtsgebiet && rechtsgebiet !== "alle") {
        query = query.eq("rechtsgebiet", rechtsgebiet as string);
    }
    if (dokumenttyp && dokumenttyp !== "alle") {
        query = query.eq("dokumenttyp", dokumenttyp as string);
    }
    if (suche && typeof suche === "string" && suche.trim()) {
        query = query.ilike("titel", `%${suche.trim()}%`);
    }
    // Kein eigenständiger Ownership-Check hier nötig: matter_id ist auf
    // Einträge dieser org_id beschränkt (siehe .eq("org_id", orgId) oben) und
    // wurde beim Anlegen bereits gegen die Organisation geprüft.
    if (matterId && typeof matterId === "string") {
        query = query.eq("matter_id", matterId);
    }

    const { data, error } = await query;
    if (error) return void res.status(500).json({ detail: error.message });
    res.json(data ?? []);
});

// ---------------------------------------------------------------------------
// POST /wissensbasis/:id/analysieren — vertiefende KI-Analyse
// ---------------------------------------------------------------------------

wissensbasisRouter.post("/:id/analysieren", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id } = req.params;
    const { frage } = req.body ?? {};

    const db = createServerSupabase();
    const orgId = await getOrgId(userId, db);
    if (!orgId) return void res.status(403).json({ detail: "Keine Organisation gefunden" });

    const { data: dok } = await db
        .from("wissensdatenbank")
        .select("titel, rechtsgebiet, dokumenttyp, gericht, aktenzeichen, extracted_text, ki_zusammenfassung")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();

    if (!dok) return void res.status(404).json({ detail: "Dokument nicht gefunden" });
    if (!dok.extracted_text?.trim()) {
        return void res.status(422).json({ detail: "Kein extrahierter Text vorhanden" });
    }

    const kontext = `Dokument: ${dok.titel}
Typ: ${dok.dokumenttyp}${dok.gericht ? ` | Gericht: ${dok.gericht}` : ""}${dok.aktenzeichen ? ` | Az: ${dok.aktenzeichen}` : ""}
Rechtsgebiet: ${dok.rechtsgebiet}
${dok.ki_zusammenfassung ? `Kurzzusammenfassung: ${dok.ki_zusammenfassung}\n` : ""}

Volltext (ggf. gekürzt):
${dok.extracted_text.slice(0, 12000)}`;

    const userFrage = frage?.trim()
        ? `Spezifische Frage: ${frage.trim()}\n\nBitte beantworte die Frage auf Basis des Dokuments.`
        : "Bitte analysiere dieses Dokument umfassend: " +
          "1) Sachverhalt/Kontext, 2) Rechtliche Kernaussagen, 3) Entscheidungsgründe/Argumentation, " +
          "4) Praktische Bedeutung für die Kanzleiarbeit, 5) Verwandte Rechtsfragen.";

    try {
        const analyse = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt:
                "Du bist ein erfahrener Rechtsanwalt und analysierst juristische Dokumente " +
                "präzise und praxisorientiert für eine Kanzlei. Antworte strukturiert und " +
                "nenne konkrete Paragraphen und Fundstellen.",
            user: `${kontext}\n\n${userFrage}`,
            maxTokens: 1500,
        });
        res.json({ analyse, dokument: { titel: dok.titel, id } });
    } catch (err) {
        res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
    }
});

// ---------------------------------------------------------------------------
// DELETE /wissensbasis/:id
// ---------------------------------------------------------------------------

wissensbasisRouter.delete("/:id", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id } = req.params;

    const db = createServerSupabase();
    const orgId = await getOrgId(userId, db);
    if (!orgId) return void res.status(403).json({ detail: "Keine Organisation gefunden" });

    const { error } = await db
        .from("wissensdatenbank")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId);

    if (error) return void res.status(500).json({ detail: error.message });
    res.status(204).send();
});
