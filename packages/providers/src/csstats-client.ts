export const CSSTATS_SELECTORS = {
  title: /<title>(?<value>[^<]+)<\/title>/i,
  premierRating: /Premier\s+Rating[^0-9]*(?<value>[0-9,]+)/i,
  noFaceit: /(?:no|not|without)\s+FACEIT(?:\s+account)?/i,
  faceit: /FACEIT/i,
  bestRating: /(?:Leetify|CS2)\s+Rating[^0-9]*(?<value>-?[0-9]+(?:\.[0-9]+)?)/i,
} as const;

export type CSStatsClientConfig = {
  baseUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
  fetch?: typeof fetch;
};

export type CSStatsPlayerProfile = {
  steamId64: string;
  profileUrl: string;
  statsUrl: string;
  name: string | null;
  title: string | null;
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
  premierRatings: CSStatsPremierRating[];
  competitiveRanks: CSStatsCompetitiveRank[];
  wingman: CSStatsWingmanRank | null;
  rawHtml: string;
  rawStatsHtml: string | null;
};

export type CSStatsPlayerStats = {
  steamId64: string;
  premierRating: number | null;
  hasFaceit: boolean | null;
  bestRating: number | null;
  kdRatio: number | null;
  hltvRating: number | null;
  matches: number | null;
  winRate: number | null;
  hsPercentage: number | null;
  adr: number | null;
  clutchPercentage: number | null;
};

export type CSStatsPremierRating = {
  season: number;
  latestRating: number | null;
  bestRating: number | null;
  wins: number;
};

export type CSStatsCompetitiveRank = {
  map: string;
  latestRank: number | null;
  bestRank: number | null;
  wins: number;
};

export type CSStatsWingmanRank = {
  latestRank: number | null;
  bestRank: number | null;
  wins: number;
};

export type CSStatsPlayerMatch = {
  id: string;
  url: string;
};

export function parseCSStatsProfileHtml(
  steamId64: string,
  profileUrl: string,
  rawHtml: string,
  rawStatsHtml: string | null = null,
) {
  const statsHtml = rawStatsHtml ?? "";
  const premierRatings = parsePremierRatings(rawHtml);
  const firstPremier = premierRatings[0];
  const premierRating =
    firstPremier?.latestRating ?? numberFromSelector(rawHtml, CSSTATS_SELECTORS.premierRating);
  const bestPremierRating = maxNullable(premierRatings.map((rating) => rating.bestRating));
  const bestRating = numberFromSelector(rawHtml, CSSTATS_SELECTORS.bestRating);
  const statsPanels = parseStatsPanels(statsHtml);
  return {
    steamId64,
    profileUrl,
    statsUrl: `${profileUrl}/stats`,
    name: stringFromId(rawHtml, "player-name"),
    title: requireStringFromSelector(rawHtml, CSSTATS_SELECTORS.title),
    premierRating,
    bestPremierRating,
    hasFaceit: CSSTATS_SELECTORS.noFaceit.test(rawHtml)
      ? false
      : CSSTATS_SELECTORS.faceit.test(rawHtml),
    bestRating,
    kdRatio: numberFromId(statsHtml, "kpd"),
    hltvRating: numberFromId(statsHtml, "rating"),
    matches: statsPanels.matches,
    winRate: statsPanels.winRate,
    hsPercentage: statsPanels.hsPercentage,
    adr: statsPanels.adr,
    clutchPercentage: statsPanels.clutchPercentage,
    recentResults: parseRecentResults(statsHtml),
    mostPlayedMap: parseMostPlayedMap(statsHtml),
    premierRatings,
    competitiveRanks: parseCompetitiveRanks(rawHtml),
    wingman: parseWingmanRank(rawHtml),
    rawHtml,
    rawStatsHtml,
  } satisfies CSStatsPlayerProfile;
}

