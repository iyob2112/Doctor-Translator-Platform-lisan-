import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { secondsWorkedByTranslator } from "./earnings.js";

describe("secondsWorkedByTranslator", () => {
  it("uses the full duration when there is no transfer", () => {
    const session = {
      translatorId: "a",
      durationSeconds: 3600,
      startedAt: "2026-10-08T10:00:00.000Z",
      endedAt: "2026-10-08T11:00:00.000Z",
      transfers: [],
    };
    assert.equal(secondsWorkedByTranslator(session, "a"), 3600);
    assert.equal(secondsWorkedByTranslator(session, "b"), 0);
  });

  it("splits time across a transfer", () => {
    const session = {
      translatorId: "b",
      durationSeconds: 3600,
      startedAt: "2026-10-08T10:00:00.000Z",
      endedAt: "2026-10-08T11:00:00.000Z",
      transfers: [
        {
          fromTranslatorId: "a",
          toTranslatorId: "b",
          transferredAt: "2026-10-08T10:20:00.000Z",
        },
      ],
    };
    assert.equal(secondsWorkedByTranslator(session, "a"), 20 * 60);
    assert.equal(secondsWorkedByTranslator(session, "b"), 40 * 60);
  });
});
