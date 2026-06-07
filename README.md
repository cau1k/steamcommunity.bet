# steamcommunity.bet

CS2 cheating-risk intelligence, framed like a betting board.

Not a cheat provider. Not real-money gambling. Not affiliated with Valve, Steam,
CSStats, or Leetify.

## Product

`steamcommunity.bet` scores the likelihood that a Steam account is cheating in
Counter-Strike. The public surface should feel like odds, markets, and line
movement, but the underlying product is reputation analysis:

- Steam identity and profile context
- CSStats match/player history
- Leetify performance signals
- Steam Community profile/status metadata
- user-submitted watchlists and notes
- signed-in player reports
- transparent confidence levels instead of fake certainty

The first useful product is a search box:

1. paste Steam profile URL, SteamID64, vanity URL, CSStats URL, or Leetify URL
2. resolve the account
3. fetch available public signals
4. show a cheating-risk board with evidence links
5. let logged-in users report, watch, annotate, and revisit profiles

Also support Steam URL replacement. A user should be able to replace
`steamcommunity.com` with `steamcommunity.bet` and land on a generated report:

- `https://steamcommunity.com/id/mick903`
- `https://steamcommunity.bet/id/mick903`
- `https://steamcommunity.com/profiles/7656119...`
- `https://steamcommunity.bet/profiles/7656119...`

Report pages should begin generating on page load. If a stored generated report
already exists, show it immediately, then refresh stale provider data in the
background.

## API Direction

Build a server API that wraps external sources behind one account model.

Keep external clients separate from oRPC orchestration:

- `packages/providers`
  - typed external provider clients
  - no route logic
  - no Better Auth coupling
  - no direct UI imports
  - returns typed provider payloads and normalized provider facts
- `packages/api`
  - oRPC routers
  - cache orchestration
  - report generation
  - scoring
  - signed-in player reports
- `apps/web`
  - calls oRPC only
  - never fetches CSStats/Leetify/Steam directly

Planned providers:

- `steamcommunity.com`
  - Steam OpenID login
  - vanity/profile resolution where available
  - `ISteamUser/GetPlayerSummaries/v0002`
- `csstats.gg`
  - no obvious maintained typed client found yet
  - likely custom thin client/scraper behind our provider interface
  - useful references found: `ShayneEvans/csstats_scraper`,
    `claabs/csstatsgg-stats`, `joshblaszczyk/cs2-stats-overlay`,
    `Juknum/csstats-plus`, `EliusHHimel/csgostats-api`
  - `EliusHHimel/csgostats-api` is a useful minimal example: fetch
    `https://csgostats.gg/player/:steamId`, parse HTML with
    `node-html-parser`, extract `.best .cs2rating`
  - do not depend on that repo directly; rebuild the pattern as a typed
    provider with fixtures, selector tests, cache, and normalized output
  - player profile wrapper, match history, and suspicious-stat extraction
- `leetify.com`
  - use `leetify-api` if it survives local integration
  - package: `https://github.com/Ativ3k/leetify-api`
  - public API docs: `https://api-public-docs.cs-prod.leetify.com/`
  - aim, utility, positioning, opening-duel, and consistency signals
  - profile, profile matches, match detail, and match lookup by source

Provider client shape:

- `steam-client.ts`
  - `resolveVanity(vanity)`
  - `getPlayerSummary(steamId64)`
  - `getBanState(steamId64)`
- `leetify-client.ts`
  - `getProfile(steamId64)`
  - `getPlayerMatches(steamId64)`
  - `getMatch(matchId)`
  - `getMatchBySource(source, sourceId)`
- `csstats-client.ts`
  - `getPlayerProfile(steamId64)`
  - `getPlayerStats(steamId64)`
  - `getPlayerMatches(steamId64)`
  - fetch HTML, parse selectors, return typed objects

oRPC router shape:

- `profile.resolve`
- `report.get`
- `report.getOrGenerate`
- `report.refreshProvider`
- `playerReport.create`
- `playerReport.listForSteamId`

Page load should call oRPC, not providers directly:

```ts
const report = await orpc.report.getOrGenerate({
  path: "/id/mick903",
});
```

