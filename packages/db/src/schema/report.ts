import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const steamProfile = sqliteTable("steam_profile", {
  steamId: text("steam_id").primaryKey(),
  personaName: text("persona_name"),
  avatarUrl: text("avatar_url"),
  profileUrl: text("profile_url"),
  visibilityState: integer("visibility_state"),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const externalProfile = sqliteTable(
  "external_profile",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    steamId: text("steam_id")
      .notNull()
      .references(() => steamProfile.steamId, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerProfileUrl: text("provider_profile_url").notNull(),
    rawPayload: text("raw_payload", { mode: "json" }).notNull(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("external_profile_steam_provider_idx").on(table.steamId, table.provider)],
);

export const providerCache = sqliteTable(
  "provider_cache",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    cacheKey: text("cache_key").notNull(),
    steamId: text("steam_id").references(() => steamProfile.steamId, { onDelete: "cascade" }),
    payloadHash: text("payload_hash"),
    rawPayload: text("raw_payload", { mode: "json" }),
    fetchStatus: text("fetch_status", {
      enum: ["success", "error", "missing_config"],
    }).notNull(),
    errorMessage: text("error_message"),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
    staleAt: integer("stale_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("provider_cache_provider_key_idx").on(table.provider, table.cacheKey),
    index("provider_cache_steam_provider_idx").on(table.steamId, table.provider),
  ],
);

export const cheatSignal = sqliteTable(
  "cheat_signal",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    steamId: text("steam_id")
      .notNull()
      .references(() => steamProfile.steamId, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    signal: text("signal").notNull(),
    value: text("value").notNull(),
    weight: integer("weight").notNull(),
    confidence: text("confidence", { enum: ["low", "medium", "high"] }).notNull(),
    sourceUrl: text("source_url"),
    observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("cheat_signal_steam_idx").on(table.steamId)],
);

export const riskScore = sqliteTable("risk_score", {
  steamId: text("steam_id")
    .primaryKey()
    .references(() => steamProfile.steamId, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  confidence: text("confidence", { enum: ["low", "medium", "high"] }).notNull(),
  explanation: text("explanation").notNull(),
  computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull(),
});

export const generatedReport = sqliteTable(
  "generated_report",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    steamId: text("steam_id")
      .notNull()
      .references(() => steamProfile.steamId, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    verdict: text("verdict", { enum: ["likely_cheating", "likely_not_cheating"] }).notNull(),
    explanation: text("explanation").notNull(),
    strongestEvidence: text("strongest_evidence", { mode: "json" }).$type<string[]>().notNull(),
    missingData: text("missing_data", { mode: "json" }).$type<string[]>().notNull(),
    providerFreshness: text("provider_freshness", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull(),
    sourceLinks: text("source_links", { mode: "json" })
      .$type<Array<{ label: string; href: string }>>()
      .notNull(),
    reportCount: integer("report_count").default(0).notNull(),
    generatedAt: integer("generated_at", { mode: "timestamp_ms" }).notNull(),
    refreshedAt: integer("refreshed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("generated_report_steam_idx").on(table.steamId),
    index("generated_report_refreshed_idx").on(table.refreshedAt),
  ],
);

export const playerReport = sqliteTable(
  "player_report",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    steamId: text("steam_id")
      .notNull()
      .references(() => steamProfile.steamId, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    matchUrl: text("match_url"),
    notes: text("notes"),
    status: text("status", { enum: ["active", "dismissed"] })
      .default("active")
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("player_report_reporter_target_idx").on(table.reporterUserId, table.steamId),
    index("player_report_steam_idx").on(table.steamId),
  ],
);

export const steamProfileRelations = relations(steamProfile, ({ many, one }) => ({
  externalProfiles: many(externalProfile),
  providerCaches: many(providerCache),
  cheatSignals: many(cheatSignal),
  generatedReports: many(generatedReport),
  playerReports: many(playerReport),
  riskScore: one(riskScore),
}));
