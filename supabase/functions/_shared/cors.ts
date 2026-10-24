// CORS for browser-called edge functions. Only PhaseTwo's own origins may read responses.
// Override with a comma-separated ALLOWED_ORIGINS secret (e.g. to add a Vercel preview URL).
const DEFAULT_ORIGINS = [
  "https://phasetwo.space",
  "https://www.phasetwo.space",
  "https://phasetwo-omega.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function allowedOrigins(env: { get(name: string): string | undefined }): string[] {
  const configured = (env.get("ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim().replace(/\/+$/, "")).filter(Boolean);
  return configured.length ? configured : DEFAULT_ORIGINS;
}

export function corsHeadersFor(origin: string | null, allowed: string[], methods = "POST, OPTIONS"): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": methods,
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
