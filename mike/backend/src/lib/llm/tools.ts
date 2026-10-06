/**
 * Tool-schema utilities.
 *
 * LOGICC uses the native OpenAI tool format so no conversion is needed.
 * This file is kept for compatibility in case existing chatTools.ts references
 * these exports — they are now no-ops that return the input unchanged.
 */

import type { OpenAIToolSchema } from "./types";

export { OpenAIToolSchema };

/** Identity — LOGICC accepts OpenAI tool schemas natively. */
export function toLogiccTools(tools: OpenAIToolSchema[]): OpenAIToolSchema[] {
    return tools;
}

// ---------------------------------------------------------------------------
// Schema normalization (shared utility)
// ---------------------------------------------------------------------------

export function normalizeToolSchema(schema: unknown): Record<string, unknown> {
    if (!schema || typeof schema !== "object") {
        return { type: "object", properties: {} };
    }
    const s = schema as Record<string, unknown>;
    const out: Record<string, unknown> = { ...s };

    if (s.type === "object") {
        const props = (s.properties as Record<string, unknown>) ?? {};
        const normProps: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(props)) {
            normProps[k] = normalizeToolSchema(v);
        }
        out.properties = normProps;
    }
    if (s.type === "array" && s.items) {
        out.items = normalizeToolSchema(s.items);
    }
    return out;
}

// Legacy exports kept for backward compat with chatTools.ts
/** @deprecated LOGICC needs no Claude-format conversion */
export const toClaudeTools = toLogiccTools;
/** @deprecated LOGICC needs no Gemini-format conversion */
export const toGeminiTools = toLogiccTools;
