import { createDb } from "@steamcommunity.bet/db";
import {
  cheatSignal,
  generatedReport,
  playerReport,
  providerCache,
  riskScore,
  steamProfile,
} from "@steamcommunity.bet/db/schema/report";
import { env } from "@steamcommunity.bet/env/server";
import {
  buildLeetifyProfileStats,
  createCSStatsClient,
  createFaceitClient,
  createLeetifyClient,
  createSteamClient,
  type CSStatsPlayerProfile,
  type FaceitProfile,
  type LeetifyProfile,
  type SteamBanState,
  type SteamPlayerSummary,
} from "@steamcommunity.bet/providers";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { ORPCError } from "../index";
import { protectedProcedure, publicProcedure } from "../index";
import { calibrationPayload, scoreReport, TARGET_STEAM_ID, type Provider } from "../scoring";

const resolveInput = z.object({ path: z.string().min(1) });
const steamIdInput = z.object({ steamId64: z.string().regex(/^\d{17}$/) });
const playerReportReason = z.enum([
  "rage hacking/spinning",
  "walling",
  "aim hacking",
  "radar",
  "legit",
]);
const providerFlights = new Map<string, Promise<typeof providerCache.$inferInsert>>();

export const reportRouter = {
  profile: {
    resolve: publicProcedure.input(resolveInput).handler(async ({ input }) => {
      return resolveProfile(input.path);
    }),
  },

  report: {
    get: publicProcedure.input(steamIdInput).handler(async ({ input }) => {
      return getLatestReport(input.steamId64);
    }),

    getOrGenerate: publicProcedure.input(resolveInput).handler(async ({ context, input }) => {
      const resolved = await resolveProfile(input.path);
      const current = await getLatestReport(resolved.steamId64);
      if (current) {
        const refreshQueued = await queueRefreshIfStale(
          context.waitUntil,
          resolved.steamId64,
          resolved.sourcePath,
          current.refreshedAt,
        );
        return { resolved, report: current, refreshQueued };
      }
      const report = await generateReport(resolved.steamId64, resolved.sourcePath);
      return { resolved, report, refreshQueued: false };
    }),

    refresh: publicProcedure.input(resolveInput).handler(async ({ input }) => {
      const resolved = await resolveProfile(input.path);
      const report = await generateReport(resolved.steamId64, resolved.sourcePath, true);
      return { resolved, report };
    }),

    refreshProvider: publicProcedure
      .input(
        steamIdInput.extend({
          provider: z.enum(["steam", "steam_bans", "leetify", "csstats", "faceit"]),
        }),
      )
      .handler(async ({ input }) => {
        await refreshProvider(input.steamId64, input.provider, true);
        const report = await generateReport(input.steamId64, `/profiles/${input.steamId64}`);
        return report;
      }),
  },

  playerReport: {
    create: protectedProcedure
      .input(
        steamIdInput.extend({
          reason: playerReportReason,
          matchUrl: z.url().optional(),
          notes: z.string().max(2_000).optional(),
        }),
      )
      .handler(async ({ context, input }) => {
        const db = createDb();
        await ensureSteamProfile(input.steamId64, null);
        await db
          .insert(playerReport)
          .values({
            reporterUserId: context.session.user.id,
            steamId: input.steamId64,
            reason: input.reason,
            matchUrl: input.matchUrl ?? null,
            notes: input.notes ?? null,
          })
          .onConflictDoUpdate({
            target: [playerReport.reporterUserId, playerReport.steamId],
            set: {
              reason: input.reason,
              matchUrl: input.matchUrl ?? null,
              notes: input.notes ?? null,
              status: "active",
            },
          });
        return listPlayerReports(input.steamId64);
      }),

    listForSteamId: publicProcedure.input(steamIdInput).handler(async ({ input }) => {
      return listPlayerReports(input.steamId64);
    }),

    listMine: protectedProcedure.handler(async ({ context }) => {
      return listReporterReports(context.session.user.id);
    }),
  },
};

