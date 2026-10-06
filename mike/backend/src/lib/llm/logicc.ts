/**
 * LOGICC LLM provider — the only permitted LLM/embedding egress.
 *
 * Uses the OpenAI-compatible Chat Completions API:
 *   POST https://api.logicc.io/v1/chat/completions
 *   POST https://api.logicc.io/v1/embeddings
 *
 * The LOGICC_API_KEY env var is the single secret. No user-supplied
 * provider keys are forwarded here; the server key is always used.
 *
 * Known LOGICC limitations (verified 2026-05):
 *  - Uses /v1/chat/completions (NOT the OpenAI Responses API /v1/responses)
 *  - SSE streaming: supported
 *  - Function/tool calling: supported on gpt-4o, gpt-4.1-*, gemini-2.5-* variants
 *  - JSON mode: supported via response_format: { type: "json_object" }
 *  - Reasoning/thinking: gemini-2.5-pro emits reasoning_content in delta
 *  - Vision/PDF: not verified — use text extraction on the server before sending
 *  - Embeddings: gemini-embedding-001 via /v1/embeddings
 */

import { assertLogiccHost, logEgressCall } from "./egress-guard";
import type {
    LlmMessage,
    NormalizedToolCall,
    NormalizedToolResult,
    OpenAIToolSchema,
    StreamChatParams,
    StreamChatResult,
} from "./types";

const BASE_URL = "https://api.logicc.io/v1";
const CHAT_URL = `${BASE_URL}/chat/completions`;
const EMBEDDINGS_URL = `${BASE_URL}/embeddings`;
const MAX_TOKENS = 16384;

assertLogiccHost(CHAT_URL);       // guard evaluated at module load
assertLogiccHost(EMBEDDINGS_URL);

function serverApiKey(): string {
    const key = process.env.LOGICC_API_KEY?.trim() ?? "";
    if (!key) {
        throw new Error(
            "LOGICC_API_KEY is not configured. Set it in the environment — never hard-code it.",
        );
    }
    return key;
}

// ---------------------------------------------------------------------------
// Internal message types (OpenAI chat completions format)
// ---------------------------------------------------------------------------

type AssistantToolCall = {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
};

type ApiMessage =
    | { role: "system"; content: string }
    | { role: "user"; content: string }
    | {
          role: "assistant";
          content: string | null;
          tool_calls?: AssistantToolCall[];
      }
    | { role: "tool"; tool_call_id: string; content: string };

function buildMessages(systemPrompt: string, messages: LlmMessage[]): ApiMessage[] {
    const result: ApiMessage[] = [{ role: "system", content: systemPrompt }];
    for (const m of messages) {
        result.push({ role: m.role, content: m.content });
    }
    return result;
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

type StreamChunk = {
    choices?: {
        delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: {
                index: number;
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
            }[];
        };
        finish_reason?: string | null;
    }[];
};

function parseSseBuffer(buffer: string): { events: StreamChunk[]; rest: string } {
    const events: StreamChunk[] = [];
    const chunks = buffer.split(/\n\n/);
    const rest = chunks.pop() ?? "";

    for (const chunk of chunks) {
        const dataLines = chunk
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim());

        for (const data of dataLines) {
            if (!data || data === "[DONE]") continue;
            try {
                events.push(JSON.parse(data) as StreamChunk);
            } catch {
                // Partial chunk — will appear in the next read.
            }
        }
    }

    return { events, rest };
}

// ---------------------------------------------------------------------------
// Streaming chat with tool-use loop
// ---------------------------------------------------------------------------

export async function streamLogicc(
    params: StreamChatParams,
): Promise<StreamChatResult> {
    const { model, systemPrompt, tools = [], callbacks = {}, runTools, enableThinking } =
        params;
    const maxIter = params.maxIterations ?? 10;
    const key = serverApiKey();
    let messages = buildMessages(systemPrompt, params.messages);
    let fullText = "";

    for (let iter = 0; iter < maxIter; iter++) {
        const body: Record<string, unknown> = {
            model,
            messages,
            stream: true,
            max_tokens: MAX_TOKENS,
        };
        if (tools.length > 0) {
            body.tools = tools as OpenAIToolSchema[];
            body.tool_choice = "auto";
        }

        logEgressCall(model, messages.length);

        const response = await fetch(CHAT_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`LOGICC request failed (${response.status}): ${text || response.statusText}`);
        }
        if (!response.body) throw new Error("LOGICC response had no body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        // Accumulator for streaming tool-call arguments
        const tcByIndex = new Map<
            number,
            { id: string; name: string; args: string }
        >();
        const assistantTextChunks: string[] = [];
        let sawReasoning = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buf += decoder.decode(value, { stream: true });
            const { events, rest } = parseSseBuffer(buf);
            buf = rest;

            for (const ev of events) {
                const choice = ev.choices?.[0];
                if (!choice?.delta) continue;
                const delta = choice.delta;

                // Reasoning (gemini-2.5-pro style)
                if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
                    sawReasoning = true;
                    callbacks.onReasoningDelta?.(delta.reasoning_content);
                }

                // Text content
                if (typeof delta.content === "string" && delta.content) {
                    assistantTextChunks.push(delta.content);
                    if (!tools.length) {
                        fullText += delta.content;
                        callbacks.onContentDelta?.(delta.content);
                    }
                }

                // Tool calls (streamed incrementally)
                if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (!tcByIndex.has(tc.index)) {
                            const entry = {
                                id: tc.id ?? `tc_${tc.index}`,
                                name: tc.function?.name ?? "",
                                args: "",
                            };
                            tcByIndex.set(tc.index, entry);
                            callbacks.onToolCallStart?.({
                                id: entry.id,
                                name: entry.name,
                                input: {},
                            });
                        }
                        const entry = tcByIndex.get(tc.index)!;
                        if (tc.id) entry.id = tc.id;
                        if (tc.function?.name) entry.name = tc.function.name;
                        if (tc.function?.arguments) entry.args += tc.function.arguments;
                    }
                }
            }
        }

        if (sawReasoning) callbacks.onReasoningBlockEnd?.();

        // No tool calls or no runner → done
        if (tcByIndex.size === 0 || !runTools) {
            const text = assistantTextChunks.join("");
            if (text && tools.length) {
                fullText += text;
                callbacks.onContentDelta?.(text);
            }
            break;
        }

        // Build normalized calls
        const normalizedCalls: NormalizedToolCall[] = [];
        const assistantToolCalls: AssistantToolCall[] = [];

        for (const [, tc] of tcByIndex) {
            let input: Record<string, unknown> = {};
            try {
                const parsed = JSON.parse(tc.args || "{}");
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    input = parsed as Record<string, unknown>;
                }
            } catch {
                input = {};
            }
            normalizedCalls.push({ id: tc.id, name: tc.name, input });
            assistantToolCalls.push({
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: tc.args || "{}" },
            });
        }

        // Append assistant message with tool calls
        messages.push({
            role: "assistant",
            content: assistantTextChunks.join("") || null,
            tool_calls: assistantToolCalls,
        });

        // Run tools, append results
        const results: NormalizedToolResult[] = await runTools(normalizedCalls);
        for (const result of results) {
            messages.push({
                role: "tool",
                tool_call_id: result.tool_use_id,
                content: result.content,
            });
        }
    }

    return { fullText };
}

