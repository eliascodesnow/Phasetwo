import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildInviteLink, INVITE_EXPIRY_DAYS, renderInviteEmail, resolveInviterName } from "../_shared/partnerInvite.ts";

const EIGHT_CHARACTER_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL")?.trim() || "PhaseTwo <mail@phasetwo.space>";

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
  // 32-character alphabet divides 256 evenly, so a random byte maps without bias.
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += EIGHT_CHARACTER_CODE_CHARS[byte % EIGHT_CHARACTER_CODE_CHARS.length];
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

async function inviterName(
  serviceClient: ReturnType<typeof createClient>,
  user: { id: string; user_metadata?: Record<string, unknown> | null },
): Promise<string> {
  const [profile, state] = await Promise.all([
    serviceClient.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    serviceClient.from("user_app_state").select("cycle_profile, app_settings").eq("user_id", user.id).maybeSingle(),
  ]);
  const metadata = user.user_metadata ?? {};
  return resolveInviterName({
    profileDisplayName: profile.data?.display_name,
    appDisplayName: (state.data?.app_settings as Record<string, unknown> | null)?.displayName,
    metadataName: metadata.full_name ?? metadata.name,
    ownerLabel: (state.data?.cycle_profile as Record<string, unknown> | null)?.ownerLabel,
  });
}

async function sendInviteEmail(inviter: string, code: string, email: string): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendKey) throw new Error("email_not_configured");

  const link = buildInviteLink(Deno.env.get("APP_URL") ?? "", code);
  const message = renderInviteEmail({ inviter, code, link, expiryDays: INVITE_EXPIRY_DAYS });
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject: message.subject, text: message.text, html: message.html }),
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
      const linkedRow = await serviceClient
        .from("cycle_invitations")
        .select("id")
        .eq("owner_user_id", user.id)
        .not("accepted_user_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (linkedRow.error) throw linkedRow.error;
      return json(request, 200, {
        ok: true,
        linked: Boolean(linkedRow.data),
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
        .eq("owner_user_id", user.id);
      if (error) return json(request, 500, { error: "invite_failed" });
      return json(request, 200, { ok: true });
    }

    if (action === "resend") {
      const invite = await findOwnerInvite(serviceClient, user.id);
      if (!invite) return json(request, 404, { error: "invite_failed" });
      let expiresAt = invite.expires_at;
      if (new Date(expiresAt).getTime() <= Date.now()) {
        expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await serviceClient.from("cycle_invitations").update({ expires_at: expiresAt }).eq("id", invite.id);
        if (error) return json(request, 500, { error: "invite_failed" });
      }
      try {
        // Always send to the address stored on the invitation, never one supplied by the client.
        await sendInviteEmail(await inviterName(serviceClient, user), invite.invite_code, invite.invited_email);
        return json(request, 200, { ok: true, expires_at: expiresAt });
      } catch (error) {
        if (error instanceof Error && error.message === "email_not_configured") return json(request, 500, { error: "email_not_configured" });
        return json(request, 500, { error: "email_failed" });
      }
    }

    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return json(request, 400, { error: "invalid_email" });
    if (email === user.email?.toLowerCase()) return json(request, 409, { error: "cannot_invite_self" });

    const active = await serviceClient
      .from("cycle_invitations")
      .select("id")
      .eq("owner_user_id", user.id)
      .not("accepted_user_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (active.error) throw active.error;
    if (active.data) return json(request, 409, { error: "already_linked" });

    const pending = await findOwnerInvite(serviceClient, user.id);
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    let inviteCode = generateInviteCode();
    let inviteSaved = false;
    while (!inviteSaved) {
      const { error: saveError } = pending
        ? await serviceClient
          .from("cycle_invitations")
          .update({ invited_email: email, invite_code: inviteCode, invite_token: crypto.randomUUID(), expires_at: expiresAt })
          .eq("id", pending.id)
        : await serviceClient
          .from("cycle_invitations")
          .insert({ owner_user_id: user.id, invited_email: email, invite_code: inviteCode, expires_at: expiresAt });
      if (!saveError) inviteSaved = true;
      else if (saveError.code !== "23505") throw saveError;
      else inviteCode = generateInviteCode();
    }

    const invite = await findOwnerInvite(serviceClient, user.id);
    if (!invite) return json(request, 500, { error: "invite_failed" });

    try {
      await sendInviteEmail(await inviterName(serviceClient, user), invite.invite_code, invite.invited_email);
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
