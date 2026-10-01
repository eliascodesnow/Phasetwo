import { describe, expect, it } from "vitest";
import { findBellaOfflineReference } from "./bellaOffline";

describe("findBellaOfflineReference", () => {
  it("matches a supported topic and includes an authoritative source", () => {
    expect(findBellaOfflineReference("What is endometriosis?")).toMatchObject({
      id: "endometriosis",
      source: { url: "https://www.who.int/news-room/fact-sheets/detail/endometriosis" },
    });
  });

  it("prioritizes urgent safety guidance over other keyword matches", () => {
    expect(findBellaOfflineReference("I have sudden severe pain and need help with my cycle")).toMatchObject({
      id: "urgent-care",
      text: expect.stringContaining("urgent medical attention"),
    });
  });

  it("returns no answer for unsupported topics", () => {
    expect(findBellaOfflineReference("What is the weather tomorrow?")).toBeUndefined();
  });
});