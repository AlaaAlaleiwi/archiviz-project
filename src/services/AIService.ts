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

export class AIService {
  private settings: AISettings;

  constructor(settings: AISettings) {
    this.settings = settings;
  }

  // ── Chat with full in-memory history (works for all providers) ───────────

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

  // ── Provider-aware streaming ──────────────────────────────────────────────

  async callStream(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const res = await fetch(this.chatUrl(), {
      method: "POST",
      headers: this.headers(),
      body: this.buildBody(messages, true),
      signal,
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Request failed ${res.status}${errText ? ": " + errText : ""}`);
    }

    // Anthropic returns a single JSON response even for streaming requests here
    if (this.settings.provider === "anthropic") {
      const data = await res.json();
      const text = data?.content?.[0]?.text || "";
      if (text) onToken(text);
      return text;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n")) {
        const data = line.startsWith("data:") ? line.slice(5).trim() : "";
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const token = json?.choices?.[0]?.delta?.content || "";
          if (token) { fullText += token; onToken(token); }
        } catch {}
      }
    }

    return fullText;
  }

  // ── Single-shot call (used by code generation) ────────────────────────────

  async call(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const res = await fetch(this.chatUrl(), {
      method: "POST",
      headers: this.headers(),
      body: this.buildBody(messages, false),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Request failed ${res.status}${errText ? ": " + errText : ""}`);
    }

    if (this.settings.provider === "spring-boot") {
      const raw = await res.text();
      try { return this.extractContent(JSON.parse(raw)); } catch { return raw; }
    }

    return this.extractContent(await res.json());
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
      // Anthropic uses system as a top-level field, not inside messages
      const systemMsg = messages.find(m => m.role === "system");
      const rest = messages.filter(m => m.role !== "system");
      const body: Record<string, unknown> = {
        model: this.settings.model,
        max_tokens: maxTok ?? 4096,
        messages: rest,
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
