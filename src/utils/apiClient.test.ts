import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./apiClient";

globalThis.fetch = vi.fn(() =>
  Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
) as typeof globalThis.fetch;

describe("apiClient", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("sends credentials: include on all requests", async () => {
    await apiClient.get("/test");
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining("/test"), expect.objectContaining({
      credentials: "include",
    }));
  });

  it("uses default base URL", async () => {
    await apiClient.get("/health");
    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toContain("localhost:8080/api");
  });

  it("serializes JSON body on POST", async () => {
    await apiClient.post("/test", { name: "test" });
    const callBody = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body as string;
    expect(callBody).toBe('{"name":"test"}');
  });

  it("adds the cached access token to authenticated requests", async () => {
    sessionStorage.setItem("archiviz_access_token", "test-token");
    await apiClient.get("/auth/me");
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    }));
  });
});
