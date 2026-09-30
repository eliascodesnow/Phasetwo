import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type InviteRequest = { action?: unknown; email?: unknown; token?: unknown };

function corsHeaders(request: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(request: Request, status: number, payload: Record<string, unknown>): Response {
  return Response.json(payload, { status, headers: corsHeaders(request) });
}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("CONFIGURATION_ERROR");
  return value;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "METHOD_NOT_ALLOWED" });

  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return json(request, 401, { error: "UNAUTHENTICATED" });

    const url = env("SUPABASE_URL");
    const anonKey = env("SUPABASE_ANON_KEY");
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return json(request, 401, { error: "UNAUTHENTICATED" });

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 4_096) return json(request, 400, { error: "INVALID_REQUEST" });
    let body: InviteRequest;
    try {
      body = JSON.parse(rawBody) as InviteRequest;
    } catch {
      return json(request, 400, { error: "INVALID_REQUEST" });
    }

    const serviceClient = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.action === "create") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || email === user.email?.toLowerCase()) {
        return json(request, 400, { error: "INVALID_INVITATION" });
      }
      await serviceClient
        .from("cycle_invitations")
        .delete()
        .eq("owner_user_id", user.id)
        .eq("invited_email", email)
        .is("accepted_user_id", null)
        .lt("expires_at", new Date().toISOString());
      const { data, error } = await serviceClient
        .from("cycle_invitations")
        .insert({ owner_user_id: user.id, invited_email: email })
        .select("invite_token,expires_at")
        .single();
      if (error || !data) return json(request, 409, { error: "INVITATION_UNAVAILABLE" });
      return json(request, 200, { token: data.invite_token, expiresAt: data.expires_at });
    }

    if (body.action === "status") {
      const { data } = await serviceClient
        .from("cycle_invitations")
        .select("invited_email,invite_token,accepted_user_id,expires_at,created_at")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return json(request, 200, {
        invitation: data ? {
          email: data.invited_email,
          accepted: Boolean(data.accepted_user_id),
          expiresAt: data.expires_at,
          token: data.invite_token,
        } : null,
      });
    }

    if (body.action === "revoke") {
      const inviteToken = typeof body.token === "string" ? body.token : "";
      if (!/^[0-9a-f-]{36}$/i.test(inviteToken)) return json(request, 400, { error: "INVALID_REQUEST" });
      const { error } = await serviceClient
        .from("cycle_invitations")
        .delete()
        .eq("owner_user_id", user.id)
        .eq("invite_token", inviteToken);
      if (error) return json(request, 503, { error: "INVITATION_UNAVAILABLE" });
      return json(request, 200, { revoked: true });
    }

    if (body.action === "accept") {
      const inviteToken = typeof body.token === "string" ? body.token : "";
      if (!/^[0-9a-f-]{36}$/i.test(inviteToken) || !user.email_confirmed_at || !user.email) {
        return json(request, 400, { error: "INVITATION_INVALID_OR_EXPIRED" });
      }
      const { data: invitation, error: lookupError } = await serviceClient
        .from("cycle_invitations")
        .select("id,owner_user_id,invited_email,expires_at,accepted_user_id")
        .eq("invite_token", inviteToken)
        .maybeSingle();
      if (lookupError || !invitation || invitation.accepted_user_id || invitation.owner_user_id === user.id ||
        invitation.invited_email.toLowerCase() !== user.email.toLowerCase() || Date.parse(invitation.expires_at) <= Date.now()) {
        return json(request, 400, { error: "INVITATION_INVALID_OR_EXPIRED" });
      }
      const { data: accepted, error: acceptError } = await serviceClient
        .from("cycle_invitations")
        .update({ accepted_user_id: user.id, accepted_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .is("accepted_user_id", null)
        .select("id")
        .maybeSingle();
      if (acceptError || !accepted) return json(request, 409, { error: "INVITATION_INVALID_OR_EXPIRED" });
      return json(request, 200, { accepted: true });
    }

    return json(request, 400, { error: "INVALID_REQUEST" });
  } catch {
    return json(request, 503, { error: "INVITATION_UNAVAILABLE" });
  }
});
