import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, LoaderCircle, MailPlus, RotateCcw, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type Invitation = { email: string; accepted: boolean; expiresAt: string; token: string | null };

export function PartnerInvitationPanel() {
  const [email, setEmail] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshStatus() {
    if (!supabase) return;
    const { data } = await supabase.functions.invoke<{ invitation: Invitation | null }>("partner-invites", { body: { action: "status" } });
    if (data) setInvitation(data.invitation);
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
    const { data, error: invokeError } = await supabase.functions.invoke<{ token: string; expiresAt: string }>("partner-invites", {
      body: { action: "create", email: email.trim() },
    });
    setBusy(false);
    if (invokeError || !data?.token) {
      setError("We couldn’t create that invitation. Check the email and try again.");
      return;
    }
    const next = { email: email.trim(), accepted: false, expiresAt: data.expiresAt, token: data.token };
    setInvitation(next);
    setNotice("Invitation link created. Send it only to the invited email address.");
  }

  async function copyInvite() {
    if (!invitation?.token) return;
    const url = new URL(window.location.href);
    url.searchParams.set("cycleInvite", invitation.token);
    url.hash = "";
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed. Select and copy the invitation link manually.");
    }
  }

  async function revokeInvite() {
    if (!supabase || !invitation?.token || busy) return;
    if (!window.confirm("Revoke this invitation and disconnect its cycle sync?")) return;
    setBusy(true);
    setError("");
    const { error: invokeError } = await supabase.functions.invoke("partner-invites", {
      body: { action: "revoke", token: invitation.token },
    });
    setBusy(false);
    if (invokeError) {
      setError("The invitation could not be revoked. Please try again.");
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
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">Your partner uses their own PhaseTwo account. Invite their account email to share your cycle dates and length; symptom logs, notes, and other account data stay private. The invitation itself is not emailed.</p>
        </div>
      </div>

      {invitation?.accepted ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sage/25 bg-sage-light/40 px-3 py-3">
          <p className="text-sm text-sage-dark"><Check className="mr-1.5 inline h-4 w-4" />Synced with {invitation.email}</p>
          <button type="button" onClick={() => void revokeInvite()} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"><X className="h-3.5 w-3.5" />Disconnect</button>
        </div>
      ) : invitation?.token ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-sm font-medium text-zinc-800">Invite sent to {invitation.email}</p>
          <p className="mt-1 text-xs text-zinc-500">Expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(invitation.expiresAt))}. The recipient must sign in using this exact email.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyInvite()} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-slate px-3 text-xs font-medium text-white hover:bg-zinc-800">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy invite link"}</button>
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
