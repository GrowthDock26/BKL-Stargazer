/**
 * Kapitalmarktrecht-Assistent — Prospekthaftung, VermAnlG, WpPG, Anlegerschutz.
 *
 * Endpoints:
 *   POST /kapitalmarkt/chat          — interaktiver Chat (opt-in Adversarial)
 *   POST /kapitalmarkt/analysieren   — Schriftsatz-/Dokumentenanalyse mit Upload
 *
 * Adversarial Workflow ist besonders für PRE9/PRE10-Klageschriften gedacht:
 * Der Attacker argumentiert als Verteidigeranwalt der Beklagten (Steurer, Thies).
 */

import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { DEFAULT_MAIN_MODEL } from "../lib/llm";
import { buildAgentSystemPrompt } from "../lib/agents/prompt-builder";
import { buildWissensbasisKontext } from "../lib/wissensbasis/kontext";
import { runAdversarialWorkflow } from "../lib/agents/adversarial";
import { extractPdfText } from "../lib/chatTools";
import { completeWithCaseLaw } from "../lib/legalSourcesTools/rechtsprechungTools";

export const kapitalmarktRouter = Router();

async function getOrgId(userId: string, db: ReturnType<typeof createServerSupabase>): Promise<string | null> {
    const { data } = await db.from("org_members").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
    return (data?.org_id as string) ?? null;
}

const KAPITALMARKT_SYSTEM_PROMPT = buildAgentSystemPrompt("kapitalmarkt");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 5 },
    fileFilter: (_req, file, cb) => {
        const ok = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        cb(null, ok.includes(file.mimetype));
    },
});

/**
 * Spezialisierter Attacker für Prospekthaftungsfälle (VermAnlG/WpPG).
 * Argumentiert als Verteidigeranwalt der Beklagten — typische Einwände
 * in PRE9/PRE10-Schadensersatzklagen gegen Steurer und Thies.
 */
const PRE_ATTACKER_PROMPT = `Du bist der Verteidigeranwalt der Beklagten in einem
Kapitalmarkt-Schadensersatzprozess (Prospekthaftung nach VermAnlG/WpPG).

Deine Aufgabe: Finde die angreifbarsten Stellen im Klageschreiben des Klägers.
Argumentiere aus der Sicht der Beklagten — sachlich, präzise, ohne Rücksicht
auf die Klägerinteressen.

Prüfe systematisch folgende typische Verteidigungslinien:

1. **Verjährungseinrede**
   - § 20 Abs. 5 VermAnlG: 1 Jahr ab Kenntnis des Prospektfehlers
   - Absolute Frist: 3 Jahre ab Prospektveröffentlichung (Datum prüfen)
   - § 199 Abs. 3 BGB: max. 10 Jahre ohne Rücksicht auf Kenntnis
   - War Kenntnis früher als behauptet? (Beiratsberichte, Geschäftsberichte, Medienberichte)

2. **Kein Prospektfehler / Wesentlichkeit nicht erreicht**
   - Angegriffene Aussagen sind bloße Prognosen oder unverbindliche Einschätzungen
   - Risiken waren im Prospekt hinreichend deutlich beschrieben (§ 13 VermAnlG)
   - Wesentlichkeitsschwelle (BGH) nicht überschritten

3. **Fehlende Kausalität**
   - Hat der Kläger den Prospekt tatsächlich gelesen? (§ 20 Abs. 2 VermAnlG)
   - Andere Informationsquellen als Kaufentscheidungsgrundlage?
   - Würde die Investition auch ohne den Fehler stattgefunden haben?

4. **Passivlegitimation zweifelhaft**
   - Ist der konkrete Beklagte tatsächlich Prospektverantwortlicher i.S.v. § 20 Abs. 1 VermAnlG?
   - Handelte der Beklagte in eigenem oder fremdem Namen?
   - Haftungsfreistellungsvereinbarungen zwischen Beklagten prüfen

5. **Mitverschulden (§ 254 BGB)**
   - Unternehmerisches Risiko war für Anleger erkennbar
   - Diversifikationsgebot missachtet
   - Professioneller Anleger: erhöhte Eigenverantwortung

6. **Schadenshöhe**
   - Zeichnungssumme minus Ausschüttungen: korrekt berechnet?
   - Zinsanspruch: Zinsbeginn, Höhe (§ 288 BGB vs. Schadensersatzzins)
   - Zug-um-Zug: Beteiligungswert nicht null — hat die Beteiligung noch Restwert?

Benenne die 3–5 stärksten Einwände mit Fundstelle und kurzem Angriffspunkt.
Keine Verbesserungsvorschläge — nur Verteidigungsargumente.`;

