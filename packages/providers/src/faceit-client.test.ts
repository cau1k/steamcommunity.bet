import assert from "node:assert/strict";
import test from "node:test";

import { createFaceitClient } from "./faceit-client.ts";

test("looks up FACEIT profile by Steam id", async () => {
  const steamId64 = "76561198055756106";
  const client = createFaceitClient({
    apiKey: "test-key",
    baseUrl: "https://faceit.test/data/v4",
    fetch: async (input, init) => {
      assert.equal(
        String(input),
        `https://faceit.test/data/v4/players?game=cs2&game_player_id=${steamId64}`,
      );
      assert.ok(init);
      assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-key");
      return Response.json({
        player_id: "faceit-player-id",
        nickname: "piewhat",
        avatar: "https://faceit.test/avatar.png",
        country: "us",
        faceit_url: "https://www.faceit.com/en/players/piewhat",
        games: {
          cs2: {
            faceit_elo: 2401,
            game_player_id: steamId64,
            game_player_name: "Piewhat",
            skill_level: 10,
          },
        },
      });
    },
  });

  const profile = await client.getProfileBySteamId(steamId64);

  assert.equal(profile.found, true);
  assert.equal(profile.nickname, "piewhat");
  assert.equal(profile.faceitUrl, "https://www.faceit.com/en/players/piewhat");
  assert.equal(profile.skillLevel, 10);
  assert.equal(profile.elo, 2401);
});

test("treats FACEIT 404 as checked missing account", async () => {
  const steamId64 = "76561198000000000";
  const client = createFaceitClient({
    apiKey: "test-key",
    fetch: async () => new Response("not found", { status: 404 }),
  });

  const profile = await client.getProfileBySteamId(steamId64);

  assert.equal(profile.steamId64, steamId64);
  assert.equal(profile.found, false);
  assert.equal(profile.nickname, null);
});

test("requires FACEIT API key", async () => {
  const client = createFaceitClient();
  await assert.rejects(
    () => client.getProfileBySteamId("76561198000000000"),
    /FACEIT_API_KEY is required/,
  );
});
