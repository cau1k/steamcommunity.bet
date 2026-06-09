import assert from "node:assert/strict";
import test from "node:test";

import { buildLeetifyProfileStats, createLeetifyClient } from "./leetify-client.ts";

test("treats Leetify profile 404 as no registered account", async () => {
  const steamId64 = "76561198000000000";
  const client = createLeetifyClient({
    fetch: async () => new Response("not found", { status: 404 }),
  });

  const profile = await client.getProfile(steamId64);

  assert.equal(profile.steam64Id, steamId64);
  assert.equal(profile.leetifyUserId, null);
  assert.equal(profile.isLeetifyUser, false);
  assert.equal(profile.rating, null);
});

test("parses full Leetify public profile stats", async () => {
  const steamId64 = "76561198055756106";
  const client = createLeetifyClient({
    baseUrl: "https://leetify.test",
    fetch: async (input) => {
      assert.equal(String(input), `https://leetify.test/api/profile/id/${steamId64}`);
      return Response.json({
        meta: {
          name: "Piewhat",
          steam64Id: steamId64,
          faceitNickname: "piewhat",
        },
        recentGameRatings: {
          gamesPlayed: 3,
          leetify: 0.0817,
          aim: 69.4,
          utility: 78,
          positioning: 72.5,
          opening: 0.0415,
          tLeetify: 0.0651,
          ctLeetify: 0.1001,
          clutch: 0.1707,
        },
        games: [
          {
            gameFinishedAt: "2026-06-08T03:14:34.000Z",
            isCs2: true,
            dataSource: "matchmaking_competitive",
            mapName: "de_cache",
            matchResult: "win",
            rankType: 12,
            skillLevel: 13,
            kills: 30,
            deaths: 14,
            accuracyHead: 0.1132,
            preaim: 11.223,
            reactionTime: 0.6563,
          },
          {
            gameFinishedAt: "2026-06-07T03:14:34.000Z",
            isCs2: true,
            dataSource: "matchmaking_competitive",
            mapName: "de_dust2",
            matchResult: "loss",
            rankType: 12,
            skillLevel: 11,
            kills: 22,
            deaths: 15,
            accuracyHead: 0.2192,
            preaim: 10.834,
            reactionTime: 0.6012,
          },
          {
            gameFinishedAt: "2026-01-17T21:24:41.000Z",
            isCs2: true,
            dataSource: "matchmaking",
            mapName: "de_overpass",
            matchResult: "win",
            rankType: 11,
            skillLevel: 23695,
            kills: 20,
            deaths: 10,
            accuracyHead: 0.2,
            preaim: 9.494,
            reactionTime: 0.5121,
          },
        ],
      });
    },
  });

  const profile = await client.getProfile(steamId64);
  const stats = buildLeetifyProfileStats(steamId64, profile);

  assert.equal(profile.rating, 8.17);
  assert.equal(stats?.name, "Piewhat");
  assert.equal(stats?.hasFaceit, true);
  assert.equal(stats?.aim, 69.4);
  assert.equal(stats?.hsPercentage, 18);
  assert.equal(stats?.timeToDamage, 590);
  assert.equal(stats?.crosshairPlacement, 10.52);
  assert.equal(stats?.premierRating, 23695);
  assert.equal(stats?.bestPremierRating, 23695);
  assert.equal(stats?.competitiveRanks[0]?.map, "Cache");
  assert.equal(stats?.competitiveRanks[0]?.latestRank, 13);
  assert.equal(stats?.bestRating, 8.17);
  assert.equal(stats?.recentResults.join(""), "WLW");
});

test("treats zero Leetify combat timing metrics as missing", () => {
  const steamId64 = "76561198003732047";
  const stats = buildLeetifyProfileStats(steamId64, {
    steam64Id: steamId64,
    recentGameRatings: {
      aim: 94.06,
      timeToDamage: 0,
      crosshairPlacement: 0,
    },
    games: [
      {
        isCs2: true,
        dataSource: "matchmaking",
        accuracyHead: 0,
        reactionTime: 0,
        preaim: 0,
      },
    ],
  });

  assert.equal(stats?.aim, 94.06);
  assert.equal(stats?.hsPercentage, null);
  assert.equal(stats?.timeToDamage, null);
  assert.equal(stats?.crosshairPlacement, null);
});
