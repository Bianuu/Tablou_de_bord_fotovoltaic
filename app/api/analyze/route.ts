import { NextResponse } from "next/server";
import { callProvider, LlmError } from "@/lib/llm";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompt";
import { ENV_VARS, isClaudeModel, PROVIDER_LABELS } from "@/lib/models";
import type { AnalyzeRequest, AnalyzeResponse, Provider } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Planul Vercel Hobby permite până la 60 s pentru o funcție fără Fluid compute.
export const maxDuration = 60;

const PROVIDERS: Provider[] = ["anthropic", "openai", "gemini", "openrouter"];
const MODEL_RE = /^[A-Za-z0-9._:\/@-]{1,120}$/;
const MAX_SERIES_CHARS = 20_000;

function envKey(provider: Provider): string | undefined {
  const v = process.env[ENV_VARS[provider]];
  return v && v.trim() ? v.trim() : undefined;
}

function accessCode(): string | undefined {
  const v = process.env.SERVER_KEYS_ACCESS_CODE;
  return v && v.trim() ? v.trim() : undefined;
}

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

/** Spune interfeței ce chei sunt configurate pe server (doar da/nu, niciodată valoarea). */
export async function GET() {
  const configured = Object.fromEntries(PROVIDERS.map((p) => [p, Boolean(envKey(p))])) as Record<Provider, boolean>;
  return NextResponse.json(
    { configured, accessCodeRequired: Boolean(accessCode()) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  let body: AnalyzeRequest & { accessCode?: string };
  try {
    body = await req.json();
  } catch {
    return error(400, "Cererea nu este JSON valid.");
  }

  const { target, provider, payload } = body ?? ({} as AnalyzeRequest);
  const model = String(body?.model ?? "").trim();

  if (target !== "claude" && target !== "other") return error(400, "Câmpul „target” trebuie să fie „claude” sau „other”.");
  if (!PROVIDERS.includes(provider)) return error(400, "Furnizor necunoscut.");
  if (!MODEL_RE.test(model)) return error(400, "Numele modelului este gol sau conține caractere nepermise.");

  // Cele două butoane sunt separate strict: primul doar Anthropic, al doilea doar alternative la Claude.
  if (target === "claude" && provider !== "anthropic") {
    return error(400, "Butonul „Analizează cu Claude” folosește exclusiv API-ul Anthropic.");
  }
  if (target === "other") {
    if (provider === "anthropic") return error(400, "Butonul „Selectează alt LLM” nu include Claude. Folosește butonul „Analizează cu Claude”.");
    if (isClaudeModel(model)) return error(400, "Modelele Claude se apelează doar din butonul „Analizează cu Claude”, direct prin API-ul Anthropic.");
  }
  if (target === "claude" && !model.startsWith("claude-")) {
    return error(400, "Pentru butonul Claude, modelul trebuie să fie un ID Anthropic care începe cu „claude-”.");
  }

  if (!payload || typeof payload !== "object" || typeof payload.series !== "string" || !payload.dayTotals || !payload.periodTotals) {
    return error(400, "Lipsesc datele zilei de analizat.");
  }
  if (payload.series.length > MAX_SERIES_CHARS) return error(413, "Seria trimisă este prea mare pentru o singură zi.");
  if (!Array.isArray(payload.anomalies)) payload.anomalies = [];
  payload.anomalies = payload.anomalies.slice(0, 40);

  // Cheia: întâi cea din interfață (BYOK), apoi cea din variabilele de mediu.
  const userKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  let apiKey = userKey;
  if (!apiKey) {
    const fromEnv = envKey(provider);
    if (!fromEnv) {
      return error(
        400,
        `Lipsește cheia API pentru ${PROVIDER_LABELS[provider]}. Introdu-o în interfață sau setează ${ENV_VARS[provider]} în .env.local / Vercel.`,
      );
    }
    const code = accessCode();
    if (code && body.accessCode !== code) {
      return error(401, "Cheia de pe server este protejată de un cod de acces. Introdu codul corect sau folosește cheia ta.");
    }
    apiKey = fromEnv;
  }

  const origin = req.headers.get("origin") ?? undefined;

  try {
    const result = await callProvider(provider, apiKey, model, buildSystemPrompt(payload), buildUserPrompt(payload), origin);
    const out: AnalyzeResponse = { text: result.text, provider, model: result.model, notice: result.notice };
    return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof LlmError) return error(e.status >= 400 && e.status < 600 ? e.status : 502, e.message);
    console.error("analyze: eroare neașteptată", e instanceof Error ? e.message : e);
    return error(500, "Eroare neașteptată pe server la apelul modelului.");
  }
}
