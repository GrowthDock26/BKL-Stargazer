/**
 * Erbrecht-Assistent (Erbse) — interner KI-Chat für BKL-Mitarbeiter.
 *
 * Vor jedem LLM-Call werden Mustertestamente und Hinweise aus der
 * Wissensdatenbank (rechtsgebiet = 'erbrecht') als Kontext injiziert,
 * sodass Erbse auf kanzleieigene Vorlagen zugreifen kann.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { DEFAULT_MAIN_MODEL } from "../lib/llm";
import { buildAgentSystemPrompt } from "../lib/agents/prompt-builder";
import { buildWissensbasisKontext } from "../lib/wissensbasis/kontext";
import { runAdversarialWorkflow } from "../lib/agents/adversarial";
import { completeWithCaseLaw } from "../lib/legalSourcesTools/rechtsprechungTools";

export const erbrechtRouter = Router();

async function getOrgId(userId: string, db: ReturnType<typeof createServerSupabase>): Promise<string | null> {
    const { data } = await db
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
    return (data?.org_id as string) ?? null;
}

const ERBRECHT_SYSTEM_PROMPT = buildAgentSystemPrompt("erbrecht");

// ---------------------------------------------------------------------------
// POST /erbrecht/chat
// ---------------------------------------------------------------------------

erbrechtRouter.post("/chat", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();

    const orgId = await getOrgId(userId, db);
    if (!orgId) return void res.status(403).json({ detail: "Kein Kanzleimitglied" });

    const { messages, adversarial } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
        return void res.status(400).json({ detail: "messages ist erforderlich" });
    }

    const last = messages[messages.length - 1] as { role?: string; content?: string };
    if (!last?.content?.trim()) {
        return void res.status(400).json({ detail: "Letzte Nachricht darf nicht leer sein" });
    }
    if (last.content.length > 8000) {
        return void res.status(400).json({ detail: "Nachricht zu lang (max. 8000 Zeichen)" });
    }

    // Wissensdatenbank-Kontext laden (Muster, Hinweise, Urteile für Erbrecht)
    const wbKontext = await buildWissensbasisKontext("erbrecht", orgId, db).catch(() => null);

    // Kontext vor der eigentlichen Anfrage einfügen, damit Erbse die Muster kennt
    const userMessage = wbKontext
        ? `${wbKontext}\n\n---\n\n## Mandantenanfrage / Arbeitsauftrag\n\n${last.content}`
        : last.content;

    try {
        if (adversarial === true) {
            // Adversarial Workflow: sinnvoll bei Testamentsentwürfen und komplexen
            // Nachfolgeplanungskonzepten — Erbse erstellt, Gegner kritisiert, Erbse verbessert
            const { entwurf, kritik, final, caseLawRead } =
                await runAdversarialWorkflow(
                    ERBRECHT_SYSTEM_PROMPT,
                    userMessage,
                    undefined,
                    undefined,
                    { caseLaw: true },
                );
            res.json({
                response: final,
                adversarial: { entwurf, kritik },
                model: DEFAULT_MAIN_MODEL,
                wissensbasis_eintraege: !!wbKontext,
                rechtsprechung: caseLawRead ?? [],
            });
        } else {
            const { text: response, caseLawRead } = await completeWithCaseLaw({
                model: DEFAULT_MAIN_MODEL,
                systemPrompt: ERBRECHT_SYSTEM_PROMPT,
                user: userMessage,
            });
            res.json({
                response,
                model: DEFAULT_MAIN_MODEL,
                wissensbasis_eintraege: !!wbKontext,
                rechtsprechung: caseLawRead,
            });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
        res.status(500).json({ detail: `KI-Fehler: ${msg}` });
    }
});
