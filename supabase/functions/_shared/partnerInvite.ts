// Pure helpers for the partner-invites edge function (no Deno APIs, so they can be unit tested).

export const DEFAULT_APP_URL = "https://phasetwo.space";
export const INVITE_EXPIRY_DAYS = 14;
export const INVITE_FALLBACK_NAME = "Someone";

const GENERIC_LABELS = new Set(["her", "him", "them", "partner", "me", "you", "user"]);

export function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export type InviterNameSources = {
  profileDisplayName?: unknown;
  appDisplayName?: unknown;
  metadataName?: unknown;
  ownerLabel?: unknown;
};

/** The sender's own name, never a placeholder, unless nothing usable is stored anywhere. */
export function resolveInviterName(sources: InviterNameSources): string {
  const candidates = [sources.profileDisplayName, sources.appDisplayName, sources.metadataName, sources.ownerLabel];
  for (const candidate of candidates) {
    const name = cleanName(candidate);
    if (name && !GENERIC_LABELS.has(name.toLowerCase())) return name;
  }
  return INVITE_FALLBACK_NAME;
}

export function normalizeAppUrl(value: string | undefined | null): string {
  const raw = (value ?? "").trim();
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // fall through to the default
  }
  return DEFAULT_APP_URL;
}

/** Deep link that opens PhaseTwo on the "Enter a partner code" section with the code prefilled. */
export function buildInviteLink(appUrl: string, code: string): string {
  return `${normalizeAppUrl(appUrl)}/?partnerCode=${encodeURIComponent(code)}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderInviteEmail(input: { inviter: string; code: string; link: string; expiryDays?: number }) {
  const days = input.expiryDays ?? INVITE_EXPIRY_DAYS;
  const who = escapeHtml(input.inviter);
  const subject = `${cleanName(input.inviter) || INVITE_FALLBACK_NAME} invited you to PhaseTwo`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f1e7;font-family:Georgia,'Times New Roman',serif;color:#3b4a3f;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fffdf8;border-radius:16px;padding:32px 28px;border:1px solid #e4ddcc;">
      <h1 style="font-size:22px;margin:0 0 12px;color:#4f6b57;">${who} invited you to PhaseTwo</h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">${who} would like to share their cycle dates with you on PhaseTwo. Their symptom logs and notes stay private.</p>
      <p style="text-align:center;margin:24px 0;"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#4f6b57;color:#ffffff;text-decoration:none;font-size:16px;padding:12px 22px;border-radius:10px;">Enter your partner code</a></p>
      <div style="text-align:center;margin:0 0 20px;padding:18px;background:#eef2ea;border-radius:12px;">
        <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#6b7d6f;margin-bottom:6px;">Your invite code</div>
        <div style="font-size:32px;letter-spacing:4px;font-weight:bold;color:#3b4a3f;font-family:'Courier New',monospace;">${escapeHtml(input.code)}</div>
      </div>
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">The button opens PhaseTwo with the code ready to accept. Sign in with this email address if asked. The code works once and expires in ${days} days.</p>
      <p style="font-size:13px;line-height:1.5;color:#7a857d;margin:0;">If you weren't expecting this, you can safely ignore this email. Nothing is shared unless you accept the code.</p>
    </div>
  </div>
</body></html>`;
  const text = `${input.inviter} invited you to PhaseTwo.\n\n${input.inviter} would like to share their cycle dates with you. Their symptom logs and notes stay private.\n\nEnter your partner code: ${input.link}\n\nInvite code: ${input.code}\n\nSign in with this email address if asked. The code works once and expires in ${days} days.\n\nIf you weren't expecting this, you can ignore this email. Nothing is shared unless you accept the code.`;
  return { subject, html, text };
}