Provider wrappers should be idempotent. Store provider payload snapshots and
normalized facts separately so scoring can change without refetching every
external source.

Provider calls should be cache-first. Page load should create work, not blindly
refetch every source:

1. load cached `generated_report`
2. load cached provider snapshots
3. mark stale/missing provider data
4. enqueue refresh jobs for stale/missing providers
5. normalize fresh payloads into `cheat_signal`
6. recompute verdict
7. update the report page

Suggested cache windows:

- Steam profile summary: 6-24 hours
- Leetify profile: 6-24 hours
- Leetify match history: 12-24 hours
- CSStats profile/matches: 12-24 hours
- ban/privacy/enforcement checks: 1-6 hours
- signed-in player reports: no external cache; update immediately

Cache entries need `provider`, `cache_key`, `payload_hash`, `fetched_at`,
`stale_at`, `expires_at`, and `fetch_status`.

HTML-scraped providers need extra guardrails:

- keep selectors centralized
- save raw HTML fixtures for regression tests
- treat selector misses as provider failure, not `not_enough_evidence`
- cache failed fetches briefly to avoid retry storms
- normalize fields before scoring; never score directly from scraped strings

First-party user reports are separate from external provider data. They should
be visible as a stat, rate-limited, and weighted carefully so one loud account
cannot manufacture a verdict.

Generated analysis reports are also stored. They are not the same as signed-in
player reports:

- generated report: system-created account analysis
- player report: signed-in user accusation/evidence submission

Every generated report should keep its resolved Steam identity, provider
snapshots, normalized signals, verdict, explanation, source links, and freshness
state.

## Authentication

Use Steam login through a custom Better Auth plugin package.

Reference gist:

`https://gist.github.com/Whats-A-MattR/5bce5574e568e8d8e6be55cf692df3a1`

Better Auth does not currently have a normal Steam OAuth/OIDC provider. Steam
uses OpenID 2.0-ish login behavior:

- no OAuth client id
- no client secret
- no redirect whitelist
- no email address
- no standard OIDC profile endpoint
- SteamID comes from the OpenID callback
- profile fetch requires Steam Web API key

Add a workspace package for this:

`packages/better-auth-steam`

Expected exports:

- server plugin: `steamAuthPlugin({ steamApiKey })`
- client plugin: `steamAuthClient()`

Expected Better Auth endpoints:

- `POST /sign-in/steam`
  - returns Steam OpenID redirect URL
- `GET /steam/callback`
  - verifies OpenID response with Steam
  - extracts SteamID64
  - fetches Steam profile summary
  - creates or links Better Auth account
  - creates session cookie
  - redirects to app

Important implementation notes from the gist:

- account provider id should be `steam`
- account id should be SteamID64
- Better Auth needs an email field, but Steam does not provide one
- use a deterministic placeholder email such as `${steamid}@steam.local`
- do not treat that placeholder as verified or contactable
- fix the gist before use; the referenced server code has typos and incomplete
  `URL`/`fetch` construction

## Data Model

Core tables to add after the auth package:

- `steam_profile`
  - `steam_id`
  - `persona_name`
  - `avatar_url`
  - `profile_url`
  - `visibility_state`
  - `last_seen_at`
- `external_profile`
  - `steam_id`
  - `provider`
  - `provider_profile_url`
  - `raw_payload`
  - `fetched_at`
- `provider_cache`
  - `provider`
  - `cache_key`
  - `steam_id`
  - `payload_hash`
  - `raw_payload`
  - `fetch_status`
  - `fetched_at`
  - `stale_at`
  - `expires_at`
- `cheat_signal`
  - `steam_id`
  - `provider`
  - `signal`
  - `value`
  - `weight`
  - `source_url`
  - `observed_at`
- `risk_score`
  - `steam_id`
  - `score`
  - `confidence`
  - `explanation`
  - `computed_at`
- `generated_report`
  - `id`
  - `steam_id`
  - `source_path`
  - `verdict`
  - `explanation`
  - `provider_freshness`
  - `generated_at`
  - `refreshed_at`
