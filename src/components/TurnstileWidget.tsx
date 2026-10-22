import { useEffect, useRef } from "react";

export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || "";
export const turnstileEnabled = Boolean(turnstileSiteKey);

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

// Cloudflare's script is fetched the first time a challenge is shown, not on every page load.
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not initialise.")));
      script.onerror = () => {
        script.remove();
        reject(new Error("Unable to load the security check."));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      scriptPromise = null; // allow a retry on the next mount
      throw error;
    });
  }
  return scriptPromise;
}

interface TurnstileWidgetProps {
  /** Called with a fresh token, or null when the token expires or the challenge errors. */
  onToken: (token: string | null) => void;
  /** Called if the Cloudflare script cannot be loaded (offline, blocked). */
  onLoadError?: (message: string) => void;
  /** Change this value to discard the current token and issue a new challenge. Tokens are single-use. */
  resetKey?: number;
  theme?: "light" | "dark" | "auto";
}

export function TurnstileWidget({ onToken, onLoadError, resetKey = 0, theme = "auto" }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const onTokenRef = useRef(onToken);
  const onLoadErrorRef = useRef(onLoadError);
  onTokenRef.current = onToken;
  onLoadErrorRef.current = onLoadError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !turnstileEnabled) return;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widgetId.current = turnstile.render(container, {
          sitekey: turnstileSiteKey,
          theme,
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) onLoadErrorRef.current?.(error instanceof Error ? error.message : "Unable to load the security check.");
      });

    return () => {
      cancelled = true;
      if (widgetId.current !== undefined) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [theme]);

  useEffect(() => {
    if (resetKey === 0 || widgetId.current === undefined) return;
    window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  if (!turnstileEnabled) return null;
  return <div ref={containerRef} className="flex min-h-[65px] justify-center" data-testid="turnstile" />;
}
