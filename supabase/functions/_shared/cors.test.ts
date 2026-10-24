import { describe, expect, it } from "vitest";
import { allowedOrigins, corsHeadersFor } from "./cors";

const env = (values: Record<string, string>) => ({ get: (name: string) => values[name] });

describe("CORS allowlist", () => {
  it("echoes only allowed origins", () => {
    const allowed = allowedOrigins(env({}));
    expect(corsHeadersFor("https://phasetwo.space", allowed)["Access-Control-Allow-Origin"]).toBe("https://phasetwo.space");
    expect(corsHeadersFor("https://evil.example", allowed)).not.toHaveProperty("Access-Control-Allow-Origin");
    expect(corsHeadersFor(null, allowed)).not.toHaveProperty("Access-Control-Allow-Origin");
  });

  it("honours ALLOWED_ORIGINS", () => {
    const allowed = allowedOrigins(env({ ALLOWED_ORIGINS: "https://a.example/, https://b.example" }));
    expect(allowed).toEqual(["https://a.example", "https://b.example"]);
    expect(corsHeadersFor("https://phasetwo.space", allowed)).not.toHaveProperty("Access-Control-Allow-Origin");
  });
});
