import { z } from "zod";

const leetifyProfileSchema = z
  .object({
    steam64Id: z.string().optional(),
    name: z.string().nullable().optional(),
    leetifyUserId: z.string().nullable().optional(),
    isLeetifyUser: z.boolean().optional(),
    rating: z.number().nullable().optional(),
    meta: z
      .object({
        name: z.string().nullable().optional(),
        steam64Id: z.string().optional(),
        steamAvatarUrl: z.string().nullable().optional(),
        leetifyUserId: z.string().nullable().optional(),
        faceitNickname: z.string().nullable().optional(),
        vanityUrl: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
    recentGameRatings: z
      .object({
        aim: z.number().nullable().optional(),
        leetifyRatingRounds: z.number().nullable().optional(),
        positioning: z.number().nullable().optional(),
        utility: z.number().nullable().optional(),
        gamesPlayed: z.number().nullable().optional(),
        clutch: z.number().nullable().optional(),
        crosshairPlacement: z.number().nullable().optional(),
        ctLeetify: z.number().nullable().optional(),
        leetify: z.number().nullable().optional(),
        opening: z.number().nullable().optional(),
        tLeetify: z.number().nullable().optional(),
        timeToDamage: z.number().nullable().optional(),
      })
      .passthrough()
      .optional(),
    games: z
      .array(
        z
          .object({
            gameFinishedAt: z.string().optional(),
            isCs2: z.boolean().optional(),
            dataSource: z.string().nullable().optional(),
            mapName: z.string().nullable().optional(),
            matchResult: z.string().nullable().optional(),
            rankType: z.number().nullable().optional(),
            skillLevel: z.number().nullable().optional(),
            kills: z.number().nullable().optional(),
            deaths: z.number().nullable().optional(),
            accuracyHead: z.number().nullable().optional(),
            preaim: z.number().nullable().optional(),
            reactionTime: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const leetifyMatchesSchema = z.array(z.object({ id: z.string().optional() }).passthrough());

export type LeetifyClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

export type LeetifyProfile = z.infer<typeof leetifyProfileSchema>;
export type LeetifyMatches = z.infer<typeof leetifyMatchesSchema>;

export type LeetifyProfileStats = {
  steamId64: string;
  profileUrl: string;
  statsUrl: string;
  name: string | null;
  premierRating: number | null;
  bestPremierRating: number | null;
  hasFaceit: boolean | null;
  bestRating: number | null;
  kdRatio: number | null;
  hltvRating: number | null;
  matches: number | null;
  winRate: number | null;
  hsPercentage: number | null;
  adr: number | null;
  clutchPercentage: number | null;
  recentResults: Array<"W" | "L" | "T">;
  mostPlayedMap: string | null;
  premierRatings: Array<{
    season: number;
    latestRating: number | null;
    bestRating: number | null;
    wins: number;
  }>;
  competitiveRanks: Array<{
    map: string;
    latestRank: number | null;
    bestRank: number | null;
    wins: number;
  }>;
  wingman: null;
  aim: number | null;
  utility: number | null;
  positioning: number | null;
  opening: number | null;
  tLeetify: number | null;
  ctLeetify: number | null;
  timeToDamage: number | null;
  crosshairPlacement: number | null;
};

export function createLeetifyClient(config: LeetifyClientConfig = {}) {
  const baseUrl = config.baseUrl ?? "https://api.cs-prod.leetify.com";
  const fetchImpl = config.fetch ?? fetch;

  async function getJson(path: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10_000);
    const headers = new Headers();
    if (config.apiKey) {
      headers.set("Authorization", `Bearer ${config.apiKey}`);
    }
    try {
      const response = await fetchImpl(new URL(path, baseUrl), {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Leetify request failed: ${response.status}`);
      }
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async getProfile(steamId64: string): Promise<LeetifyProfile> {
      try {
        const profile = leetifyProfileSchema.parse(await getJson(`/api/profile/id/${steamId64}`));
        return {
          ...profile,
          steam64Id: profile.steam64Id ?? profile.meta?.steam64Id ?? steamId64,
          name: profile.name ?? profile.meta?.name ?? null,
          leetifyUserId: profile.leetifyUserId ?? profile.meta?.leetifyUserId ?? null,
          isLeetifyUser: Boolean(profile.leetifyUserId ?? profile.meta?.leetifyUserId),
          rating: profile.rating ?? leetifyScore(profile.recentGameRatings?.leetify),
        };
      } catch (error) {
        if (error instanceof Error && error.message === "Leetify request failed: 404") {
          return {
            steam64Id: steamId64,
            leetifyUserId: null,
            isLeetifyUser: false,
            rating: null,
          };
        }
        throw error;
      }
    },

    async getPlayerMatches(steamId64: string): Promise<LeetifyMatches> {
      try {
        return leetifyMatchesSchema.parse(await getJson(`/api/profile/${steamId64}/matches`));
      } catch (error) {
        if (error instanceof Error && error.message === "Leetify request failed: 404") {
          return [];
        }
        throw error;
      }
    },

    async getMatch(matchId: string) {
      return z.unknown().parse(await getJson(`/api/games/${matchId}`));
    },

    async getMatchBySource(source: string, sourceId: string) {
      return z.unknown().parse(await getJson(`/api/games/${source}/${sourceId}`));
    },
  };
}

export function buildLeetifyProfileStats(
  steamId64: string,
  profile: LeetifyProfile | null | undefined,
): LeetifyProfileStats | null {
  if (!profile) {
    return null;
  }
  const games = [...(profile.games ?? [])]
    .filter((game) => game.isCs2 !== false)
    .sort((a, b) => Date.parse(b.gameFinishedAt ?? "") - Date.parse(a.gameFinishedAt ?? ""));
  const windowSize = profile.recentGameRatings?.gamesPlayed ?? Math.min(games.length, 30);
  const recentGames = games.slice(0, windowSize);
  const premierGames = games.filter(
    (game) => game.rankType === 11 && typeof game.skillLevel === "number" && game.skillLevel > 0,
  );
  const competitiveGames = games.filter(
    (game) => game.rankType === 12 && typeof game.skillLevel === "number" && game.skillLevel > 0,
  );
  const kills = sum(recentGames.map((game) => game.kills));
  const deaths = sum(recentGames.map((game) => game.deaths));
  const wins = recentGames.filter((game) => game.matchResult === "win").length;
  const headAccuracy = average(
    recentGames
      .map((game) => game.accuracyHead)
      .filter((value): value is number => typeof value === "number"),
  );
  const reactionTime = average(
    recentGames
      .map((game) => game.reactionTime)
      .filter((value): value is number => typeof value === "number"),
  );
  const preaim = average(
    recentGames
      .map((game) => game.preaim)
      .filter((value): value is number => typeof value === "number"),
  );
  const currentPremier = premierGames[0]?.skillLevel ?? null;
  const bestPremier = maxNullable(premierGames.map((game) => game.skillLevel ?? null));
  return {
    steamId64,
    profileUrl: `https://leetify.com/app/profile/${steamId64}`,
    statsUrl: `https://leetify.com/app/profile/${steamId64}`,
    name: profile.name ?? profile.meta?.name ?? null,
    premierRating: currentPremier,
    bestPremierRating: bestPremier,
    hasFaceit: typeof profile.meta?.faceitNickname === "string" ? true : null,
    bestRating: profile.rating ?? leetifyScore(profile.recentGameRatings?.leetify),
    kdRatio:
      typeof kills === "number" && typeof deaths === "number" && deaths > 0 ? kills / deaths : null,
    hltvRating: null,
    matches: recentGames.length || profile.recentGameRatings?.gamesPlayed || null,
    winRate: recentGames.length ? Math.round((wins / recentGames.length) * 100) : null,
    hsPercentage:
      typeof headAccuracy === "number" && headAccuracy > 0 ? Math.round(headAccuracy * 100) : null,
    adr: null,
    clutchPercentage: leetifyPercent(profile.recentGameRatings?.clutch),
    recentResults: recentGames.slice(0, 5).flatMap((game) => resultCode(game.matchResult)),
    mostPlayedMap: mostPlayedMap(recentGames),
    premierRatings: premierGames.length
      ? [
          {
            season: 0,
            latestRating: currentPremier,
            bestRating: bestPremier,
            wins: premierWins(premierGames),
          },
        ]
      : [],
    competitiveRanks: competitiveRanks(competitiveGames),
    wingman: null,
    aim: rounded(profile.recentGameRatings?.aim),
    utility: rounded(profile.recentGameRatings?.utility),
    positioning: rounded(profile.recentGameRatings?.positioning),
    opening: leetifyScore(profile.recentGameRatings?.opening),
    tLeetify: leetifyScore(profile.recentGameRatings?.tLeetify),
    ctLeetify: leetifyScore(profile.recentGameRatings?.ctLeetify),
    timeToDamage: leetifyMilliseconds(
      firstPositive(profile.recentGameRatings?.timeToDamage, reactionTime),
    ),
    crosshairPlacement: rounded(
      firstPositive(profile.recentGameRatings?.crosshairPlacement, preaim),
    ),
  };
}

function firstPositive(...values: Array<number | null | undefined>) {
  return values.find((value): value is number => typeof value === "number" && value > 0) ?? null;
}

function leetifyScore(value: number | null | undefined) {
  if (typeof value !== "number") {
    return null;
  }
  return Math.round((Math.abs(value) < 1 ? value * 100 : value) * 100) / 100;
}

function leetifyPercent(value: number | null | undefined) {
  if (typeof value !== "number") {
    return null;
  }
  return Math.round((Math.abs(value) <= 1 ? value * 100 : value) * 100) / 100;
}

function leetifyMilliseconds(value: number | null | undefined) {
  if (typeof value !== "number") {
    return null;
  }
  return Math.round(Math.abs(value) < 10 ? value * 1000 : value);
}

function rounded(value: number | null | undefined) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : null;
}

function sum(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) : null;
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function maxNullable(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length ? Math.max(...numbers) : null;
}

function resultCode(value: string | null | undefined) {
  if (value === "win") return ["W" as const];
  if (value === "loss") return ["L" as const];
  if (value === "tie") return ["T" as const];
  return [];
}

function mostPlayedMap(games: Array<{ mapName?: string | null }>) {
  const counts = new Map<string, number>();
  for (const game of games) {
    if (game.mapName) {
      counts.set(game.mapName, (counts.get(game.mapName) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function premierWins(games: Array<{ matchResult?: string | null }>) {
  return games.filter((game) => game.matchResult === "win").length;
}

function competitiveRanks(
  games: Array<{
    mapName?: string | null;
    skillLevel?: number | null;
    matchResult?: string | null;
  }>,
) {
  const byMap = new Map<string, typeof games>();
  for (const game of games) {
    if (!game.mapName) {
      continue;
    }
    byMap.set(game.mapName, [...(byMap.get(game.mapName) ?? []), game]);
  }
  return [...byMap.entries()]
    .map(([map, mapGames]) => ({
      map: prettyMapName(map),
      latestRank: mapGames[0]?.skillLevel ?? null,
      bestRank: maxNullable(mapGames.map((game) => game.skillLevel ?? null)),
      wins: mapGames.filter((game) => game.matchResult === "win").length,
    }))
    .sort((a, b) => (b.latestRank ?? 0) - (a.latestRank ?? 0));
}

function prettyMapName(value: string) {
  return value
    .replace(/^de_/, "")
    .replace(/^cs_/, "")
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
