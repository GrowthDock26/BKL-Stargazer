/**
 * LOGICC model catalog (sole permitted LLM provider).
 *
 * Model IDs are LOGICC identifiers; map to underlying providers internally
 * at LOGICC. For demanding legal reasoning tasks prefer gemini-2.5-pro or o3-mini.
 *
 * Fallback note: if LOGICC adds or removes a model, update this file and
 * restart the backend. No code changes in callers are needed.
 */

// ---------------------------------------------------------------------------
// Main-chat tier — user picks one per conversation (full legal reasoning)
// ---------------------------------------------------------------------------
export const LOGICC_MAIN_MODELS = [
    "gemini-2.5-pro",      // strongest reasoning; preferred for legal analysis
    "o3-mini",             // OpenAI reasoning model via LOGICC
    "gpt-4o",              // reliable fallback; good for tool-use heavy flows
    "gemini-2.5-flash",    // faster, still capable
] as const;

// ---------------------------------------------------------------------------
// Mid-tier — tabular review, batch extraction
// ---------------------------------------------------------------------------
export const LOGICC_MID_MODELS = [
    "gpt-4.1-mini",        // cost-efficient with tool calling
    "gemini-2.5-flash",
] as const;

// ---------------------------------------------------------------------------
// Low-tier — title generation, lightweight single-turn completions
// ---------------------------------------------------------------------------
export const LOGICC_LOW_MODELS = [
    "gemini-2.5-flash-lite",  // cheapest; sufficient for short completions
    "gpt-4.1-nano",
] as const;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
export const DEFAULT_MAIN_MODEL: string = "gemini-2.5-pro";
export const DEFAULT_TITLE_MODEL: string = "gemini-2.5-flash-lite";
export const DEFAULT_TABULAR_MODEL: string = "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// Provider type — single provider now
// ---------------------------------------------------------------------------
export type Provider = "logicc";

const ALL_MODELS = new Set<string>([
    ...LOGICC_MAIN_MODELS,
    ...LOGICC_MID_MODELS,
    ...LOGICC_LOW_MODELS,
]);

export function providerForModel(_model: string): Provider {
    return "logicc";
}

export function resolveModel(id: string | null | undefined, fallback: string): string {
    if (id && ALL_MODELS.has(id)) return id;
    return fallback;
}

export function allMainModels(): string[] {
    return [...LOGICC_MAIN_MODELS];
}

export function allMidModels(): string[] {
    return [...LOGICC_MID_MODELS];
}

export function allLowModels(): string[] {
    return [...LOGICC_LOW_MODELS];
}
