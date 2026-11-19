import type { Provider } from "./types";

export interface ModelOption {
  id: string;
  label: string;
}

/**
 * Modele Claude disponibile pentru butonul „Analizează cu Claude”.
 * claude-3-5-sonnet și claude-3-5-haiku au fost retrase de Anthropic (oct. 2025, feb. 2026),
 * iar claude-sonnet-4-5 se retrage pe 30 noiembrie 2026, așa că lista folosește familia curentă.
 * Câmpul „Alt model Claude” permite orice alt ID valid.
 */
export const CLAUDE_MODELS: ModelOption[] = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (implicit)" },
  { id: "claude-opus-5-5", label: "Opus 5.5 (cel mai capabil)" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 (rapid)" },
];

export const DEFAULT_CLAUDE_MODEL = CLAUDE_MODELS[0].id;

export interface OtherProvider {
  id: Exclude<Provider, "anthropic">;
  label: string;
  envVar: string;
  keyPlaceholder: string;
  defaultModel: string;
  suggestions: string[];
  docsUrl: string;
}

/** Furnizorii pentru butonul „Selectează alt LLM” (fără Claude). */
export const OTHER_PROVIDERS: OtherProvider[] = [
  {
    id: "openai",
    label: "OpenAI / ChatGPT",
    envVar: "OPENAI_API_KEY",
    keyPlaceholder: "sk-…",
    defaultModel: "gpt-6.2-sol",
    suggestions: ["gpt-6.2-sol", "gpt-6.2-astra", "gpt-5.5"],
    docsUrl: "https://platform.openai.com/docs/models",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    envVar: "GEMINI_API_KEY",
    keyPlaceholder: "AIza…",
    defaultModel: "gemini-4-hydrogen",
    suggestions: ["gemini-4-hydrogen", "gemini-4-neon", "gemini-3.5-flash"],
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    keyPlaceholder: "sk-or-…",
    defaultModel: "openai/gpt-6.2-sol",
    suggestions: ["openai/gpt-6.2-sol", "google/gemini-4-hydrogen", "openai/gpt-6.2-astra", "google/gemini-4-neon"],
    docsUrl: "https://openrouter.ai/models",
  },
];

export const ENV_VARS: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic Claude",
  openai: "OpenAI / ChatGPT",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
};

/** Butonul 2 exclude Claude: refuză modele Claude cerute prin alți furnizori (ex. „anthropic/…” pe OpenRouter). */
export function isClaudeModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.startsWith("anthropic/") || m.includes("claude");
}
