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

export type SteamClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export type SteamPlayerSummary = {
  steamId64: string;
  personaName: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  visibilityState: number | null;
};

export type SteamBanState = {
  steamId64: string;
  communityBanned: boolean;
  vacBanned: boolean;
  vacBanCount: number;
  daysSinceLastBan: number;
  gameBanCount: number;
};

export function createSteamClient(config: SteamClientConfig) {
  const baseUrl = config.baseUrl ?? "https://api.steampowered.com";
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
      };
    },

    async getBanState(steamId64: string): Promise<SteamBanState | null> {
      const url = new URL("/ISteamUser/GetPlayerBans/v1/", baseUrl);
      url.searchParams.set("key", requireApiKey());
      url.searchParams.set("steamids", steamId64);
      const payload = banResponseSchema.parse(await getJson(url));
      const player = payload.players[0];
      if (!player) {
        return null;
      }
      return {
        steamId64: player.SteamId,
        communityBanned: player.CommunityBanned,
        vacBanned: player.VACBanned,
        vacBanCount: player.NumberOfVACBans,
        daysSinceLastBan: player.DaysSinceLastBan,
        gameBanCount: player.NumberOfGameBans,
      };
    },
  };
}
