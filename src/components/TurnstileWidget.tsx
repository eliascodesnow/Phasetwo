import { useEffect, useRef } from "react";
import { loadTurnstile, turnstileEnabled, turnstileSiteKey } from "../lib/turnstile";

interface TurnstileWidgetProps {
  /** Called with a fresh single-use token, or null when the token expired or the check failed. */
  onToken: (token: string | null) => void;
  /** Called with a plain-language message when the check can't run. */
  onError?: (message: string) => void;
  /** Change this value to discard the current token and run the check again (tokens are single-use). */
  resetKey?: number;
  /** Label for this surface (1-32 letters, digits, _ or -), reported back by Cloudflare. */
  action?: string;
}

export function TurnstileWidget({ onToken, onError, resetKey = 0, action = "signin" }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  // Keep the latest callbacks without re-rendering the widget when the parent re-renders.
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };

  useEffect(() => {
    const container = containerRef.current;
    if (!turnstileEnabled || !container) return;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widgetId.current = turnstile.render(container, {
          sitekey: turnstileSiteKey,
          action,
          theme: "light",
          size: "flexible",
          // Stays invisible for most people; only shows up if Cloudflare needs an interaction.
          appearance: "interaction-only",
          "refresh-expired": "auto",
          callback: (token) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "timeout-callback": () => callbacks.current.onToken(null),
          "error-callback": () => {
            callbacks.current.onToken(null);
            callbacks.current.onError?.("The security check didn't finish. Please try again.");
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        callbacks.current.onToken(null);
        callbacks.current.onError?.(error instanceof Error ? error.message : "Couldn't load the security check.");
      });

    return () => {
      cancelled = true;
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = undefined;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- render once per mount; the action is fixed for a surface
  }, []);

  // Skip the first run: the widget is already fresh when it mounts.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  if (!turnstileEnabled) return null;
  return <div ref={containerRef} data-testid="turnstile" className="empty:hidden" />;
}
