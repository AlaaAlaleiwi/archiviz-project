export type AIProvider = "openai" | "anthropic" | "local";

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class AIService {
  private settings: AISettings;

  constructor(settings: AISettings) {
    this.settings = settings;
  }

  private get isOpenAI()     { return this.settings.provider === "openai"; }
  private get isAnthropic()  { return this.settings.provider === "anthropic"; }

  private chatUrl(): string {
    if (this.isOpenAI)    return "https://api.openai.com/v1/chat/completions";
    if (this.isAnthropic) return "https://api.anthropic.com/v1/messages";
    return `${this.settings.baseUrl}/v1/chat/completions`;
  }

  private chatHeaders(): Record<string, string> {
    if (this.isAnthropic) {
      return {
        "Content-Type":         "application/json",
        "x-api-key":            this.settings.apiKey,
        "anthropic-version":    "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      };
    }
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.isOpenAI) h["Authorization"] = `Bearer ${this.settings.apiKey}`;
    return h;
  }

  private chatBody(prompt: string): string {
    const model = this.settings.model;
    if (this.isAnthropic) {
      return JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
    }
    return JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 4096,
    });
  }

  private parseResponse(data: any): string {
    if (this.isAnthropic) {
      return data?.content?.[0]?.text ?? "";
    }
    return data?.choices?.[0]?.message?.content ?? "";
  }

  /** Lightweight connectivity + auth check. Throws with a human-readable message on failure. */
  async healthCheck(): Promise<void> {
    // Anthropic: send a tiny real message — no public /models endpoint in browser
    if (this.isAnthropic) {
      if (!this.settings.apiKey?.trim()) throw new Error("API key is required.");
      let res: Response;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: this.chatHeaders(),
          body: JSON.stringify({
            model: this.settings.model || "claude-3-haiku-20240307",
            max_tokens: 10,
            messages: [{ role: "user", content: "hi" }],
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch (err: any) {
        if (err?.name === "TimeoutError") throw new Error("Connection timed out reaching Anthropic.");
        throw new Error("Cannot reach Anthropic API. Check your internet connection.");
      }
      if (res.status === 401) throw new Error("Invalid Anthropic API key.");
      if (res.status === 403) throw new Error("API key doesn't have access to this model.");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Anthropic returned ${res.status}.`);
      }
      return;
    }

    // OpenAI + local: hit /v1/models
    const url = this.isOpenAI
      ? "https://api.openai.com/v1/models"
      : `${this.settings.baseUrl}/v1/models`;
    const headers: Record<string, string> = {};
    if (this.isOpenAI) headers["Authorization"] = `Bearer ${this.settings.apiKey}`;

    let res: Response;
    try {
      res = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(6000) });
    } catch (err: any) {
      if (err?.name === "TimeoutError") throw new Error("Connection timed out. Is the server running?");
      throw new Error(
        this.isOpenAI
          ? "Cannot reach OpenAI. Check your internet connection."
          : `Cannot reach ${this.settings.baseUrl}. Is LM Studio / Ollama running with CORS enabled?`
      );
    }
    if (res.status === 401) throw new Error(this.isOpenAI ? "Invalid OpenAI API key." : "Server returned 401 — check your credentials.");
    if (!res.ok) throw new Error(`Server responded with ${res.status} ${res.statusText}.`);
  }

  async call(prompt: string, signal: AbortSignal): Promise<string> {
    const res = await fetch(this.chatUrl(), {
      method: "POST",
      headers: this.chatHeaders(),
      body: this.chatBody(prompt),
      signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? await res.text());
    }

    const data = await res.json();
    return this.parseResponse(data);
  }
}