/**
 * LOGICC ist der einzige LLM-Provider (kein Bring-your-own-key mehr).
 * Diese Funktionen bleiben aus Kompatibilitätsgründen für bestehende
 * Aufrufer bestehen, prüfen aber nichts mehr — jedes in MODELS gelistete
 * Modell läuft über den zentral konfigurierten LOGICC_API_KEY.
 */
import { MODELS, type ModelOption } from "../components/assistant/ModelToggle";
import type { ApiKeyState } from "@/app/lib/mikeApi";

export type ModelProvider = "gemini" | "openai";

export function getModelProvider(modelId: string): ModelProvider | null {
    const model = MODELS.find((m) => m.id === modelId);
    if (!model) return null;
    return modelGroupToProvider(model.group);
}

export function isModelAvailable(
    modelId: string,
    _apiKeys: ApiKeyState,
): boolean {
    return MODELS.some((m) => m.id === modelId);
}

export function isProviderAvailable(
    _provider: ModelProvider,
    _apiKeys: ApiKeyState,
): boolean {
    return true;
}

export function providerLabel(provider: ModelProvider): string {
    if (provider === "openai") return "OpenAI";
    return "Google (Gemini)";
}

export function modelGroupToProvider(
    group: ModelOption["group"],
): ModelProvider {
    if (group === "OpenAI") return "openai";
    return "gemini";
}