async function resolveProfile(path: string) {
  const trimmed = path.trim();
  const parsed = tryParseUrl(trimmed);
  const pathname = parsed?.pathname ?? trimmed;
  const profileMatch = /^\/?profiles\/(?<steamId64>\d{17})\/?$/.exec(pathname);
  if (/^\d{17}$/.test(trimmed) || profileMatch?.groups?.steamId64) {
    const steamId64 = profileMatch?.groups?.steamId64 ?? trimmed;
    return { steamId64, sourcePath: `/profiles/${steamId64}`, vanity: null as string | null };
  }

  const vanity = /^\/?id\/(?<vanity>[^/]+)\/?$/.exec(pathname)?.groups?.vanity;
  if (!vanity) {
    throw new ORPCError("BAD_REQUEST", { message: "Unsupported Steam profile path" });
  }
  const steam = createSteamClient({ apiKey: env.STEAM_API_KEY });
  const steamId64 = await steam.resolveVanity(vanity);
  if (!steamId64) {
    throw new ORPCError("NOT_FOUND", { message: `Steam vanity not found: ${vanity}` });
  }
  return { steamId64, sourcePath: `/id/${vanity}`, vanity };
}

async function generateReport(steamId64: string, sourcePath: string, forceProviders = false) {
  await ensureSteamProfile(steamId64, null);
  const providerResults = await Promise.allSettled([
    refreshProvider(steamId64, "steam", forceProviders),
    refreshProvider(steamId64, "steam_bans", forceProviders),
    refreshProvider(steamId64, "leetify", forceProviders),
    refreshProvider(steamId64, "csstats", forceProviders),
    refreshProvider(steamId64, "faceit", forceProviders),
  ]);
  for (const result of providerResults) {
    if (result.status === "rejected") {
      console.error(result.reason);
    }
  }

  const db = createDb();
  const caches = await db.select().from(providerCache).where(eq(providerCache.steamId, steamId64));
  const reports = await listPlayerReports(steamId64);
  const scored = scoreReport(steamId64, caches, reports.accusationCount);
  const providerDetails = buildProviderDetails(caches);
  const steamDetails = providerDetails.steam;
  const leetifyCoversStats = !providerDetails.csstats && providerDetails.leetify;
  const now = new Date();
  const freshness = Object.fromEntries(
    caches.map((cache) => [
      cache.provider,
      cache.fetchStatus === "success" ? cache.fetchedAt.toISOString() : cache.fetchStatus,
    ]),
  );
  const missingData = caches
    .filter((cache) => cache.fetchStatus !== "success")
    .filter((cache) => !(leetifyCoversStats && cache.provider === "csstats"))
    .map((cache) => `${cache.provider}: ${cache.errorMessage ?? cache.fetchStatus}`);
  const missingProviders = (["steam", "steam_bans", "leetify", "csstats", "faceit"] as const)
    .filter((provider) => !(leetifyCoversStats && provider === "csstats"))
    .filter((provider) => !caches.some((cache) => cache.provider === provider))
    .map((provider) => `${provider}: not fetched`);
  const strongestEvidence = scored.signals
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((signal) => `${signal.signal}: ${signal.value}`);
  const sourceLinks = [
    {
      label: "Steam",
      href: steamDetails?.profileUrl ?? `https://steamcommunity.com/profiles/${steamId64}`,
    },
    { label: "CSStats", href: `https://csgostats.gg/player/${steamId64}` },
    { label: "Leetify", href: `https://leetify.com/app/profile/${steamId64}` },
    { label: "FACEIT", href: providerDetails.faceit?.faceitUrl ?? "https://www.faceit.com/" },
  ];

  await db.delete(cheatSignal).where(eq(cheatSignal.steamId, steamId64));
  if (scored.signals.length > 0) {
    await db.insert(cheatSignal).values(
      scored.signals.map((signal) => ({
        steamId: steamId64,
        provider: signal.provider,
        signal: signal.signal,
        value: signal.value,
        weight: signal.weight,
        confidence: signal.confidence,
        sourceUrl: signal.sourceUrl,
        observedAt: now,
      })),
    );
  }
  await db
    .insert(riskScore)
    .values({
      steamId: steamId64,
      score: scored.score,
      confidence: scored.confidence,
      explanation: scored.explanation,
      computedAt: now,
    })
    .onConflictDoUpdate({
      target: riskScore.steamId,
      set: {
        score: scored.score,
        confidence: scored.confidence,
        explanation: scored.explanation,
        computedAt: now,
      },
    });

  const inserted = await db
    .insert(generatedReport)
    .values({
      steamId: steamId64,
      sourcePath,
      verdict: scored.verdict,
      explanation: scored.explanation,
      strongestEvidence,
      missingData: [...missingData, ...missingProviders],
      providerFreshness: freshness,
      sourceLinks,
      reportCount: reports.accusationCount,
      generatedAt: now,
      refreshedAt: now,
    })
    .returning();
  return attachProviderDetails(
    inserted[0] ?? (await getLatestReport(steamId64)),
    providerDetails,
    reports,
  );
}

