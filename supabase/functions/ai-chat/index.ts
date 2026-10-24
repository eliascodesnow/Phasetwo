// Deploy:
//   supabase secrets set OPENROUTER_API_KEY=... OPENROUTER_MODEL=... [OPENROUTER_FALLBACK_MODEL=...] [FREE_DAILY_LIMIT=10 PLUS_DAILY_LIMIT=100]
//   then supabase functions deploy ai-chat.
//
// The system prompt is built here from a few validated fields; the client cannot supply its own.
// The daily limit shares the atomic `consume_bella_daily_limit` counter (public.ai_usage) with Ask Bella.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { allowedOrigins, corsHeadersFor } from "../_shared/cors.ts";
import { buildPartnerAdvicePrompt, parseAdviceContext } from "../_shared/partnerAdvice.ts";

type HistoryEntry = { role: "user" | "model"; text: string };
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const OPENROUTER_TIMEOUT_MS = 20_000;
const MAX_MESSAGE_LENGTH = 1_000;
const MAX_HISTORY_TURNS = 10;
const MAX_REQUEST_BYTES = 20_000;

function respond(request: Request, status: number, payload: Record<string, unknown>): Response {
  return Response.json(payload, { status, headers: corsHeadersFor(request.headers.get("Origin"), allowedOrigins(Deno.env)) });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function limitFromEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name) ?? fallback);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1_000) : fallback;
}

function coerceText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is HistoryEntry => !!entry && (entry.role === "user" || entry.role === "model") && typeof entry.text === "string")
    .slice(-MAX_HISTORY_TURNS)
    .map((entry) => ({ role: entry.role, text: coerceText(entry.text).slice(0, MAX_MESSAGE_LENGTH) }))
    .filter((entry) => entry.text.length > 0);
}

function authenticate(jwt: string) {
  const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.auth.getUser(jwt).then(({ data, error }) => (error || !data.user ? null : { user: data.user, client }));
}

/** Plus status is decided here from the subscriptions table, never from the request. */
async function hasPlusAccess(serviceClient: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data)) return false;
  return data.some((row) => {
    const plan = String(row?.plan ?? row?.tier ?? row?.type ?? row?.name ?? "").toLowerCase();
    const status = String(row?.status ?? "").toLowerCase();
    const isPlus = (typeof row?.is_plus === "boolean" && row.is_plus) || /\b(plus|pro)\b/.test(plan);
    return isPlus && !["cancelled", "canceled", "inactive", "expired"].includes(status);
  });
}

async function callOpenRouter(model: string, messages: ChatMessage[], apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://phasetwo.space",
        "X-Title": "PhaseTwo",
      },
      body: JSON.stringify({ model, messages, max_tokens: 400, temperature: 0.6 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OPENROUTER_${response.status}`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
    const content = payload?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((part) => (typeof part === "string" ? part : part?.text ?? "")).join("")
      : typeof content === "string" ? content : "";
    if (!text.trim()) throw new Error("EMPTY_RESPONSE");
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const log = (status: number) => console.log(JSON.stringify({ request_id: requestId, latency_ms: Date.now() - startedAt, status }));

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req.headers.get("Origin"), allowedOrigins(Deno.env)) });
  if (req.method !== "POST") return respond(req, 405, { error: "METHOD_NOT_ALLOWED" });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!jwt) return respond(req, 401, { error: "UNAUTHENTICATED" });
    const auth = await authenticate(jwt);
    if (!auth) return respond(req, 401, { error: "UNAUTHENTICATED" });

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BYTES) return respond(req, 400, { error: "INVALID_REQUEST" });
    let payload: { message?: unknown; history?: unknown; context?: unknown };
    try {
      payload = JSON.parse(rawBody || "{}");
    } catch {
      return respond(req, 400, { error: "INVALID_REQUEST" });
    }

    const message = coerceText(payload.message);
    const context = parseAdviceContext(payload.context);
    if (!message || message.length > MAX_MESSAGE_LENGTH || !context) return respond(req, 400, { error: "INVALID_REQUEST" });

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const limit = (await hasPlusAccess(serviceClient, auth.user.id)) ? limitFromEnv("PLUS_DAILY_LIMIT", 100) : limitFromEnv("FREE_DAILY_LIMIT", 10);
    const { data: allowed, error: usageError } = await auth.client.rpc("consume_bella_daily_limit", { p_limit: limit });
    if (usageError) throw new Error("USAGE_LIMIT_UNAVAILABLE");
    if (allowed !== true) {
      log(429);
      return respond(req, 429, { error: "RATE_LIMITED" });
    }

    const apiKey = getEnv("OPENROUTER_API_KEY");
    const primaryModel = getEnv("OPENROUTER_MODEL");
    const fallbackModel = Deno.env.get("OPENROUTER_FALLBACK_MODEL")?.trim() || primaryModel;
    const messages: ChatMessage[] = [
      { role: "system", content: buildPartnerAdvicePrompt(context) },
      ...cleanHistory(payload.history).map((entry) => ({ role: entry.role === "model" ? "assistant" as const : "user" as const, content: entry.text })),
      { role: "user", content: message },
    ];

    let responseText = "";
    for (let attempt = 0; attempt < 2 && !responseText; attempt += 1) {
      try {
        responseText = await callOpenRouter(attempt === 0 ? primaryModel : fallbackModel, messages, apiKey);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "UNKNOWN";
        const retryable = reason === "TIMEOUT" || reason === "OPENROUTER_429" || /^OPENROUTER_5\d\d$/.test(reason);
        if (attempt === 0 && retryable) continue;
        log(502);
        return respond(req, 502, { error: "EMPTY_RESPONSE" });
      }
    }

    log(200);
    return respond(req, 200, { text: responseText });
  } catch {
    log(500);
    return respond(req, 500, { error: "SERVER_ERROR" });
  }
});
