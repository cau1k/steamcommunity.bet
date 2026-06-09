import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSteamProfileInput, parseSteamId64 } from "./steam-profile-input.ts";

test("normalizes Steam profile URLs and .bet mirror URLs", () => {
  assert.deepEqual(normalizeSteamProfileInput("https://steamcommunity.com/id/caulkenstein"), {
    steamId64: null,
    sourcePath: "/id/caulkenstein",
    vanity: "caulkenstein",
  });
  assert.deepEqual(normalizeSteamProfileInput("https://steamcommunity.bet/id/caulkenstein"), {
    steamId64: null,
    sourcePath: "/id/caulkenstein",
    vanity: "caulkenstein",
  });
  assert.deepEqual(normalizeSteamProfileInput("/id/caulkenstein"), {
    steamId64: null,
    sourcePath: "/id/caulkenstein",
    vanity: "caulkenstein",
  });
  assert.deepEqual(normalizeSteamProfileInput("steamcommunity.com/profiles/76561199570438277"), {
    steamId64: "76561199570438277",
    sourcePath: "/profiles/76561199570438277",
    vanity: null,
  });
});

test("normalizes raw Steam ID formats", () => {
  assert.equal(parseSteamId64("76561199570438277"), "76561199570438277");
  assert.equal(parseSteamId64("STEAM_0:1:123"), "76561197960265975");
  assert.equal(parseSteamId64("[U:1:247]"), "76561197960265975");
  assert.equal(parseSteamId64("247"), "76561197960265975");
});

test("normalizes CSStats and Leetify profile URLs", () => {
  assert.deepEqual(normalizeSteamProfileInput("https://csgostats.gg/player/76561199570438277"), {
    steamId64: "76561199570438277",
    sourcePath: "/profiles/76561199570438277",
    vanity: null,
  });
  assert.deepEqual(
    normalizeSteamProfileInput("https://leetify.com/app/profile/76561199570438277"),
    {
      steamId64: "76561199570438277",
      sourcePath: "/profiles/76561199570438277",
      vanity: null,
    },
  );
});
