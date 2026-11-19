import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "./types";

/** Eroare cu mesaj în română și cod HTTP, returnată ca atare de /api/analyze. */
export class LlmError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface LlmResult {
  text: string;
  model: string;
  notice?: string;
}

const MAX_OUTPUT_TOKENS = 8000;
const TIMEOUT_MS = 55_000;

/** Modele Claude din familia 5.5: acceptă `output_config.effort`. */
const CLAUDE_EFFORT_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
/** Modele care acceptă fallback-ul automat pe server la un refuz al filtrelor de siguranță. */
const CLAUDE_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

function statusMessage(provider: string, status: number, detail: string): string {
  const d = detail ? ` Detalii: ${detail}` : "";
  switch (status) {
    case 400:
      return `${provider} a respins cererea (400).${d}`;
    case 401:
      return `Cheia API ${provider} este invalidă sau lipsește (401).`;
    case 402:
      return `Contul ${provider} nu are credit suficient (402).${d}`;
    case 403:
      return `Cheia API ${provider} nu are acces la acest model sau la această operațiune (403).${d}`;
    case 404:
      return `Modelul cerut nu există la ${provider} sau nu este disponibil pentru cheia ta (404).${d}`;
    case 408:
    case 504:
      return `${provider} nu a răspuns la timp. Încearcă din nou sau alege un model mai rapid.`;
    case 429:
      return `Limită de utilizare atinsă la ${provider} (429). Așteaptă puțin și încearcă din nou.${d}`;
    default:
      return status >= 500
        ? `${provider} are o problemă temporară (${status}). Încearcă din nou.${d}`
        : `Eroare ${status} de la ${provider}.${d}`;
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, providerLabel: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new LlmError(timeout ? 504 : 502, timeout ? statusMessage(providerLabel, 504, "") : `Nu m-am putut conecta la ${providerLabel}.`);
  }
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail: string = data?.error?.message ?? data?.message ?? (typeof data?.error === "string" ? data.error : "") ?? "";
    throw new LlmError(res.status, statusMessage(providerLabel, res.status, String(detail).slice(0, 300)));
  }
  if (data === null) throw new LlmError(502, `${providerLabel} a trimis un răspuns care nu este JSON.`);
  return data;
}

// ---------------------------------------------------------------- Anthropic Claude

async function callAnthropic(apiKey: string, model: string, system: string, user: string): Promise<LlmResult> {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];

  try {
    if (CLAUDE_FALLBACK_MODELS.has(model)) {
      // Dacă filtrele de siguranță refuză cererea, API-ul o reia automat pe un model compatibil.
      const response = await client.beta.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      const text = response.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join("\n")
        .trim();
      return finishClaude(text, response.stop_reason, response.model);
    }

    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages,
      ...(CLAUDE_EFFORT_MODELS.has(model) ? { output_config: { effort: "medium" as const } } : {}),
    });
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();
    return finishClaude(text, response.stop_reason, response.model);
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new LlmError(504, statusMessage("Anthropic", 504, ""));
    if (e instanceof Anthropic.APIConnectionError) throw new LlmError(502, "Nu m-am putut conecta la Anthropic.");
    if (e instanceof Anthropic.APIError) {
      const detail = (e.error as any)?.error?.message ?? e.message ?? "";
      throw new LlmError(e.status ?? 502, statusMessage("Anthropic", e.status ?? 502, String(detail).slice(0, 300)));
    }
    throw e;
  }
}

function finishClaude(text: string, stopReason: string | null, model: string): LlmResult {
  if (stopReason === "refusal") {
    throw new LlmError(422, "Claude a refuzat cererea (filtru de siguranță). Încearcă din nou sau alege alt model.");
  }
  if (!text) throw new LlmError(502, "Claude nu a returnat text.");
  return {
    text,
    model,
    notice: stopReason === "max_tokens" ? "Răspunsul a fost tăiat la limita de lungime." : undefined,
  };
}

// ---------------------------------------------------------------- OpenAI (Responses API)

async function callOpenAI(apiKey: string, model: string, system: string, user: string): Promise<LlmResult> {
  const data = await postJson(
    "https://api.openai.com/v1/responses",
    { authorization: `Bearer ${apiKey}` },
    { model, instructions: system, input: user, max_output_tokens: MAX_OUTPUT_TOKENS * 2, store: false },
    "OpenAI",
  );
  let text = typeof data.output_text === "string" ? data.output_text : "";
  if (!text && Array.isArray(data.output)) {
    text = data.output
      .filter((item: any) => item?.type === "message")
      .flatMap((item: any) => (Array.isArray(item.content) ? item.content : []))
      .filter((c: any) => c?.type === "output_text" && typeof c.text === "string")
      .map((c: any) => c.text)
      .join("\n");
  }
  text = text.trim();
  const refusal = Array.isArray(data.output)
    ? data.output
        .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
        .find((c: any) => c?.type === "refusal")
    : undefined;
  if (!text && refusal) throw new LlmError(422, `OpenAI a refuzat cererea: ${String(refusal.refusal ?? "").slice(0, 200)}`);
  if (!text) throw new LlmError(502, "OpenAI nu a returnat text.");
  return {
    text,
    model: data.model ?? model,
    notice: data.status === "incomplete" ? "Răspunsul OpenAI este incomplet (limită de lungime)." : undefined,
  };
}

// ---------------------------------------------------------------- Google Gemini

async function callGemini(apiKey: string, model: string, system: string, user: string): Promise<LlmResult> {
  const id = model.replace(/^models\//, "");
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`,
    { "x-goog-api-key": apiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
    },
    "Google Gemini",
  );
  if (data.promptFeedback?.blockReason) {
    throw new LlmError(422, `Gemini a blocat cererea (${data.promptFeedback.blockReason}).`);
  }
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p: any) => typeof p?.text === "string" && !p.thought)
    .map((p: any) => p.text)
    .join("")
    .trim();
  if (!text) {
    const reason = candidate?.finishReason ? ` (motiv: ${candidate.finishReason})` : "";
    throw new LlmError(502, `Gemini nu a returnat text${reason}.`);
  }
  return {
    text,
    model: data.modelVersion ?? id,
    notice: candidate?.finishReason === "MAX_TOKENS" ? "Răspunsul Gemini a fost tăiat la limita de lungime." : undefined,
  };
}

// ---------------------------------------------------------------- OpenRouter (API compatibil OpenAI)

async function callOpenRouter(apiKey: string, model: string, system: string, user: string, referer?: string): Promise<LlmResult> {
  const data = await postJson(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      authorization: `Bearer ${apiKey}`,
      "x-title": "PV Solar Dashboard",
      ...(referer ? { "http-referer": referer } : {}),
    },
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
    },
    "OpenRouter",
  );
  if (data.error) {
    throw new LlmError(502, `OpenRouter: ${String(data.error.message ?? data.error).slice(0, 300)}`);
  }
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  const text = (typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c?.text ?? "").join("") : "").trim();
  if (!text) throw new LlmError(502, "OpenRouter nu a returnat text.");
  return {
    text,
    model: data.model ?? model,
    notice: choice?.finish_reason === "length" ? "Răspunsul a fost tăiat la limita de lungime." : undefined,
  };
}

export async function callProvider(
  provider: Provider,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  referer?: string,
): Promise<LlmResult> {
  switch (provider) {
    case "anthropic":
      return callAnthropic(apiKey, model, system, user);
    case "openai":
      return callOpenAI(apiKey, model, system, user);
    case "gemini":
      return callGemini(apiKey, model, system, user);
    case "openrouter":
      return callOpenRouter(apiKey, model, system, user, referer);
  }
}
