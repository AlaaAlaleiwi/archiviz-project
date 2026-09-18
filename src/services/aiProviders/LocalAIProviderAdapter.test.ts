import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalAIProviderAdapter } from "./LocalAIProviderAdapter";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body) } as Response;
}

describe("LocalAIProviderAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("discovers Ollama models and recommends coding models as free and local", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      models: [
        { name: "qwen2.5-coder:7b", size: 4_700_000_000 },
        { name: "llama3.2:3b", size: 2_000_000_000 },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new LocalAIProviderAdapter("http://localhost:11434/");
    const models = await adapter.listModels(new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/tags", expect.objectContaining({ method: "GET" }));
    expect(adapter.protocol).toBe("ollama");
    expect(models[0]).toMatchObject({
      id: "qwen2.5-coder:7b",
      providerId: "local",
      recommended: true,
      pricing: { kind: "free", inputPrice: 0, outputPrice: 0 },
    });
    expect(models[1].recommended).toBe(false);
  });

  it("falls back to an OpenAI-compatible model endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "codestral-local" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new LocalAIProviderAdapter("http://localhost:1234/v1");
    const models = await adapter.listModels(new AbortController().signal);

    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:1234/v1/models", expect.objectContaining({ method: "GET" }));
    expect(adapter.protocol).toBe("openai-compatible");
    expect(models).toHaveLength(1);
    expect(models[0].recommended).toBe(true);
  });

  it("reports an unavailable local runtime without crossing to cloud", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection refused")));
    const adapter = new LocalAIProviderAdapter("http://localhost:11434");

    const health = await adapter.healthCheck(new AbortController().signal);

    expect(health.status).toBe("unavailable");
    expect(health.message).toMatch(/ollama or an openai-compatible local server/i);
  });
});
