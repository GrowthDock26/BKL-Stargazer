/**
 * LLM adapter — LOGICC is the only permitted provider.
 *
 * All outbound LLM calls are routed through logicc.ts.
 * The old claude.ts, gemini.ts, and openai.ts files are no longer imported
 * and must not be reinstated without a security review.
 */

import { streamLogicc, completeLogiccText } from "./logicc";
import type { StreamChatParams, StreamChatResult } from "./types";

export * from "./types";
export * from "./models";
export * from "./egress-guard";

export async function streamChatWithTools(
    params: StreamChatParams,
): Promise<StreamChatResult> {
    return streamLogicc(params);
}

export async function completeText(params: {
    model: string;
    systemPrompt?: string;
    user: string;
    maxTokens?: number;
    jsonMode?: boolean;
    apiKeys?: Record<string, unknown>;
}): Promise<string> {
    return completeLogiccText(params);
}

export { embedLogicc as embedText } from "./logicc";
export { completeLogiccVision as completeVision } from "./logicc";
