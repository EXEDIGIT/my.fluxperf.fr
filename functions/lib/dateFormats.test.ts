import { describe, expect, it } from "vitest";
import { formatCompactFrenchDate, formatFrenchDate } from "./dateFormats";

describe("date format helpers", () => {
  it("formats dates with the Paris timezone", () => {
    const lateUtcDate = new Date("2026-07-16T22:30:00.000Z");

    expect(formatFrenchDate(lateUtcDate)).toBe("17/07/2026");
    expect(formatCompactFrenchDate(lateUtcDate)).toBe("17072026");
  });
});
