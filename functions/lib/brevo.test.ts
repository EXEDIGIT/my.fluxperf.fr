import { describe, expect, it, vi } from "vitest";
import { syncBrevoMarketingContact, unlinkBrevoMarketingContact } from "./brevo";

const env = {
  BREVO_API_KEY: "brevo-secret",
  BREVO_MARKETING_LIST_ID: "42"
};

describe("Brevo marketing contacts", () => {
  it("upserts an eligible contact into the configured list without changing blacklist fields", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 7 }), { status: 201 }));

    const result = await syncBrevoMarketingContact(env, {
      email: "Camille@Example.test",
      firstName: "Camille",
      lastName: "Martin",
      clientId: "CLI-1",
      companyName: "Acme",
      role: "Direction",
      activeServices: ["Site web", "Google Ads"],
      source: "myfluxperf_admin"
    }, fetcher as typeof fetch);

    expect(result).toEqual({ status: "synced", email: "camille@example.test" });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(body).toMatchObject({
      email: "camille@example.test",
      updateEnabled: true,
      listIds: [42],
      attributes: {
        FNAME: "Camille",
        LNAME: "Martin",
        MFP_CLIENT_ID: "CLI-1",
        MFP_COMPANY: "Acme",
        MFP_ROLE: "Direction",
        MFP_ACTIVE_SERVICES: "Site web | Google Ads",
        MFP_SOURCE: "myfluxperf_admin"
      }
    });
    expect(body).not.toHaveProperty("emailBlacklisted");
  });

  it("keeps a creation non-blocking when Brevo rejects the contact", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: "Unknown attribute" }), { status: 400 }));

    const result = await syncBrevoMarketingContact(env, {
      email: "camille@example.test",
      firstName: "Camille",
      lastName: "Martin",
      clientId: "CLI-1",
      companyName: "Acme",
      role: "Direction",
      activeServices: [],
      source: "myfluxperf_admin"
    }, fetcher as typeof fetch);

    expect(result).toEqual({ status: "failed", email: "camille@example.test", reason: "Unknown attribute" });
  });

  it("unlinks a deactivated contact without touching its blacklist status", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

    const result = await unlinkBrevoMarketingContact(env, "camille@example.test", fetcher as typeof fetch);

    expect(result).toEqual({ status: "unlinked", email: "camille@example.test" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/contacts/camille%40example.test");
    expect(JSON.parse(String(init.body))).toEqual({ unlinkListIds: [42] });
  });
});
