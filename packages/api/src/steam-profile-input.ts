const STEAM_ID64_BASE = 76561197960265728n;

export type ResolvedSteamProfileInput = {
  steamId64: string | null;
  sourcePath: string;
  vanity: string | null;
};

export function normalizeSteamProfileInput(input: string): ResolvedSteamProfileInput | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = tryParseUrl(toUrlCandidate(trimmed));
  const hostname = parsed?.hostname.replace(/^www\./, "").toLowerCase() ?? "";
  const pathname = parsed?.pathname ?? trimmed;
  const path = pathname.replace(/\/+$/, "");

  const directSteamId64 = parseSteamId64(trimmed);
  if (directSteamId64) {
    return steamId64Result(directSteamId64);
  }

  const profileSteamId = /^\/?profiles\/(?<steamId>[^/]+)$/i.exec(path)?.groups?.steamId;
  if (profileSteamId) {
    const steamId64 = parseSteamId64(profileSteamId);
    return steamId64 ? steamId64Result(steamId64) : null;
  }

  const vanity = /^\/?id\/(?<vanity>[^/]+)$/i.exec(path)?.groups?.vanity;
  if (vanity) {
    return vanityResult(vanity);
  }

  if (hostname === "csgostats.gg") {
    const csstatsSteamId = /^\/player\/(?<steamId>[^/]+)$/i.exec(path)?.groups?.steamId;
    const steamId64 = csstatsSteamId ? parseSteamId64(csstatsSteamId) : null;
    return steamId64 ? steamId64Result(steamId64) : null;
  }

  if (hostname === "leetify.com") {
    const leetifySteamId = /^\/app\/profile\/(?<steamId>[^/]+)$/i.exec(path)?.groups?.steamId;
    const steamId64 = leetifySteamId ? parseSteamId64(leetifySteamId) : null;
    return steamId64 ? steamId64Result(steamId64) : null;
  }

  if (!trimmed.includes("/") && /^[a-zA-Z0-9_-]{2,64}$/.test(trimmed)) {
    return vanityResult(trimmed);
  }

  return null;
}

export function parseSteamId64(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{17}$/.test(trimmed)) {
    return trimmed;
  }

  const steam2 = /^STEAM_[0-5]:(?<authServer>[01]):(?<account>\d+)$/i.exec(trimmed);
  if (steam2?.groups) {
    const accountId = BigInt(steam2.groups.account) * 2n + BigInt(steam2.groups.authServer);
    return (STEAM_ID64_BASE + accountId).toString();
  }

  const steam3 = /^\[U:1:(?<account>\d+)\]$/i.exec(trimmed);
  if (steam3?.groups) {
    return (STEAM_ID64_BASE + BigInt(steam3.groups.account)).toString();
  }

  if (/^\d{1,10}$/.test(trimmed)) {
    return (STEAM_ID64_BASE + BigInt(trimmed)).toString();
  }

  return null;
}

function steamId64Result(steamId64: string): ResolvedSteamProfileInput {
  return { steamId64, sourcePath: `/profiles/${steamId64}`, vanity: null };
}

function vanityResult(vanity: string): ResolvedSteamProfileInput {
  return { steamId64: null, sourcePath: `/id/${vanity}`, vanity };
}

function tryParseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function toUrlCandidate(value: string) {
  if (value.includes("://")) {
    return value;
  }
  if (/^(steamcommunity\.com|steamcommunity\.bet|csgostats\.gg|leetify\.com)\//i.test(value)) {
    return `https://${value}`;
  }
  return `https://steamcommunity.bet${value.startsWith("/") ? value : `/${value}`}`;
}
