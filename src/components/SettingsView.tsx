import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Trash2, Bell, BellOff, Check, Lightbulb } from "lucide-react";
import type { AppSettings, CycleProfile, ThemeMode } from "../types";
import { MEDICAL_DISCLAIMER } from "../lib/endoContent";
import { editPeriodStart } from "../lib/cycleUtils";
import { supabase } from "../lib/supabase";
import { PartnerInvitationPanel } from "./PartnerInvitationPanel";
import { formatInviteCode, mapPartnerAcceptError } from "../lib/partnerInvite";
import { SaveChangesButton } from "./SaveChangesButton";
import { disableReminders, enableReminders, reminderSupport, type ReminderSupport } from "../lib/notifications";

export function SettingsView({
  settings,
  onSettingsChange,
  isAuthenticated,
  isLinkedPartner,
  onLeavePartnerSync,
  onPartnerLinked,
  initialPartnerCode,
  onInitialPartnerCodeUsed,
  profile,
  onProfileChange,
  onDeleteAccount,
  onSave,
  saving,
  savedAt,
  onStartTour,
}: {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  isAuthenticated: boolean;
  isLinkedPartner: boolean;
  onLeavePartnerSync: () => Promise<void>;
  onPartnerLinked: () => Promise<void>;
  initialPartnerCode?: string | null;
  onInitialPartnerCodeUsed?: () => void;
  profile: CycleProfile;
  onProfileChange: (profile: CycleProfile) => void;
  onDeleteAccount: () => Promise<void>;
  onSave: () => Promise<void>;
  saving: boolean;
  savedAt: Date | null;
  onStartTour: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [leavingSync, setLeavingSync] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [partnerCode, setPartnerCode] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linkNotice, setLinkNotice] = useState("");
  // Choosing "I view an invited partner's cycle" before linking opens the code entry instead of being blocked.
  const [partnerIntent, setPartnerIntent] = useState(false);
  const partnerCodeInput = useRef<HTMLInputElement>(null);
  const viewingPartner = settings.role === "partner" || (!isLinkedPartner && partnerIntent);

  useEffect(() => {
    if (!initialPartnerCode) return;
    setPartnerIntent(true);
    setPartnerCode(formatInviteCode(initialPartnerCode));
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("partner-code-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      partnerCodeInput.current?.focus({ preventScroll: true });
      onInitialPartnerCodeUsed?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialPartnerCode]);

  function chooseSelf() {
    setPartnerIntent(false);
    onSettingsChange({ ...settings, role: "self" });
  }

  function choosePartner() {
    if (isLinkedPartner) {
      onSettingsChange({ ...settings, role: "partner", ldrEnabled: true });
      return;
    }
    setPartnerIntent(true);
    window.requestAnimationFrame(() => {
      document.getElementById("partner-code-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      partnerCodeInput.current?.focus({ preventScroll: true });
    });
  }
  const [reminderPermission, setReminderPermission] = useState<ReminderSupport>(reminderSupport());

  // Period reminders and push cycle tips share one device subscription, so it is only removed once both are off.
  async function toggleReminders(on: boolean) {
    if (!on) {
      if (!settings.phaseTips) await disableReminders();
      return onSettingsChange({ ...settings, periodReminders: false });
    }
    const permission = await enableReminders();
    setReminderPermission(permission);
    onSettingsChange({ ...settings, periodReminders: permission === "granted" });
  }

  async function togglePhaseTips(on: boolean) {
    if (!on) {
      if (!settings.periodReminders) await disableReminders();
      return onSettingsChange({ ...settings, phaseTips: false });
    }
    const permission = await enableReminders();
    setReminderPermission(permission);
    onSettingsChange({ ...settings, phaseTips: permission === "granted" });
  }

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

      <section className="border-b border-zinc-200 pb-5" aria-labelledby="appearance-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="appearance-heading" className="font-display text-base font-semibold text-zinc-900">Appearance</h2>
            <p className="mt-1 text-sm text-zinc-500">Light is the default. System follows your device preference.</p>
          </div>
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1" role="group" aria-label="Color theme">
            {(["system", "light", "dark"] as ThemeMode[]).map((mode) => (
              <button key={mode} type="button" aria-pressed={(settings.themeMode ?? "light") === mode}
                onClick={() => onSettingsChange({ ...settings, themeMode: mode })}
                className={`min-h-10 rounded-md px-3 text-sm font-medium capitalize transition-colors ${(settings.themeMode ?? "light") === mode ? "bg-white text-zinc-900 shadow-card" : "text-zinc-600 hover:text-zinc-900"}`}>
                {mode}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 pb-5" aria-labelledby="tour-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-md">
            <h2 id="tour-heading" className="font-display text-base font-semibold text-zinc-900">App tour</h2>
            <p className="mt-1 text-sm text-zinc-500">A quick walkthrough of every feature and how to log your period.</p>
          </div>
          <button type="button" onClick={onStartTour} className="min-h-11 rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Take the tour</button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-card sm:p-5" aria-labelledby="reminders-heading">
        <div className="flex items-center gap-3.5">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 ${settings.periodReminders ? "bg-[var(--period-solid)] text-white" : "bg-zinc-100 text-zinc-500"}`} aria-hidden="true">
            {settings.periodReminders ? <Bell className="h-5 w-5" strokeWidth={2} /> : <BellOff className="h-5 w-5" strokeWidth={2} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="reminders-heading" className="font-display text-[15px] font-semibold leading-tight text-zinc-900">Period reminders</h2>
            <p className="mt-0.5 text-[13px] leading-snug text-zinc-500">{settings.periodReminders ? "On · 2 days and 1 day before" : "Off · tap to get a heads-up"}</p>
          </div>
          <button type="button" role="switch" aria-checked={Boolean(settings.periodReminders)} aria-labelledby="reminders-heading" disabled={reminderPermission === "unsupported"}
            onClick={() => void toggleReminders(!settings.periodReminders)}
            className={`relative inline-flex h-[30px] w-[52px] shrink-0 items-center rounded-full p-[3px] shadow-[inset_0_1px_2px_rgb(0_0_0/0.18)] outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-[var(--period-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 ${settings.periodReminders ? "bg-[var(--period-solid)]" : "bg-zinc-300"}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] ${settings.periodReminders ? "translate-x-[22px]" : "translate-x-0"}`}>
              {settings.periodReminders && <Check className="h-3.5 w-3.5 text-[var(--period-solid)]" strokeWidth={3} />}
            </span>
          </button>
        </div>
        {reminderPermission === "denied" && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">Notifications are blocked for this site. Allow them in your browser settings, then switch this on.</p>}
        {reminderPermission === "unsupported" && <p className="mt-3 text-xs text-zinc-500">This browser does not support notifications.</p>}
      </section>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-card sm:p-5" aria-label="Tips and insights">
        {settings.role !== "partner" && (
          <SwitchRow
            id="phase-tips-heading"
            icon={settings.phaseTips ? Bell : BellOff}
            title="Cycle tips (push)"
            description={settings.phaseTips ? "On · a heads-up before PMS days and when your period may start" : "Off · occasional notifications, even when the app is closed"}
            checked={Boolean(settings.phaseTips)}
            disabled={reminderPermission === "unsupported"}
            onChange={(on) => void togglePhaseTips(on)}
          />
        )}
        <SwitchRow
          id="in-app-tips-heading"
          icon={Lightbulb}
          title="Insights on Today"
          description={settings.inAppTips !== false ? "On · one short, dismissible insight at a time" : "Off · no insights on the Today screen"}
          checked={settings.inAppTips !== false}
          onChange={(on) => onSettingsChange({ ...settings, inAppTips: on })}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
          <h2 className="font-display text-base font-semibold text-zinc-900">Tracking setup</h2>
          <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-xs font-medium text-zinc-500">How are you using PhaseTwo?</legend>
              <div className="mt-2 grid gap-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${!viewingPartner ? "border-sage bg-sage-light/50" : "border-zinc-200 hover:bg-zinc-50"}`}>
                  <input type="radio" name="tracking-role" checked={!viewingPartner} onChange={chooseSelf} className="mt-0.5 accent-[#4A6B5D]" />
                  <span><span className="block text-sm font-medium text-zinc-800">I track my own cycle</span><span className="mt-0.5 block text-xs text-zinc-500">Your period and symptom history stay in this account.</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${viewingPartner ? "border-sage bg-sage-light/50" : "border-zinc-200 hover:bg-zinc-50"}`}>
                  <input type="radio" name="tracking-role" checked={viewingPartner} onChange={choosePartner} className="mt-0.5 accent-[#4A6B5D]" />
                  <span><span className="block text-sm font-medium text-zinc-800">I view an invited partner’s cycle</span><span className="mt-0.5 block text-xs text-zinc-500">{isLinkedPartner ? "Your partner’s cycle is linked to this account." : "Enter the code from your partner’s invitation email to link their cycle."}</span></span>
                </label>
              </div>
            </fieldset>
            {!viewingPartner && <>
              <label className="block text-xs font-medium text-zinc-600">Name to display<input value={profile.ownerLabel} onChange={(event) => onProfileChange({ ...profile, ownerLabel: event.target.value })} maxLength={80} className="mt-1.5 min-h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" /></label>
              <label className="block text-xs font-medium text-zinc-600">Most recent period start<input type="date" value={profile.lastPeriodStart} onChange={(event) => { if (event.target.value) onProfileChange(editPeriodStart(profile, profile.lastPeriodStart, event.target.value)); }} className="mt-1.5 min-h-11 w-full rounded-md border border-zinc-200 px-3 text-sm" /></label>
              <label className="block text-xs font-medium text-zinc-600">Cycle length (days)<input type="number" min={20} max={45} value={profile.cycleLength} onChange={(event) => onProfileChange({ ...profile, cycleLength: Math.max(20, Math.min(45, Number(event.target.value) || 28)) })} className="mt-1.5 min-h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" /></label>
              <label className="block text-xs font-medium text-zinc-600">Period duration (days)<input type="number" min={1} max={10} value={profile.periodLength} onChange={(event) => onProfileChange({ ...profile, periodLength: Math.max(1, Math.min(10, Number(event.target.value) || 5)) })} className="mt-1.5 min-h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" /></label>
            </>}
          </div>
        </section>

        <div className="space-y-6">
          {!viewingPartner && isAuthenticated && <PartnerInvitationPanel />}
          {settings.role === "partner" && isLinkedPartner && <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6"><h2 className="font-display text-base font-semibold text-zinc-900">Partner sync</h2><p className="mt-2 text-xs leading-relaxed text-zinc-600">This account can view the cycle dates and length shared by your partner. Their symptom logs, notes, and account data remain private.</p><button type="button" disabled={leavingSync} onClick={() => { setLeavingSync(true); setSyncError(""); void onLeavePartnerSync().catch(() => setSyncError("Partner sync could not be disconnected. Please try again.")).finally(() => setLeavingSync(false)); }} className="mt-3 min-h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{leavingSync ? "Disconnecting…" : "Disconnect partner sync"}</button>{syncError && <p role="alert" className="mt-2 text-xs text-rose-700">{syncError}</p>}</section>}
          {!isLinkedPartner && viewingPartner && !isAuthenticated && <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6"><h2 className="font-display text-base font-semibold text-zinc-900">Enter a partner code</h2><p className="mt-1 text-xs leading-relaxed text-zinc-600">Sign in first, then enter the code from your partner’s invitation email.</p></section>}
          {isAuthenticated && !isLinkedPartner && <section id="partner-code-section" className={`rounded-xl border bg-white p-5 shadow-card sm:p-6 ${viewingPartner ? "border-sage" : "border-zinc-200"}`}>
            <h2 className="font-display text-base font-semibold text-zinc-900">Enter a partner code</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">Your partner shares the code from their invitation email. It can be used once and expires after 14 days.</p>
            <form className="mt-4 space-y-3" onSubmit={async (event) => {
              event.preventDefault();
              if (!supabase || linking) return;
              setLinking(true); setLinkError(""); setLinkNotice("");
              const { error } = await supabase.rpc("accept_cycle_invitation", { p_code: partnerCode });
              setLinking(false);
              if (error) {
                setLinkError(mapPartnerAcceptError(error.message));
                return;
              }
              setLinkNotice("Partner cycle linked. Your account can now view the shared cycle.");
              setPartnerCode("");
              setPartnerIntent(false);
              await onPartnerLinked();
            }}>
              <input ref={partnerCodeInput} value={partnerCode} onChange={(event) => setPartnerCode(event.target.value)} placeholder="K7M2-QX9P" autoComplete="one-time-code" maxLength={9} className="min-h-10 w-full rounded-md border border-zinc-200 px-3 text-sm uppercase placeholder:text-zinc-400 focus:border-sage focus:outline-none" />
              <button type="submit" disabled={linking || partnerCode.trim().length === 0} className="inline-flex min-h-10 items-center justify-center rounded-md bg-sage-dark px-4 text-sm font-medium text-white disabled:opacity-50">{linking ? "Linking…" : "Accept partner code"}</button>
              {linkError && <p role="alert" className="text-xs text-rose-700">{linkError}</p>}
              {linkNotice && <p role="status" className="text-xs text-sage-dark">{linkNotice}</p>}
            </form>
          </section>}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:p-6">
            <h2 className="font-display text-base font-semibold text-zinc-900">Privacy and care</h2>
            <p className="mt-3 text-xs leading-relaxed text-zinc-600">Symptom history is private to your account. An accepted partner invitation shares only cycle dates and length. Delete symptom entries from Home or History.</p>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">{MEDICAL_DISCLAIMER}</p>
            <p className="mt-3 text-xs"><a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-sage-dark underline underline-offset-2">Privacy Policy</a><span className="px-2 text-zinc-400">·</span><a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-sage-dark underline underline-offset-2">Terms of Service</a></p>
          </section>
        </div>
      </div>

      <SaveChangesButton onSave={onSave} saving={saving} savedAt={savedAt} />

      {isAuthenticated && <section className="rounded-xl border border-rose-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-rose-600" />
          <div className="flex-1">
            <h2 className="font-display text-base font-semibold text-zinc-900">Delete account</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-600">Permanently remove your account and synced PhaseTwo data. This action cannot be undone.</p>
            <button type="button" onClick={() => setConfirmOpen(true)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Delete my account</button>
          </div>
        </div>
      </section>}

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
function SwitchRow({ id, icon: Icon, title, description, checked, disabled, onChange }: {
  id: string;
  icon: typeof Bell;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 ${checked ? "bg-[var(--period-solid)] text-white" : "bg-zinc-100 text-zinc-500"}`} aria-hidden="true">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={id} className="font-display text-[15px] font-semibold leading-tight text-zinc-900">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-snug text-zinc-500">{description}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative inline-flex h-[30px] w-[52px] shrink-0 items-center rounded-full p-[3px] shadow-[inset_0_1px_2px_rgb(0_0_0/0.18)] outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-[var(--period-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-[var(--period-solid)]" : "bg-zinc-300"}`}>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] ${checked ? "translate-x-[22px]" : "translate-x-0"}`}>
          {checked && <Check className="h-3.5 w-3.5 text-[var(--period-solid)]" strokeWidth={3} />}
        </span>
      </button>
    </div>
  );
}
