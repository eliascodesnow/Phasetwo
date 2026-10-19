/** Reads the HTTP status from a supabase-js FunctionsHttpError (status lives on error.context, a Response). */
export function errorStatus(error: unknown): number | undefined {
  const context = (error as { context?: { status?: unknown } } | null)?.context;
  return typeof context?.status === "number" ? context.status : undefined;
}

export const APPOINTMENT_DISCLAIMER = "This summary reflects information recorded in PhaseTwo.";
