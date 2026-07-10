import { describe, expect, it } from "vitest";
import { buildPrefilledJotformUrl, isExternalUrl } from "./url";

describe("Jotform URL helpers", () => {
  it("adds Fluxperf prefill parameters without losing existing query params", () => {
    const url = buildPrefilledJotformUrl("https://form.jotform.com/123456?source=my", {
      clientId: "a2cm",
      company: "A2-CM",
      email: "contact@a2-cm.fr",
      firstName: "Anthony"
    });
    const target = new URL(url);

    expect(target.searchParams.get("source")).toBe("my");
    expect(target.searchParams.get("client_id")).toBe("a2cm");
    expect(target.searchParams.get("company")).toBe("A2-CM");
    expect(target.searchParams.get("email")).toBe("contact@a2-cm.fr");
    expect(target.searchParams.get("first_name")).toBe("Anthony");
  });

  it("detects external URLs", () => {
    expect(isExternalUrl("https://lookerstudio.google.com/reporting/demo")).toBe(true);
    expect(isExternalUrl("/ressources")).toBe(false);
    expect(isExternalUrl(null)).toBe(false);
  });
});
