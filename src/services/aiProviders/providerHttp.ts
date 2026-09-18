import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../utils/tauriRuntime";

export async function providerJsonRequest<T>(
  url: string,
  options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; signal: AbortSignal }
): Promise<T> {
  const method = options.method ?? "GET";
  if (isTauriRuntime()) {
    const raw = await invoke<string>("ai_fetch", {
      options: { url, method, headers: options.headers ?? {}, body: options.body ?? "" },
    });
    return JSON.parse(raw) as T;
  }

  const response = await fetch(url, {
    method,
    headers: options.headers,
    body: method === "GET" ? undefined : options.body,
    signal: options.signal,
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw}`);
  return JSON.parse(raw) as T;
}
