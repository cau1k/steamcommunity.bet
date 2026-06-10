import type { providerCache } from "@steamcommunity.bet/db/schema/report";
import type {
  CSStatsPlayerProfile,
  FaceitProfile,
  LeetifyProfile,
  SteamBanState,
  SteamFriendBanStats,
  SteamInventoryValue,
  SteamPlayerSummary,
} from "@steamcommunity.bet/providers";
import { buildLeetifyProfileStats } from "@steamcommunity.bet/providers/leetify-client";

export type Provider =
  | "steam"
  | "steam_bans"
  | "steam_friends"
  | "steam_inventory"
  | "leetify"
  | "csstats"
  | "faceit";
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

type Signal = {
  provider: Provider;
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
  const steam = caches.find(
    (cache) => cache.provider === "steam" && cache.fetchStatus === "success",
  )?.rawPayload as SteamPlayerSummary | null | undefined;
  if (typeof steam?.visibilityState === "number" && steam.visibilityState !== 3) {
    signals.push({
      provider: "steam",
      signal: "steam_private_profile",
      value: `Steam profile visibility state ${steam.visibilityState}`,
      weight: 5,
      confidence: "low",
      sourceUrl: steam.profileUrl ?? `https://steamcommunity.com/profiles/${steamId64}`,
    });
  }

  const steamInventory = caches.find(
    (cache) => cache.provider === "steam_inventory" && cache.fetchStatus === "success",
  )?.rawPayload as SteamInventoryValue | null | undefined;
  if (steamInventory?.accessible === false) {
    signals.push({
      provider: "steam_inventory",
      signal: "steam_private_inventory",
      value: "CS2 inventory is private or unavailable",
      weight: 5,
      confidence: "low",
      sourceUrl: `https://steamcommunity.com/profiles/${steamId64}/inventory/`,
    });
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

  const steamFriends = caches.find(
    (cache) => cache.provider === "steam_friends" && cache.fetchStatus === "success",
  )?.rawPayload as SteamFriendBanStats | null | undefined;
  if (steamFriends?.accessible && steamFriends.bannedFriendCount > 0) {
    signals.push({
      provider: "steam_friends",
      signal: "steam_banned_friends",
      value: `${steamFriends.bannedFriendCount}/${steamFriends.checkedFriendCount} checked Steam friend(s) have VAC or game bans`,
      weight: Math.min(steamFriends.bannedFriendCount * 2, 10),
      confidence: "low",
      sourceUrl: `https://steamcommunity.com/profiles/${steamId64}/friends/`,
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
  if (lacksFaceit) {
    signals.push({
      provider: "faceit",
      signal: "no_faceit_account",
      value: "No FACEIT account found",
      weight: 5,
      confidence: "low",
      sourceUrl: null,
    });
  }
  if (
    typeof steam?.visibilityState === "number" &&
    steam.visibilityState !== 3 &&
    steamInventory?.accessible === false &&
    lacksFaceit
  ) {
    signals.push({
      provider: "steam",
      signal: "hidden_profile_no_faceit_cluster",
      value: "Private Steam profile; private CS2 inventory; no FACEIT account found",
      weight: 15,
      confidence: "medium",
      sourceUrl: steam.profileUrl ?? `https://steamcommunity.com/profiles/${steamId64}`,
    });
  }
  if (faceit?.hasEsea) {
    signals.push({
      provider: "faceit",
      signal: "faceit_esea_member",
      value: "FACEIT account has ESEA membership",
      weight: -20,
      confidence: "high",
      sourceUrl: faceit.faceitUrl,
    });
  } else if (faceit?.hasPremium) {
    signals.push({
      provider: "faceit",
      signal: "faceit_premium_member",
      value: "FACEIT account has Premium membership",
      weight: -10,
      confidence: "medium",
      sourceUrl: faceit.faceitUrl,
    });
  }
  if (faceitInactiveOverOneYear(faceit)) {
    const lastPlayedAt = faceit?.lastPlayedAt ?? "";
    signals.push({
      provider: "faceit",
      signal: "faceit_inactive_over_one_year",
      value: `FACEIT last played ${new Date(lastPlayedAt).toLocaleDateString()}`,
      weight: 5,
      confidence: "low",
      sourceUrl: faceit?.faceitUrl ?? null,
    });
  }
  const faceitBan = faceit?.latestBan ?? faceit?.bans?.[0] ?? null;
  if (faceitBan) {
    const reason = faceitBan.reason ?? faceitBan.type ?? "unknown";
    const startsAt = faceitBan.startsAt ? new Date(faceitBan.startsAt) : null;
    const recentCheatingBan =
      /cheat/i.test(reason) &&
      startsAt instanceof Date &&
      !Number.isNaN(startsAt.getTime()) &&
      Date.now() - startsAt.getTime() <= 365 * 24 * 60 * 60 * 1000;
    signals.push({
      provider: "faceit",
      signal: recentCheatingBan ? "faceit_recent_cheating_ban" : "faceit_ban_history",
      value: `FACEIT banned: ${reason}${faceitBan.startsAt ? ` on ${faceitBan.startsAt}` : ""}`,
      weight: recentCheatingBan ? 25 : 15,
      confidence: recentCheatingBan ? "high" : "medium",
      sourceUrl: faceit?.faceitUrl ?? null,
    });
  }
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
      csstats.hltvRating >= 2.5 &&
      typeof csstats.kdRatio === "number" &&
      csstats.kdRatio >= 5 &&
      typeof csstats.adr === "number" &&
      csstats.adr >= 150
    ) {
      signals.push({
        provider: "csstats",
        signal: "csstats_rage_statline",
        value: `HLTV ${csstats.hltvRating}; K/D ${csstats.kdRatio}; ADR ${csstats.adr} over ${csstats.matches} matches`,
        weight: 35,
        confidence: "high",
        sourceUrl: csstats.statsUrl,
      });
    }
    if (typeof csstats.hsPercentage === "number" && csstats.hsPercentage >= 80) {
      signals.push({
        provider: "csstats",
        signal: "csstats_extreme_headshot_rate",
        value: `${csstats.hsPercentage}% HS over ${csstats.matches} matches`,
        weight: 12,
        confidence: "high",
        sourceUrl: csstats.statsUrl,
      });
    }
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
  const mapRankDrop = largestCompetitiveRankDrop(csstats?.competitiveRanks ?? []);
  if (mapRankDrop && mapRankDrop.delta >= 6) {
    signals.push({
      provider: "csstats",
      signal: "csstats_map_rank_volatility",
      value: `${mapRankDrop.map}: ${mapRankDrop.currentRank} to ${mapRankDrop.bestRank}`,
      weight: 10,
      confidence: "medium",
      sourceUrl: csstats?.profileUrl ?? null,
    });
  }

  const leetify = caches.find(
    (cache) => cache.provider === "leetify" && cache.fetchStatus === "success",
  )?.rawPayload as LeetifyProfile | null | undefined;
  const leetifyStats = buildLeetifyProfileStats(steamId64, leetify);
  const premierForAimContext = currentPremierRating(csstats, leetifyStats);
  const premierVolume = premierSeasonVolume(csstats, leetifyStats);
  if (
    typeof leetifyStats?.aim === "number" &&
    leetifyStats.aim >= 90 &&
    lacksFaceit &&
    typeof premierForAimContext === "number" &&
    premierForAimContext > 0 &&
    premierForAimContext <= 10_000 &&
    premierVolume &&
    premierVolume.wins > 15
  ) {
    signals.push({
      provider: "leetify",
      signal: "high_aim_low_premier_no_faceit",
      value: `Aim ${leetifyStats.aim}; Premier ${premierForAimContext}; FACEIT absent; ${premierVolume.label} ${premierVolume.wins} wins`,
      weight: 25,
      confidence: "high",
      sourceUrl: leetifyStats.profileUrl,
    });
  }
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
  if (typeof leetify?.rating === "number" && leetify.rating >= 15) {
    signals.push({
      provider: "leetify",
      signal: "leetify_rage_rating",
      value: `Leetify rating ${leetify.rating}`,
      weight: 25,
      confidence: "high",
      sourceUrl: `https://leetify.com/app/profile/${steamId64}`,
    });
  }
  if (typeof leetifyStats?.aim === "number" && leetifyStats.aim >= 95) {
    signals.push({
      provider: "leetify",
      signal: "leetify_extreme_aim",
      value: `Aim ${leetifyStats.aim}`,
      weight: 15,
      confidence: "high",
      sourceUrl: leetifyStats.profileUrl,
    });
  }
  if (typeof leetifyStats?.aim === "number" && leetifyStats.aim > 95 && lacksFaceit) {
    signals.push({
      provider: "leetify",
      signal: "leetify_extreme_aim_no_faceit",
      value: `Aim ${leetifyStats.aim}; FACEIT absent`,
      weight: 20,
      confidence: "high",
      sourceUrl: leetifyStats.profileUrl,
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
      leetifyStats.bestRating >= 15 &&
      typeof leetifyStats.kdRatio === "number" &&
      leetifyStats.kdRatio >= 5
    ) {
      signals.push({
        provider: "leetify",
        signal: "leetify_rage_statline",
        value: `Leetify ${leetifyStats.bestRating}; K/D ${leetifyStats.kdRatio.toFixed(2)} over ${leetifyStats.matches} matches`,
        weight: 30,
        confidence: "high",
        sourceUrl: leetifyStats.statsUrl,
      });
    }
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
      provider: "steam",
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

function largestCompetitiveRankDrop(ranks: CSStatsPlayerProfile["competitiveRanks"]) {
  let largest: {
    map: string;
    currentRank: number;
    bestRank: number;
    delta: number;
  } | null = null;
  for (const rank of ranks) {
    if (typeof rank.latestRank !== "number" || typeof rank.bestRank !== "number") {
      continue;
    }
    const delta = rank.bestRank - rank.latestRank;
    if (delta > (largest?.delta ?? 0)) {
      largest = {
        map: rank.map,
        currentRank: rank.latestRank,
        bestRank: rank.bestRank,
        delta,
      };
    }
  }
  return largest;
}

function currentPremierRating(
  csstats: CSStatsPlayerProfile | null | undefined,
  leetifyStats: ReturnType<typeof buildLeetifyProfileStats>,
) {
  const candidates = [csstats?.premierRating, leetifyStats?.premierRating];
  return candidates.find((rating): rating is number => typeof rating === "number" && rating > 0);
}

function premierSeasonVolume(
  csstats: CSStatsPlayerProfile | null | undefined,
  leetifyStats: ReturnType<typeof buildLeetifyProfileStats>,
) {
  const seasons = [...(csstats?.premierRatings ?? []), ...(leetifyStats?.premierRatings ?? [])]
    .filter((rating) => typeof rating.wins === "number")
    .sort((left, right) => right.season - left.season)
    .slice(0, 2);
  const current = seasons[0];
  const previous = seasons[1];
  if (!current) {
    return null;
  }
  if (previous && previous.wins > current.wins) {
    return { label: `Season ${previous.season}`, wins: previous.wins };
  }
  return { label: `Season ${current.season}`, wins: current.wins };
}

function faceitInactiveOverOneYear(faceit: FaceitProfile | null | undefined) {
  if (!faceit?.found || !faceit.lastPlayedAt) {
    return false;
  }
  const lastPlayed = new Date(faceit.lastPlayedAt);
  if (Number.isNaN(lastPlayed.getTime())) {
    return false;
  }
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return lastPlayed <= oneYearAgo;
}