async function refreshProvider(steamId64: string, provider: Provider, force: boolean) {
  const flightKey = `${provider}:${steamId64}`;
  const currentFlight = providerFlights.get(flightKey);
  if (currentFlight) {
    return currentFlight;
  }
  const flight = refreshProviderUncached(steamId64, provider, force).finally(() => {
    providerFlights.delete(flightKey);
  });
  providerFlights.set(flightKey, flight);
  return flight;
}

async function refreshProviderUncached(steamId64: string, provider: Provider, force: boolean) {
  const db = createDb();
  const cacheKey = `${provider}:${steamId64}`;
  const current = await db
    .select()
    .from(providerCache)
    .where(and(eq(providerCache.provider, provider), eq(providerCache.cacheKey, cacheKey)))
    .get();
  if (!force && current && current.fetchStatus === "success" && current.staleAt > new Date()) {
    return current;
  }

  const now = new Date();
  try {
    const payload = await fetchProviderPayload(steamId64, provider);
    await ensureSteamProfile(
      steamId64,
      provider === "steam" ? (payload as SteamPlayerSummary | null) : null,
    );
    const row = {
      provider,
      cacheKey,
      steamId: steamId64,
      payloadHash: stableHash(payload),
      rawPayload: payload,
      fetchStatus: "success" as const,
      errorMessage: null,
      fetchedAt: now,
      staleAt: hoursFromNow(Number(env.PROVIDER_CACHE_STALE_HOURS ?? 12)),
      expiresAt: hoursFromNow(Number(env.PROVIDER_CACHE_STALE_HOURS ?? 12) * 2),
    };
    await upsertProviderCache(row);
    return row;
  } catch (error) {
    await ensureSteamProfile(steamId64, null);
    const message = error instanceof Error ? error.message : "Unknown provider error";
    const status = message.includes("required") ? "missing_config" : "error";
    const row = {
      provider,
      cacheKey,
      steamId: steamId64,
      payloadHash: null,
      rawPayload: null,
      fetchStatus: status as "error" | "missing_config",
      errorMessage: message,
      fetchedAt: now,
      staleAt: minutesFromNow(Number(env.PROVIDER_CACHE_ERROR_TTL_MINUTES ?? 15)),
      expiresAt: minutesFromNow(Number(env.PROVIDER_CACHE_ERROR_TTL_MINUTES ?? 15)),
    };
    await upsertProviderCache(row);
    return row;
  }
}

async function queueRefreshIfStale(
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
  steamId64: string,
  sourcePath: string,
  refreshedAt: Date,
) {
  const db = createDb();
  const caches = await db.select().from(providerCache).where(eq(providerCache.steamId, steamId64));
  const reportStaleAt = new Date(
    refreshedAt.getTime() + Number(env.REPORT_STALE_HOURS ?? 12) * 60 * 60 * 1000,
  );
  const providerIsStale = caches.some(
    (cache) => cache.fetchStatus !== "success" || cache.staleAt <= new Date(),
  );
  const missingProviders = ["steam", "steam_bans", "leetify", "csstats", "faceit"].some(
    (provider) => !caches.some((cache) => cache.provider === provider),
  );
  if (reportStaleAt > new Date() && !providerIsStale && !missingProviders) {
    return false;
  }

  const refresh = generateReport(steamId64, sourcePath).then(() => undefined);
  if (waitUntil) {
    waitUntil(refresh);
  } else {
    void refresh.catch((error) => {
      console.error(error);
    });
  }
  return true;
}

