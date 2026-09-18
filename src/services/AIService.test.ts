import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, listen } = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { AIService } from "./AIService";

describe("AIService browser transport", () => {
  beforeEach(() => {
    invoke.mockReset();
    listen.mockReset();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses browser fetch instead of the Tauri bridge outside the desktop app", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: "Hello" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new AIService({
      provider: "openai",
      apiKey: "test-key",
      baseUrl: "https://example.test",
      model: "test-model",
    });

    await expect(service.call([{ role: "user", content: "Hi" }])).resolves.toBe("Hello");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks unverified cloud providers when Free Route is active", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new AIService({
      provider: "openai",
      routingMode: "free-only",
      apiKey: "test-key",
      baseUrl: "https://example.test",
      model: "possibly-paid-model",
    });

    await expect(service.call([{ role: "user", content: "Hi" }]))
      .rejects.toThrow(/free route blocked this request/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
