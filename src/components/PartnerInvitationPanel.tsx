import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, LoaderCircle, MailPlus, RotateCcw, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatInviteCode, mapPartnerInviteError } from "../lib/partnerInvite";

type Invitation = { email: string; code: string; expires_at: string };

type PartnerInviteResult = {
  ok?: boolean;
  expires_at?: string;
  error?: string;
  invitation?: Invitation | null;
};

export function PartnerInvitationPanel() {
  const [email, setEmail] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshStatus() {
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke<PartnerInviteResult>("partner-invites", { body: { action: "status" } });
    if (error) {
      if (import.meta.env.DEV) console.error("partner-invites status failed", error);
      return;
    }
    setInvitation(data?.invitation ?? null);
  }

  useEffect(() => {
    void refreshStatus();
    const interval = window.setInterval(() => void refreshStatus(), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const nextEmail = email.trim();
    const { data, error: invokeError } = await supabase.functions.invoke<PartnerInviteResult>("partner-invites", {
      body: { action: "create", email: nextEmail },
    });
    setBusy(false);
    if (invokeError || !data?.ok) {
      const code = data?.error ?? (invokeError as { message?: string } | undefined)?.message;
      if (import.meta.env.DEV) console.error("partner-invites create failed", invokeError ?? data, code);
      setError(mapPartnerInviteError(code ?? ""));
      return;
    }
    setNotice("Invitation sent. Share the code below with the invited person.");
    await refreshStatus();
  }

  async function resendInvite() {
    if (!supabase || !invitation || busy) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase.functions.invoke<PartnerInviteResult>("partner-invites", {
      body: { action: "resend", email: invitation.email },
    });
    setBusy(false);
    if (error || !data?.ok) {
      const code = data?.error ?? (error as { message?: string } | undefined)?.message;
      if (import.meta.env.DEV) console.error("partner-invites resend failed", error ?? data, code);
      setError(mapPartnerInviteError(code ?? ""));
      return;
    }
    setInvitation((current) => current ? { ...current, expires_at: data.expires_at ?? current.expires_at } : current);
    setNotice("The invitation email has been resent.");
  }

  async function revokeInvite() {
    if (!supabase || !invitation || busy) return;
    if (!window.confirm("Revoke this invitation?")) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase.functions.invoke<PartnerInviteResult>("partner-invites", { body: { action: "revoke" } });
    setBusy(false);
    if (error || !data?.ok) {
      const code = data?.error ?? (error as { message?: string } | undefined)?.message;
      if (import.meta.env.DEV) console.error("partner-invites revoke failed", error ?? data, code);
      setError(mapPartnerInviteError(code ?? ""));
      return;
    }
    setInvitation(null);
    setNotice("Partner access has been removed.");
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-light text-sage-dark"><MailPlus className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold text-zinc-900">Partner sync</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">Invite by account email, then share the single-use code. The code expires after 14 days.</p>
        </div>
      </div>

      {invitation ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-sm font-medium text-zinc-800">Invitation for {invitation.email}</p>
          <p className="mt-1 text-xs text-zinc-500">Expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(invitation.expires_at))}</p>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-sage/25 bg-white px-3 py-2">
            <span className="font-mono text-sm font-semibold tracking-wider text-sage-dark">{formatInviteCode(invitation.code)}</span>
            <button type="button" onClick={() => void navigator.clipboard.writeText(invitation.code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => setError("Copy failed. Select and copy the code manually."))} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md border border-zinc-200 px-2 text-xs font-medium text-zinc-700">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy code"}</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void resendInvite()} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-slate px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />Resend email</button>
            <button type="button" onClick={() => void revokeInvite()} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-xs text-zinc-600 hover:bg-white disabled:opacity-50"><X className="h-3.5 w-3.5" />Revoke</button>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void createInvite(event)} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Partner’s account email" className="min-h-10 min-w-0 flex-1 rounded-md border border-zinc-200 px-3 text-sm placeholder:text-zinc-400 focus:border-sage focus:outline-none" />
          <button type="submit" disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}Create invite</button>
        </form>
      )}
      {notice && <p role="status" className="mt-3 text-xs text-sage-dark">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}<button type="button" onClick={() => void refreshStatus()} aria-label="Refresh invitation status" title="Refresh invitation status" className="ml-2 inline-flex align-middle"><RotateCcw className="h-3.5 w-3.5" /></button></p>}
    </section>
  );
}
