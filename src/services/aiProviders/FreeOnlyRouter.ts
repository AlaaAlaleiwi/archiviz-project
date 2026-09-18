import type {
  AIProviderDiscoveryAdapter,
  ModelCapability,
  ProviderHealth,
  ProviderPrivacyClass,
  QuotaState,
} from "./types";

export type AIOperation = "architecture-proposal" | "code-generation" | "repair" | "chat";
export type RoutingPrivacyPolicy = "local-required" | "local-preferred" | "cloud-approved" | "company-required";

export type FreeRoutingRequest = {
  operation: AIOperation;
  requiredContextSize?: number;
  requiredOutputSize?: number;
  streaming?: boolean;
  privacyPolicy: RoutingPrivacyPolicy;
  allowedProviderIds: string[];
  preferredProviderId?: string;
  localFirst?: boolean;
};

export type RouteRejectionCode =
  | "provider-not-allowed"
  | "privacy-policy"
  | "provider-unavailable"
  | "no-models"
  | "quota-exhausted"
  | "pricing-unverified"
  | "paid-model"
  | "incompatible-model";

export type RouteRejection = {
  providerId: string;
  modelId?: string;
  code: RouteRejectionCode;
  message: string;
};

export type FreeRouteSelection = {
  adapter: AIProviderDiscoveryAdapter;
  model: ModelCapability;
  health: ProviderHealth;
  quota: QuotaState | null;
  statusLabel: "Local / Private" | "Cloud / Free" | "Company Managed";
};

export type FreeOnlyRoutingErrorCode = "no-free-provider" | "cloud-approval-required";

export class FreeOnlyRoutingError extends Error {
  readonly code: FreeOnlyRoutingErrorCode;
  readonly rejections: RouteRejection[];

  constructor(code: FreeOnlyRoutingErrorCode, message: string, rejections: RouteRejection[]) {
    super(message);
    this.name = "FreeOnlyRoutingError";
    this.code = code;
    this.rejections = rejections;
  }
}

type RouterOptions = {
  maxPricingAgeMs?: number;
  now?: () => number;
};

const DEFAULT_MAX_PRICING_AGE_MS = 24 * 60 * 60 * 1000;

function statusLabel(privacyClass: ProviderPrivacyClass): FreeRouteSelection["statusLabel"] {
  if (privacyClass === "local") return "Local / Private";
  if (privacyClass === "company") return "Company Managed";
  return "Cloud / Free";
}

function allowedByPrivacy(adapter: AIProviderDiscoveryAdapter, policy: RoutingPrivacyPolicy): boolean {
  if (policy === "local-required" || policy === "local-preferred") return adapter.privacyClass === "local";
  if (policy === "company-required") return adapter.privacyClass === "company";
  return true;
}

function modelCompatibilityReason(model: ModelCapability, request: FreeRoutingRequest): string | null {
  if ((request.operation === "code-generation" || request.operation === "repair") && model.supportsCoding !== true) {
    return "Coding capability is not verified for this model.";
  }
  if (request.streaming && model.supportsStreaming !== true) {
    return "Streaming capability is not verified for this model.";
  }
  if ((request.requiredContextSize ?? 0) > 0 && (model.contextWindow ?? 0) < (request.requiredContextSize ?? 0)) {
    return "The verified context window is too small or unknown.";
  }
  if ((request.requiredOutputSize ?? 0) > 0 && (model.maxOutputTokens ?? 0) < (request.requiredOutputSize ?? 0)) {
    return "The verified output limit is too small or unknown.";
  }
  return null;
}

export class FreeOnlyRouter {
  private readonly adapters: AIProviderDiscoveryAdapter[];
  private readonly maxPricingAgeMs: number;
  private readonly now: () => number;

  constructor(adapters: AIProviderDiscoveryAdapter[], options: RouterOptions = {}) {
    this.adapters = adapters;
    this.maxPricingAgeMs = options.maxPricingAgeMs ?? DEFAULT_MAX_PRICING_AGE_MS;
    this.now = options.now ?? Date.now;
  }

