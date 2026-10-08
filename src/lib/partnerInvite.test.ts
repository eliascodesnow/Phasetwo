import { describe, expect, it } from "vitest";
import { formatInviteCode, mapPartnerInviteError } from "./partnerInvite";

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
