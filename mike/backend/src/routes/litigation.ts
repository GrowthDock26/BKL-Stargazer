/**
 * Litigation Lawyer — interner KI-Assistent für Prozessführung.
 *
 * Funktionen:
 *   POST /litigation/chat          — interaktiver Chat (Fragen, Strategieberatung)
 *   POST /litigation/analysieren   — Schriftsatz-/Dokumentenanalyse (Upload + Frage)
 *
 * Alle Mitarbeiter der Kanzlei haben Zugang.
 * Rate Limiting: kiLimiter in index.ts (20 Anfragen / 15 Min.).
 */

import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { DEFAULT_MAIN_MODEL } from "../lib/llm";
import { buildAgentSystemPrompt } from "../lib/agents/prompt-builder";
import { runAdversarialWorkflow } from "../lib/agents/adversarial";
import { buildWissensbasisKontext } from "../lib/wissensbasis/kontext";
import { extractPdfText } from "../lib/chatTools";
import { completeWithCaseLaw } from "../lib/legalSourcesTools/rechtsprechungTools";

// Litigation ist cross-domain — zieht aus allen relevanten Rechtsgebieten
const LITIGATION_RECHTSGEBIETE = ["kapitalmarkt", "gesellschaftsrecht", "erbrecht", "arbeitsrecht", "litigation"];

export const litigationRouter = Router();

async function getOrgId(userId: string, db: ReturnType<typeof createServerSupabase>): Promise<string | null> {
    const { data } = await db
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
    return (data?.org_id as string) ?? null;
}

const LITIGATION_SYSTEM_PROMPT = buildAgentSystemPrompt("litigation");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 5 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        cb(null, allowed.includes(file.mimetype));
    },
});

// ---------------------------------------------------------------------------
// POST /litigation/chat — interaktiver Litigation-Chat
// ---------------------------------------------------------------------------

litigationRouter.post("/chat", requireAuth, async (req, res) => {
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
        return void res.status(400).json({ detail: "Letzte Nachricht darf nicht leer sein" });
    }
    if (last.content.length > 8000) {
        return void res.status(400).json({ detail: "Nachricht zu lang (max. 8000 Zeichen)" });
    }

    const wbKontext = await buildWissensbasisKontext(LITIGATION_RECHTSGEBIETE, orgId, db).catch(() => null);

    const userMessage = wbKontext
        ? `${wbKontext}\n\n---\n\n## Anfrage\n\n${last.content}`
        : last.content;

    try {
        const { text: response, caseLawRead } = await completeWithCaseLaw({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: LITIGATION_SYSTEM_PROMPT,
            user: userMessage,
        });
        res.json({
            response,
            model: DEFAULT_MAIN_MODEL,
            wissensbasis_eintraege: !!wbKontext,
            rechtsprechung: caseLawRead,
        });
    } catch (err) {
        res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
    }
});

// ---------------------------------------------------------------------------
// POST /litigation/analysieren — Schriftsatz-Analyse mit optionalem Dateiupload
//
// Body (multipart/form-data):
//   datei[]  — bis zu 5 PDF/DOCX-Dateien (optional)
//   frage    — konkrete Frage / Arbeitsauftrag (required)
//   aufgabe  — "sachstand" | "relation" | "schriftsatz" (optional, default: "sachstand")
// ---------------------------------------------------------------------------

litigationRouter.post(
    "/analysieren",
    requireAuth,
    upload.array("datei", 5),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerSupabase();

        const orgId = await getOrgId(userId, db);
        if (!orgId) return void res.status(403).json({ detail: "Kein Kanzleimitglied" });

        const frage = (req.body?.frage as string | undefined)?.trim();
        if (!frage) {
            return void res.status(400).json({ detail: "'frage' ist erforderlich" });
        }

        const aufgabe = (req.body?.aufgabe as string | undefined) ?? "sachstand";
        const validAufgaben = ["sachstand", "relation", "schriftsatz"];
        if (!validAufgaben.includes(aufgabe)) {
            return void res.status(400).json({
                detail: `'aufgabe' muss einer von: ${validAufgaben.join(", ")} sein`,
            });
        }

        // Texte aus Datei-Uploads extrahieren
        const files = (req.files ?? []) as Express.Multer.File[];
        const dokumentenTexte: string[] = [];

        for (const file of files) {
            try {
                let text = "";
                if (file.mimetype === "application/pdf") {
                    text = await extractPdfText(file.buffer.buffer as ArrayBuffer);
                } else {
                    const mammoth = await import("mammoth");
                    const result = await mammoth.extractRawText({ buffer: file.buffer });
                    text = result.value;
                }
                if (text.trim()) {
                    dokumentenTexte.push(`=== DOKUMENT: ${file.originalname} ===\n${text.slice(0, 12000)}`);
                }
            } catch {
                // Fehler bei einzelner Datei ignorieren, weiter mit nächster
            }
        }

        const aufgabenHinweis: Record<string, string> = {
            sachstand: "Erstelle eine strukturierte Sachstands- und Rechtslageanalyse (vgl. Abschnitt IX.A deiner Anweisungen).",
            relation: "Erstelle eine vollständige Relation vor mündlicher Verhandlung (vgl. Abschnitt IX.B deiner Anweisungen).",
            schriftsatz: "Entwirf einen Schriftsatz auf Basis der folgenden Unterlagen und Anweisung (vgl. Abschnitt IX.C deiner Anweisungen). Schließe mit 'Hinweise für Senior-Review'.",
        };

        const wbKontext = await buildWissensbasisKontext(LITIGATION_RECHTSGEBIETE, orgId, db).catch(() => null);

        const userMessage = [
            ...(wbKontext ? [wbKontext, "", "---", ""] : []),
            aufgabenHinweis[aufgabe],
            "",
            `Arbeitsauftrag: ${frage}`,
            ...(dokumentenTexte.length > 0
                ? ["", "--- HOCHGELADENE DOKUMENTE ---", ...dokumentenTexte]
                : ["", "(Keine Dokumente hochgeladen — antworte auf Basis des Arbeitsauftrags.)"]),
        ].join("\n");

        try {
            if (aufgabe === "schriftsatz") {
                // Schriftsätze: Adversarial Workflow (Builder → Attacker → Synthesizer)
                const { entwurf, kritik, final, caseLawRead } =
                    await runAdversarialWorkflow(
                        LITIGATION_SYSTEM_PROMPT,
                        userMessage,
                        undefined,
                        undefined,
                        { caseLaw: true },
                    );
                res.json({
                    response: final,
                    adversarial: { entwurf, kritik },
                    model: DEFAULT_MAIN_MODEL,
                    aufgabe,
                    wissensbasis_eintraege: !!wbKontext,
                    dokumente: files.map((f) => f.originalname),
                    rechtsprechung: caseLawRead ?? [],
                });
            } else {
                // Sachstand / Relation: Single-Call mit Rechtsprechungs-Zugriff
                const { text: response, caseLawRead } = await completeWithCaseLaw({
                    model: DEFAULT_MAIN_MODEL,
                    systemPrompt: LITIGATION_SYSTEM_PROMPT,
                    user: userMessage,
                });
                res.json({
                    response,
                    model: DEFAULT_MAIN_MODEL,
                    aufgabe,
                    wissensbasis_eintraege: !!wbKontext,
                    dokumente: files.map((f) => f.originalname),
                    rechtsprechung: caseLawRead,
                });
            }
        } catch (err) {
            res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
        }
    },
);
