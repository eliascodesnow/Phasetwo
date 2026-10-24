import { describe, expect, it } from "vitest";
import { clearPendingPartnerCode, formatInviteCode, mapPartnerAcceptError, mapPartnerInviteError, parsePartnerCodeParam, readPendingPartnerCode, stashPendingPartnerCode } from "./partnerInvite";

describe("partner invite helpers", () => {
  it("normalizes code input and preserves the expected format", () => {
    expect(formatInviteCode("k7m2-qx9p")).toBe("K7M2-QX9P");
    expect(formatInviteCode("K7M2QX9P")).toBe("K7M2-QX9P");
  });

  it("maps live function error codes to user-friendly messages", () => {
    expect(mapPartnerInviteError("invalid_email")).toBe("Enter a valid email address.");
    expect(mapPartnerInviteError("cannot_invite_self")).toBe("You cannot invite your own account.");
    expect(mapPartnerInviteError("already_linked")).toBe("This account already has an active partner.");
    expect(mapPartnerInviteError("email_not_configured")).toBe("Email delivery is not configured for this project.");
    expect(mapPartnerInviteError("invite_failed")).toBe("We could not create the invitation. Please try again.");
    expect(mapPartnerInviteError("email_failed")).toBe("The invitation could not be emailed. Please try again.");
    expect(mapPartnerInviteError("unauthorized")).toBe("Please sign in again and try the invitation.");
    expect(mapPartnerInviteError("unknown")).toBe("We couldn’t create that invitation. Please try again.");
  });
});

describe("partner code deep link", () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  }

  it("accepts only well-formed codes and formats them", () => {
    expect(parsePartnerCodeParam("k7m2-qx9p")).toBe("K7M2-QX9P");
    expect(parsePartnerCodeParam("K7M2QX9P")).toBe("K7M2-QX9P");
    expect(parsePartnerCodeParam("short")).toBeNull();
    expect(parsePartnerCodeParam("<script>alert(1)</script>")).toBeNull();
    expect(parsePartnerCodeParam(null)).toBeNull();
  });

  it("keeps a pending code until it is used, then clears it", () => {
    const storage = memoryStorage();
    stashPendingPartnerCode("K7M2-QX9P", storage, 1_000);
    expect(readPendingPartnerCode(storage, 2_000)).toBe("K7M2-QX9P");
    clearPendingPartnerCode(storage);
    expect(readPendingPartnerCode(storage, 2_000)).toBeNull();
  });

  it("drops a pending code after it has expired", () => {
    const storage = memoryStorage();
    stashPendingPartnerCode("K7M2-QX9P", storage, 0);
    expect(readPendingPartnerCode(storage, 15 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it("maps accept errors without exposing raw codes", () => {
    expect(mapPartnerAcceptError("invalid_or_expired_code")).toBe("That invite code is invalid or has expired.");
    expect(mapPartnerAcceptError("cannot_accept_own_invite")).toBe("You cannot accept your own invitation.");
    expect(mapPartnerAcceptError("some raw postgres error")).toBe("That invite code could not be accepted. Please try again.");
  });
});

describe("new function error codes", () => {
  it("maps rate limit and lockout codes", () => {
    expect(mapPartnerInviteError("rate_limited")).toContain("try again later");
    expect(mapPartnerAcceptError("too_many_attempts")).toContain("wait an hour");
    expect(mapPartnerAcceptError("something_else")).toBe("That invite code could not be accepted. Please try again.");
  });
});