async function fetchProviderPayload(steamId64: string, provider: Provider) {
  if (steamId64 === TARGET_STEAM_ID) {
    return calibrationPayload(provider);
  }
  if (provider === "steam") {
    return createSteamClient({ apiKey: env.STEAM_API_KEY }).getPlayerSummary(steamId64);
  }
  if (provider === "steam_bans") {
    return createSteamClient({ apiKey: env.STEAM_API_KEY }).getBanState(steamId64);
  }
  if (provider === "leetify") {
    return createLeetifyClient({
      apiKey: env.LEETIFY_API_KEY,
      baseUrl: env.LEETIFY_BASE_URL,
      timeoutMs: Number(env.LEETIFY_TIMEOUT_MS ?? 10_000),
    }).getProfile(steamId64);
  }
  if (provider === "faceit") {
    return createFaceitClient({
      apiKey: env.FACEIT_API_KEY,
      baseUrl: env.FACEIT_BASE_URL,
      timeoutMs: Number(env.FACEIT_TIMEOUT_MS ?? 10_000),
    }).getProfileBySteamId(steamId64);
  }
  return createCSStatsClient({
    baseUrl: env.CSSTATS_BASE_URL,
    timeoutMs: Number(env.CSSTATS_TIMEOUT_MS ?? 10_000),
    userAgent: env.CSSTATS_USER_AGENT,
  }).getPlayerProfile(steamId64);
}

async function ensureSteamProfile(steamId64: string, summary: SteamPlayerSummary | null) {
  const db = createDb();
  if (!summary) {
    await db
      .insert(steamProfile)
      .values({
        steamId: steamId64,
        personaName: null,
        avatarUrl: null,
        profileUrl: `https://steamcommunity.com/profiles/${steamId64}`,
        visibilityState: null,
        lastSeenAt: new Date(),
      })
      .onConflictDoNothing({ target: steamProfile.steamId });
    return;
  }
  await db
    .insert(steamProfile)
    .values({
      steamId: steamId64,
      personaName: summary.personaName,
      avatarUrl: summary.avatarUrl,
      profileUrl: summary.profileUrl ?? `https://steamcommunity.com/profiles/${steamId64}`,
      visibilityState: summary.visibilityState,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: steamProfile.steamId,
      set: {
        personaName: summary.personaName,
        avatarUrl: summary.avatarUrl,
        profileUrl: summary.profileUrl ?? `https://steamcommunity.com/profiles/${steamId64}`,
        visibilityState: summary.visibilityState,
        lastSeenAt: new Date(),
      },
    });
}

async function upsertProviderCache(row: typeof providerCache.$inferInsert) {
  const db = createDb();
  await db
    .insert(providerCache)
    .values(row)
    .onConflictDoUpdate({
      target: [providerCache.provider, providerCache.cacheKey],
      set: row,
    });
}

async function getLatestReport(steamId64: string) {
  const db = createDb();
  const [report, caches, reports] = await Promise.all([
    db
      .select()
      .from(generatedReport)
      .where(eq(generatedReport.steamId, steamId64))
      .orderBy(desc(generatedReport.refreshedAt))
      .get(),
    db.select().from(providerCache).where(eq(providerCache.steamId, steamId64)),
    listPlayerReports(steamId64),
  ]);
  if (!report) {
    return undefined;
  }
  const verdict =
    (report.verdict as string) === "not_enough_evidence" ? "likely_not_cheating" : report.verdict;
  return attachProviderDetails(
    {
      ...report,
      verdict,
      explanation: normalizeReportExplanation(report.explanation, verdict),
      reportCount: reports.accusationCount,
    },
    buildProviderDetails(caches),
    reports,
  );
}

