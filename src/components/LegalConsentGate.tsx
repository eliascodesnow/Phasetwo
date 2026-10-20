import { useEffect, useState, type ReactNode } from "react";
import { Leaf } from "lucide-react";
import { accountAcceptance, isCurrentAcceptance, requestPersistentStorage, PRIVACY_URL, readStoredAcceptance, storeAcceptance, TERMS_URL } from "../lib/legal";

const COLLECTS = [
  "Your email or Google sign-in (only if you sign in)",
  "Cycle dates, plus the symptoms and notes you choose to log",
  "Your planner tasks and chat messages",
  "Basic technical data such as IP address and device type",
];

const NEVER = [
  "Your GPS location, camera, microphone or contacts",
  "Payment or bank details",
  "Advertising IDs or ad tracking",
  "Anything to sell: we never sell your information",
];

const linkClass = "font-medium text-sage-dark underline underline-offset-2 hover:text-sage";

/** Blocks the whole app until the current Terms of Service and Privacy Policy are accepted. */
export function LegalConsentGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(() => isCurrentAcceptance(readStoredAcceptance()));
  const [isUpdate] = useState(() => {
    const stored = readStoredAcceptance();
    return Boolean(stored) && !isCurrentAcceptance(stored);
  });
  useEffect(() => {
    if (accepted) { requestPersistentStorage(); return; }
    // The browser forgot, but a signed-in account remembers: restore it instead of asking again.
    let cancelled = false;
    void accountAcceptance().then((saved) => {
      if (cancelled || !saved) return;
      storeAcceptance(undefined, new Date(saved.acceptedAt));
      setAccepted(true);
    });
    return () => { cancelled = true; };
  }, [accepted]);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeHealth, setAgreeHealth] = useState(false);

  if (accepted) return <>{children}</>;

  const ready = agreeTerms && agreeHealth;

  function accept() {
    if (!ready) return;
    storeAcceptance();
    setAccepted(true);
    window.scrollTo({ top: 0 });
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-base px-4 py-6 pb-safe sm:items-center sm:py-10">
      <section aria-labelledby="legal-gate-title" className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-card sm:p-8">
        <div className="flex items-center gap-2 text-sage-dark">
          <Leaf className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
          <span className="font-display text-lg font-bold text-zinc-900">PhaseTwo</span>
        </div>

        <h1 id="legal-gate-title" className="mt-5 font-display text-2xl font-bold text-zinc-900">
          {isUpdate ? "We’ve updated our Terms and Privacy Policy" : "Before you start"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          PhaseTwo is a cycle tracking and planning app. Log your period and symptoms, plan around your cycle, and, if you choose, share your cycle dates with one partner.
          {isUpdate ? " Please review the changes and accept to continue." : " Please read how it handles your information and agree to continue."}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-sage-light/60 p-4">
            <h2 className="text-sm font-semibold text-zinc-900">What PhaseTwo collects</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-700">
              {COLLECTS.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="rounded-xl bg-rose-50 p-4">
            <h2 className="text-sm font-semibold text-zinc-900">What it never collects</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-700">
              {NEVER.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          If you don’t sign in, everything you enter stays on this device. Symptom logs and notes are never shown to a partner. Full details are in the{" "}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>Privacy Policy</a>.
        </p>

        <div className="mt-5 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3.5 has-[:checked]:border-sage">
            <input type="checkbox" checked={agreeTerms} onChange={(event) => setAgreeTerms(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#4A6B5D]" />
            <span className="text-sm leading-relaxed text-zinc-800">
              I am 18 or older, and I agree to the{" "}
              <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>Terms of Service</a> and the{" "}
              <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>Privacy Policy</a>.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3.5 has-[:checked]:border-sage">
            <input type="checkbox" checked={agreeHealth} onChange={(event) => setAgreeHealth(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#4A6B5D]" />
            <span className="text-sm leading-relaxed text-zinc-800">
              I give my explicit consent for PhaseTwo to process the health information I choose to enter (cycle dates, symptoms and notes) as described in the Privacy Policy. I can withdraw this at any time by deleting my data or my account.
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={accept}
          disabled={!ready}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-sage-dark px-4 text-sm font-semibold text-white transition-colors hover:bg-sage-darker disabled:cursor-not-allowed disabled:opacity-50"
        >
          Agree and continue
        </button>
        <p className="mt-3 text-center text-xs leading-relaxed text-zinc-500">
          If you don’t agree, you can’t use PhaseTwo. Close this page and nothing will be saved.
        </p>
        <p className="mt-2 text-center text-[11px] text-zinc-400">PhaseTwo gives information, not medical advice.</p>
      </section>
    </main>
  );
}
