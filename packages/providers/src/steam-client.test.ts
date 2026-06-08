import assert from "node:assert/strict";
import test from "node:test";

import { createSteamClient } from "./steam-client.ts";

test("fetches CS2 inventory with Steam's accepted page size", async () => {
  const steamId64 = "76561199570438277";
  const client = createSteamClient({
    fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname === `/inventory/${steamId64}/730/2`) {
        assert.equal(url.searchParams.get("l"), "english");
        assert.equal(url.searchParams.get("count"), "2000");
        return Response.json({
          total_inventory_count: 1,
          assets: [{ classid: "1", instanceid: "0", amount: "1" }],
          descriptions: [
            {
              classid: "1",
              instanceid: "0",
              market_hash_name: "AK-47 | Test",
              marketable: 1,
            },
          ],
        });
      }
      if (url.pathname === "/market/priceoverview/") {
        assert.equal(url.searchParams.get("appid"), "730");
        assert.equal(url.searchParams.get("currency"), "1");
        assert.equal(url.searchParams.get("market_hash_name"), "AK-47 | Test");
        return Response.json({ success: true, lowest_price: "$1.23" });
      }
      assert.fail(`unexpected Steam request ${url.toString()}`);
    },
  });

  const inventory = await client.getCs2InventoryValue(steamId64);

  assert.equal(inventory.accessible, true);
  assert.equal(inventory.itemCount, 1);
  assert.equal(inventory.marketableItemCount, 1);
  assert.equal(inventory.pricedItemCount, 1);
  assert.equal(inventory.estimatedValueCents, 123);
});

test("checks Steam friends for VAC or game bans", async () => {
  const steamId64 = "76561198000000000";
  const friendIds = ["76561198000000001", "76561198000000002", "76561198000000003"];
  const client = createSteamClient({
    apiKey: "test-key",
    baseUrl: "https://steam.test",
    fetch: async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("key"), "test-key");
      if (url.pathname === "/ISteamUser/GetFriendList/v1/") {
        assert.equal(url.searchParams.get("steamid"), steamId64);
        assert.equal(url.searchParams.get("relationship"), "friend");
        return Response.json({
          friendslist: {
            friends: friendIds.map((steamid) => ({ steamid, relationship: "friend" })),
          },
        });
      }
      if (url.pathname === "/ISteamUser/GetPlayerBans/v1/") {
        assert.equal(url.searchParams.get("steamids"), friendIds.join(","));
        return Response.json({
          players: [
            {
              SteamId: friendIds[0],
              CommunityBanned: false,
              VACBanned: false,
              NumberOfVACBans: 0,
              DaysSinceLastBan: 0,
              NumberOfGameBans: 0,
            },
            {
              SteamId: friendIds[1],
              CommunityBanned: false,
              VACBanned: true,
              NumberOfVACBans: 1,
              DaysSinceLastBan: 7,
              NumberOfGameBans: 0,
            },
            {
              SteamId: friendIds[2],
              CommunityBanned: false,
              VACBanned: false,
              NumberOfVACBans: 0,
              DaysSinceLastBan: 12,
              NumberOfGameBans: 1,
            },
          ],
        });
      }
      assert.fail(`unexpected Steam request ${url.toString()}`);
    },
  });

  const stats = await client.getFriendBanStats(steamId64);

  assert.equal(stats.accessible, true);
  assert.equal(stats.friendCount, 3);
  assert.equal(stats.checkedFriendCount, 3);
  assert.equal(stats.bannedFriendCount, 2);
  assert.equal(stats.vacBannedFriendCount, 1);
  assert.equal(stats.gameBannedFriendCount, 1);
});
