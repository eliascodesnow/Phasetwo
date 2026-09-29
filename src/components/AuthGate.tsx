import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { ArrowRight, Leaf, LoaderCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

type AuthMode = "login" | "signup";
type ProfileState = "signed-out" | "checking" | "missing" | "complete" | "error";
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState>("signed-out");
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const captchaContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | undefined>(undefined);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  useEffect(() => {
    const container = captchaContainerRef.current;
    if (!container || !turnstileSiteKey) return;

    const renderWidget = () => {
      if (!window.turnstile) return;
      turnstileWidgetId.current = window.turnstile.render(container, {
        sitekey: turnstileSiteKey,
        callback: (token) => setCaptchaToken(token),
        "expired-callback": () => setCaptchaToken(null),
      });
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile"]',
    );
    script?.addEventListener("load", renderWidget);
    return () => script?.removeEventListener("load", renderWidget);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setProfileState(nextSession ? "checking" : "signed-out");
      setErrorMessage("");
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setErrorMessage(error.message);
      setSession(data.session);
      setAuthReady(true);
      setProfileState(data.session ? "checking" : "signed-out");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setProfileState("signed-out");
      return;
    }

    let ignore = false;
    const user = session.user;
    const metadataName = user.user_metadata.full_name ?? user.user_metadata.name ?? "";
    setDisplayName((current) => current || metadataName);
    setProfileState("checking");

    void supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (ignore) return;
        if (error) {
          setErrorMessage(error.message);
          setProfileState("error");
          return;
        }
        if (data?.display_name?.trim()) {
          setDisplayName(data.display_name);
          setProfileState("complete");
        } else {
          setProfileState("missing");
        }
      });

    return () => {
      ignore = true;
    };
  }, [session?.user.id]);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (!captchaToken) {
      setErrorMessage("Please complete the security check before continuing.");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    setNotice("");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: window.location.origin, captchaToken },
        });
        if (error) throw error;
        setNotice("Check your email for a sign-in link.");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin, captchaToken },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Check your email to confirm your account, then return here to finish your profile.");
        }
      }
      window.turnstile?.reset(turnstileWidgetId.current);
      setCaptchaToken(null);
    } catch (authError) {
      window.turnstile?.reset(turnstileWidgetId.current);
      setCaptchaToken(null);
      setErrorMessage(authError instanceof Error ? authError.message : "Unable to authenticate.");
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    if (!supabase) return;
    setBusy(true);
    setErrorMessage("");
    setNotice("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });

    if (error) {
      setErrorMessage(error.message);
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session?.user) return;
    const name = displayName.trim();
    if (!name) {
      setErrorMessage("Enter your name to create your profile.");
      return;
    }

    setBusy(true);
    setErrorMessage("");
    const { error } = await supabase.from("profiles").upsert({
      id: session.user.id,
      display_name: name,
      completed_at: new Date().toISOString(),
    });
    setBusy(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setProfileState("complete");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setDisplayName("");
    setPassword("");
  }

  if (!supabase) {
    return (
      <AuthLayout>
        <h1 className="font-display text-2xl font-semibold text-zinc-900">Connect PhaseTwo</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Add your Supabase project URL and anon key to <code>.env.local</code> to enable secure sign-in and sync.
        </p>
      </AuthLayout>
    );
  }

  if (!authReady || (session && profileState === "checking")) {
    return (
      <AuthLayout>
        <div className="flex items-center gap-3 text-sm text-zinc-600">
          <LoaderCircle className="h-4 w-4 animate-spin text-sage" />
          Checking your account...
        </div>
      </AuthLayout>
    );
  }

  if (profileState === "complete" && session) {
    return <>{children(session.user)}</>;
  }

  if (session && (profileState === "missing" || profileState === "error")) {
    return (
      <AuthLayout>
        <button type="button" onClick={signOut} className="mb-8 text-xs text-zinc-500 hover:text-zinc-800">
          Sign out
        </button>
        <p className="text-xs font-medium uppercase text-sage-dark">Your profile</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-zinc-900">A name to start with</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Create your profile before continuing to your private workspace.</p>
        <form onSubmit={saveProfile} className="mt-7 space-y-4">
          <label className="block text-sm font-medium text-zinc-700">
            Display name
            <input
              autoComplete="name"
              autoFocus
              required
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-sage"
            />
          </label>
          <Feedback error={errorMessage} notice={notice} />
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-sage-dark px-4 py-3 text-sm font-medium text-white hover:bg-sage disabled:opacity-60">
            {busy ? "Saving..." : "Create profile"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <p className="text-xs font-medium uppercase text-sage-dark">A little more in sync</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-zinc-900">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Sign in to keep your cycle details, plans, and notes with you on every device.
      </p>

      <button
        type="button"
        onClick={continueWithGoogle}
        disabled={busy}
        className="mt-7 flex w-full items-center justify-center gap-3 rounded-md border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
      >
        <GoogleMark />
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        or use email
        <span className="h-px flex-1 bg-zinc-200" />
      </div>

      <form onSubmit={submitCredentials} className="space-y-4">
        <label className="block text-sm font-medium text-zinc-700">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-sage"
          />
        </label>
        <div ref={captchaContainerRef} />
        {mode === "signup" && (
          <label className="block text-sm font-medium text-zinc-700">
            Password
            <input
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-sage"
            />
          </label>
        )}
        <Feedback error={errorMessage} notice={notice} />
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-sage-dark px-4 py-3 text-sm font-medium text-white hover:bg-sage disabled:opacity-60">
          {busy ? "Please wait..." : mode === "login" ? "Email me a sign-in link" : "Create account"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        {mode === "login" ? "New to PhaseTwo?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setErrorMessage("");
            setNotice("");
          }}
          className="font-medium text-sage-dark hover:underline"
        >
          {mode === "login" ? "Create account" : "Log in"}
        </button>
      </p>
    </AuthLayout>
  );
}

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-base px-5 py-10 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex items-center gap-2 text-zinc-900">
          <Leaf className="h-5 w-5 text-sage" strokeWidth={1.75} />
          <span className="font-display text-base font-semibold">PhaseTwo</span>
        </div>
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">{children}</section>
        <p className="mt-5 text-center text-xs text-zinc-400">Your health and planning data stays private to your account.</p>
      </div>
    </main>
  );
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  if (!error && !notice) return null;
  return (
    <p role={error ? "alert" : "status"} className={`text-sm leading-5 ${error ? "text-red-700" : "text-sage-dark"}`}>
      {error || notice}
    </p>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.908c1.702-1.567 2.685-3.875 2.685-6.614Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.181l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.582-5.039-3.71H.955v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.961 10.711A5.41 5.41 0 0 1 3.68 9c0-.594.102-1.17.281-1.711v-2.33H.955A9 9 0 0 0 0 9c0 1.45.348 2.823.955 4.041l3.006-2.33Z" />
      <path fill="#EA4335" d="M9 3.579c1.322 0 2.508.454 3.442 1.346l2.581-2.581C13.463.892 11.426 0 9 0A9 9 0 0 0 .955 4.959l3.006 2.33C4.672 5.161 6.656 3.579 9 3.579Z" />
    </svg>
  );
}