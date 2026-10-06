/**
 * Gesellschaftsrecht-Assistent — GmbH, GmbH & Co. KG, Familiengesellschaften.
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

export const gesellschaftsrechtRouter = Router();

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

const GESELLSCHAFTSRECHT_SYSTEM_PROMPT = buildAgentSystemPrompt("gesellschaftsrecht");

const VERTRAGS_REVIEW_PROMPT = (typ: string, vertragstext: string) => `Analysiere den folgenden Gesellschaftsvertrag (${typ}) systematisch. Für jede Klausel:
- Bezeichne die Klausel
- Bewerte: ✅ wirksam & vollständig | ⚠️ Risiko/Verbesserungsbedarf | ❌ unwirksam/fehlerhaft | 🔧 Ergänzung empfohlen | ⬜ Fehlt
- Begründung mit Rechtsgrundlage
- Bei ⚠️/❌/🔧/⬜: konkreter Verbesserungs- oder Formulierungsvorschlag

${typ.includes("GmbH & Co") ? `
PFLICHTPRÜFUNG GmbH & Co. KG:
1. Komplementärin (GmbH) — Regelung und Haftungsfreistellung
2. Kapitalkonten (3-Konten-Modell vollständig?)
3. Gewinn-/Verlustverteilung inkl. Vorabvergütung
4. Entnahmerecht (Privatentnahmen + Steuerentnahmen geregelt?)
5. Nachfolgeklausel (qualifiziert oder einfach? Risiken?)
6. Abfindungsregelung (Bewertungsmethode, Auszahlungsmodalitäten)
7. Vinkulierungsklausel
8. Ausschließungsklausel und wichtige Gründe
9. Gesellschafterversammlung (Einberufung, Mehrheiten, Beschlussfassung)
10. Wettbewerbsverbot der Gesellschafter
11. Beurkundungserfordernisse beachtet?
12. Steuerliche Klauseln (Steuerentnahme, § 13a ErbStG-Optimierung)
` : `
PFLICHTPRÜFUNG GmbH-SATZUNG:
1. Firma und Sitz
2. Unternehmensgegenstand (zu eng/zu weit?)
3. Stammkapital und Einlagen
4. Gesellschafterversammlung (Einberufung, Mehrheiten)
5. Geschäftsführungsregelung (§ 181 BGB-Befreiung?)
6. Anteilsübertragung (Vinkulierung, Vorkaufsrecht)
7. Einziehung (§ 34 GmbHG — wichtige Gründe definiert?)
8. Abfindungsklausel (Bewertungsmethode)
9. Gewinnverwendung
10. Wettbewerbsverbot
11. Auflösung und Liquidation
12. Schriftformerfordernisse und Beurkundungspflichten
`}

Abschließend: Gesamtbewertung, Risikoeinstufung (gering/mittel/hoch) und die 3 wichtigsten Handlungsempfehlungen.

VERTRAGSTEXT:
${vertragstext}`;

// ---------------------------------------------------------------------------
// POST /gesellschaftsrecht/chat
// ---------------------------------------------------------------------------

gesellschaftsrechtRouter.post("/chat", requireAuth, async (req, res) => {
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

    const wbKontext = await buildWissensbasisKontext("gesellschaftsrecht", orgId, db).catch(() => null);

    const userMessage = wbKontext
        ? `${wbKontext}\n\n---\n\n## Anfrage\n\n${last.content}`
        : last.content;

    try {
        const response = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: GESELLSCHAFTSRECHT_SYSTEM_PROMPT,
            user: userMessage,
            maxTokens: 1200,
        });
        res.json({ response, model: DEFAULT_MAIN_MODEL, wissensbasis_eintraege: !!wbKontext });
    } catch (err) {
        res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
    }
});

// ---------------------------------------------------------------------------
// POST /gesellschaftsrecht/vertrag-pruefen
// ---------------------------------------------------------------------------

gesellschaftsrechtRouter.post(
    "/vertrag-pruefen",
    requireAuth,
    upload.single("datei"),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerSupabase();

        const orgId = await getOrgId(userId, db);
        if (!orgId) return void res.status(403).json({ detail: "Kein Kanzleimitglied" });

        const file = req.file;
        const { vertragstext: direktText, vertragstyp } = req.body ?? {};
        const typ = (vertragstyp as string) || "GmbH-Gesellschaftsvertrag";

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

        const wbKontext = await buildWissensbasisKontext("gesellschaftsrecht", orgId, db).catch(() => null);
        const reviewPrompt = VERTRAGS_REVIEW_PROMPT(typ, text.slice(0, 14000));

        const userMessage = wbKontext
            ? `${wbKontext}\n\n---\n\n${reviewPrompt}`
            : reviewPrompt;

        try {
            const review = await completeText({
                model: DEFAULT_MAIN_MODEL,
                systemPrompt: GESELLSCHAFTSRECHT_SYSTEM_PROMPT,
                user: userMessage,
                maxTokens: 3000,
            });
            res.json({ review, model: DEFAULT_MAIN_MODEL, vertragstyp: typ, wissensbasis_eintraege: !!wbKontext });
        } catch (err) {
            res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
        }
    },
);
