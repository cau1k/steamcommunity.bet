import { z } from "zod";

const faceitPlayerSchema = z
  .object({
    player_id: z.string(),
    nickname: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    faceit_url: z.string().nullable().optional(),
    games: z
      .object({
        cs2: z
          .object({
            faceit_elo: z.number().nullable().optional(),
            game_player_id: z.string().nullable().optional(),
            game_player_name: z.string().nullable().optional(),
            game_profile_id: z.string().nullable().optional(),
            skill_level: z.number().nullable().optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
        csgo: z
          .object({
            faceit_elo: z.number().nullable().optional(),
            game_player_id: z.string().nullable().optional(),
            game_player_name: z.string().nullable().optional(),
            game_profile_id: z.string().nullable().optional(),
            skill_level: z.number().nullable().optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const faceitHistorySchema = z
  .object({
    items: z
      .array(
        z
          .object({
            finished_at: z.number().nullable().optional(),
            started_at: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type FaceitClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

export type FaceitProfile = {
  steamId64: string;
  found: boolean;
  playerId: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  country: string | null;
  faceitUrl: string | null;
  skillLevel: number | null;
  elo: number | null;
  gamePlayerId: string | null;
  gamePlayerName: string | null;
  lastPlayedAt: string | null;
  lastPlayedGame: "cs2" | "csgo" | null;
};

export function createFaceitClient(config: FaceitClientConfig = {}) {
  const baseUrl = config.baseUrl ?? "https://open.faceit.com/data/v4";
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const fetchImpl = config.fetch ?? fetch;

  function requireApiKey() {
    if (!config.apiKey) {
      throw new Error("FACEIT_API_KEY is required for FACEIT provider calls");
    }
    return config.apiKey;
  }

  async function getLastPlayed(playerId: string) {
    return (
      (await getLastPlayedForGame(playerId, "cs2")) ??
      (await getLastPlayedForGame(playerId, "csgo"))
    );
  }

  async function getLastPlayedForGame(playerId: string, game: "cs2" | "csgo") {
    const url = new URL(`players/${playerId}/history`, normalizedBaseUrl);
    url.searchParams.set("game", game);
    url.searchParams.set("from", "0");
    url.searchParams.set("to", Math.floor(Date.now() / 1000).toString());
    url.searchParams.set("limit", "1");

    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${requireApiKey()}`,
      },
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`FACEIT history request failed: ${response.status}`);
    }
    const payload = faceitHistorySchema.parse(await response.json());
    const latest = payload.items?.[0];
    const timestamp = latest?.finished_at ?? latest?.started_at ?? null;
    return timestamp ? { at: new Date(timestamp * 1000).toISOString(), game } : null;
  }

  return {
    async getProfileBySteamId(steamId64: string): Promise<FaceitProfile> {
      const url = new URL("players", normalizedBaseUrl);
      url.searchParams.set("game", "cs2");
      url.searchParams.set("game_player_id", steamId64);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10_000);
      try {
        const response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${requireApiKey()}`,
          },
          signal: controller.signal,
        });
        if (response.status === 404) {
          return missingFaceitProfile(steamId64);
        }
        if (!response.ok) {
          throw new Error(`FACEIT request failed: ${response.status}`);
        }
        const payload = faceitPlayerSchema.parse(await response.json());
        const game = payload.games?.cs2 ?? payload.games?.csgo ?? null;
        const lastPlayed = await getLastPlayed(payload.player_id);
        return {
          steamId64,
          found: true,
          playerId: payload.player_id,
          nickname: payload.nickname ?? null,
          avatarUrl: payload.avatar ?? null,
          country: payload.country ?? null,
          faceitUrl: payload.faceit_url ?? null,
          skillLevel: game?.skill_level ?? null,
          elo: game?.faceit_elo ?? null,
          gamePlayerId: game?.game_player_id ?? null,
          gamePlayerName: game?.game_player_name ?? null,
          lastPlayedAt: lastPlayed?.at ?? null,
          lastPlayedGame: lastPlayed?.game ?? null,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function missingFaceitProfile(steamId64: string): FaceitProfile {
  return {
    steamId64,
    found: false,
    playerId: null,
    nickname: null,
    avatarUrl: null,
    country: null,
    faceitUrl: null,
    skillLevel: null,
    elo: null,
    gamePlayerId: null,
    gamePlayerName: null,
    lastPlayedAt: null,
    lastPlayedGame: null,
  };
}
