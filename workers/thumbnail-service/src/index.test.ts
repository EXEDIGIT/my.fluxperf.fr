import { describe, expect, it } from "vitest";
import { isCaptureUrlAllowed, isStateStale } from "./index";

describe("thumbnail worker guards", () => {
  it("accepts the configured domain and its subdomains", () => {
    expect(isCaptureUrlAllowed("https://www.hbint.com", "hbint.com")).toBe(true);
    expect(isCaptureUrlAllowed("https://trial.hbint.com", "hbint.com")).toBe(true);
  });

  it("rejects private, local and mismatched capture targets", () => {
    expect(isCaptureUrlAllowed("http://localhost:5173", "localhost")).toBe(false);
    expect(isCaptureUrlAllowed("https://127.0.0.1", "127.0.0.1")).toBe(false);
    expect(isCaptureUrlAllowed("https://192.168.1.20", "192.168.1.20")).toBe(false);
    expect(isCaptureUrlAllowed("https://example.com", "hbint.com")).toBe(false);
    expect(isCaptureUrlAllowed("data:text/html,hello", "hbint.com")).toBe(false);
  });

  it("detects missing, changed or expired states", () => {
    const now = Date.parse("2026-07-18T12:00:00.000Z");
    const staleAfterMs = 7 * 24 * 60 * 60 * 1000;

    expect(isStateStale(null, "hash", now, staleAfterMs)).toBe(true);
    expect(
      isStateStale(
        {
          solutionId: "SOL-0001",
          status: "ready",
          capturedAt: "2026-07-18T10:00:00.000Z",
          sourceUrlHash: "other"
        },
        "hash",
        now,
        staleAfterMs
      )
    ).toBe(true);
    expect(
      isStateStale(
        {
          solutionId: "SOL-0001",
          status: "ready",
          capturedAt: "2026-07-10T10:00:00.000Z",
          sourceUrlHash: "hash"
        },
        "hash",
        now,
        staleAfterMs
      )
    ).toBe(true);
    expect(
      isStateStale(
        {
          solutionId: "SOL-0001",
          status: "ready",
          capturedAt: "2026-07-18T10:00:00.000Z",
          sourceUrlHash: "hash"
        },
        "hash",
        now,
        staleAfterMs
      )
    ).toBe(false);
  });
});