export function createCSStatsClient(config: CSStatsClientConfig = {}) {
  const baseUrl = config.baseUrl ?? "https://csgostats.gg";
  const fetchImpl = config.fetch ?? fetch;

  async function getPlayerProfile(steamId64: string): Promise<CSStatsPlayerProfile> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10_000);
    const profileUrl = new URL(`/player/${steamId64}`, baseUrl).toString();
    const statsUrl = new URL(`/player/${steamId64}/stats`, baseUrl).toString();
    try {
      const headers = {
        "User-Agent": config.userAgent ?? "steamcommunity.bet/0.1",
      };
      const [profileResponse, statsResponse] = await Promise.all([
        fetchImpl(profileUrl, {
          headers,
          signal: controller.signal,
        }),
        fetchImpl(statsUrl, {
          headers,
          signal: controller.signal,
        }),
      ]);
      if (!profileResponse.ok) {
        throw new Error(`CSStats request failed: ${profileResponse.status}`);
      }
      if (!statsResponse.ok) {
        throw new Error(`CSStats stats request failed: ${statsResponse.status}`);
      }
      return parseCSStatsProfileHtml(
        steamId64,
        profileUrl,
        await profileResponse.text(),
        await statsResponse.text(),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    getPlayerProfile,

    async getPlayerStats(steamId64: string): Promise<CSStatsPlayerStats> {
      const profile = await getPlayerProfile(steamId64);
      return {
        steamId64,
        premierRating: profile.premierRating,
        hasFaceit: profile.hasFaceit,
        bestRating: profile.bestRating,
        kdRatio: profile.kdRatio,
        hltvRating: profile.hltvRating,
        matches: profile.matches,
        winRate: profile.winRate,
        hsPercentage: profile.hsPercentage,
        adr: profile.adr,
        clutchPercentage: profile.clutchPercentage,
      };
    },

    async getPlayerMatches(_steamId64: string): Promise<CSStatsPlayerMatch[]> {
      return [];
    },
  };
}

function stringFromId(rawHtml: string, id: string) {
  const escaped = escapeRegExp(id);
  const value = new RegExp(`id=["']${escaped}["'][^>]*>(?<value>[\\s\\S]*?)<`, "i").exec(rawHtml)
    ?.groups?.value;
  return value ? stripHtml(value).trim() || null : null;
}

function numberFromId(rawHtml: string, id: string) {
  const escaped = escapeRegExp(id);
  const block = new RegExp(
    `id=["']${escaped}["'][\\s\\S]*?<span[^>]*>(?<value>[\\s\\S]*?)<\\/span>`,
    "i",
  ).exec(rawHtml)?.groups?.value;
  return numberFromText(block ?? "");
}

