import assert from "node:assert/strict";
import test from "node:test";

import { createLeetifyClient } from "./leetify-client.ts";

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
