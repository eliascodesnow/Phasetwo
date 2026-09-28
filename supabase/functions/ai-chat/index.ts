// Deploy:
//   supabase secrets set OPENROUTER_API_KEY=... OPENROUTER_MODEL=... OPENROUTER_FALLBACK_MODEL=...
//   then supabase functions deploy ai-chat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type OpenRouterHistoryItem = {
  role: "user" | "model";
  text: string;
};

type ChatInput = {
  systemPrompt?: string;
  history?: OpenRouterHistoryItem[];
  message?: string;
  requiresPlus?: boolean;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const OPENROUTER_TIMEOUT_MS = 20_000;
const MAX_MESSAGE_LENGTH = 1_000;
const MAX_HISTORY_TURNS = 10;
const MAX_REQUEST_BYTES = 20_000;

const jsonError = (status: number, code: string) =>
  Response.json(
    { error: code },
    { status }
  );

function getEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function coerceText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toOpenRouterMessages(systemPrompt: string, history: OpenRouterHistoryItem[], message: string): ChatMessage[] {
  const normalizedHistory = history
    .slice(-MAX_HISTORY_TURNS)
    .map((entry) => ({
      role: entry.role === "model" ? "assistant" : "user",
      content: coerceText(entry.text).slice(0, MAX_MESSAGE_LENGTH),
    }))
    .filter((entry) => entry.content.length > 0);

  return [
    { role: "system", content: systemPrompt || "You are a helpful assistant." },
    ...normalizedHistory,
    { role: "user", content: message.slice(0, MAX_MESSAGE_LENGTH) },
  ];
}

async function getAuthenticatedUser(jwt: string) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

async function hasPlusAccess(serviceSupabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data, error } = await serviceSupabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return false;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.some((row) => {
    const rawPlan = String(row?.plan ?? row?.tier ?? row?.type ?? row?.name ?? "").toLowerCase();
    const rawStatus = String(row?.status ?? "").toLowerCase();
    const rowIsPlusFlag = row && typeof row.is_plus === "boolean" ? row.is_plus : false;

    return (
      rowIsPlusFlag ||
      rawPlan.includes("plus") ||
      rawPlan.includes("pro")
    ) && !["cancelled", "canceled", "inactive", "expired"].includes(rawStatus);
  });
}

