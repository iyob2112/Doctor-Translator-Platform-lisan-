import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addisDate,
  bookingPriceEtb,
  usageAmountEtb,
  deviceLimitReached,
  isSubscriptionActive,
  nextPeriod,
  rangesOverlap,
  renewPeriod,
  slotCovers,
  usageMinutesFromSession,
} from "../utils/billing.js";
import { quoteBookingWindow } from "./bookings.service.js";

describe("subscription periods", () => {
  it("marks a subscription expired after expiresAt", () => {
    const now = new Date("2026-10-04T12:00:00.000Z");
    assert.equal(
      isSubscriptionActive({ status: "active", expiresAt: "2026-10-01T00:00:00.000Z" }, now),
      false
    );
    assert.equal(
      isSubscriptionActive({ status: "active", expiresAt: "2026-10-10T00:00:00.000Z" }, now),
      true
    );
  });

  it("renews from the later of now and current expiry", () => {
    const now = new Date("2026-10-04T00:00:00.000Z");
    const future = renewPeriod("2026-10-20T00:00:00.000Z", 30, now);
    assert.equal(future.startsAt.toISOString(), "2026-10-20T00:00:00.000Z");
    assert.equal(future.expiresAt.toISOString(), "2026-11-19T00:00:00.000Z");
    const lapsed = renewPeriod("2026-09-01T00:00:00.000Z", 30, now);
    assert.equal(lapsed.startsAt.toISOString(), now.toISOString());
  });

  it("creates a 30-day first period", () => {
    const start = new Date("2026-10-04T00:00:00.000Z");
    const period = nextPeriod(start, 30);
    assert.equal(period.expiresAt.toISOString(), "2026-11-03T00:00:00.000Z");
  });
});

describe("device limits", () => {
  it("blocks a new device at the plan cap", () => {
    assert.equal(deviceLimitReached(3, 3, false), true);
    assert.equal(deviceLimitReached(3, 3, true), false);
    assert.equal(deviceLimitReached(2, 3, false), false);
  });
});

describe("minute usage", () => {
  it("converts session duration to billed minutes", () => {
    assert.equal(usageMinutesFromSession(0), 0);
    assert.equal(usageMinutesFromSession(30), 0.5);
    assert.equal(usageMinutesFromSession(180), 3);
  });
});

describe("on-demand usage pricing", () => {
  it("prices per hour without rounding minutes into 36-second chunks", () => {
    assert.equal(usageAmountEtb(400, 3 / 60, "hour"), 0.33);
    assert.equal(usageAmountEtb(400, 20 / 60, "hour"), 2.22);
    assert.equal(usageAmountEtb(400, 1, "hour"), 6.67);
    assert.equal(usageAmountEtb(400, 10, "hour"), 66.67);
    assert.equal(usageAmountEtb(10, 3, "minute"), 30);
  });
});

describe("booking quotes", () => {
  it("prices duration from the hourly catalog rate", () => {
    assert.equal(bookingPriceEtb(400, 180), 1200);
    assert.equal(bookingPriceEtb(500, 60), 500);
  });

  it("rejects past or inverted times", () => {
    assert.throws(() => quoteBookingWindow({ date: "2020-01-01", startTime: "14:00", endTime: "17:00" }));
    assert.throws(() => quoteBookingWindow({ date: "2099-01-08", startTime: "17:00", endTime: "14:00" }));
  });

  it("builds an Addis-time window", () => {
    const quote = quoteBookingWindow({ date: "2099-01-09", startTime: "14:00", endTime: "17:00" });
    assert.equal(quote.durationMinutes, 180);
    assert.equal(quote.startsAt.toISOString(), addisDate(2099, 1, 9, 14, 0).toISOString());
  });

  it("detects overlapping translator slots", () => {
    const a = { startsAt: "2026-10-10T11:00:00.000Z", endsAt: "2026-10-10T14:00:00.000Z" };
    assert.equal(
      rangesOverlap(new Date(a.startsAt), new Date(a.endsAt), new Date("2026-10-10T13:00:00.000Z"), new Date("2026-10-10T15:00:00.000Z")),
      true
    );
    assert.equal(
      rangesOverlap(new Date(a.startsAt), new Date(a.endsAt), new Date("2026-10-10T14:00:00.000Z"), new Date("2026-10-10T16:00:00.000Z")),
      false
    );
  });

  it("requires the window to sit inside an active slot", () => {
    const slot = { weekday: 5, startMinute: 8 * 60, endMinute: 18 * 60, isActive: true };
    assert.equal(slotCovers(slot, 5, 14 * 60, 17 * 60), true);
    assert.equal(slotCovers(slot, 5, 7 * 60, 9 * 60), false);
    assert.equal(slotCovers(slot, 0, 14 * 60, 17 * 60), false);
  });
});
