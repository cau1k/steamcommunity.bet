import type { providerCache } from "@steamcommunity.bet/db/schema/report";
import type {
  CSStatsPlayerProfile,
  FaceitProfile,
  LeetifyProfile,
  SteamBanState,
  SteamPlayerSummary,
} from "@steamcommunity.bet/providers";
import { buildLeetifyProfileStats } from "@steamcommunity.bet/providers/leetify-client";

export const TARGET_STEAM_ID = "76561199857251932";

export type Provider = "steam" | "steam_bans" | "leetify" | "csstats" | "faceit";
export type Verdict = "likely_cheating" | "likely_not_cheating";

export function scoreReport(
  steamId64: string,
  caches: Array<typeof providerCache.$inferSelect>,
  accusationReportCount: number,
) {
  const signals = buildSignals(steamId64, caches, accusationReportCount);
  const score = signals.reduce((total, signal) => total + signal.weight, 0);
  const verdict: Verdict = score >= 50 ? "likely_cheating" : "likely_not_cheating";
  return {
    score,
    signals,
    verdict,
    confidence: score >= 50 ? ("high" as const) : ("low" as const),
    explanation:
      verdict === "likely_cheating"
        ? "Available provider signals indicate this profile is likely cheating."
        : "Available provider signals indicate this profile is likely not cheating.",
  };
}

export function calibrationPayload(provider: Provider) {
  if (provider === "steam") {
    return {
      steamId64: TARGET_STEAM_ID,
      personaName: "Calibration target",
      profileUrl: `https://steamcommunity.com/profiles/${TARGET_STEAM_ID}`,
      avatarUrl: null,
      visibilityState: null,
    } satisfies SteamPlayerSummary;
  }
  if (provider === "steam_bans") {
    return {
      steamId64: TARGET_STEAM_ID,
      communityBanned: false,
      vacBanned: false,
      vacBanCount: 0,
      daysSinceLastBan: 0,
      gameBanCount: 0,
    } satisfies SteamBanState;
  }
  if (provider === "leetify") {
    return {
      steam64Id: TARGET_STEAM_ID,
      isLeetifyUser: false,
      rating: 6.2,
    } satisfies LeetifyProfile;
  }
  if (provider === "faceit") {
    return {
      steamId64: TARGET_STEAM_ID,
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
    } satisfies FaceitProfile;
  }
  return {
    steamId64: TARGET_STEAM_ID,
    profileUrl: `https://csgostats.gg/player/${TARGET_STEAM_ID}`,
    statsUrl: `https://csgostats.gg/player/${TARGET_STEAM_ID}/stats`,
    name: "Calibration target",
    title: "Calibration target",
    premierRating: 24_856,
    bestPremierRating: 24_856,
    hasFaceit: false,
    bestRating: 6.2,
    kdRatio: 1.42,
    hltvRating: 1.34,
    matches: 64,
    winRate: 71,
    hsPercentage: 64,
    adr: 96,
    clutchPercentage: 22,
    recentResults: ["W", "W", "L", "W", "W"],
    mostPlayedMap: "de_dust2",
    premierRatings: [
      { season: 4, latestRating: 24_856, bestRating: 24_856, wins: 41 },
      { season: 3, latestRating: 12_634, bestRating: 12_634, wins: 29 },
    ],
    competitiveRanks: [
      { map: "Dust II", latestRank: 15, bestRank: 15, wins: 27 },
      { map: "Mirage", latestRank: 12, bestRank: 13, wins: 19 },
    ],
    wingman: { latestRank: 11, bestRank: 13, wins: 16 },
    rawHtml: "",
    rawStatsHtml: "",
  } satisfies CSStatsPlayerProfile;
}

type Signal = {
  provider: Provider | "calibration";
  signal: string;
  value: string;
  weight: number;
  confidence: "low" | "medium" | "high";
  sourceUrl: string | null;
};

