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

  it("matches more specific education topics over generic cycle terms", () => {
    expect(findBellaOfflineReference("What is PCOS?")?.id).toBe("pcos");
    expect(findBellaOfflineReference("Could I have PCOS?")?.id).toBe("diagnosis");
    expect(findBellaOfflineReference("What is PMDD?")?.id).toBe("pmdd");
    expect(findBellaOfflineReference("Why are my periods irregular?")?.id).toBe("irregular-periods");
    expect(findBellaOfflineReference("What are uterine fibroids?")?.id).toBe("fibroids");
    expect(findBellaOfflineReference("How does the menstrual cycle work?")?.id).toBe("menstrual-cycle");
  });

  it("returns no answer for unsupported topics", () => {
    expect(findBellaOfflineReference("What is the weather tomorrow?")).toBeUndefined();
  });
});