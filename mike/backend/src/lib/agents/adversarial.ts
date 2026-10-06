/**
 * Adversarial Workflow — Builder → Attacker → Synthesizer
 *
 * Inspiriert von Lavern's Adversarial Workflow (Apache 2.0, AnttiHero/lavern).
 * Kerngedanke: "At some point you stop needing a bigger model and
 * start needing more viewpoints." — 3 Calls, gleiche Kosten wie Opus-Upgrade,
 * aber strukturell robusteres Ergebnis.
 *
 * Ablauf:
 *   1. BUILDER   — erstellt den Entwurf (nutzt den vollen Agenten-System-Prompt)
 *   2. ATTACKER  — sucht die stärksten juristischen Schwachstellen (adversarial)
 *   3. SYNTHESIZER — verbessert den Entwurf auf Basis der Kritik
 *
 * Einsatz:
 *   - litigation/analysieren: automatisch bei aufgabe = "schriftsatz"
 *   - erbrecht/chat:          opt-in via adversarial: true im Request-Body
 */

import { completeText, DEFAULT_MAIN_MODEL } from "../llm";
import type { UserApiKeys } from "../llm";
import {
    completeWithCaseLaw,
    type CaseLawSearchOutcome,
    type CaseLawReadOutcome,
} from "../legalSourcesTools/rechtsprechungTools";

export type AdversarialResult = {
    entwurf: string;
    kritik: string;
    final: string;
    caseLawSearched?: CaseLawSearchOutcome[];
    caseLawRead?: CaseLawReadOutcome[];
};

const ATTACKER_SYSTEM_PROMPT = `Du bist ein kritischer juristischer Gegner-Anwalt.
Deine einzige Aufgabe: Schwachstellen im vorgelegten Rechtsdokument aus Sicht
des Gegners oder des Gerichts zu identifizieren.

Benenne präzise und ohne Beschönigung:
1. Die 3 stärksten Gegenargumente (Gegner- oder Gerichtsperspektive)
2. Angreifbare oder unklare Formulierungen (mit Zitat der problematischen Stelle)
3. Fehlende oder unzureichende Begründungen und Belege
4. Prozessuale oder formale Schwächen

Keine Verbesserungsvorschläge — nur Kritik. Kein Mitgefühl, kein Schönreden.
Antworte strukturiert und knapp.`;

const SYNTHESIZER_INSTRUCTION = (originalAnfrage: string) =>
    `Du erhältst einen juristischen Entwurf und eine Kritik dazu.

ORIGINALAUFTRAG:
${originalAnfrage}

Deine Aufgabe:
1. Räume die genannten Schwachstellen aus — präzise, ohne die Stärken zu schwächen.
2. Markiere jede verbesserte Passage mit [REV].
3. Falls eine Schwachstelle nicht ausgeräumt werden kann, benenne das offen.
4. Halte Struktur und Umfang des Entwurfs bei — kein Neuschreiben ohne Grund.
5. Schließe ab mit den Pflichtblöcken (Risikoradar + Adressaten-Check).`;

/**
 * Führt den vollständigen Adversarial Workflow durch.
 *
 * @param agentSystemPrompt    Vollständiger System-Prompt des aufrufenden Agenten
 * @param userMessage          Die Aufgabenstellung / Arbeitsauftrag
 * @param apiKeys              Optionale API-Keys
 * @param customAttackerPrompt Überschreibt den generischen Attacker — für
 *                             domänenspezifische Gegenargumentation (z.B. Kapitalmarkt)
 * @param options.caseLaw      Wenn true, können BUILDER und SYNTHESIZER die
 *                             Tools search_case_law/get_case_law aufrufen, um
 *                             deutsche Gerichtsentscheidungen zu recherchieren
 *                             und wörtlich zu zitieren, statt sie zu erfinden.
 *                             Der ATTACKER-Schritt braucht das nicht (reine Kritik).
 *                             Explizit opt-in, damit bestehende Aufrufer (z.B.
 *                             Kapitalmarkt) unverändert bleiben.
 */
export async function runAdversarialWorkflow(
    agentSystemPrompt: string,
    userMessage: string,
    apiKeys?: UserApiKeys,
    customAttackerPrompt?: string,
    options?: { caseLaw?: boolean },
): Promise<AdversarialResult> {
    const caseLawSearched: CaseLawSearchOutcome[] = [];
    const caseLawRead: CaseLawReadOutcome[] = [];

    // ---- 1. BUILDER ----
    let entwurf: string;
    if (options?.caseLaw) {
        const result = await completeWithCaseLaw({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: agentSystemPrompt,
            user: userMessage,
        });
        entwurf = result.text;
        caseLawSearched.push(...result.caseLawSearched);
        caseLawRead.push(...result.caseLawRead);
    } else {
        entwurf = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: agentSystemPrompt,
            user: userMessage,
            maxTokens: 4000,
            apiKeys,
        });
    }

    // ---- 2. ATTACKER ----
    const kritik = await completeText({
        model: DEFAULT_MAIN_MODEL,
        systemPrompt: customAttackerPrompt ?? ATTACKER_SYSTEM_PROMPT,
        user: `Analysiere dieses Rechtsdokument auf Schwachstellen:\n\n${entwurf}`,
        maxTokens: 1200,
        apiKeys,
    });

    // ---- 3. SYNTHESIZER ----
    const synthesizerUser = [
        SYNTHESIZER_INSTRUCTION(userMessage),
        "",
        "--- ERSTER ENTWURF ---",
        entwurf,
        "",
        "--- KRITIK DES GEGNER-ANWALTS ---",
        kritik,
    ].join("\n");

    let final: string;
    if (options?.caseLaw) {
        const result = await completeWithCaseLaw({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: agentSystemPrompt,
            user: synthesizerUser,
        });
        final = result.text;
        caseLawSearched.push(...result.caseLawSearched);
        caseLawRead.push(...result.caseLawRead);
    } else {
        final = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: agentSystemPrompt,
            user: synthesizerUser,
            maxTokens: 4000,
            apiKeys,
        });
    }

    return options?.caseLaw
        ? { entwurf, kritik, final, caseLawSearched, caseLawRead }
        : { entwurf, kritik, final };
}
