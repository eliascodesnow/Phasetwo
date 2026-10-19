import { describe, expect, it } from "vitest";
import { errorStatus } from "./bellaClient";

describe("errorStatus", () => {
  it("reads the status from the error's response context", () => {
    expect(errorStatus({ context: new Response("{}", { status: 429 }) })).toBe(429);
    expect(errorStatus({ context: { status: 401 } })).toBe(401);
  });
  it("returns undefined when there is no status", () => {
    expect(errorStatus(new Error("network"))).toBeUndefined();
    expect(errorStatus(null)).toBeUndefined();
    expect(errorStatus({ context: { status: "500" } })).toBeUndefined();
  });
});
