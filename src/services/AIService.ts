import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CHAT_SYSTEM_PROMPT } from "../utils/systemPrompts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AIProvider = "openai" | "anthropic" | "local" | "spring-boot";

export interface AISettings {
  provider: AIProvider;
  apiKey?: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  stream?: boolean;
}

interface AiFetchOptions {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export class AIService {
  private settings: AISettings;

  constructor(settings: AISettings) {
    this.settings = settings;
  }

  // ── Chat with full in-memory history ─────────────────────────────────────

  async chatStream(
    history: ChatMessage[],
    message: string,
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const systemPrompt = this.settings.systemPrompt || CHAT_SYSTEM_PROMPT;
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];
    return this.callStream(messages, onToken, signal);
  }

  // ── Streaming via Tauri native HTTP (no CORS) ─────────────────────────────

  async callStream(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const requestId = crypto.randomUUID();
    const opts: AiFetchOptions = {
      url: this.chatUrl(),
      headers: this.headers(),
      body: this.buildBody(messages, true),
    };

    return new Promise<string>((resolve, reject) => {
      let fullText = "";
      const unlisteners: Array<() => void> = [];

      const cleanup = () => unlisteners.forEach(fn => fn());

      signal?.addEventListener("abort", () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      });

      Promise.all([
        listen<{ requestId: string; data: string }>("ai-token", event => {
          if (event.payload.requestId !== requestId) return;
          try {
            const json = JSON.parse(event.payload.data);
            const token = this.extractStreamToken(json);
            if (token) { fullText += token; onToken(token); }
          } catch {}
        }),
        listen<{ requestId: string }>("ai-done", event => {
          if (event.payload.requestId !== requestId) return;
          cleanup();
          resolve(fullText);
        }),
        listen<{ requestId: string; error: string }>("ai-error", event => {
          if (event.payload.requestId !== requestId) return;
          cleanup();
          reject(new Error(event.payload.error));
        }),
      ]).then(([u1, u2, u3]) => {
        unlisteners.push(u1, u2, u3);
        invoke("ai_stream", { options: opts, requestId }).catch(err => {
          cleanup();
          reject(new Error(String(err)));
        });
      });
    });
  }

  // ── Single-shot call (health check, code generation) ─────────────────────

  async call(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const opts: AiFetchOptions = {
      url: this.chatUrl(),
      headers: this.headers(),
      body: this.buildBody(messages, false),
    };

    const abortPromise = signal
      ? new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          )
        )
      : null;

    const fetchPromise = invoke<string>("ai_fetch", { options: opts }).then(raw => {
      if (this.settings.provider === "spring-boot") {
        try { return this.extractContent(JSON.parse(raw)); } catch { return raw; }
      }
      try { return this.extractContent(JSON.parse(raw)); } catch { return raw; }
    });

    return abortPromise ? Promise.race([fetchPromise, abortPromise]) : fetchPromise;
  }

  async healthCheck(): Promise<void> {
    const result = await this.call(
      [{ role: "user", content: "hi" }],
      AbortSignal.timeout(10000)
    );
    if (!result) throw new Error("Empty response from server");
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private chatUrl(): string {
    if (this.settings.provider === "anthropic") return "https://api.anthropic.com/v1/messages";
    if (this.settings.provider === "spring-boot") return `${this.settings.baseUrl}/api/ai/chat`;
    return `${this.settings.baseUrl}/v1/chat/completions`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.settings.provider === "openai")
      h["Authorization"] = `Bearer ${this.settings.apiKey}`;
    if (this.settings.provider === "anthropic") {
      h["x-api-key"] = this.settings.apiKey!;
      h["anthropic-version"] = "2023-06-01";
    }
    return h;
  }

  private buildBody(messages: ChatMessage[], stream: boolean): string {
    const temp = this.settings.temperature ?? 0.2;
    const maxTok = this.settings.maxTokens;

    if (this.settings.provider === "anthropic") {
      const systemMsg = messages.find(m => m.role === "system");
      const rest = messages.filter(m => m.role !== "system");
      const body: Record<string, unknown> = {
        model: this.settings.model,
        max_tokens: maxTok ?? 4096,
        messages: rest,
        stream,
      };
      if (systemMsg) body["system"] = systemMsg.content;
      return JSON.stringify(body);
    }

    if (this.settings.provider === "spring-boot") {
      const userMsg = [...messages].reverse().find(m => m.role === "user");
      return JSON.stringify({
        message: userMsg?.content ?? "",
        model: this.settings.model || undefined,
        temperature: temp,
        maxTokens: maxTok,
      });
    }

    const body: Record<string, unknown> = {
      model: this.settings.model,
      messages,
      temperature: temp,
      stream,
    };
    if (maxTok) body["max_tokens"] = maxTok;
    return JSON.stringify(body);
  }

  private extractStreamToken(json: unknown): string {
    if (typeof json !== "object" || json === null) return "";
    const j = json as Record<string, unknown>;
    if (this.settings.provider === "anthropic") {
      if (j.type === "content_block_delta" && (j.delta as any)?.type === "text_delta")
        return (j.delta as any).text ?? "";
      return "";
    }
    return (j?.choices as any)?.[0]?.delta?.content ?? "";
  }

  private extractContent(data: unknown): string {
    if (typeof data !== "object" || data === null) return "";
    const d = data as Record<string, unknown>;
    return (
      (d?.choices as any)?.[0]?.message?.content ||
      (d?.choices as any)?.[0]?.delta?.content ||
      (d?.content as any)?.[0]?.text ||
      ""
    );
  }
}