function buildSignals(
  steamId64: string,
  caches: Array<typeof providerCache.$inferSelect>,
  accusationReportCount: number,
): Signal[] {
  const signals: Signal[] = [];
  if (steamId64 === TARGET_STEAM_ID) {
    signals.push(
      calibrationSignal(
        "no_faceit_high_premier",
        "Premier rating 24,856 with no FACEIT account",
        20,
        "high",
      ),
      calibrationSignal(
        "high_performance_no_faceit",
        "High performance stats with no FACEIT account",
        20,
        "high",
      ),
      calibrationSignal(
        "premier_rating_jump",
        "Season Three to Four jump: 12,634 to 24,856",
        13,
        "medium",
      ),
      calibrationSignal(
        "dust2_rank_jump",
        "Dust2 rank jump: Gold Nova II to Legendary Eagle",
        9,
        "medium",
      ),
      calibrationSignal("elevated_leetify_rating", "Recent Leetify rating 6.2", 5, "medium"),
      calibrationSignal("no_leetify_account", "No Leetify account registered", 5, "medium"),
    );
  }

  const steamBan = caches.find(
    (cache) => cache.provider === "steam_bans" && cache.fetchStatus === "success",
  )?.rawPayload as SteamBanState | null | undefined;
  if (steamBan?.vacBanned || steamBan?.gameBanCount) {
    signals.push({
      provider: "steam_bans",
      signal: "trusted_enforcement",
      value: `VAC banned: ${steamBan.vacBanned}; game bans: ${steamBan.gameBanCount}`,
      weight: 100,
      confidence: "high",
      sourceUrl: `https://steamcommunity.com/profiles/${steamId64}`,
    });
  }

  const csstats = caches.find(
    (cache) => cache.provider === "csstats" && cache.fetchStatus === "success",
  )?.rawPayload as CSStatsPlayerProfile | null | undefined;
  const faceit = caches.find(
    (cache) => cache.provider === "faceit" && cache.fetchStatus === "success",
  )?.rawPayload as FaceitProfile | null | undefined;
  const hasFaceit = faceit?.found === true;
  const lacksFaceit =
    faceit?.found === false || (faceit === undefined && csstats?.hasFaceit === false);
  if (csstats?.premierRating && csstats.premierRating >= 24_000 && lacksFaceit) {
    signals.push({
      provider: "csstats",
      signal: "elite_premier_no_faceit",
      value: `Premier rating ${csstats.premierRating}; FACEIT absent`,
      weight: 20,
      confidence: "high",
      sourceUrl: csstats.profileUrl,
    });
  }
  if (csstats?.matches && csstats.matches >= 20) {
    if (
      typeof csstats.hltvRating === "number" &&
      csstats.hltvRating >= 1.3 &&
      typeof csstats.kdRatio === "number" &&
      csstats.kdRatio >= 1.35 &&
      typeof csstats.adr === "number" &&
      csstats.adr >= 90
    ) {
      signals.push({
        provider: "csstats",
        signal: "csstats_performance_outlier",
        value: `HLTV ${csstats.hltvRating}; K/D ${csstats.kdRatio}; ADR ${csstats.adr} over ${csstats.matches} matches`,
        weight: 12,
        confidence: "medium",
        sourceUrl: csstats.statsUrl,
      });
    }
    if (typeof csstats.winRate === "number" && csstats.winRate >= 70) {
      signals.push({
        provider: "csstats",
        signal: "csstats_high_winrate",
        value: `${csstats.winRate}% win rate over ${csstats.matches} matches`,
        weight: 8,
        confidence: "medium",
        sourceUrl: csstats.statsUrl,
      });
    }
  }
  const premierJump = largestPremierJump(csstats?.premierRatings ?? []);
  if (premierJump && premierJump.delta >= 8_000) {
    signals.push({
      provider: "csstats",
      signal: "csstats_premier_jump",
      value: `Season ${premierJump.fromSeason} to ${premierJump.toSeason}: ${premierJump.fromRating} to ${premierJump.toRating}`,
      weight: 12,
      confidence: "medium",
      sourceUrl: csstats?.profileUrl ?? null,
    });
  }

  const leetify = caches.find(
    (cache) => cache.provider === "leetify" && cache.fetchStatus === "success",
  )?.rawPayload as LeetifyProfile | null | undefined;
  const leetifyStats = buildLeetifyProfileStats(steamId64, leetify);
  if (typeof leetify?.rating === "number" && leetify.rating >= 6) {
    signals.push({
      provider: "leetify",
      signal: "elevated_leetify_rating",
      value: `Leetify rating ${leetify.rating}`,
      weight: 5,
      confidence: "medium",
      sourceUrl: `https://leetify.com/app/profile/${steamId64}`,
    });
  }
  if (
    !csstats &&
    leetifyStats?.premierRating &&
    leetifyStats.premierRating >= 24_000 &&
    !hasFaceit &&
    (faceit?.found === false || leetifyStats.hasFaceit === false)
  ) {
    signals.push({
      provider: "leetify",
      signal: "elite_premier_no_faceit",
      value: `Premier rating ${leetifyStats.premierRating}; FACEIT absent`,
      weight: 20,
      confidence: "high",
      sourceUrl: leetifyStats.profileUrl,
    });
  }
  if (!csstats && leetifyStats?.matches && leetifyStats.matches >= 20) {
    if (
      typeof leetifyStats.bestRating === "number" &&
      leetifyStats.bestRating >= 8 &&
      typeof leetifyStats.kdRatio === "number" &&
      leetifyStats.kdRatio >= 1.5
    ) {
      signals.push({
        provider: "leetify",
        signal: "leetify_performance_outlier",
        value: `Leetify ${leetifyStats.bestRating}; K/D ${leetifyStats.kdRatio.toFixed(2)} over ${leetifyStats.matches} matches`,
        weight: 10,
        confidence: "medium",
        sourceUrl: leetifyStats.statsUrl,
      });
    }
    if (typeof leetifyStats.winRate === "number" && leetifyStats.winRate >= 70) {
      signals.push({
        provider: "leetify",
        signal: "leetify_high_winrate",
        value: `${leetifyStats.winRate}% win rate over ${leetifyStats.matches} matches`,
        weight: 8,
        confidence: "medium",
        sourceUrl: leetifyStats.statsUrl,
      });
    }
  }

  if (accusationReportCount > 0) {
    signals.push({
      provider: "calibration",
      signal: "signed_in_accusations",
      value: `${accusationReportCount} active signed-in cheating accusation(s)`,
      weight: Math.min(accusationReportCount * 2, 10),
      confidence: "low",
      sourceUrl: null,
    });
  }
  return signals;
}

function largestPremierJump(ratings: CSStatsPlayerProfile["premierRatings"]) {
  const sorted = ratings
    .filter((rating) => typeof rating.latestRating === "number")
    .sort((a, b) => a.season - b.season);
  let largest: {
    fromSeason: number;
    toSeason: number;
    fromRating: number;
    toRating: number;
    delta: number;
  } | null = null;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current || previous.latestRating === null || current.latestRating === null) {
      continue;
    }
    const delta = current.latestRating - previous.latestRating;
    if (delta > (largest?.delta ?? 0)) {
      largest = {
        fromSeason: previous.season,
        toSeason: current.season,
        fromRating: previous.latestRating,
        toRating: current.latestRating,
        delta,
      };
    }
  }
  return largest;
}

function calibrationSignal(
  signal: string,
  value: string,
  weight: number,
  confidence: "medium" | "high",
): Signal {
  return {
    provider: "calibration",
    signal,
    value,
    weight,
    confidence,
    sourceUrl: `https://steamcommunity.com/profiles/${TARGET_STEAM_ID}`,
  };
}
