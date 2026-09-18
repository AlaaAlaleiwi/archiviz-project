import { afterEach, describe, expect, it, vi } from "vitest";
import { autoConfigureFreeRoute } from "./autoConfigureFreeRoute";

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body) } as Response;
}

describe("autoConfigureFreeRoute", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("automatically selects the recommended Ollama coding model", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      models: [{ name: "llama3.2:3b" }, { name: "qwen2.5-coder:7b" }],
    })));

    const result = await autoConfigureFreeRoute(new AbortController().signal);

    expect(result.settings).toMatchObject({
      provider: "local",
      routingMode: "free-only",
      baseUrl: "http://localhost:11434",
      model: "qwen2.5-coder:7b",
    });
    expect(result.protocol).toBe("ollama");
  });

  it("falls back from Ollama to an available LM Studio endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, false, 404))
      .mockResolvedValueOnce(response({}, false, 404))
      .mockResolvedValueOnce(response({}, false, 404))
      .mockResolvedValueOnce(response({ data: [{ id: "local-coder" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await autoConfigureFreeRoute(new AbortController().signal);

    expect(result.settings.baseUrl).toBe("http://localhost:1234");
    expect(result.settings.model).toBe("local-coder");
    expect(result.protocol).toBe("openai-compatible");
  });

  it("returns an actionable error when no free local runtime is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection refused")));

    await expect(autoConfigureFreeRoute(new AbortController().signal))
      .rejects.toThrow(/start ollama or lm studio/i);
  });
});