async function ensureUsageLimit(
  serviceSupabase: ReturnType<typeof createClient>,
  userId: string,
  requiresPlus: boolean
): Promise<{ allowed: boolean; currentCount: number; limit: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const limit = Number(requiresPlus ? Deno.env.get("PLUS_DAILY_LIMIT") ?? 100 : Deno.env.get("FREE_DAILY_LIMIT") ?? 10);

  const { data, error } = await serviceSupabase
    .from("ai_usage")
    .select("request_count")
    .eq("user_id", userId)
    .eq("DAY", today)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  const currentCount = Number(data?.request_count ?? 0);
  if (currentCount >= limit) {
    return { allowed: false, currentCount, limit };
  }

  const nextCount = currentCount + 1;
  const { error: writeError } = await serviceSupabase
    .from("ai_usage")
    .upsert(
      {
        user_id: userId,
        DAY: today,
        request_count: nextCount,
      },
      { onConflict: "user_id,DAY" }
    );

  if (writeError) {
    throw writeError;
  }

  return { allowed: true, currentCount, limit };
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
        "HTTP-Referer": "https://phasetwo.app",
        "X-Title": "PhaseTwo",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 400,
        temperature: 0.6,
      }),
      signal: controller.signal,
    });

    if (response.status === 429 || response.status >= 500) {
      throw new Error(`OPENROUTER_${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`OPENROUTER_${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string; type?: string }>;
        };
      }>;
    };

    const content = payload?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((part) => (typeof part === "string" ? part : part?.text ?? "")).join("")
      : typeof content === "string"
        ? content
        : "";

    if (!text.trim()) {
      throw new Error("EMPTY_RESPONSE");
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();

  try {
    if (req.method !== "POST") {
      return jsonError(405, "METHOD_NOT_ALLOWED");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!jwt) {
      return jsonError(401, "UNAUTHENTICATED");
    }

    const user = await getAuthenticatedUser(jwt);
    if (!user) {
      return jsonError(401, "UNAUTHENTICATED");
    }

    const rawBody = await req.text();
    const bodySize = new TextEncoder().encode(rawBody).length;
    if (bodySize > MAX_REQUEST_BYTES) {
      return jsonError(400, "INVALID_REQUEST");
    }

    let payload: ChatInput;
    try {
      payload = JSON.parse(rawBody || "{}") as ChatInput;
    } catch {
      return jsonError(400, "INVALID_REQUEST");
    }

    const message = coerceText(payload.message);
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return jsonError(400, "INVALID_REQUEST");
    }

    const history = Array.isArray(payload.history) ? payload.history : [];
    const safeHistory = history
      .filter((entry) => entry && (entry.role === "user" || entry.role === "model") && typeof entry.text === "string")
      .slice(-MAX_HISTORY_TURNS)
      .map((entry) => ({ role: entry.role, text: coerceText(entry.text).slice(0, MAX_MESSAGE_LENGTH) }))
      .filter((entry) => entry.text.length > 0);

    const requiresPlus = Boolean(payload.requiresPlus);
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: subscriptionRows, error: subscriptionError } = await serviceSupabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (requiresPlus) {
      const hasPlus = Array.isArray(subscriptionRows)
        ? subscriptionRows.some((row) => {
            const rawPlan = String(row?.plan ?? row?.tier ?? row?.type ?? row?.name ?? "").toLowerCase();
            const rawStatus = String(row?.status ?? "").toLowerCase();
            const rowIsPlus = typeof row?.is_plus === "boolean" ? row.is_plus : false;
            return (
              (rowIsPlus || rawPlan.includes("plus") || rawPlan.includes("pro")) &&
              !["cancelled", "canceled", "inactive", "expired"].includes(rawStatus)
            );
          })
        : false;

      if (subscriptionError && subscriptionError.code !== "42P01") {
        return jsonError(500, "SERVER_ERROR");
      }

      if (!hasPlus) {
        return jsonError(402, "SUBSCRIPTION_REQUIRED");
      }
    }

    const usage = await ensureUsageLimit(serviceSupabase, user.id, requiresPlus);
    if (!usage.allowed) {
      return jsonError(429, "RATE_LIMITED");
    }

    const apiKey = getEnv("OPENROUTER_API_KEY");
    const primaryModel = getEnv("OPENROUTER_MODEL");
    const fallbackModel = getEnv("OPENROUTER_FALLBACK_MODEL");
    const systemPrompt = coerceText(payload.systemPrompt) || "You are a helpful assistant.";
    const messages = toOpenRouterMessages(systemPrompt, safeHistory, message);

    let responseText = "";
    let usedModel = primaryModel;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const model = attempt === 0 ? primaryModel : fallbackModel;
      try {
        usedModel = model;
        responseText = await callOpenRouter(model, messages, apiKey);
        break;
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "UNKNOWN";
        const shouldRetry = /TIMEOUT|OPENROUTER_429|OPENROUTER_5|5\d\d/i.test(messageText);

        if (attempt === 0 && shouldRetry) {
          continue;
        }

        console.log(JSON.stringify({
          user_id: user.id,
          model: usedModel,
          latency_ms: Date.now() - startedAt,
          status: 502,
        }));

        return jsonError(502, "EMPTY_RESPONSE");
      }
    }

    const status = responseText ? 200 : 502;
    console.log(JSON.stringify({
      user_id: user.id,
      model: usedModel,
      latency_ms: Date.now() - startedAt,
      status,
    }));

    if (!responseText) {
      return jsonError(502, "EMPTY_RESPONSE");
    }

    return Response.json({ text: responseText }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    console.log(JSON.stringify({
      user_id: "unknown",
      model: "unknown",
      latency_ms: Date.now() - startedAt,
      status: 500,
    }));

    return jsonError(500, /Missing /i.test(message) ? "SERVER_ERROR" : "SERVER_ERROR");
  }
});
