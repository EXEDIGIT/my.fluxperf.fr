import { describe, expect, it } from "vitest";
import { getAdminEmails, isAdminEmail } from "./adminAuth";

describe("admin auth helpers", () => {
  it("normalizes the configured admin emails", () => {
    expect(getAdminEmails({ APP_ENV: "production", ADMIN_EMAILS: "TRISTAN@FLUXPERF.FR, david@fluxperf.fr" })).toEqual([
      "tristan@fluxperf.fr",
      "david@fluxperf.fr"
    ]);
  });

  it("does not allow a dev fallback in production", () => {
    expect(getAdminEmails({ APP_ENV: "production", DEV_ADMIN_EMAIL: "dev@fluxperf.fr" })).toEqual([]);
  });

  it("accepts the local dev admin fallback outside production", () => {
    expect(isAdminEmail("DEV@FLUXPERF.FR", { APP_ENV: "development", DEV_ADMIN_EMAIL: "dev@fluxperf.fr" })).toBe(
      true
    );
  });
});
