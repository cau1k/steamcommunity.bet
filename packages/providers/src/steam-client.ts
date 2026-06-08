import { z } from "zod";

const steamResponseSchema = z.object({
  response: z.object({
    players: z.array(
      z.object({
        steamid: z.string(),
        personaname: z.string().optional(),
        profileurl: z.string().optional(),
        avatarfull: z.string().optional(),
        communityvisibilitystate: z.number().optional(),
        timecreated: z.number().optional(),
      }),
    ),
  }),
});

const vanityResponseSchema = z.object({
  response: z.object({
    success: z.number(),
    steamid: z.string().optional(),
    message: z.string().optional(),
  }),
});

const banResponseSchema = z.object({
  players: z.array(
    z.object({
      SteamId: z.string(),
      CommunityBanned: z.boolean(),
      VACBanned: z.boolean(),
      NumberOfVACBans: z.number(),
      DaysSinceLastBan: z.number(),
      NumberOfGameBans: z.number(),
    }),
  ),
});

const steamLevelResponseSchema = z.object({
  response: z.object({
    player_level: z.number().nullable().optional(),
  }),
});

const friendListResponseSchema = z.object({
  friendslist: z.object({
    friends: z.array(
      z.object({
        steamid: z.string(),
        relationship: z.string().optional(),
        friend_since: z.number().optional(),
      }),
    ),
  }),
});