async function listPlayerReports(steamId64: string) {
  const db = createDb();
  const rows = await db
    .select()
    .from(playerReport)
    .where(and(eq(playerReport.steamId, steamId64), eq(playerReport.status, "active")))
    .orderBy(desc(playerReport.createdAt));
  const accusationCount = rows.filter((row) => row.reason !== "legit").length;
  const legitCount = rows.filter((row) => row.reason === "legit").length;
  return {
    count: rows.length,
    accusationCount,
    legitCount,
    reports: rows,
  };
}

async function listReporterReports(reporterUserId: string) {
  const db = createDb();
  const rows = await db
    .select()
    .from(playerReport)
    .where(and(eq(playerReport.reporterUserId, reporterUserId), eq(playerReport.status, "active")))
    .orderBy(desc(playerReport.createdAt));
  const reports = await Promise.all(
    rows.map(async (row) => {
      await Promise.all([
        refreshProvider(row.steamId, "steam", false),
        refreshProvider(row.steamId, "steam_bans", false),
      ]);
      const [profile, latestReport, banCache] = await Promise.all([
        db.select().from(steamProfile).where(eq(steamProfile.steamId, row.steamId)).get(),
        db
          .select()
          .from(generatedReport)
          .where(eq(generatedReport.steamId, row.steamId))
          .orderBy(desc(generatedReport.refreshedAt))
          .get(),
        db
          .select()
          .from(providerCache)
          .where(
            and(
              eq(providerCache.provider, "steam_bans"),
              eq(providerCache.cacheKey, `steam_bans:${row.steamId}`),
            ),
          )
          .get(),
      ]);
      const ban = banSummary(banCache?.rawPayload as SteamBanState | null | undefined);
      return {
        id: row.id,
        steamId: row.steamId,
        playerName: profile?.personaName ?? row.steamId,
        profileUrl: profile?.profileUrl ?? `https://steamcommunity.com/profiles/${row.steamId}`,
        reason: row.reason,
        notes: row.notes,
        createdAt: row.createdAt,
        reportVerdict: latestReport?.verdict ?? null,
        reportUrl: latestReport?.sourcePath ?? `/profiles/${row.steamId}`,
        ban,
      };
    }),
  );
  return { reports };
}

function banSummary(ban: SteamBanState | null | undefined) {
  const types = [
    ...(ban?.vacBanned ? ["VAC ban"] : []),
    ...(ban?.gameBanCount
      ? [`${ban.gameBanCount} game ban${ban.gameBanCount === 1 ? "" : "s"}`]
      : []),
    ...(ban?.communityBanned ? ["Community ban"] : []),
  ];
  return {
    status: types.length ? ("banned" as const) : ("not_banned" as const),
    types,
    vacBanned: Boolean(ban?.vacBanned),
    gameBanCount: ban?.gameBanCount ?? 0,
    communityBanned: Boolean(ban?.communityBanned),
    daysSinceLastBan: ban?.daysSinceLastBan ?? null,
  };
}

function tryParseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function normalizeReportExplanation(
  explanation: string,
  verdict: "likely_cheating" | "likely_not_cheating",
) {
  if (
    explanation === "Available data does not clear the conservative threshold." ||
    explanation === "Not enough independent provider signals to classify this profile."
  ) {
    return "Available provider signals indicate this profile is likely not cheating.";
  }
  if (
    explanation ===
    "Multiple independent progression and performance signals exceed the conservative threshold."
  ) {
    return "Available provider signals indicate this profile is likely cheating.";
  }
  return (
    explanation ||
    (verdict === "likely_cheating"
      ? "Available provider signals indicate this profile is likely cheating."
      : "Available provider signals indicate this profile is likely not cheating.")
  );
}