  async select(request: FreeRoutingRequest, signal: AbortSignal): Promise<FreeRouteSelection> {
    const allowed = new Set(request.allowedProviderIds);
    const rejections: RouteRejection[] = [];
    const candidates = this.adapters.filter(adapter => {
      if (!allowed.has(adapter.id)) {
        rejections.push({ providerId: adapter.id, code: "provider-not-allowed", message: "Provider is not approved by the user or organization." });
        return false;
      }
      if (!allowedByPrivacy(adapter, request.privacyPolicy)) {
        rejections.push({ providerId: adapter.id, code: "privacy-policy", message: "Provider is outside the selected privacy boundary." });
        return false;
      }
      return true;
    });

    const ordered = [...candidates].sort((a, b) => this.rank(a, request) - this.rank(b, request));
    for (const adapter of ordered) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const selection = await this.evaluateProvider(adapter, request, signal, rejections);
      if (selection) return selection;
    }

    if (request.privacyPolicy === "local-preferred") {
      throw new FreeOnlyRoutingError(
        "cloud-approval-required",
        "No compatible local model is available. Explicitly approve a free cloud provider or start a local model.",
        rejections,
      );
    }
    throw new FreeOnlyRoutingError(
      "no-free-provider",
      "No approved, compatible provider with verified zero-cost pricing is available.",
      rejections,
    );
  }

  private rank(adapter: AIProviderDiscoveryAdapter, request: FreeRoutingRequest): number {
    if (request.localFirst && adapter.privacyClass === "local") return 0;
    if (adapter.id === request.preferredProviderId) return 1;
    return 2;
  }

  private async evaluateProvider(
    adapter: AIProviderDiscoveryAdapter,
    request: FreeRoutingRequest,
    signal: AbortSignal,
    rejections: RouteRejection[],
  ): Promise<FreeRouteSelection | null> {
    let health: ProviderHealth;
    let models: ModelCapability[];
    let quota: QuotaState | null;
    try {
      health = await adapter.healthCheck(signal);
      if (health.status !== "available") {
        rejections.push({
          providerId: adapter.id,
          code: health.status === "no-models" ? "no-models" : "provider-unavailable",
          message: health.message,
        });
        return null;
      }
      [models, quota] = await Promise.all([adapter.listModels(signal), adapter.getQuota(signal)]);
    } catch (error) {
      if (signal.aborted) throw error;
      rejections.push({
        providerId: adapter.id,
        code: "provider-unavailable",
        message: error instanceof Error ? error.message : "Provider metadata could not be loaded.",
      });
      return null;
    }

    if (quota?.remainingRequests === 0 || quota?.remainingTokens === 0) {
      rejections.push({ providerId: adapter.id, code: "quota-exhausted", message: "The free quota is exhausted." });
      return null;
    }

    for (const model of models) {
      const priceRejection = this.pricingRejection(model);
      if (priceRejection) {
        rejections.push({ providerId: adapter.id, modelId: model.id, ...priceRejection });
        continue;
      }
      const incompatibility = modelCompatibilityReason(model, request);
      if (incompatibility) {
        rejections.push({ providerId: adapter.id, modelId: model.id, code: "incompatible-model", message: incompatibility });
        continue;
      }
      return { adapter, model, health, quota, statusLabel: statusLabel(adapter.privacyClass) };
    }

    if (models.length === 0) {
      rejections.push({ providerId: adapter.id, code: "no-models", message: "Provider reported no models." });
    }
    return null;
  }

  private pricingRejection(model: ModelCapability): Pick<RouteRejection, "code" | "message"> | null {
    if (model.pricing.kind === "paid") {
      return { code: "paid-model", message: "Paid models are blocked in Free AI mode." };
    }
    if (model.pricing.kind !== "free") {
      return { code: "pricing-unverified", message: "The model price could not be verified as zero." };
    }
    const verifiedAt = Date.parse(model.pricing.verifiedAt);
    if (!Number.isFinite(verifiedAt) || this.now() - verifiedAt > this.maxPricingAgeMs) {
      return { code: "pricing-unverified", message: "The zero-cost price verification is stale or invalid." };
    }
    return null;
  }
}
