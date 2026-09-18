import type { AISettings } from "../AIService";
import { LocalAIProviderAdapter } from "./LocalAIProviderAdapter";
import type { ModelCapability } from "./types";

const DEFAULT_LOCAL_ENDPOINTS = ["http://localhost:11434", "http://localhost:1234"];

export type AutoConfiguredFreeRoute = {
  settings: AISettings;
  models: ModelCapability[];
  protocol: "ollama" | "openai-compatible";
};

export async function autoConfigureFreeRoute(
  signal: AbortSignal,
  preferredBaseUrl?: string,
): Promise<AutoConfiguredFreeRoute> {
  const endpoints = [preferredBaseUrl, ...DEFAULT_LOCAL_ENDPOINTS]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(value => value.replace(/\/+$/, ""))
    .filter((value, index, values) => values.indexOf(value) === index);

  for (const baseUrl of endpoints) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const adapter = new LocalAIProviderAdapter(baseUrl);
    try {
      const models = await adapter.listModels(signal);
      if (models.length === 0 || !adapter.protocol) continue;
      const selected = models.find(model => model.recommended) ?? models[0];
      return {
        settings: {
          provider: "local",
          routingMode: "free-only",
          apiKey: "",
          baseUrl,
          model: selected.id,
        },
        models,
        protocol: adapter.protocol,
      };
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }

  throw new Error("Free Route could not find a running local AI service. Start Ollama or LM Studio, then retry.");
}
