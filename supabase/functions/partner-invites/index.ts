import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const EIGHT_CHARACTER_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RESEND_API_URL = "https://api.resend.com/emails";

type InviteRequest = {
  action?: "create" | "status" | "resend" | "revoke";
  email?: unknown;
};

type InviteRow = {
  id: string;
  invited_email: string;
  invite_code: string;
  expires_at: string;
  accepted_user_id: string | null;
};

function corsHeaders(request: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(request: Request, status: number, payload: Record<string, unknown>): Response {
  return Response.json(payload, { status, headers: corsHeaders(request) });
}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`CONFIGURATION_ERROR:${name}`);
  return value;
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function generateInviteCode(): string {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += EIGHT_CHARACTER_CODE_CHARS[Math.floor(Math.random() * EIGHT_CHARACTER_CODE_CHARS.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

async function findOwnerInvite(serviceClient: ReturnType<typeof createClient>, ownerId: string) {
  const { data, error } = await serviceClient
    .from("cycle_invitations")
    .select("id, invited_email, invite_code, expires_at, accepted_user_id")
    .eq("owner_user_id", ownerId)
    .is("accepted_user_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as InviteRow | null;
}

async function sendInviteEmail(code: string, email: string, expiresAt: string): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendKey) throw new Error("email_not_configured");

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PhaseTwo <mail@phasetwo.space>",
      to: [email],
      subject: "Your PhaseTwo partner code",
      text: `Your PhaseTwo partner code is ${code}. Share it with your partner. It expires at ${new Date(expiresAt).toISOString()} and can be used once.`,
      html: `<h1>Your PhaseTwo partner code</h1><p>Use this code to link your PhaseTwo account:</p><p><strong>${code}</strong></p><p>It expires on ${new Date(expiresAt).toLocaleString()} and can be used once.</p>`,
    }),
  });

  if (!response.ok) throw new Error("email_failed");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "METHOD_NOT_ALLOWED" });

  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return json(request, 401, { error: "unauthorized" });

    const url = env("SUPABASE_URL");
    const anonKey = env("SUPABASE_ANON_KEY");
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json(request, 401, { error: "unauthorized" });

    const serviceClient = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 4_096) return json(request, 400, { error: "invalid_email" });
    let body: InviteRequest;
    try {
      body = JSON.parse(rawBody) as InviteRequest;
    } catch {
      return json(request, 400, { error: "invalid_email" });
    }

    const action = body.action ?? "create";
    if (action === "status") {
      const invite = await findOwnerInvite(serviceClient, user.id);
      return json(request, 200, {
        ok: true,
        invitation: invite ? {
          email: invite.invited_email,
          code: invite.invite_code,
          expires_at: invite.expires_at,
        } : null,
      });
    }

    if (action === "revoke") {
      const { error } = await serviceClient
        .from("cycle_invitations")
        .delete()
        .eq("owner_user_id", user.id)
        .is("accepted_user_id", null);
      if (error) return json(request, 500, { error: "invite_failed" });
      return json(request, 200, { ok: true });
    }

    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return json(request, 400, { error: "invalid_email" });
    if (email === user.email?.toLowerCase()) return json(request, 409, { error: "cannot_invite_self" });

    const pending = await serviceClient
      .from("cycle_invitations")
      .select("id")
      .eq("owner_user_id", user.id)
      .is("accepted_user_id", null)
      .limit(1)
      .maybeSingle();
    if (pending.error) throw pending.error;
    if (pending.data) return json(request, 409, { error: "already_linked" });

    const active = await serviceClient
      .from("cycle_invitations")
      .select("id")
      .eq("owner_user_id", user.id)
      .not("accepted_user_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (active.error) throw active.error;
    if (active.data) return json(request, 409, { error: "already_linked" });

    let inviteCode = generateInviteCode();
    let inviteCreated = false;
    while (!inviteCreated) {
      const { error: insertError } = await serviceClient
        .from("cycle_invitations")
        .insert({
          owner_user_id: user.id,
          invited_email: email,
          invite_code: inviteCode,
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        });
      if (!insertError) inviteCreated = true;
      else if (insertError.code !== "23505") throw insertError;
      else inviteCode = generateInviteCode();
    }

    const invite = await findOwnerInvite(serviceClient, user.id);
    if (!invite) return json(request, 500, { error: "invite_failed" });

    try {
      await sendInviteEmail(invite.invite_code, invite.invited_email, invite.expires_at);
      return json(request, 200, { ok: true, expires_at: invite.expires_at });
    } catch (error) {
      if (error instanceof Error && error.message === "email_not_configured") return json(request, 500, { error: "email_not_configured" });
      return json(request, 500, { error: "email_failed" });
    }
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith("CONFIGURATION_ERROR:") ? "email_not_configured" : "invite_failed";
    console.error("partner-invites failed", error);
    return json(request, 500, { error: code });
  }
});
