import { describe, expect, it } from "vitest";
import { buildInviteLink, DEFAULT_APP_URL, escapeHtml, normalizeAppUrl, renderInviteEmail, resolveInviterName } from "./partnerInvite";

describe("resolveInviterName", () => {
  it("prefers the profile name, then app display name, then account metadata", () => {
    expect(resolveInviterName({ profileDisplayName: "Natalie", appDisplayName: "Nat" })).toBe("Natalie");
    expect(resolveInviterName({ profileDisplayName: "  ", appDisplayName: "Nat" })).toBe("Nat");
    expect(resolveInviterName({ metadataName: "Natalie K" })).toBe("Natalie K");
  });
  it("ignores generic labels and falls back only when nothing usable exists", () => {
    expect(resolveInviterName({ ownerLabel: "Her" })).toBe("Someone");
    expect(resolveInviterName({ ownerLabel: "Partner", appDisplayName: "Amy" })).toBe("Amy");
    expect(resolveInviterName({})).toBe("Someone");
  });
  it("strips markup and control characters", () => {
    expect(resolveInviterName({ profileDisplayName: "<b>Amy</b>\nEvil" })).toBe("b Amy /b Evil");
  });
});

describe("invite link and email", () => {
  it("builds a deep link to the partner code section", () => {
    expect(buildInviteLink("https://phasetwo.space/", "K7M2-QX9P")).toBe("https://phasetwo.space/?partnerCode=K7M2-QX9P");
    expect(normalizeAppUrl("not a url")).toBe(DEFAULT_APP_URL);
    expect(normalizeAppUrl("javascript:alert(1)")).toBe(DEFAULT_APP_URL);
  });
  it("names the sender, includes the link and code, and escapes HTML", () => {
    const email = renderInviteEmail({ inviter: "Amy <x>", code: "K7M2-QX9P", link: "https://phasetwo.space/?partnerCode=K7M2-QX9P" });
    expect(email.subject).toBe("Amy x invited you to PhaseTwo");
    expect(email.html).toContain("Amy &lt;x&gt; invited you to PhaseTwo");
    expect(email.html).toContain('href="https://phasetwo.space/?partnerCode=K7M2-QX9P"');
    expect(email.html).toContain("K7M2-QX9P");
    expect(email.text).toContain("https://phasetwo.space/?partnerCode=K7M2-QX9P");
    expect(email.html.toLowerCase()).not.toContain("someone");
  });
  it("escapes quotes", () => {
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
  });
});
