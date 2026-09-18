import { describe, expect, it, vi } from "vitest";
import { FreeOnlyRouter, FreeOnlyRoutingError } from "./FreeOnlyRouter";
import type {
  AIProviderDiscoveryAdapter,
  ModelCapability,
  ProviderHealth,
  ProviderPrivacyClass,
  QuotaState,
} from "./types";

const now = Date.parse("2026-09-18T10:00:00.000Z");

function freeModel(id: string, overrides: Partial<ModelCapability> = {}): ModelCapability {
  return {
    id,
    displayName: id,
    providerId: "local",
    recommended: true,
    supportsCoding: true,
    supportsStreaming: true,
    contextWindow: 32_000,
    maxOutputTokens: 8_000,
    pricing: { kind: "free", inputPrice: 0, outputPrice: 0, verifiedAt: "2026-09-18T09:00:00.000Z" },
    ...overrides,
  };
}

function adapter(
  id: string,
  privacyClass: ProviderPrivacyClass,
  models: ModelCapability[],
  options: { health?: ProviderHealth; quota?: QuotaState | null } = {},
): AIProviderDiscoveryAdapter {
  return {
    id,
    privacyClass,
    healthCheck: vi.fn().mockResolvedValue(options.health ?? {
      status: "available",
      message: "Ready",
      checkedAt: "2026-09-18T09:00:00.000Z",
    }),
    listModels: vi.fn().mockResolvedValue(models.map(model => ({ ...model, providerId: id }))),
    getQuota: vi.fn().mockResolvedValue(options.quota ?? null),
  };
}

const baseRequest = {
  operation: "code-generation" as const,
  requiredContextSize: 16_000,
  requiredOutputSize: 4_000,
  streaming: true,
  privacyPolicy: "cloud-approved" as const,
  allowedProviderIds: ["local", "cloud"],
};

describe("FreeOnlyRouter", () => {
  it("prefers a compatible local model when local-first routing is enabled", async () => {
    const local = adapter("local", "local", [freeModel("local-coder")]);
    const cloud = adapter("cloud", "cloud", [freeModel("cloud-coder")]);
    const router = new FreeOnlyRouter([cloud, local], { now: () => now });

    const selection = await router.select({ ...baseRequest, localFirst: true }, new AbortController().signal);

    expect(selection.adapter.id).toBe("local");
    expect(selection.statusLabel).toBe("Local / Private");
    expect(cloud.healthCheck).not.toHaveBeenCalled();
  });

  it("never selects paid or unknown-price models", async () => {
    const paid = freeModel("paid", { pricing: { kind: "paid", inputPrice: 1, outputPrice: 1, verifiedAt: "2026-09-18T09:00:00.000Z" } });
    const unknown = freeModel("unknown", { pricing: { kind: "unknown" } });
    const verified = freeModel("verified-free");
    const cloud = adapter("cloud", "cloud", [paid, unknown, verified]);
    const router = new FreeOnlyRouter([cloud], { now: () => now });

    const selection = await router.select({ ...baseRequest, allowedProviderIds: ["cloud"] }, new AbortController().signal);

    expect(selection.model.id).toBe("verified-free");
  });

  it("fails closed when zero-cost verification is stale", async () => {
    const stale = freeModel("stale", {
      pricing: { kind: "free", inputPrice: 0, outputPrice: 0, verifiedAt: "2026-09-16T09:00:00.000Z" },
    });
    const router = new FreeOnlyRouter([adapter("cloud", "cloud", [stale])], { now: () => now });

    await expect(router.select(
      { ...baseRequest, allowedProviderIds: ["cloud"] },
      new AbortController().signal,
    )).rejects.toMatchObject({
      code: "no-free-provider",
      rejections: [expect.objectContaining({ code: "pricing-unverified", modelId: "stale" })],
    });
  });

  it("requires explicit cloud approval instead of silently leaving local-preferred mode", async () => {
    const local = adapter("local", "local", [], {
      health: { status: "no-models", message: "Install a local model.", checkedAt: "2026-09-18T09:00:00.000Z" },
    });
    const cloud = adapter("cloud", "cloud", [freeModel("cloud-coder")]);
    const router = new FreeOnlyRouter([local, cloud], { now: () => now });

    await expect(router.select({
      ...baseRequest,
      privacyPolicy: "local-preferred",
    }, new AbortController().signal)).rejects.toMatchObject({ code: "cloud-approval-required" });
    expect(cloud.healthCheck).not.toHaveBeenCalled();
  });

  it("rejects exhausted quota and providers outside the approved list", async () => {
    const approved = adapter("cloud", "cloud", [freeModel("free")], { quota: { remainingRequests: 0 } });
    const unapproved = adapter("other-cloud", "cloud", [freeModel("other-free")]);
    const router = new FreeOnlyRouter([approved, unapproved], { now: () => now });

    try {
      await router.select({ ...baseRequest, allowedProviderIds: ["cloud"] }, new AbortController().signal);
      throw new Error("Expected routing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FreeOnlyRoutingError);
      expect(error).toMatchObject({
        code: "no-free-provider",
        rejections: expect.arrayContaining([
          expect.objectContaining({ providerId: "cloud", code: "quota-exhausted" }),
          expect.objectContaining({ providerId: "other-cloud", code: "provider-not-allowed" }),
        ]),
      });
    }
    expect(unapproved.healthCheck).not.toHaveBeenCalled();
  });

  it("enforces required context, output, coding, and streaming capabilities", async () => {
    const incompatible = freeModel("small-chat-model", {
      supportsCoding: false,
      supportsStreaming: false,
      contextWindow: 8_000,
      maxOutputTokens: 1_000,
    });
    const router = new FreeOnlyRouter([adapter("local", "local", [incompatible])], { now: () => now });

    await expect(router.select({
      ...baseRequest,
      privacyPolicy: "local-required",
      allowedProviderIds: ["local"],
    }, new AbortController().signal)).rejects.toMatchObject({
      code: "no-free-provider",
      rejections: [expect.objectContaining({ code: "incompatible-model" })],
    });
  });

  it("respects cancellation before contacting a provider", async () => {
    const local = adapter("local", "local", [freeModel("local-coder")]);
    const controller = new AbortController();
    controller.abort();
    const router = new FreeOnlyRouter([local], { now: () => now });

    await expect(router.select({ ...baseRequest, allowedProviderIds: ["local"] }, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(local.healthCheck).not.toHaveBeenCalled();
  });
});