const inventoryResponseSchema = z
  .object({
    total_inventory_count: z.number().optional(),
    descriptions: z
      .array(
        z
          .object({
            market_hash_name: z.string().optional(),
            marketable: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
    assets: z
      .array(
        z
          .object({
            classid: z.string(),
            instanceid: z.string(),
            amount: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const priceOverviewSchema = z
  .object({
    success: z.boolean().optional(),
    lowest_price: z.string().optional(),
    median_price: z.string().optional(),
  })
  .passthrough();

export type SteamClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  communityBaseUrl?: string;
  marketBaseUrl?: string;
  fetch?: typeof fetch;
};

export type SteamPlayerSummary = {
  steamId64: string;
  personaName: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  visibilityState: number | null;
  createdAt: string | null;
  level: number | null;
};

export type SteamBanState = {
  steamId64: string;
  communityBanned: boolean;
  vacBanned: boolean;
  vacBanCount: number;
  daysSinceLastBan: number;
  gameBanCount: number;
};

export type SteamInventoryValue = {
  steamId64: string;
  appId: 730;
  contextId: "2";
  accessible: boolean;
  itemCount: number | null;
  marketableItemCount: number | null;
  pricedItemCount: number;
  currency: "USD";
  estimatedValueCents: number | null;
};

export type SteamFriendBanStats = {
  steamId64: string;
  accessible: boolean;
  friendCount: number | null;
  checkedFriendCount: number;
  bannedFriendCount: number;
  vacBannedFriendCount: number;
  gameBannedFriendCount: number;
};

export function createSteamClient(config: SteamClientConfig) {
  const baseUrl = config.baseUrl ?? "https://api.steampowered.com";
  const communityBaseUrl = config.communityBaseUrl ?? "https://steamcommunity.com";
  const marketBaseUrl = config.marketBaseUrl ?? "https://steamcommunity.com";
  const fetchImpl = config.fetch ?? fetch;

  function requireApiKey() {
    if (!config.apiKey) {
      throw new Error("STEAM_API_KEY is required for Steam provider calls");
    }
    return config.apiKey;
  }

  async function getJson(url: URL) {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Steam request failed: ${response.status}`);
    }
    return response.json();
  }

  async function getSteamLevel(steamId64: string): Promise<number | null> {
    const url = new URL("/IPlayerService/GetSteamLevel/v1/", baseUrl);
    url.searchParams.set("key", requireApiKey());
    url.searchParams.set("steamid", steamId64);
    const payload = steamLevelResponseSchema.parse(await getJson(url));
    return payload.response.player_level ?? null;
  }

  async function getBanStates(steamIds: string[]): Promise<SteamBanState[]> {
    if (steamIds.length === 0) {
      return [];
    }
    const url = new URL("/ISteamUser/GetPlayerBans/v1/", baseUrl);
    url.searchParams.set("key", requireApiKey());
    url.searchParams.set("steamids", steamIds.join(","));
    const payload = banResponseSchema.parse(await getJson(url));
    return payload.players.map((player) => ({
      steamId64: player.SteamId,
      communityBanned: player.CommunityBanned,
      vacBanned: player.VACBanned,
      vacBanCount: player.NumberOfVACBans,
      daysSinceLastBan: player.DaysSinceLastBan,
      gameBanCount: player.NumberOfGameBans,
    }));
  }

  return {
    async resolveVanity(vanity: string) {
      const url = new URL("/ISteamUser/ResolveVanityURL/v0001/", baseUrl);
      url.searchParams.set("key", requireApiKey());
      url.searchParams.set("vanityurl", vanity);
      const payload = vanityResponseSchema.parse(await getJson(url));
      if (payload.response.success !== 1 || !payload.response.steamid) {
        return null;
      }
      return payload.response.steamid;
    },

    async getPlayerSummary(steamId64: string): Promise<SteamPlayerSummary | null> {
      const url = new URL("/ISteamUser/GetPlayerSummaries/v0002/", baseUrl);
      url.searchParams.set("key", requireApiKey());
      url.searchParams.set("steamids", steamId64);
      const payload = steamResponseSchema.parse(await getJson(url));
      const player = payload.response.players[0];
      if (!player) {
        return null;
      }
      return {
        steamId64: player.steamid,
        personaName: player.personaname ?? null,
        profileUrl: player.profileurl ?? null,
        avatarUrl: player.avatarfull ?? null,
        visibilityState: player.communityvisibilitystate ?? null,
        createdAt: player.timecreated ? new Date(player.timecreated * 1000).toISOString() : null,
        level: await getSteamLevel(steamId64),
      };
    },

    getSteamLevel,

    async getBanState(steamId64: string): Promise<SteamBanState | null> {
      return (await getBanStates([steamId64]))[0] ?? null;
    },

    async getFriendBanStats(steamId64: string): Promise<SteamFriendBanStats> {
      const friendListUrl = new URL("/ISteamUser/GetFriendList/v1/", baseUrl);
      friendListUrl.searchParams.set("key", requireApiKey());
      friendListUrl.searchParams.set("steamid", steamId64);
      friendListUrl.searchParams.set("relationship", "friend");
      const response = await fetchImpl(friendListUrl);
      if ([401, 403, 404].includes(response.status)) {
        return missingFriendBanStats(steamId64);
      }
      if (!response.ok) {
        throw new Error(`Steam friends request failed: ${response.status}`);
      }

      const friends = friendListResponseSchema.parse(await response.json()).friendslist.friends;
      const friendIds = friends.map((friend) => friend.steamid);
      const banStates = (
        await Promise.all(
          chunks(friendIds.slice(0, 500), 100).map((steamIds) => getBanStates(steamIds)),
        )
      ).flat();
      return {
        steamId64,
        accessible: true,
        friendCount: friendIds.length,
        checkedFriendCount: banStates.length,
        bannedFriendCount: banStates.filter(
          (banState) => banState.vacBanned || banState.gameBanCount > 0,
        ).length,
        vacBannedFriendCount: banStates.filter((banState) => banState.vacBanned).length,
        gameBannedFriendCount: banStates.filter((banState) => banState.gameBanCount > 0).length,
      };
    },

    async getCs2InventoryValue(steamId64: string): Promise<SteamInventoryValue> {
      const inventoryUrl = new URL(`/inventory/${steamId64}/730/2`, communityBaseUrl);
      inventoryUrl.searchParams.set("l", "english");
      inventoryUrl.searchParams.set("count", "2000");
      const response = await fetchImpl(inventoryUrl);
      if ([400, 401, 403, 404].includes(response.status)) {
        return missingInventoryValue(steamId64);
      }
      if (!response.ok) {
        throw new Error(`Steam inventory request failed: ${response.status}`);
      }

      const inventory = inventoryResponseSchema.parse(await response.json());
      const marketNamesByAssetKey = new Map<string, string>();
      for (const description of inventory.descriptions ?? []) {
        if (!description.market_hash_name || description.marketable !== 1) {
          continue;
        }
        const classid = String(description.classid ?? "");
        const instanceid = String(description.instanceid ?? "0");
        marketNamesByAssetKey.set(`${classid}:${instanceid}`, description.market_hash_name);
      }

      const itemAmounts = new Map<string, number>();
      for (const asset of inventory.assets ?? []) {
        const marketName = marketNamesByAssetKey.get(`${asset.classid}:${asset.instanceid}`);
        if (!marketName) {
          continue;
        }
        itemAmounts.set(marketName, (itemAmounts.get(marketName) ?? 0) + Number(asset.amount ?? 1));
      }

      let estimatedValueCents = 0;
      let pricedItemCount = 0;
      for (const [marketName, amount] of [...itemAmounts.entries()].slice(0, 80)) {
        const price = await getMarketPriceCents(marketName);
        if (price === null) {
          continue;
        }
        pricedItemCount += amount;
        estimatedValueCents += price * amount;
      }

      return {
        steamId64,
        appId: 730,
        contextId: "2",
        accessible: true,
        itemCount: inventory.total_inventory_count ?? inventory.assets?.length ?? null,
        marketableItemCount: [...itemAmounts.values()].reduce((total, amount) => total + amount, 0),
        pricedItemCount,
        currency: "USD",
        estimatedValueCents: pricedItemCount > 0 ? estimatedValueCents : null,
      };
    },
  };

  async function getMarketPriceCents(marketHashName: string) {
    const url = new URL("/market/priceoverview/", marketBaseUrl);
    url.searchParams.set("appid", "730");
    url.searchParams.set("currency", "1");
    url.searchParams.set("market_hash_name", marketHashName);
    const response = await fetchImpl(url);
    if (!response.ok) {
      return null;
    }
    const payload = priceOverviewSchema.parse(await response.json());
    return priceTextToCents(payload.lowest_price ?? payload.median_price ?? null);
  }
}

function missingInventoryValue(steamId64: string): SteamInventoryValue {
  return {
    steamId64,
    appId: 730,
    contextId: "2",
    accessible: false,
    itemCount: null,
    marketableItemCount: null,
    pricedItemCount: 0,
    currency: "USD",
    estimatedValueCents: null,
  };
}

function missingFriendBanStats(steamId64: string): SteamFriendBanStats {
  return {
    steamId64,
    accessible: false,
    friendCount: null,
    checkedFriendCount: 0,
    bannedFriendCount: 0,
    vacBannedFriendCount: 0,
    gameBannedFriendCount: 0,
  };
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function priceTextToCents(value: string | null) {
  if (!value) {
    return null;
  }
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}
