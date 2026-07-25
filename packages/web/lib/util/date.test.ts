import { formatDate } from "@/lib/util/date";

describe("formatDate", () => {
  it("formats an ISO date as a long US date", () => {
    expect(formatDate("2026-07-24T00:00:00.000Z")).toBe("July 24, 2026");
  });

  it("formats in UTC regardless of the time of day", () => {
    // 02:00 UTC must not roll back to the previous day for western zones.
    expect(formatDate("2026-01-01T02:00:00.000Z")).toBe("January 1, 2026");
  });

  it("handles a plain midnight-UTC date (what a date input produces)", () => {
    expect(formatDate("2026-12-25T00:00:00.000Z")).toBe("December 25, 2026");
  });
});
