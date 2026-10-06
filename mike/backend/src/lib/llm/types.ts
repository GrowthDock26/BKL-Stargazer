/**
 * Shared types for the LLM adapter.
 *
 * Callers speak OpenAI-style tools + { role, content } messages.
 * The LOGICC provider translates internally. All LLM egress goes through
 * logicc.ts — no other provider files are loaded.
 */

export type OpenAIToolSchema = {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
};

export type LlmMessage = {
    role: "user" | "assistant";
    content: string;
};

export type NormalizedToolCall = {
    id: string;
    name: string;
    input: Record<string, unknown>;
};

export type NormalizedToolResult = {
    tool_use_id: string;
    content: string;
};

export type StreamCallbacks = {
    onReasoningDelta?: (text: string) => void;
    onReasoningBlockEnd?: () => void;
    onContentDelta?: (text: string) => void;
    onToolCallStart?: (call: NormalizedToolCall) => void;
};

/** Kept for API compatibility; only `logicc` is used at runtime. */
export type UserApiKeys = {
    logicc?: string | null;
    /** @deprecated */
    claude?: string | null;
    /** @deprecated */
    gemini?: string | null;
    /** @deprecated */
    openai?: string | null;
};

export type StreamChatParams = {
    model: string;
    systemPrompt: string;
    messages: LlmMessage[];
    tools?: OpenAIToolSchema[];
    maxIterations?: number;
    callbacks?: StreamCallbacks;
    runTools?: (calls: NormalizedToolCall[]) => Promise<NormalizedToolResult[]>;
    apiKeys?: UserApiKeys;
    /**
     * Enable provider-side reasoning/thinking (gemini-2.5-pro emits
     * reasoning_content). Off by default — enable only for interactive
     * legal analysis where the user benefits from seeing the thought process.
     */
    enableThinking?: boolean;
};

export type StreamChatResult = {
    fullText: string;
};
