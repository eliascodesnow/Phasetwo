import { describe, expect, it } from "vitest";
import { chunk, constantTimeEqual, isAllowedPushEndpoint } from "./push";

describe("push endpoint allowlist", () => {
  it("accepts real push services", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QabC")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc")).toBe(true);
  });

  it("rejects internal, plain-http, userinfo and look-alike hosts", () => {
    for (const value of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "https://fcm.googleapis.com@evil.example/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evil.example/fcm.googleapis.com",
      "https://fcm.googleapis.com:8443/x",
      "https://storage.googleapis.com/bucket/x",
      "not a url",
      "",
      null,
    ]) expect(isAllowedPushEndpoint(value)).toBe(false);
  });
});

describe("helpers", () => {
  it("compares secrets exactly", () => {
    expect(constantTimeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(constantTimeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(constantTimeEqual("Bearer abc", "Bearer abcd")).toBe(false);
    expect(constantTimeEqual("", "x")).toBe(false);
  });

  it("chunks lists", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
