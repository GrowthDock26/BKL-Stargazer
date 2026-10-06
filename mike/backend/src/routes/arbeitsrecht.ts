/**
 * Arbeitsrecht-Assistent — Schwerpunkt GmbH-Geschäftsführerverträge.
 * Funktionen: KI-Chat + Vertragsanalyse (Upload → strukturiertes Review).
 */

import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { completeText, DEFAULT_MAIN_MODEL } from "../lib/llm";
import { buildAgentSystemPrompt } from "../lib/agents/prompt-builder";
import { buildWissensbasisKontext } from "../lib/wissensbasis/kontext";
import { extractPdfText } from "../lib/chatTools";

export const arbeitsrechtRouter = Router();

async function getOrgId(userId: string, db: ReturnType<typeof createServerSupabase>): Promise<string | null> {
    const { data } = await db.from("org_members").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
    return (data?.org_id as string) ?? null;
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const ok = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        cb(null, ok.includes(file.mimetype));
    },
});

const ARBEITSRECHT_SYSTEM_PROMPT = buildAgentSystemPrompt("arbeitsrecht");

const VERTRAGS_REVIEW_PROMPT = (vertragstext: string) => `Analysiere den folgenden Geschäftsführervertrag systematisch und strukturiert.

Für jede gefundene Klausel/jeden Abschnitt:
- Bezeichne die Klausel
- Bewerte: ✅ wirksam und vollständig | ⚠️ Risiko oder Verbesserungsbedarf | ❌ unwirksam oder fehlerhaft | 🔧 Ergänzung empfohlen
- Gib eine kurze Begründung mit Rechtsgrundlage
- Formuliere bei ⚠️/❌/🔧 einen konkreten Verbesserungsvorschlag

Prüfe IMMER folgende Punkte (auch wenn nicht explizit vorhanden — dann als fehlend markieren):
1. Vergütung (Festgehalt, variable Vergütung, Nebenleistungen)
2. Arbeitszeit und Überstunden
3. Urlaub
4. Kündigung (ordentlich / außerordentlich, Fristen, Koppelungsklausel)
5. Nachvertragliches Wettbewerbsverbot (+ Karenzentschädigung)
6. Haftung und D&O-Versicherung
7. § 181 BGB Befreiung
8. Vertretungsbefugnis
9. Gerichtsstandklausel
10. Datenschutz / Verschwiegenheit

Abschließend: Gesamtbewertung und die 3 wichtigsten Handlungsempfehlungen.

VERTRAGSTEXT:
${vertragstext}`;

// ---------------------------------------------------------------------------
// POST /arbeitsrecht/chat
// ---------------------------------------------------------------------------

arbeitsrechtRouter.post("/chat", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();

    const orgId = await getOrgId(userId, db);
    if (!orgId) return void res.status(403).json({ detail: "Kein Kanzleimitglied" });

    const { messages } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
        return void res.status(400).json({ detail: "messages ist erforderlich" });
    }

    const last = messages[messages.length - 1] as { content?: string };
    if (!last?.content?.trim()) {
        return void res.status(400).json({ detail: "Nachricht darf nicht leer sein" });
    }
    if (last.content.length > 5000) {
        return void res.status(400).json({ detail: "Nachricht zu lang (max. 5000 Zeichen)" });
    }

    const wbKontext = await buildWissensbasisKontext("arbeitsrecht", orgId, db).catch(() => null);

    const userMessage = wbKontext
        ? `${wbKontext}\n\n---\n\n## Anfrage\n\n${last.content}`
        : last.content;

    try {
        const response = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: ARBEITSRECHT_SYSTEM_PROMPT,
            user: userMessage,
            maxTokens: 1200,
        });
        res.json({ response, model: DEFAULT_MAIN_MODEL, wissensbasis_eintraege: !!wbKontext });
    } catch (err) {
        res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
    }
});

// ---------------------------------------------------------------------------
// POST /arbeitsrecht/vertrag-pruefen — Vertragsdokument analysieren
// ---------------------------------------------------------------------------

arbeitsrechtRouter.post(
    "/vertrag-pruefen",
    requireAuth,
    upload.single("datei"),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerSupabase();

        const orgId = await getOrgId(userId, db);
        if (!orgId) return void res.status(403).json({ detail: "Kein Kanzleimitglied" });

        const file = req.file;
        const { vertragstext: direktText } = req.body ?? {};

        let text = "";
        if (file) {
            if (file.mimetype === "application/pdf") {
                text = await extractPdfText(file.buffer.buffer as ArrayBuffer);
            } else {
                const mammoth = await import("mammoth");
                const result = await mammoth.extractRawText({ buffer: file.buffer });
                text = result.value;
            }
        } else if (direktText?.trim()) {
            text = direktText.trim();
        }

        if (!text.trim()) {
            return void res.status(400).json({ detail: "Kein Vertragstext vorhanden" });
        }

        const wbKontext = await buildWissensbasisKontext("arbeitsrecht", orgId, db).catch(() => null);
        const reviewPrompt = VERTRAGS_REVIEW_PROMPT(text.slice(0, 14000));

        const userMessage = wbKontext
            ? `${wbKontext}\n\n---\n\n${reviewPrompt}`
            : reviewPrompt;

        try {
            const review = await completeText({
                model: DEFAULT_MAIN_MODEL,
                systemPrompt: ARBEITSRECHT_SYSTEM_PROMPT,
                user: userMessage,
                maxTokens: 2500,
            });
            res.json({ review, model: DEFAULT_MAIN_MODEL, zeichen: text.length, wissensbasis_eintraege: !!wbKontext });
        } catch (err) {
            res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
        }
    },
);
