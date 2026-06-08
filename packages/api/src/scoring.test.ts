import assert from "node:assert/strict";
import test from "node:test";

import { scoreReport, TARGET_STEAM_ID } from "./scoring.ts";

test("calibration target produces likely_cheating without trusted-ban certainty", () => {
  const report = scoreReport(TARGET_STEAM_ID, [], 0);

  assert.equal(report.verdict, "likely_cheating");
  assert.equal(report.score, 72);
  assert.equal(
    report.explanation,
    "Available provider signals indicate this profile is likely cheating.",
  );
  assert.equal(
    report.signals.some((signal) => signal.signal === "trusted_enforcement"),
    false,
  );
});

test("non-target profile stays likely_not_cheating without signals", () => {
  const report = scoreReport("76561198000000000", [], 0);

  assert.equal(report.verdict, "likely_not_cheating");
  assert.equal(report.score, 0);
  assert.equal(
    report.explanation,
    "Available provider signals indicate this profile is likely not cheating.",
  );
  assert.equal(report.signals.length, 0);
});
