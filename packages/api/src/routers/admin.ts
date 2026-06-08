import { createDb } from "@steamcommunity.bet/db";
import { account, user } from "@steamcommunity.bet/db/schema/auth";
import { generatedReport, playerReport, steamProfile } from "@steamcommunity.bet/db/schema/report";
import { desc, eq } from "drizzle-orm";

import { ORPCError, protectedProcedure } from "../index";

const ADMIN_STEAM_ID = "76561199570438277";
const ADMIN_STEAM_VANITY = "caulkenstein";

export const adminRouter = {
  check: protectedProcedure.handler(async ({ context }) => {
    return { isAdmin: await isAdminUser(context.session.user.id) };
  }),

  users: protectedProcedure.handler(async ({ context }) => {
    await requireAdmin(context.session.user.id);
    const db = createDb();
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        banned: user.banned,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        steamId: account.accountId,
        providerId: account.providerId,
      })
      .from(user)
      .leftJoin(account, eq(account.userId, user.id))
      .orderBy(desc(user.createdAt));

    return {
      users: rows
        .filter((row) => !row.providerId || row.providerId === "steam")
        .map(({ providerId: _providerId, ...row }) => ({
          ...row,
          isAdmin: row.steamId === ADMIN_STEAM_ID || row.name.toLowerCase() === ADMIN_STEAM_VANITY,
        })),
    };
  }),

  reportedPlayers: protectedProcedure.handler(async ({ context }) => {
    await requireAdmin(context.session.user.id);
    const db = createDb();
    const [reportRows, generatedRows] = await Promise.all([
      db
        .select({
          id: playerReport.id,
          steamId: playerReport.steamId,
          reason: playerReport.reason,
          notes: playerReport.notes,
          createdAt: playerReport.createdAt,
          reporterName: user.name,
          playerName: steamProfile.personaName,
          profileUrl: steamProfile.profileUrl,
        })
        .from(playerReport)
        .leftJoin(user, eq(playerReport.reporterUserId, user.id))
        .leftJoin(steamProfile, eq(playerReport.steamId, steamProfile.steamId))
        .where(eq(playerReport.status, "active"))
        .orderBy(desc(playerReport.createdAt)),
      db.select().from(generatedReport).orderBy(desc(generatedReport.refreshedAt)),
    ]);

    const latestGenerated = new Map<string, (typeof generatedRows)[number]>();
    for (const row of generatedRows) {
      if (!latestGenerated.has(row.steamId)) {
        latestGenerated.set(row.steamId, row);
      }
    }

    const bySteamId = new Map<string, typeof reportRows>();
    for (const row of reportRows) {
      const latest = latestGenerated.get(row.steamId);
      if (!latest) {
        continue;
      }
      bySteamId.set(row.steamId, [...(bySteamId.get(row.steamId) ?? []), row]);
    }

    return {
      players: [...bySteamId.entries()].map(([steamId, rows]) => {
        const latest = latestGenerated.get(steamId);
        const accusations = rows.filter((row) => row.reason !== "legit");
        const disputes = rows.filter((row) => row.reason === "legit");
        return {
          steamId,
          playerName: rows[0]?.playerName ?? steamId,
          profileUrl: rows[0]?.profileUrl ?? `https://steamcommunity.com/profiles/${steamId}`,
          reportUrl: latest?.sourcePath ?? `/profiles/${steamId}`,
          verdict: latest?.verdict ?? "likely_not_cheating",
          lastCheckedAt: latest?.refreshedAt ?? null,
          totalReports: rows.length,
          accusationCount: accusations.length,
          disputeCount: disputes.length,
          recentReports: rows.slice(0, 5).map((row) => ({
            id: row.id,
            reporterName: row.reporterName ?? "Steam user",
            reason: row.reason,
            notes: row.notes,
            createdAt: row.createdAt,
          })),
        };
      }),
    };
  }),
};

async function requireAdmin(userId: string) {
  if (!(await isAdminUser(userId))) {
    throw new ORPCError("FORBIDDEN");
  }
}

async function isAdminUser(userId: string) {
  const db = createDb();
  const row = await db
    .select({
      steamId: account.accountId,
      name: user.name,
    })
    .from(user)
    .leftJoin(account, eq(account.userId, user.id))
    .where(eq(user.id, userId))
    .get();
  return row?.steamId === ADMIN_STEAM_ID || row?.name.toLowerCase() === ADMIN_STEAM_VANITY;
}