function parseStatsPanels(rawHtml: string) {
  const panels = blocksByClass(rawHtml, "stat-panel");
  const stats = {
    matches: null as number | null,
    winRate: null as number | null,
    hsPercentage: null as number | null,
    adr: null as number | null,
    clutchPercentage: null as number | null,
  };
  for (const panel of panels) {
    const heading = stripHtml(
      /class=["'][^"']*\bstat-heading\b[^"']*["'][^>]*>(?<value>[\s\S]*?)<\/[^>]+>/i.exec(panel)
        ?.groups?.value ?? "",
    );
    const value = numberFromText(
      /font-size:\s*34px[^>]*>(?<value>[\s\S]*?)<\/[^>]+>/i.exec(panel)?.groups?.value ?? "",
    );
    if (heading === "Win Rate") {
      stats.winRate = value;
      stats.matches = numberFromText(
        /class=["'][^"']*\btotal-value\b[^"']*["'][^>]*>(?<value>[\s\S]*?)<\/[^>]+>/i.exec(panel)
          ?.groups?.value ?? "",
      );
    } else if (heading.includes("HS") && stats.hsPercentage === null) {
      stats.hsPercentage = value;
    } else if (heading.includes("ADR")) {
      stats.adr = value;
    } else if (heading.includes("Clutch")) {
      stats.clutchPercentage = value;
    }
  }
  return stats;
}

function parseRecentResults(rawHtml: string): Array<"W" | "L" | "T"> {
  return Array.from(rawHtml.matchAll(/class=["'][^"']*\bmatch-dot\b(?<classes>[^"']*)["']/gi))
    .map((match) => {
      const classes = match.groups?.classes ?? "";
      if (classes.includes("match-win")) {
        return "W" as const;
      }
      if (classes.includes("match-lose")) {
        return "L" as const;
      }
      if (classes.includes("match-draw")) {
        return "T" as const;
      }
      return null;
    })
    .filter((value): value is "W" | "L" | "T" => value !== null)
    .reverse()
    .slice(0, 5);
}

function parseMostPlayedMap(rawHtml: string) {
  const canvasId = /id=["'](?<value>[^"']+)-wr-chart-canvas["'][^>]*>\s*<\/canvas>/i.exec(rawHtml)
    ?.groups?.value;
  return canvasId ?? null;
}

function parsePremierRatings(rawHtml: string): CSStatsPremierRating[] {
  return rankBlocks(rawHtml)
    .filter((block) => /alt=["']Premier[^"']*["']/i.test(block))
    .map((block) => ({
      season:
        numberFromText(/Premier\s+Season\s+(?<value>\d+)/i.exec(block)?.groups?.value ?? "") ?? 1,
      latestRating: ratingFromClass(block, "rank"),
      bestRating: ratingFromClass(block, "best"),
      wins: winsFromRankBlock(block),
    }));
}

function parseCompetitiveRanks(rawHtml: string): CSStatsCompetitiveRank[] {
  return rankBlocks(rawHtml).flatMap((block) => {
    const alt = /<img[^>]+alt=["'](?<value>[^"']+)["']/i.exec(block)?.groups?.value;
    if (!alt || alt.startsWith("Premier") || alt === "FACEIT" || alt === "Wingman") {
      return [];
    }
    return [
      {
        map: alt,
        latestRank: rankImageNumber(block, "rank"),
        bestRank: rankImageNumber(block, "best"),
        wins: winsFromRankBlock(block),
      },
    ];
  });
}

function parseWingmanRank(rawHtml: string): CSStatsWingmanRank | null {
  const block = rankBlocks(rawHtml).find((rankBlock) => /alt=["']Wingman["']/i.test(rankBlock));
  return block
    ? {
        latestRank: wingmanRankImageNumber(block, "rank"),
        bestRank: wingmanRankImageNumber(block, "best"),
        wins: winsFromRankBlock(block),
      }
    : null;
}

function rankBlocks(rawHtml: string) {
  return blocksByClass(sectionById(rawHtml, "player-ranks") ?? rawHtml, "ranks");
}

function ratingFromClass(rawHtml: string, className: string) {
  const block = blockByClass(rawHtml, className);
  if (!block) {
    return null;
  }
  const span =
    /class=["'][^"']*\bcs2rating\b[^"']*["'][\s\S]*?<span[^>]*>(?<value>[\s\S]*?)<\/span>/i.exec(
      block,
    )?.groups?.value;
  const text = stripHtml(span ?? "");
  if (!text || text === "---") {
    return 0;
  }
  return numberFromText(text);
}

function rankImageNumber(rawHtml: string, className: string) {
  const block = blockByClass(rawHtml, className);
  return numberFromText(/\/ranks\/(?<value>\d+)\.png/i.exec(block ?? "")?.groups?.value ?? "");
}

function wingmanRankImageNumber(rawHtml: string, className: string) {
  const block = blockByClass(rawHtml, className);
  return numberFromText(/wingman(?<value>\d+)\.svg/i.exec(block ?? "")?.groups?.value ?? "");
}

function winsFromRankBlock(rawHtml: string) {
  return (
    numberFromText(
      /class=["'][^"']*\bwins\b[^"']*["'][\s\S]*?<b[^>]*>(?<value>[\s\S]*?)<\/b>/i.exec(rawHtml)
        ?.groups?.value ?? "",
    ) ?? 0
  );
}

function sectionById(rawHtml: string, id: string) {
  const start = rawHtml.search(new RegExp(`id=["']${escapeRegExp(id)}["']`, "i"));
  if (start < 0) {
    return null;
  }
  const nextSection = rawHtml.slice(start + id.length).search(/\sid=["'][^"']+["']/i);
  return nextSection < 0
    ? rawHtml.slice(start)
    : rawHtml.slice(start, start + id.length + nextSection);
}

function blockByClass(rawHtml: string, className: string) {
  return blocksByClass(rawHtml, className)[0] ?? null;
}

function blocksByClass(rawHtml: string, className: string) {
  const starts = Array.from(
    rawHtml.matchAll(
      new RegExp(`<[^>]+class=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["'][^>]*>`, "gi"),
    ),
  ).map((match) => match.index ?? 0);
  return starts.map((start, index) => rawHtml.slice(start, starts[index + 1] ?? rawHtml.length));
}

function maxNullable(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

function numberFromText(value: string) {
  const cleaned = stripHtml(value).replaceAll(",", "").trim();
  const match = /-?\d+(?:\.\d+)?/.exec(cleaned);
  return match ? Number(match[0]) : null;
}

function stripHtml(value: string) {
  return value
    .replaceAll(/<[^>]*>/g, "")
    .replaceAll("&nbsp;", " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stringFromSelector(rawHtml: string, selector: RegExp) {
  const value = selector.exec(rawHtml)?.groups?.value;
  return value?.trim() ?? null;
}

function requireStringFromSelector(rawHtml: string, selector: RegExp) {
  const value = stringFromSelector(rawHtml, selector);
  if (!value) {
    throw new Error(`CSStats selector missed: ${selector.source}`);
  }
  return value;
}

function numberFromSelector(rawHtml: string, selector: RegExp) {
  const value = stringFromSelector(rawHtml, selector);
  return value ? Number(value.replaceAll(",", "")) : null;
}
