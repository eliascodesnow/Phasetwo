// Cloudflare Turnstile helpers. The script is loaded on demand (only when the sign-in form needs it),
// so it never weighs down the first load or blocks the offline app shell.

export interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: (errorCode?: string) => boolean | void;
  "timeout-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "flexible" | "compact";
  appearance?: "always" | "execute" | "interaction-only";
  "refresh-expired"?: "auto" | "manual" | "never";
}

export interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Public site key. Leave unset to run without a challenge (e.g. local dev with CAPTCHA off in Supabase). */
export const turnstileSiteKey: string = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
export const turnstileEnabled = turnstileSiteKey.length > 0;

let pending: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (pending) return pending;

  pending = new Promise<TurnstileApi>((resolve, reject) => {
    const fail = () => {
      pending = null; // allow a retry, e.g. after the connection comes back
      document.querySelector(`script[src="${SCRIPT_SRC}"]`)?.remove();
      reject(new Error("Couldn't load the security check. Check your connection and try again."));
    };
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : fail());
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return pending;
}
