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

test("signed-in report weighting only represents cheating accusations", () => {
  const report = scoreReport("76561198000000000", [], 1);

  assert.equal(report.score, 2);
  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.value, signal.weight]),
    [["signed_in_accusations", "1 active signed-in cheating accusation(s)", 2]],
  );
});

test("rage-level public stats cross the cheating threshold", () => {
  const steamId64 = "76561198812139914";
  const report = scoreReport(
    steamId64,
    [
      {
        provider: "csstats",
        fetchStatus: "success",
        rawPayload: {
          steamId64,
          profileUrl: `https://csgostats.gg/player/${steamId64}`,
          statsUrl: `https://csgostats.gg/player/${steamId64}/stats`,
          premierRating: 26_713,
          bestPremierRating: 26_713,
          hasFaceit: true,
          kdRatio: 13.12,
          hltvRating: 3.41,
          matches: 27,
          winRate: 85,
          hsPercentage: 89,
          adr: 225,
          clutchPercentage: 70,
          premierRatings: [],
          competitiveRanks: [],
          recentResults: [],
          mostPlayedMap: "cs_office",
          wingman: null,
        },
      },
      {
        provider: "leetify",
        fetchStatus: "success",
        rawPayload: {
          steam64Id: steamId64,
          rating: 23.12,
          recentGameRatings: {
            aim: 99.96,
          },
        },
      },
    ] as never,
    0,
  );

  assert.equal(report.verdict, "likely_cheating");
  assert.equal(
    report.signals.some((signal) => signal.signal === "csstats_rage_statline"),
    true,
  );
  assert.equal(
    report.signals.some((signal) => signal.signal === "leetify_rage_rating"),
    true,
  );
});

test("FACEIT ESEA membership reduces cheating score", () => {
  const report = scoreReport(
    "76561198000000001",
    [
      {
        provider: "faceit",
        fetchStatus: "success",
        rawPayload: {
          found: true,
          faceitUrl: "https://www.faceit.com/en/players/pro",
          hasEsea: true,
          hasPremium: true,
        },
      },
      {
        provider: "csstats",
        fetchStatus: "success",
        rawPayload: {
          steamId64: "76561198000000001",
          profileUrl: "https://csgostats.gg/player/76561198000000001",
          statsUrl: "https://csgostats.gg/player/76561198000000001/stats",
          matches: 25,
          hltvRating: 2.6,
          kdRatio: 5.1,
          adr: 151,
          premierRatings: [],
        },
      },
    ],
    0,
  );

  assert.equal(report.score, 27);
  assert.equal(report.verdict, "likely_not_cheating");
  assert.ok(report.signals.some((signal) => signal.signal === "faceit_esea_member"));
});

test("stale FACEIT activity is low-weight suspicion", () => {
  const report = scoreReport(
    "76561198000000002",
    [
      {
        provider: "faceit",
        fetchStatus: "success",
        rawPayload: {
          found: true,
          faceitUrl: "https://www.faceit.com/en/players/stale",
          lastPlayedAt: "2024-05-05T00:00:00.000Z",
          hasEsea: false,
          hasPremium: false,
        },
      },
    ],
    0,
  );

  assert.equal(report.score, 5);
  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.weight, signal.confidence]),
    [["faceit_inactive_over_one_year", 5, "low"]],
  );
});

test("banned Steam friends are low-confidence evidence", () => {
  const report = scoreReport(
    "76561198000000003",
    [
      {
        provider: "steam_friends",
        fetchStatus: "success",
        rawPayload: {
          accessible: true,
          friendCount: 10,
          checkedFriendCount: 10,
          bannedFriendCount: 3,
          vacBannedFriendCount: 2,
          gameBannedFriendCount: 1,
        },
      },
    ],
    0,
  );

  assert.equal(report.score, 6);
  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.weight, signal.confidence]),
    [["steam_banned_friends", 6, "low"]],
  );
});