// ---------------------------------------------------------------------------
// Non-streaming single completion (title generation, lightweight tasks)
// ---------------------------------------------------------------------------

export async function completeLogiccText(params: {
    model: string;
    systemPrompt?: string;
    user: string;
    maxTokens?: number;
    jsonMode?: boolean;
}): Promise<string> {
    // NOTE: LOGICC returns empty content for Gemini models with stream:false.
    // We always stream and collect the full text — works for all models.
    const key = serverApiKey();
    const messages: ApiMessage[] = [];
    if (params.systemPrompt) {
        messages.push({ role: "system", content: params.systemPrompt });
    }
    messages.push({ role: "user", content: params.user });

    logEgressCall(params.model, messages.length);

    const body: Record<string, unknown> = {
        model: params.model,
        messages,
        max_tokens: params.maxTokens ?? 512,
        stream: true,
    };
    if (params.jsonMode) {
        body.response_format = { type: "json_object" };
    }

    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`LOGICC completion failed (${response.status}): ${text}`);
    }
    if (!response.body) throw new Error("LOGICC response had no body");

    // Collect streamed text chunks
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let fullText = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseBuffer(buf);
        buf = rest;
        for (const ev of events) {
            const content = ev.choices?.[0]?.delta?.content;
            if (typeof content === "string") fullText += content;
        }
    }

    return fullText;
}

// ---------------------------------------------------------------------------
// Embeddings (RAG / semantic search)
// ---------------------------------------------------------------------------

export async function embedLogicc(texts: string | string[]): Promise<number[][]> {
    const key = serverApiKey();
    const model = process.env.LOGICC_EMBEDDING_MODEL ?? "gemini-embedding-001";
    const input = Array.isArray(texts) ? texts : [texts];

    logEgressCall(model, input.length);

    const response = await fetch(EMBEDDINGS_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input }),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`LOGICC embedding failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as {
        data?: { embedding: number[]; index: number }[];
    };

    return (json.data ?? [])
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
}

// ---------------------------------------------------------------------------
// Vision completion — sends text + base64 images to LOGICC (gpt-4o)
// Falls back to text-only if the model doesn't support vision.
// ---------------------------------------------------------------------------

const VISION_MODEL = "gpt-4o";

export async function completeLogiccVision(params: {
    systemPrompt?: string;
    user: string;
    imageBase64s: string[];   // base64-encoded PNG strings (no data: prefix)
    maxTokens?: number;
    jsonMode?: boolean;
}): Promise<string> {
    const key = serverApiKey();

    const imageContent = params.imageBase64s.map((b64) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/png;base64,${b64}`, detail: "high" },
    }));

    const messages: ApiMessage[] = [];
    if (params.systemPrompt) {
        messages.push({ role: "system", content: params.systemPrompt });
    }
    messages.push({
        role: "user",
        content: [
            { type: "text", text: params.user },
            ...imageContent,
        ] as unknown as string,
    });

    logEgressCall(VISION_MODEL, messages.length);

    const body: Record<string, unknown> = {
        model: VISION_MODEL,
        messages,
        max_tokens: params.maxTokens ?? 4000,
        stream: true,
    };
    if (params.jsonMode) body.response_format = { type: "json_object" };

    const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`LOGICC vision failed (${response.status}): ${text}`);
    }
    if (!response.body) throw new Error("LOGICC vision response had no body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let fullText = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseBuffer(buf);
        buf = rest;
        for (const ev of events) {
            const content = ev.choices?.[0]?.delta?.content;
            if (typeof content === "string") fullText += content;
        }
    }
    return fullText;
}