const AUFGABEN_HINWEIS: Record<string, string> = {
    sachstand: "Erstelle eine strukturierte Sachstands- und Rechtslageanalyse aus Mandantensicht.",
    schriftsatz: "Entwirf einen Schriftsatz (Klage, Replik oder Stellungnahme) auf Basis der Unterlagen. Schließe mit Risikoradar und Adressaten-Check.",
};

// ---------------------------------------------------------------------------
// POST /kapitalmarkt/chat — interaktiver Chat
// ---------------------------------------------------------------------------

kapitalmarktRouter.post("/chat", requireAuth, async (req, res) => {
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

    const wbKontext = await buildWissensbasisKontext("kapitalmarkt", orgId, db).catch(() => null);

    const userMessage = wbKontext
        ? `${wbKontext}\n\n---\n\n## Anfrage\n\n${last.content}`
        : last.content;

    try {
        if (adversarial === true) {
            const { entwurf, kritik, final, caseLawRead } =
                await runAdversarialWorkflow(
                    KAPITALMARKT_SYSTEM_PROMPT,
                    userMessage,
                    undefined,
                    PRE_ATTACKER_PROMPT,
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
                systemPrompt: KAPITALMARKT_SYSTEM_PROMPT,
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

// ---------------------------------------------------------------------------
// POST /kapitalmarkt/analysieren — Schriftsatz-Analyse mit Dateiupload
//
// Body (multipart/form-data):
//   datei[]  — bis zu 5 PDF/DOCX (Schriftsätze, Prospekte, Urteile)
//   frage    — Arbeitsauftrag (required)
//   aufgabe  — "sachstand" | "schriftsatz" (default: "sachstand")
//
// Bei aufgabe = "schriftsatz": immer Adversarial mit PRE-Attacker
// ---------------------------------------------------------------------------

kapitalmarktRouter.post(
    "/analysieren",
    requireAuth,
    upload.array("datei", 5),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerSupabase();

        const orgId = await getOrgId(userId, db);
        if (!orgId) return void res.status(403).json({ detail: "Kein Kanzleimitglied" });

        const frage = (req.body?.frage as string | undefined)?.trim();
        if (!frage) return void res.status(400).json({ detail: "'frage' ist erforderlich" });

        const aufgabe = (req.body?.aufgabe as string | undefined) ?? "sachstand";
        if (!Object.keys(AUFGABEN_HINWEIS).includes(aufgabe)) {
            return void res.status(400).json({
                detail: `'aufgabe' muss einer von: ${Object.keys(AUFGABEN_HINWEIS).join(", ")} sein`,
            });
        }

        // Dokumente extrahieren
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
            } catch { /* Einzeldatei-Fehler ignorieren */ }
        }

        const wbKontext = await buildWissensbasisKontext("kapitalmarkt", orgId, db).catch(() => null);

        const userMessage = [
            ...(wbKontext ? [wbKontext, "", "---", ""] : []),
            AUFGABEN_HINWEIS[aufgabe],
            "",
            `Arbeitsauftrag: ${frage}`,
            ...(dokumentenTexte.length > 0
                ? ["", "--- HOCHGELADENE DOKUMENTE ---", ...dokumentenTexte]
                : ["", "(Keine Dokumente hochgeladen — antworte auf Basis des Arbeitsauftrags.)"]),
        ].join("\n");

        try {
            if (aufgabe === "schriftsatz") {
                // Schriftsätze immer adversarial — Attacker kennt PRE9/PRE10-Verteidigungsstrategien
                const { entwurf, kritik, final, caseLawRead } =
                    await runAdversarialWorkflow(
                        KAPITALMARKT_SYSTEM_PROMPT,
                        userMessage,
                        undefined,
                        PRE_ATTACKER_PROMPT,
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
                const { text: response, caseLawRead } = await completeWithCaseLaw({
                    model: DEFAULT_MAIN_MODEL,
                    systemPrompt: KAPITALMARKT_SYSTEM_PROMPT,
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
            const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
            res.status(500).json({ detail: `KI-Fehler: ${msg}` });
        }
    },
);
