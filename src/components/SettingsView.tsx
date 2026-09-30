import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { AppSettings, CycleProfile } from "../types";
import { MEDICAL_DISCLAIMER } from "../lib/endoContent";
import { PartnerInvitationPanel } from "./PartnerInvitationPanel";

export function SettingsView({
  settings,
  onSettingsChange,
  isLinkedPartner,
  onLeavePartnerSync,
  profile,
  onProfileChange,
  onDeleteAccount,
}: {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  isLinkedPartner: boolean;
  onLeavePartnerSync: () => Promise<void>;
  profile: CycleProfile;
  onProfileChange: (profile: CycleProfile) => void;
  onDeleteAccount: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [leavingSync, setLeavingSync] = useState(false);
  const [syncError, setSyncError] = useState("");

  async function deleteAccount() {
    if (confirmation !== "DELETE") return;
    setDeleting(true);
    setDeleteError("");
    try {
      await onDeleteAccount();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete the account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sage-dark">Your workspace</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your cycle profile, account preferences, and private data.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
          <h2 className="font-display text-base font-semibold text-zinc-900">Tracking setup</h2>
          <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-xs font-medium text-zinc-500">How are you using PhaseTwo?</legend>
              <div className="mt-2 grid gap-2">
                <label className="flex items-start gap-3 rounded-lg border border-sage bg-sage-light/50 p-3">
                  <input type="radio" name="tracking-role" checked={settings.role === "self"} onChange={() => onSettingsChange({ ...settings, role: "self" })} className="mt-0.5 accent-[#4A6B5D]" />
                  <span><span className="block text-sm font-medium text-zinc-800">I track my own cycle</span><span className="mt-0.5 block text-xs text-zinc-500">Your period and symptom history stay in this account.</span></span>
                </label>
                <label className={`flex items-start gap-3 rounded-lg border p-3 ${isLinkedPartner ? "border-sage bg-sage-light/50" : "border-zinc-200 opacity-60"}`}>
                  <input type="radio" name="tracking-role" checked={settings.role === "partner"} disabled={!isLinkedPartner} onChange={() => onSettingsChange({ ...settings, role: "partner", ldrEnabled: true })} className="mt-0.5 accent-[#4A6B5D]" />
                  <span><span className="block text-sm font-medium text-zinc-800">I view an invited partner’s cycle</span><span className="mt-0.5 block text-xs text-zinc-500">Requires an invitation accepted by this account’s email.</span></span>
                </label>
              </div>
            </fieldset>
            {settings.role === "self" && <label className="block text-xs font-medium text-zinc-600">Name to display<input value={profile.ownerLabel} onChange={(event) => onProfileChange({ ...profile, ownerLabel: event.target.value })} maxLength={80} className="mt-1.5 min-h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" /></label>}
            <label className="block text-xs font-medium text-zinc-600">Most recent period start<input type="date" value={profile.lastPeriodStart} onChange={(event) => onProfileChange({ ...profile, lastPeriodStart: event.target.value })} className="mt-1.5 min-h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" /></label>
            <label className="block text-xs font-medium text-zinc-600">Cycle length (days)<input type="number" min={20} max={45} value={profile.cycleLength} onChange={(event) => onProfileChange({ ...profile, cycleLength: Math.max(20, Math.min(45, Number(event.target.value) || 28)) })} className="mt-1.5 min-h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" /></label>
            <label className="block text-xs font-medium text-zinc-600">Period duration (days)<input type="number" min={1} max={10} value={profile.periodLength} onChange={(event) => onProfileChange({ ...profile, periodLength: Math.max(1, Math.min(10, Number(event.target.value) || 5)) })} className="mt-1.5 min-h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" /></label>
          </div>
        </section>

        <div className="space-y-6">
          {settings.role === "self" && <PartnerInvitationPanel />}
          {settings.role === "partner" && isLinkedPartner && <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6"><h2 className="font-display text-base font-semibold text-zinc-900">Partner sync</h2><p className="mt-2 text-xs leading-relaxed text-zinc-600">This account can view the cycle dates and length shared by your partner. Their symptom logs, notes, and account data remain private.</p><button type="button" disabled={leavingSync} onClick={() => { setLeavingSync(true); setSyncError(""); void onLeavePartnerSync().catch(() => setSyncError("Partner sync could not be disconnected. Please try again.")).finally(() => setLeavingSync(false)); }} className="mt-3 min-h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{leavingSync ? "Disconnecting…" : "Disconnect partner sync"}</button>{syncError && <p role="alert" className="mt-2 text-xs text-rose-700">{syncError}</p>}</section>}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
            <h2 className="font-display text-base font-semibold text-zinc-900">Privacy and care</h2>
            <p className="mt-3 text-xs leading-relaxed text-zinc-600">Symptom history is private to your account. An accepted partner invitation shares only cycle dates and length. Delete symptom entries from Home or History.</p>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">{MEDICAL_DISCLAIMER}</p>
          </section>
        </div>
      </div>

      <section className="rounded-xl border border-rose-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-rose-600" />
          <div className="flex-1">
            <h2 className="font-display text-base font-semibold text-zinc-900">Delete account</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-600">Permanently remove your account and synced PhaseTwo data. This action cannot be undone.</p>
            <button type="button" onClick={() => setConfirmOpen(true)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Delete my account</button>
          </div>
        </div>
      </section>

      {confirmOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="delete-account-title" className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl sm:p-6">
          <h2 id="delete-account-title" className="font-display text-lg font-semibold text-zinc-900">Permanently delete your account?</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">Your account and synced data will be removed. Type DELETE to confirm.</p>
          <label className="mt-4 block text-xs font-medium text-zinc-600">Confirmation<input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" /></label>
          {deleteError && <p role="alert" className="mt-3 text-sm text-rose-700">{deleteError}</p>}
          <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={deleting} onClick={() => { setConfirmOpen(false); setConfirmation(""); }} className="min-h-10 rounded-md border border-zinc-200 px-3 text-sm text-zinc-700">Cancel</button><button type="button" disabled={deleting || confirmation !== "DELETE"} onClick={() => void deleteAccount()} className="min-h-10 rounded-md bg-rose-700 px-3 text-sm font-medium text-white disabled:opacity-40">{deleting ? "Deleting…" : "Delete permanently"}</button></div>
        </section>
      </div>}
    </div>
  );
}