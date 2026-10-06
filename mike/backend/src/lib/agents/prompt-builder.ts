/**
 * Zentraler Einstiegspunkt für agentenspezifische System-Prompts.
 *
 * Kombiniert: BKL Soul + Agent-Profil aus Registry + Klotzkette + Disclaimer.
 * Alle Spezialisten-Routes rufen buildAgentSystemPrompt(profileId) auf statt
 * eigene Inline-Strings zu pflegen.
 */

import { getProfile, type AgentProfile } from "./registry";
import { buildSpecialistSystemPrompt } from "./bkl-soul";

function formatProfile(p: AgentProfile): string {
    if (p.extendedPrompt) return p.extendedPrompt.trim();

    const lines: string[] = [
        p.identity,
        "",
        p.focus,
    ];

    lines.push("", "### Rechtsquellen (Priorität)");
    p.rechtsquellen.forEach((q, i) => lines.push(`${i + 1}. ${q}`));

    lines.push("", "### Kritische Regeln — dürfen niemals übergangen werden");
    p.criticalRules.forEach((r) => lines.push(`- ${r}`));

    lines.push("", "### Erfolgsmetriken");
    p.successMetrics.forEach((m) => lines.push(`- ${m}`));

    if (p.kanzleikontext) {
        lines.push("", "### Kanzleikontext");
        lines.push(p.kanzleikontext);
    }

    lines.push(
        "",
        "### Ausgabeformat",
        "Antworte direkt und ohne unnötige Einleitungen.",
        "Struktur: Kernaussage → Rechtsgrundlage → praktische Konsequenz.",
        "Maximale Länge: 200 Wörter, sofern keine Dokumenterstellung angefordert.",
    );

    return lines.join("\n");
}

/**
 * Erzeugt den vollständigen System-Prompt für einen spezialisierten Agenten.
 *
 * @param profileId  Schlüssel aus der Registry (z.B. 'kapitalmarkt', 'erbrecht')
 */
export function buildAgentSystemPrompt(profileId: string): string {
    const profile = getProfile(profileId);
    return buildSpecialistSystemPrompt(formatProfile(profile));
}
