import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauriRuntime";

export function secureStorageAvailable(): boolean {
  return isTauriRuntime();
}

async function tryInvoke<T>(name: "secret_get" | "secret_set" | "secret_delete", args: Record<string, string>): Promise<T | null> {
  try {
    return await invoke<T>(name, args);
  } catch {
    return null;
  }
}

export async function secretGet(name: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const secureValue = await tryInvoke<string>("secret_get", { name });
  return secureValue || null;
}

export async function secretSet(name: string, value: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  return await tryInvoke("secret_set", { name, value }) !== null;
}

export async function secretDelete(name: string): Promise<void> {
  if (isTauriRuntime()) {
    await tryInvoke("secret_delete", { name });
  }
}
