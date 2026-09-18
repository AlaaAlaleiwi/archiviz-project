import { providerJsonRequest } from "./providerHttp";
import type { AIProviderDiscoveryAdapter, ModelCapability, ProviderHealth, QuotaState } from "./types";

type LocalProtocol = "ollama" | "openai-compatible";

type OllamaModel = {
  name?: string;
  model?: string;
  size?: number;
  details?: { parameter_size?: string };
};

const codingModelPattern = /(coder|code|qwen|deepseek|starcoder|codellama|devstral|codestral)/i;

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function freePricing(verifiedAt: string) {
  return { kind: "free" as const, inputPrice: 0 as const, outputPrice: 0 as const, verifiedAt };
}

export class LocalAIProviderAdapter implements AIProviderDiscoveryAdapter {
  readonly id = "local";
  readonly privacyClass = "local" as const;
  private detectedProtocol: LocalProtocol | null = null;
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  get protocol(): LocalProtocol | null {
    return this.detectedProtocol;
  }

  async healthCheck(signal: AbortSignal): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const models = await this.listModels(signal);
      if (models.length === 0) {
        return { status: "no-models", message: "The local runtime is available, but no models are installed or loaded.", checkedAt };
      }
      return { status: "available", message: `${models.length} local model${models.length === 1 ? "" : "s"} available.`, checkedAt };
    } catch (error) {
      return {
        status: "unavailable",
        message: error instanceof Error ? error.message : "The local AI runtime is unavailable.",
        checkedAt,
      };
    }
  }

  async listModels(signal: AbortSignal): Promise<ModelCapability[]> {
    const baseUrl = normalizeBaseUrl(this.baseUrl);
    if (!baseUrl) throw new Error("Enter a local AI server URL.");
    const verifiedAt = new Date().toISOString();

    try {
      const ollamaRoot = baseUrl.replace(/\/v1$/, "");
      const result = await providerJsonRequest<{ models?: OllamaModel[] }>(`${ollamaRoot}/api/tags`, { signal });
      this.detectedProtocol = "ollama";
      return (result.models ?? []).flatMap(model => {
        const id = model.name ?? model.model;
        if (!id) return [];
        return [{
          id,
          displayName: id,
          providerId: this.id,
          sizeBytes: typeof model.size === "number" ? model.size : undefined,
          recommended: codingModelPattern.test(id),
          supportsCoding: codingModelPattern.test(id),
          supportsStreaming: true,
          pricing: freePricing(verifiedAt),
        }];
      });
    } catch (ollamaError) {
      if (signal.aborted) throw ollamaError;
    }

    const openAIBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    try {
      const result = await providerJsonRequest<{ data?: Array<{ id?: string }> }>(`${openAIBase}/models`, { signal });
      this.detectedProtocol = "openai-compatible";
      return (result.data ?? []).flatMap(model => model.id ? [{
        id: model.id,
        displayName: model.id,
        providerId: this.id,
        recommended: codingModelPattern.test(model.id),
        supportsCoding: codingModelPattern.test(model.id),
        supportsStreaming: true,
        pricing: freePricing(verifiedAt),
      }] : []);
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error("Could not reach Ollama or an OpenAI-compatible local server at this URL.");
    }
  }

  async getQuota(_signal: AbortSignal): Promise<QuotaState | null> {
    return null;
  }
}
