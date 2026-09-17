import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("secureStore", () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    localStorage.clear();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("never falls back to localStorage outside Tauri", async () => {
    const { secretGet, secretSet } = await import("./secureStore");
    expect(await secretSet("api-key", "secret-value")).toBe(false);
    expect(await secretGet("api-key")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("uses native keychain commands inside Tauri", async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke: vi.fn() };
    invoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce("secret-value");
    const { secretGet, secretSet } = await import("./secureStore");
    expect(await secretSet("api-key", "secret-value")).toBe(true);
    expect(await secretGet("api-key")).toBe("secret-value");
    expect(invoke).toHaveBeenCalledWith("secret_set", { name: "api-key", value: "secret-value" });
    expect(localStorage.length).toBe(0);
  });
});