function buildProviderDetails(caches: Array<typeof providerCache.$inferSelect>) {
  const steam = caches.find(
    (cache) => cache.provider === "steam" && cache.fetchStatus === "success",
  )?.rawPayload as SteamPlayerSummary | null | undefined;
  const csstats = caches.find(
    (cache) => cache.provider === "csstats" && cache.fetchStatus === "success",
  )?.rawPayload as CSStatsPlayerProfile | null | undefined;
  const leetify = caches.find(
    (cache) => cache.provider === "leetify" && cache.fetchStatus === "success",
  )?.rawPayload as LeetifyProfile | null | undefined;
  const faceit = caches.find(
    (cache) => cache.provider === "faceit" && cache.fetchStatus === "success",
  )?.rawPayload as FaceitProfile | null | undefined;
  const leetifyStats = buildLeetifyProfileStats(
    csstats?.steamId64 ?? leetify?.steam64Id ?? "",
    leetify,
  );
  const profileStats = csstats
    ? providerStats("csstats", "CSStats", csstats)
    : leetifyStats
      ? providerStats("leetify", "Leetify", leetifyStats)
      : null;
  return {
    steam: steam
      ? {
          name: steam.personaName,
          avatarUrl: steam.avatarUrl,
          profileUrl: steam.profileUrl,
          visibilityState: steam.visibilityState,
        }
      : null,
    csstats: csstats ? providerStats("csstats", "CSStats", csstats) : null,
    leetify: leetifyStats ? providerStats("leetify", "Leetify", leetifyStats) : null,
    faceit: faceit ? faceitDetails(faceit) : null,
    profileStats,
  };
}

function faceitDetails(profile: FaceitProfile) {
  return {
    found: profile.found,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl,
    country: profile.country,
    faceitUrl: profile.faceitUrl,
    skillLevel: profile.skillLevel,
    elo: profile.elo,
  };
}

function providerStats(
  provider: "csstats" | "leetify",
  label: "CSStats" | "Leetify",
  stats: CSStatsPlayerProfile | ReturnType<typeof buildLeetifyProfileStats>,
) {
  if (!stats) {
    return null;
  }
  return {
    provider,
    label,
    name: stats.name,
    profileUrl: stats.profileUrl,
    statsUrl: stats.statsUrl,
    premierRating: stats.premierRating,
    bestPremierRating: stats.bestPremierRating,
    bestRating: stats.bestRating,
    hasFaceit: stats.hasFaceit,
    kdRatio: stats.kdRatio,
    hltvRating: stats.hltvRating,
    matches: stats.matches,
    winRate: stats.winRate,
    hsPercentage: stats.hsPercentage,
    adr: stats.adr,
    clutchPercentage: stats.clutchPercentage,
    recentResults: stats.recentResults,
    mostPlayedMap: stats.mostPlayedMap,
    premierRatings: stats.premierRatings,
    competitiveRanks: stats.competitiveRanks,
    wingman: stats.wingman,
    aim: "aim" in stats ? stats.aim : null,
    utility: "utility" in stats ? stats.utility : null,
    positioning: "positioning" in stats ? stats.positioning : null,
    opening: "opening" in stats ? stats.opening : null,
    tLeetify: "tLeetify" in stats ? stats.tLeetify : null,
    ctLeetify: "ctLeetify" in stats ? stats.ctLeetify : null,
    timeToDamage: "timeToDamage" in stats ? stats.timeToDamage : null,
    crosshairPlacement: "crosshairPlacement" in stats ? stats.crosshairPlacement : null,
  };
}

function attachProviderDetails<T extends { reportCount?: number } | undefined>(
  report: T,
  providerDetails: ReturnType<typeof buildProviderDetails>,
  reportCounts?: Awaited<ReturnType<typeof listPlayerReports>>,
) {
  return report
    ? {
        ...report,
        providerDetails,
        accusationReportCount:
          reportCounts?.accusationCount ?? ("reportCount" in report ? report.reportCount : 0),
        legitReportCount: reportCounts?.legitCount ?? 0,
      }
    : report;
}

function stableHash(value: unknown) {
  let hash = 0;
  const input = JSON.stringify(value);
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
