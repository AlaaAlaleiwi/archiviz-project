// services/AIService.ts
export class AIService {
  private settings: any;

  constructor(settings: any) {
    this.settings = settings;
  }

  private buildFetchOptions(prompt: string, stream: boolean, signal: AbortSignal) {
    const isOpenAI = this.settings?.provider === "openai";

    const url = isOpenAI
      ? "https://api.openai.com/v1/chat/completions"
      : `${this.settings?.baseUrl}/v1/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": stream ? "text/event-stream" : "application/json",
    };

    if (isOpenAI) {
      headers["Authorization"] = `Bearer ${this.settings?.apiKey}`;
    }

    return {
      url,
      headers,
      body: JSON.stringify({
        model: this.settings?.model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 4096,
        stream,
      }),
      signal,
    };
  }

  async call(prompt: string, signal: AbortSignal): Promise<string> {
    const { url, headers, body } = this.buildFetchOptions(prompt, false, signal);

    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal,
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }
}