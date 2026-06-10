import assert from "node:assert/strict";
import test from "node:test";

import { scoreReport } from "./scoring.ts";

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

test("recent FACEIT cheating ban is high-confidence evidence", () => {
  const recentBanDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const report = scoreReport(
    "76561198000000003",
    [
      {
        provider: "faceit",
        fetchStatus: "success",
        rawPayload: {
          found: true,
          faceitUrl: "https://www.faceit.com/en/players/banned",
          latestBan: {
            reason: "cheating",
            startsAt: recentBanDate,
          },
        },
      },
    ],
    0,
  );

  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.weight, signal.confidence]),
    [["faceit_recent_cheating_ban", 25, "high"]],
  );
});

test("older FACEIT ban history is moderate evidence", () => {
  const report = scoreReport(
    "76561198000000004",
    [
      {
        provider: "faceit",
        fetchStatus: "success",
        rawPayload: {
          found: true,
          faceitUrl: "https://www.faceit.com/en/players/old-banned",
          latestBan: {
            reason: "cheating",
            startsAt: "2019-04-01T00:00:00.000Z",
          },
        },
      },
    ],
    0,
  );

  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.weight, signal.confidence]),
    [["faceit_ban_history", 15, "medium"]],
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

test("private Steam profile and inventory are low-weight standalone signals", () => {
  const report = scoreReport(
    "76561198000000004",
    [
      {
        provider: "steam",
        fetchStatus: "success",
        rawPayload: {
          steamId64: "76561198000000004",
          profileUrl: "https://steamcommunity.com/profiles/76561198000000004",
          visibilityState: 1,
        },
      },
      {
        provider: "steam_inventory",
        fetchStatus: "success",
        rawPayload: {
          accessible: false,
          itemCount: null,
          marketableItemCount: null,
          pricedItemCount: 0,
          currency: "USD",
          estimatedValueCents: null,
        },
      },
    ] as never,
    0,
  );

  assert.equal(report.score, 10);
  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.weight, signal.confidence]),
    [
      ["steam_private_profile", 5, "low"],
      ["steam_private_inventory", 5, "low"],
    ],
  );
});

test("private profile, private inventory, and no FACEIT form a medium aggregate signal", () => {
  const report = scoreReport(
    "76561198000000007",
    [
      {
        provider: "steam",
        fetchStatus: "success",
        rawPayload: {
          steamId64: "76561198000000007",
          profileUrl: "https://steamcommunity.com/profiles/76561198000000007",
          visibilityState: 1,
        },
      },
      {
        provider: "steam_inventory",
        fetchStatus: "success",
        rawPayload: {
          accessible: false,
          itemCount: null,
          marketableItemCount: null,
          pricedItemCount: 0,
          currency: "USD",
          estimatedValueCents: null,
        },
      },
      {
        provider: "faceit",
        fetchStatus: "success",
        rawPayload: {
          found: false,
          faceitUrl: null,
        },
      },
    ] as never,
    0,
  );

  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.weight, signal.confidence]),
    [
      ["steam_private_profile", 5, "low"],
      ["steam_private_inventory", 5, "low"],
      ["no_faceit_account", 5, "low"],
      ["hidden_profile_no_faceit_cluster", 15, "medium"],
    ],
  );
});

test("missing FACEIT account is a low-weight signal", () => {
  const report = scoreReport(
    "76561198000000005",
    [
      {
        provider: "faceit",
        fetchStatus: "success",
        rawPayload: {
          found: false,
          faceitUrl: null,
        },
      },
    ] as never,
    0,
  );

  assert.equal(report.score, 5);
  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.weight, signal.confidence]),
    [["no_faceit_account", 5, "low"]],
  );
});

test("high aim with low Premier and no FACEIT is a high-confidence interop signal", () => {
  const steamId64 = "76561198000000006";
  const report = scoreReport(
    steamId64,
    [
      {
        provider: "faceit",
        fetchStatus: "success",
        rawPayload: {
          found: false,
          faceitUrl: null,
        },
      },
      {
        provider: "csstats",
        fetchStatus: "success",
        rawPayload: {
          steamId64,
          profileUrl: `https://csgostats.gg/player/${steamId64}`,
          statsUrl: `https://csgostats.gg/player/${steamId64}/stats`,
          premierRating: 8_500,
          hasFaceit: false,
          premierRatings: [{ season: 4, latestRating: 8_500, bestRating: 8_800, wins: 16 }],
        },
      },
      {
        provider: "leetify",
        fetchStatus: "success",
        rawPayload: {
          steam64Id: steamId64,
          recentGameRatings: {
            aim: 91.2,
          },
        },
      },
    ] as never,
    0,
  );

  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.weight, signal.confidence]),
    [
      ["no_faceit_account", 5, "low"],
      ["high_aim_low_premier_no_faceit", 25, "high"],
    ],
  );
});

test("high aim with low Premier and no FACEIT ignores placement-only Premier volume", () => {
  const steamId64 = "76561198000000009";
  const report = scoreReport(
    steamId64,
    [
      {
        provider: "faceit",
        fetchStatus: "success",
        rawPayload: {
          found: false,
          faceitUrl: null,
        },
      },
      {
        provider: "csstats",
        fetchStatus: "success",
        rawPayload: {
          steamId64,
          profileUrl: `https://csgostats.gg/player/${steamId64}`,
          statsUrl: `https://csgostats.gg/player/${steamId64}/stats`,
          premierRating: 8_500,
          hasFaceit: false,
          premierRatings: [{ season: 4, latestRating: 8_500, bestRating: 8_800, wins: 10 }],
        },
      },
      {
        provider: "leetify",
        fetchStatus: "success",
        rawPayload: {
          steam64Id: steamId64,
          recentGameRatings: {
            aim: 91.2,
          },
        },
      },
    ] as never,
    0,
  );

  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.weight, signal.confidence]),
    [["no_faceit_account", 5, "low"]],
  );
});

test("extreme aim with no FACEIT is a high signal", () => {
  const steamId64 = "76561198000000010";
  const report = scoreReport(
    steamId64,
    [
      {
        provider: "faceit",
        fetchStatus: "success",
        rawPayload: {
          found: false,
          faceitUrl: null,
        },
      },
      {
        provider: "leetify",
        fetchStatus: "success",
        rawPayload: {
          steam64Id: steamId64,
          recentGameRatings: {
            aim: 96.4,
          },
        },
      },
    ] as never,
    0,
  );

  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.weight, signal.confidence]),
    [
      ["no_faceit_account", 5, "low"],
      ["leetify_extreme_aim", 15, "high"],
      ["leetify_extreme_aim_no_faceit", 20, "high"],
    ],
  );
});

test("competitive map rank volatility is a medium signal", () => {
  const steamId64 = "76561198000000008";
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
          premierRatings: [],
          competitiveRanks: [
            { map: "de_mirage", latestRank: 5, bestRank: 12, wins: 30 },
            { map: "de_nuke", latestRank: 9, bestRank: 12, wins: 30 },
          ],
        },
      },
    ] as never,
    0,
  );

  assert.deepEqual(
    report.signals.map((signal) => [signal.signal, signal.value, signal.weight, signal.confidence]),
    [["csstats_map_rank_volatility", "de_mirage: 5 to 12", 10, "medium"]],
  );
});
