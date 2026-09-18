export type ProviderPrivacyClass = "local" | "cloud" | "company";

export type PricingState =
  | { kind: "free"; inputPrice: 0; outputPrice: 0; verifiedAt: string }
  | { kind: "paid"; inputPrice: number; outputPrice: number; verifiedAt: string }
  | { kind: "unknown"; verifiedAt?: string };

export type ModelCapability = {
  id: string;
  displayName: string;
  providerId: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  sizeBytes?: number;
  supportsCoding?: boolean;
  supportsStreaming?: boolean;
  recommended: boolean;
  pricing: PricingState;
};

export type ProviderHealth = {
  status: "available" | "unavailable" | "no-models";
  message: string;
  checkedAt: string;
};

export type QuotaState = {
  remainingRequests?: number;
  remainingTokens?: number;
  resetsAt?: string;
};

export interface AIProviderDiscoveryAdapter {
  id: string;
  privacyClass: ProviderPrivacyClass;
  healthCheck(signal: AbortSignal): Promise<ProviderHealth>;
  listModels(signal: AbortSignal): Promise<ModelCapability[]>;
  getQuota(signal: AbortSignal): Promise<QuotaState | null>;
}