- `watchlist_entry`
  - `user_id`
  - `steam_id`
  - `note`
  - `created_at`
- `player_report`
  - `reporter_user_id`
  - `steam_id`
  - `reason`
  - `match_url`
  - `notes`
  - `status`
  - `created_at`

## Scoring

Start conservative. Evidence over vibes.

The scoring engine can use numeric internals, but the product should not show a
public percentage. Public output is a verdict plus explanation:

- `likely_cheating`
- `not_enough_evidence`

Only show `likely_cheating` when multiple independent signal families agree or a
trusted source confirms a ban. Everything else stays `not_enough_evidence`.

Initial signal families:

- aim consistency
  - headshot rate stability across many matches
  - time-to-damage outliers
  - pre-aim and crosshair-placement efficiency
  - spray accuracy and first-bullet accuracy
- game-sense anomalies
  - repeated correct clears through low-information paths
  - unusually high success against hidden/flanking players
  - suspicious reaction timing after enemy visibility
- progression anomalies
  - sudden skill/rank jumps
  - new account with elite metrics
  - old dormant account with abrupt performance shift
- match-network signals
  - repeated queues with already high-risk accounts
  - suspicious party clusters
  - repeated reports from unrelated signed-in users
- provider conflict signals
  - CSStats and Leetify disagreement worth investigation
  - missing/private data after suspicious matches
  - identity changes across providers
- enforcement and reputation signals
  - VAC/game ban state
  - profile privacy changes
  - signed-in report volume
  - reporter quality and reporter diversity

Report weighting:

- Steam login required
- one active report per reporter per target
- reports from unrelated accounts count more than reports from a friend group
- reporters with accurate historical reports count more
- reports without match links count less

Display:

- verdict
- explanation
- strongest evidence
- signed-in report count
- missing data
- provider freshness
- source links

Never expose the internal score. Never claim certainty unless the source says
ban/conviction directly.

## Routes

Mirror Steam Community profile routes:

- `/id/[vanity]`
- `/profiles/[steamId64]`

Route behavior:

1. resolve the Steam account
2. create or load `steam_profile`
3. create or load latest `generated_report`
4. render immediately if a report exists
5. start provider refresh/generation on page load if missing or stale
6. update the report page as provider data lands

Use these routes as canonical report URLs. The search box should redirect into
one of them after resolution.

Page-load generation should be single-flight per SteamID/provider. Concurrent
views should reuse the same in-progress refresh instead of stampeding external
services.

## First Milestones

1. Replace scaffold landing page with account lookup.
2. Add `packages/better-auth-steam`.
3. Wire Steam login into `packages/auth` and web client.
4. Add Steam profile resolver.
5. Add `/id/[vanity]` and `/profiles/[steamId64]` generated report routes.
6. Add generated report storage and page-load generation.
7. Add provider cache and stale-refresh jobs.
8. Add provider abstraction for external profile wrappers.
9. Add Leetify provider, starting from `leetify-api`.
10. Add custom CSStats provider/client.
11. Add normalized cheat signals and first scoring pass.
12. Add signed-in player reports and report count display.
13. Add watchlists for logged-in users.
14. Deploy on Cloudflare once DNS is live.

## Cloudflare

Current stack targets Cloudflare through Alchemy:

- SvelteKit web app
- Hono server worker
- Cloudflare D1
- Better Auth
- oRPC

Required env once the domain is on Cloudflare:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL=https://steamcommunity.bet`
- `CORS_ORIGIN=https://steamcommunity.bet`
- `STEAM_API_KEY`
- `LEETIFY_API_KEY`, optional but preferred for rate limits

Likely routing:

- `https://steamcommunity.bet` -> web
- `https://api.steamcommunity.bet` -> server, if split routing becomes useful

## Guardrails

- no real-money wagering in v1
- no skins wagering
- no cheat distribution
- no fake Steam login UI
- no Steam/Valve branding beyond necessary factual references
- no hidden credential collection
- no harassment workflow; evidence links and confidence levels only
- no anonymous report spam; reporting requires Steam login

The bit is "betting board for cheater odds." The product is public-account risk
analysis.
