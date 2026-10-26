// Ari Knows: partner-support assistant. The prompt is built here, never accepted from the client.
// Deploy: supabase functions deploy ari-chat --no-verify-jwt
// Secrets used: OPENROUTER_API_KEY, OPENROUTER_MODEL (optional OPENROUTER_FALLBACK_MODEL, ARI_DAILY_LIMIT).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildAriSystemPrompt,
  cleanOwnerLabel,
  resolveRelationship,
  sanitizeAriReply,
} from "../_shared/ariPrompt.ts";
import { allowedOrigins, corsHeadersFor } from "../_shared/cors.ts";
import { dayDiff, phaseOfDay, todayIn } from "../_shared/pushContent.ts";

type HistoryItem = { role: "user" | "assistant"; content: string };
type ModelMessage = { role: "system" | "user" | "assistant"; content: string };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_MESSAGE_LENGTH = 800;
const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_ITEM_LENGTH = 900;
const MAX_REQUEST_BYTES = 12_000;
// Short answers keep Ari fast.
const MAX_TOKENS = 380;

function corsHeaders(request: Request): HeadersInit {
  return corsHeadersFor(request.headers.get("Origin"), allowedOrigins(Deno.env));
}

const json = (request: Request, status: number, payload: Record<string, unknown>) =>
  Response.json(payload, { status, headers: corsHeaders(request) });

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("MISSING_CONFIGURATION");
  return value;
}

function parseHistory(value: unknown): HistoryItem[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY_ITEMS) return null;
  const result: HistoryItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const item = entry as Record<string, unknown>;
    if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return null;
    const content = item.content.trim();
    if (!content || content.length > MAX_HISTORY_ITEM_LENGTH) return null;
    result.push({ role: item.role, content });
  }
  return result;
}

async function callOpenRouter(model: string, apiKey: string, messages: ModelMessage[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://phasetwo.space",
        "X-Title": "PhaseTwo Ari Knows",
      },
      body: JSON.stringify({ model, messages, max_tokens: MAX_TOKENS, temperature: 0.5 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("PROVIDER_ERROR");
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text?: unknown }).text ?? "") : "")).join("")
        : "";
    const clean = sanitizeAriReply(text);
    if (!clean) throw new Error("EMPTY_RESPONSE");
    return clean;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request: Request) => {
  const startedAt = Date.now();
  const log = (status: number, category: string) =>
    console.info(JSON.stringify({ fn: "ari-chat", latency_ms: Date.now() - startedAt, status, category }));

  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "METHOD_NOT_ALLOWED" });

  try {
    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(request, 401, { error: "UNAUTHENTICATED" });

    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) {
      log(401, "unauthenticated");
      return json(request, 401, { error: "UNAUTHENTICATED" });
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) return json(request, 400, { error: "INVALID_REQUEST" });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return json(request, 400, { error: "INVALID_REQUEST" });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = parseHistory(body.history);
    const relationship = resolveRelationship(body.relationship as Record<string, unknown> | undefined);
    if (!message || message.length > MAX_MESSAGE_LENGTH || !history || !relationship) {
      log(400, "invalid_request");
      return json(request, 400, { error: "INVALID_REQUEST" });
    }

    // Only the profile the owner chose to share with this partner. No symptom logs, no age, no health flags.
    const { data: shared, error: sharedError } = await userClient.rpc("get_my_shared_cycle_profile");
    if (sharedError) throw new Error("SHARED_PROFILE_UNAVAILABLE");
    if (!shared || typeof shared !== "object") {
      log(403, "no_shared_profile");
      return json(request, 403, { error: "NOT_A_PARTNER" });
    }
    const profile = shared as Record<string, unknown>;
    const cycleLength = Number(profile.cycleLength);
    const lastPeriodStart = typeof profile.lastPeriodStart === "string" ? profile.lastPeriodStart.slice(0, 10) : "";
    if (!Number.isInteger(cycleLength) || cycleLength < 15 || cycleLength > 90 || !/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) {
      log(422, "bad_profile");
      return json(request, 422, { error: "CYCLE_UNAVAILABLE" });
    }
    const timezone = typeof profile.timezone === "string" && profile.timezone ? profile.timezone : "UTC";
    const diff = dayDiff(lastPeriodStart, todayIn(timezone));
    const cycleDay = ((diff % cycleLength) + cycleLength) % cycleLength + 1;

    const limitValue = Number(Deno.env.get("ARI_DAILY_LIMIT") ?? "30");
    const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 500) : 30;
    // Atomic counter shared with Ask Bella (public.ai_usage); Ari and Bella draw from the same daily allowance.
    const { data: allowed, error: usageError } = await userClient.rpc("consume_bella_daily_limit", { p_limit: limit });
    if (usageError) throw new Error("USAGE_LIMIT_UNAVAILABLE");
    if (allowed !== true) {
      log(429, "daily_limit");
      return json(request, 429, { error: "DAILY_LIMIT_REACHED" });
    }

    const system = buildAriSystemPrompt({
      relationship,
      ownerLabel: cleanOwnerLabel(profile.ownerLabel),
      cycleDay,
      cycleLength,
      phase: phaseOfDay(cycleDay, cycleLength),
      daysUntilPeriod: cycleLength - cycleDay + 1,
    });
    const messages: ModelMessage[] = [{ role: "system", content: system }, ...history, { role: "user", content: message }];

    const apiKey = env("OPENROUTER_API_KEY");
    const models = [env("OPENROUTER_MODEL"), Deno.env.get("OPENROUTER_FALLBACK_MODEL")?.trim()].filter(Boolean) as string[];
    let text = "";
    for (const model of models) {
      try {
        text = await callOpenRouter(model, apiKey, messages);
        break;
      } catch {
        // try the fallback model once
      }
    }
    if (!text) throw new Error("PROVIDER_ERROR");
    log(200, "success");
    return json(request, 200, { text, cycleDay, phase: phaseOfDay(cycleDay, cycleLength) });
  } catch (error) {
    const category = error instanceof Error ? error.message : "UNKNOWN";
    const status = category === "MISSING_CONFIGURATION" || category === "USAGE_LIMIT_UNAVAILABLE" || category === "SHARED_PROFILE_UNAVAILABLE" ? 503 : 502;
    log(status, category);
    return json(request, status, { error: "ARI_UNAVAILABLE" });
  }
});
