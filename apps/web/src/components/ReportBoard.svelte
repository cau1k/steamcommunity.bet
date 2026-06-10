<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { client, orpc } from '$lib/orpc';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { PUBLIC_SERVER_URL } from '$env/static/public';
	import ThumbsDownSharpIcon from '@iconify-svelte/pixelarticons/thumbs-down-sharp';
	import ThumbsUpSharpIcon from '@iconify-svelte/pixelarticons/thumbs-up-sharp';
	import { createMutation, createQuery } from '@tanstack/svelte-query';

	type Props = {
		path: string;
	};

	type ProviderReport = {
		verdict: 'likely_cheating' | 'likely_not_cheating';
		explanation: string;
		strongestEvidence: string[];
		strongestEvidenceDetails?: Array<{
			signal: string;
			value: string;
			weight: number;
			confidence: 'low' | 'medium' | 'high';
		}>;
		missingData: string[];
		providerFreshness: Record<string, string>;
		refreshedAt: string | Date;
		sourceLinks: Array<{ label: string; href: string }>;
		reportCount: number;
		accusationReportCount: number;
		legitReportCount: number;
		recentCheatingReports: Array<{
			id: number;
			reporterName: string;
			reporterSteamId: string | null;
			reporterReportUrl: string | null;
			reason: string;
			notes: string | null;
			createdAt: string | Date;
		}>;
		viewerPlayerReport: {
			id: number;
			reason: string;
			notes: string | null;
			createdAt: string | Date;
		} | null;
		viewerOwnsPlayer: boolean;
		providerDetails?: {
			steam?: {
				name: string | null;
				avatarUrl: string | null;
				profileUrl: string | null;
				visibilityState: number | null;
				createdAt: string | null;
				level: number | null;
				inventory: {
					accessible: boolean;
					itemCount: number | null;
					marketableItemCount: number | null;
					pricedItemCount: number;
					currency: 'USD';
					estimatedValueCents: number | null;
				} | null;
				friends: {
					accessible: boolean;
					friendCount: number | null;
					checkedFriendCount: number;
					bannedFriendCount: number;
					vacBannedFriendCount: number;
					gameBannedFriendCount: number;
				} | null;
			} | null;
			csstats?: ProfileStats | null;
			leetify?: ProfileStats | null;
			profileStats?: ProfileStats | null;
			faceit?: {
				found: boolean;
				nickname: string | null;
				avatarUrl: string | null;
				country: string | null;
				faceitUrl: string | null;
				skillLevel: number | null;
				elo: number | null;
				lastPlayedAt: string | null;
				lastPlayedGame: 'cs2' | 'csgo' | null;
				membershipType: string | null;
				memberships: string[];
				hasPremium: boolean;
				hasEsea: boolean;
				bans: Array<{
					reason: string | null;
					type: string | null;
					startsAt: string | null;
					endsAt: string | null;
					game: string | null;
				}>;
				latestBan: {
					reason: string | null;
					type: string | null;
					startsAt: string | null;
					endsAt: string | null;
					game: string | null;
				} | null;
			} | null;
		};
	};

	type ProfileStats = {
		provider: 'csstats' | 'leetify';
		label: 'CSStats' | 'Leetify';
		name: string | null;
		profileUrl: string;
		statsUrl: string | null;
		premierRating: number | null;
		bestPremierRating: number | null;
		bestRating: number | null;
		hasFaceit: boolean | null;
		kdRatio: number | null;
		hltvRating: number | null;
		matches: number | null;
		winRate: number | null;
		hsPercentage: number | null;
		adr: number | null;
		clutchPercentage: number | null;
		recentResults: string[];
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
		wingman: {
			latestRank: string | null;
			bestRank: string | null;
			wins: number;
		} | null;
		aim?: number | null;
		utility?: number | null;
		positioning?: number | null;
		opening?: number | null;
		tLeetify?: number | null;
		ctLeetify?: number | null;
		timeToDamage?: number | null;
		crosshairPlacement?: number | null;
	};

	type SourceLink = { label: string; href: string; missing?: boolean };
	type FaceitDetails = NonNullable<NonNullable<ProviderReport['providerDetails']>['faceit']>;
	type ReportVote = 'up' | 'down';
	type PlayerReportReason = 'rage hacking/spinning' | 'walling' | 'aim hacking' | 'radar';
	type StoredPlayerReportReason = PlayerReportReason | 'legit';
	type RefreshProvider =
		| 'steam'
		| 'steam_bans'
		| 'steam_friends'
		| 'steam_inventory'
		| 'csstats'
		| 'leetify'
		| 'faceit';
	type RefreshStepStatus = 'idle' | 'loading' | 'done' | 'warn' | 'error';

	type RefreshStep = {
		provider: RefreshProvider;
		label: string;
		message: string;
		status: RefreshStepStatus;
		detail: string;
	};

	const playerReportReasons: PlayerReportReason[] = [
		'rage hacking/spinning',
		'walling',
		'aim hacking',
		'radar'
	];
	const refreshProviders: Array<Omit<RefreshStep, 'status' | 'detail'>> = [
		{ provider: 'steam', label: 'Steam profile', message: 'Loading Steam profile' },
		{ provider: 'steam_bans', label: 'Steam bans', message: 'Checking VAC and game bans' },
		{
			provider: 'steam_friends',
			label: 'Banned friends',
			message: 'Checking banned Steam friends'
		},
		{
			provider: 'steam_inventory',
			label: 'Inventory value',
			message: 'Pricing CS2 inventory'
		},
		{ provider: 'csstats', label: 'CSStats', message: 'Loading CSStats profile' },
		{ provider: 'leetify', label: 'Leetify', message: 'Loading Leetify profile' },
		{ provider: 'faceit', label: 'FACEIT', message: 'Checking FACEIT account' }
	];

	const props: Props = $props();
	const sessionQuery = authClient.useSession();
	let reportVote = $state<ReportVote | null>(null);
	let reportReason = $state<PlayerReportReason>('walling');
	let reportNote = $state('');
	let refreshPromise = $state<Promise<void> | null>(null);
	let refreshStatusMessage = $state('');
	let refreshSteps = $state<RefreshStep[]>(initialRefreshSteps());
	// svelte-ignore state_referenced_locally -- SvelteKit recreates this route component per path.
	const reportQuery = createQuery(
		orpc.report.getOrGenerate.queryOptions({ input: { path: props.path } })
	);
	const refreshMutation = createMutation(
		orpc.report.refreshProvider.mutationOptions({
			onSuccess: () => {
				$reportQuery.refetch();
			}
		})
	);
	const playerReportMutation = createMutation(
		orpc.playerReport.create.mutationOptions({
			onSuccess: () => {
				reportVote = null;
				reportReason = 'walling';
				reportNote = '';
				$reportQuery.refetch();
			}
		})
	);

	const report = $derived($reportQuery.data?.report as ProviderReport | undefined);
	const resolved = $derived($reportQuery.data?.resolved);
	const freshnessRows = $derived(
		Object.entries(report?.providerFreshness ?? {}).map(([provider, value]) => ({
			provider,
			label: providerLabel(provider),
			status: freshnessStatus(value),
			value: formatFreshness(value)
		}))
	);
	const isRefreshing = $derived(
		Boolean(refreshPromise) || $refreshMutation.isPending
	);
	const steam = $derived(report?.providerDetails?.steam);
	const csstats = $derived(report?.providerDetails?.csstats);
	const faceit = $derived(report?.providerDetails?.faceit);
	const leetify = $derived(report?.providerDetails?.leetify);
	const profileStats = $derived(report?.providerDetails?.profileStats ?? csstats);
	const viewerHasPlayerReport = $derived(Boolean(report?.viewerPlayerReport));
	const viewerOwnsPlayer = $derived(Boolean(report?.viewerOwnsPlayer));
	const sourceLinks = $derived(
		report ? withFaceitSource(report.sourceLinks, faceit, profileStats?.hasFaceit) : []
	);
	const displayName = $derived(steam?.name ?? resolved?.steamId64 ?? 'Unknown profile');
	const steamProfileUrl = $derived(
		steam?.profileUrl ??
			(resolved ? `https://steamcommunity.com/profiles/${resolved.steamId64}` : '')
	);
	const csstatsRows = $derived(
		profileStats
			? [
					['Source', profileStats.label],
					['Name', profileStats.name],
					['Current Premier', formatNumber(profileStats.premierRating)],
					['Best Premier', formatNumber(profileStats.bestPremierRating)],
					[`${profileStats.label} rating`, formatDecimal(profileStats.bestRating)],
					['FACEIT linked', formatBoolean(profileStats.hasFaceit)],
					['Matches', formatNumber(profileStats.matches)],
					['Winrate', formatPercent(profileStats.winRate)],
					['K/D', formatDecimal(profileStats.kdRatio)],
					['HLTV rating', formatDecimal(profileStats.hltvRating)],
					['HS', formatPercent(profileStats.hsPercentage)],
					['ADR', formatNumber(profileStats.adr)],
					['Clutch', formatPercent(profileStats.clutchPercentage)],
					['Aim', formatDecimal(profileStats.aim)],
					['Utility', formatDecimal(profileStats.utility)],
					['Positioning', formatDecimal(profileStats.positioning)],
					['Opening', formatDecimal(profileStats.opening)],
					['T rating', formatDecimal(profileStats.tLeetify)],
					['CT rating', formatDecimal(profileStats.ctLeetify)],
					['Time to Damage', formatMilliseconds(profileStats.timeToDamage)],
					['Crosshair Placement', formatDegrees(profileStats.crosshairPlacement)],
					['Recent', profileStats.recentResults?.join(' ') || null],
					['Most played', profileStats.mostPlayedMap]
				]
			: []
	);
	const leetifyHeaderStats = $derived(
		leetify
			? [
					['Aim', formatDecimal(leetify.aim)],
					['HS%', formatPercent(leetify.hsPercentage)],
					['Time to Damage', formatMilliseconds(leetify.timeToDamage)],
					['crosshair', formatDegrees(leetify.crosshairPlacement)]
				].filter(([, value]) => value)
			: []
	);
	const csstatsHeaderStats = $derived(
		csstats
			? [
					['HS', formatPercent(csstats.hsPercentage)],
					['K/D', formatDecimal(csstats.kdRatio)],
					['HLTV', formatDecimal(csstats.hltvRating)],
					['ADR', formatNumber(csstats.adr)],
					['Winrate', formatPercent(csstats.winRate)],
					['Matches', formatNumber(csstats.matches)]
				].filter(([, value]) => value)
			: []
	);
	const steamHeaderStats = $derived(steam ? steamQuickStats(steam) : []);
	const faceitActivityStats = $derived(faceit ? faceitCompetitiveStats(faceit) : []);
	const faceitLevelBadge = $derived(faceitLevelBadgeUrl(faceit));
	const faceitHeaderStats = $derived(faceit ? faceitMembershipStats(faceit) : []);
	const evidenceRows = $derived(
		report?.strongestEvidenceDetails?.length
			? report.strongestEvidenceDetails.map((item) => ({
					label: humanSignal(item.signal),
					value: item.value,
					tone: evidenceTone(item.weight)
				}))
			: (report?.strongestEvidence ?? []).map((item) => {
					const [signal, ...rest] = item.split(': ');
					return {
						label: humanSignal(signal),
						value: rest.join(': ') || item,
						tone: 'low'
					};
				})
	);
	const missingRows = $derived(
		(report?.missingData ?? []).map((item) => {
			const [provider, ...rest] = item.split(': ');
			const message = rest.join(': ') || item;
			return {
				provider,
				label: providerLabel(provider),
				message: humanMissingMessage(message),
				status: message === 'not fetched' ? 'warn' : 'bad'
			};
		})
	);
	const competitiveRankSummaries = $derived(
		(profileStats?.competitiveRanks ?? [])
			.map((rank) => ({
				...rank,
				displayRank: rank.latestRank ?? rank.bestRank
			}))
			.filter((rank) => typeof rank.displayRank === 'number')
	);
	const highestCompetitiveRank = $derived(
		competitiveRankSummaries.toSorted((a, b) => (b.displayRank ?? 0) - (a.displayRank ?? 0))[0] ??
			null
	);
	const lowestCompetitiveRank = $derived(
		competitiveRankSummaries.toSorted((a, b) => (a.displayRank ?? 0) - (b.displayRank ?? 0))[0] ??
			null
	);
	const currentPremier = $derived(
		displayPremierRating(profileStats)
			? {
					label: profileStats?.premierRating ? 'Current Premier' : 'Previous Premier',
					value: displayPremierRating(profileStats)
				}
			: null
	);
	const highestCompetitiveRankImage = $derived(rankImageUrl(highestCompetitiveRank?.displayRank));
	const lowestCompetitiveRankImage = $derived(rankImageUrl(lowestCompetitiveRank?.displayRank));
	const currentPremierParts = $derived(premierParts(currentPremier?.value));
	const lastRefreshedLabel = $derived(formatLastRefreshed(report?.refreshedAt));
	const reportModalTitle = $derived(reportVote ? reportVoteTitle(reportVote, report?.verdict) : '');
	const reportModalReason = $derived(reportVote ? reportVoteReason(reportVote, report?.verdict) : '');
	const isSubmittingReport = $derived($playerReportMutation.isPending);
	const reportSignInUrl = $derived(
		`${PUBLIC_SERVER_URL}/api/auth/steam?callbackURL=${encodeURIComponent(page.url.href)}`
	);

	function initialRefreshSteps() {
		return refreshProviders.map((step) => ({
			...step,
			status: 'idle' as const,
			detail: 'Queued'
		}));
	}

	function generatingReportSteps() {
		return refreshProviders.map((step) => ({
			...step,
			status: 'loading' as const,
			detail: step.message
		}));
	}

	function updateRefreshStep(
		provider: RefreshProvider,
		status: RefreshStepStatus,
		detail: string
	) {
		refreshSteps = refreshSteps.map((step) =>
			step.provider === provider ? { ...step, status, detail } : step
		);
	}

	async function refreshReport() {
		if (!resolved || refreshPromise) {
			return;
		}
		const steamId64 = resolved.steamId64;
		refreshSteps = initialRefreshSteps();
		refreshStatusMessage = 'Loading provider data';
		const promise = runRefreshReport(steamId64);
		refreshPromise = promise;
		promise.then(
			() => {
				setTimeout(() => {
					if (refreshPromise === promise) refreshPromise = null;
				}, 700);
			},
			() => {
				setTimeout(() => {
					if (refreshPromise === promise) refreshPromise = null;
				}, 1400);
			}
		);
	}

	async function runRefreshReport(steamId64: string) {
		try {
			await Promise.all(
				refreshProviders.map(async (step) => {
					updateRefreshStep(step.provider, 'loading', step.message);
					const result = await client.report.refreshProviderCache({
						steamId64,
						provider: step.provider
					});
					updateRefreshStep(
						step.provider,
						result.fetchStatus === 'success' ? 'done' : 'warn',
						result.fetchStatus === 'success' ? 'Loaded' : (result.errorMessage ?? result.fetchStatus)
					);
				})
			);
			refreshStatusMessage = 'Compiling report';
			await client.report.regenerateFromCache({ path: props.path });
			refreshStatusMessage = 'Report refreshed';
			await $reportQuery.refetch();
		} catch (error) {
			refreshStatusMessage = error instanceof Error ? error.message : 'Refresh failed';
			const loadingStep = refreshSteps.find((step) => step.status === 'loading');
			if (loadingStep) {
				updateRefreshStep(loadingStep.provider, 'error', 'Failed');
			}
			throw error;
		}
	}

	function refresh(
		provider: RefreshProvider
	) {
		if (!resolved) {
			return;
		}
		$refreshMutation.mutate({ steamId64: resolved.steamId64, provider });
	}

	function openReportModal(vote: ReportVote) {
		if (!$sessionQuery.data?.user || viewerHasPlayerReport || viewerOwnsPlayer) {
			return;
		}
		reportVote = vote;
		reportReason = 'aim hacking';
	}

	function closeReportModal() {
		if (isSubmittingReport) {
			return;
		}
		reportVote = null;
		reportReason = 'walling';
		reportNote = '';
	}

	function submitPlayerReport() {
		if (!resolved || !reportVote) {
			return;
		}
		const notes = reportNote.trim();
		const reason: StoredPlayerReportReason = reportVote === 'down' ? 'legit' : reportReason;
		$playerReportMutation.mutate({
			steamId64: resolved.steamId64,
			reason,
			notes: notes || undefined
		});
	}

	function formatNumber(value: number | null | undefined) {
		return typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : null;
	}

	function displayPremierRating(stats: ProfileStats | null | undefined) {
		if (!stats) {
			return null;
		}
		if (stats.premierRating && stats.premierRating > 0) {
			return stats.premierRating;
		}
		const latestHistorical = stats.premierRatings.find(
			(rating) => rating.latestRating && rating.latestRating > 0
		)?.latestRating;
		return latestHistorical ?? stats.bestPremierRating;
	}

	function formatDecimal(value: number | null | undefined) {
		return typeof value === 'number' ? value.toFixed(2) : null;
	}

	function formatPercent(value: number | null | undefined) {
		return typeof value === 'number' ? `${value}%` : null;
	}

	function formatDegrees(value: number | null | undefined) {
		return typeof value === 'number' ? `${formatDecimal(value)}°` : null;
	}

	function formatMilliseconds(value: number | null | undefined) {
		return typeof value === 'number' ? `${formatNumber(value)}ms` : null;
	}

	function formatBoolean(value: boolean | null | undefined) {
		if (value === true) return 'yes';
		if (value === false) return 'no';
		return null;
	}

	function formatCurrencyCents(value: number | null | undefined) {
		return typeof value === 'number'
			? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100)
			: null;
	}

	function formatAccountAge(value: string | null | undefined) {
		if (!value) {
			return null;
		}
		const createdAt = new Date(value);
		if (Number.isNaN(createdAt.getTime())) {
			return null;
		}
		const months = Math.max(
			0,
			(new Date().getFullYear() - createdAt.getFullYear()) * 12 +
				new Date().getMonth() -
				createdAt.getMonth()
		);
		if (months >= 24) {
			return `${Math.floor(months / 12)}y`;
		}
		if (months >= 1) {
			return `${months}mo`;
		}
		return '<1mo';
	}

	function steamQuickStats(profile: NonNullable<ProviderReport['providerDetails']>['steam']) {
		if (!profile) {
			return [];
		}
		const inventoryCents = profile.inventory?.estimatedValueCents ?? null;
		const inventoryValue = profile.inventory?.accessible
			? (formatCurrencyCents(inventoryCents) ?? '-')
			: 'private';
		const inventoryTone =
			typeof inventoryCents === 'number' ? (inventoryCents > 40_000 ? 'high' : 'low') : null;
		return [
			{ label: 'Age', value: formatAccountAge(profile.createdAt), tone: null },
			{ label: 'Level', value: formatNumber(profile.level) ?? '-', tone: null },
			{ label: 'CS2 inv', value: inventoryValue, tone: inventoryTone },
			{ label: 'Banned friends', value: steamFriendBanValue(profile.friends), tone: null }
		].filter((stat) => stat.value);
	}

	function steamFriendBanValue(
		friends: NonNullable<NonNullable<ProviderReport['providerDetails']>['steam']>['friends']
	) {
		if (!friends) {
			return null;
		}
		if (!friends.accessible) {
			return 'private';
		}
		return `${friends.bannedFriendCount}/${friends.checkedFriendCount}`;
	}

	function sourceIcon(label: string) {
		if (label === 'Steam') return { className: '--steam', url: '/source-icons/steam.svg' };
		if (label === 'CSStats') return { className: '--csstats', url: '/source-icons/csstats.svg' };
		if (label === 'FACEIT') return { className: '--faceit', url: '/source-icons/faceit.svg' };
		if (label === 'Leetify') return { className: '--leetify', url: '/source-icons/leetify.svg' };
		return null;
	}

	function withFaceitSource(
		links: Array<{ label: string; href: string }>,
		faceitProfile: FaceitDetails | null | undefined,
		hasFaceit: boolean | null | undefined
	): SourceLink[] {
		const next = links.map((source) =>
			source.label === 'FACEIT'
				? {
						...source,
						href: faceitProfile?.faceitUrl ?? source.href,
						missing: faceitProfile?.found === false
					}
				: source
		);
		if (next.some((source) => source.label === 'FACEIT')) {
			return next;
		}
		if (faceitProfile || hasFaceit === true) {
			return [
				...next,
				{
					label: 'FACEIT',
					href: faceitProfile?.faceitUrl ?? 'https://www.faceit.com/',
					missing: faceitProfile?.found === false
				}
			];
		}
		return next;
	}

	function providerLabel(provider: string) {
		if (provider === 'steam') return 'Steam';
		if (provider === 'steam_bans') return 'Steam bans';
		if (provider === 'steam_friends') return 'Steam friends';
		if (provider === 'steam_inventory') return 'Steam inventory';
		if (provider === 'csstats') return 'CSStats';
		if (provider === 'leetify') return 'Leetify';
		if (provider === 'faceit') return 'FACEIT';
		return provider.replaceAll('_', ' ');
	}

	function humanSignal(signal: string) {
		return signal
			.replaceAll('_', ' ')
			.replace(/\b\w/g, (letter) => letter.toUpperCase())
			.replace('Csstats', 'CSStats')
			.replace('Faceit', 'FACEIT');
	}

	function evidenceTone(weight: number) {
		if (weight >= 20) return 'high';
		if (weight >= 8) return 'medium';
		return 'low';
	}

	function humanMissingMessage(message: string) {
		if (message === 'not fetched') return 'Not fetched yet';
		if (message === 'missing_config') return 'Provider not configured';
		if (/404/.test(message)) return 'No public profile';
		return message;
	}

	function faceitCompetitiveStats(profile: FaceitDetails) {
		if (!profile.found) {
			return [];
		}
		const lastPlayed = profile.lastPlayedAt ? new Date(profile.lastPlayedAt) : null;
		const lastPlayedText =
			lastPlayed && !Number.isNaN(lastPlayed.getTime())
				? `last played ${formatRelativeAge(lastPlayed)}`
				: null;
		const lastPlayedTitle =
			lastPlayed && !Number.isNaN(lastPlayed.getTime())
				? `Last played ${lastPlayed.toLocaleDateString()}`
				: null;
		const active = lastPlayed ? faceitActive(lastPlayed) : false;
		return [
			{ label: 'ELO', value: formatNumber(profile.elo), title: null },
			{ label: active ? 'Active' : 'Inactive', value: lastPlayedText, title: lastPlayedTitle }
		].filter((stat) => stat.value);
	}

	function formatRelativeAge(value: Date) {
		const days = Math.max(0, Math.floor((Date.now() - value.getTime()) / 86_400_000));
		if (days < 60) {
			return `${days || 1}d ago`;
		}
		const months = Math.floor(days / 30);
		if (months < 24) {
			return `${months}mo ago`;
		}
		return `${Math.floor(months / 12)}y ago`;
	}

	function faceitActive(lastPlayed: Date) {
		const oneYearAgo = new Date();
		oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
		return lastPlayed > oneYearAgo;
	}

	function faceitLevelBadgeUrl(profile: FaceitDetails | null | undefined) {
		if (!profile?.found || !profile.skillLevel || profile.skillLevel < 1 || profile.skillLevel > 10) {
			return null;
		}
		return `/faceit-levels/${profile.skillLevel}.png`;
	}

	function faceitMembershipStats(profile: FaceitDetails) {
		const rows: string[] = [];
		if (profile.hasPremium) {
			rows.push('Premium');
		}
		if (profile.hasEsea) {
			rows.push('ESEA');
		}
		if (!rows.length && profile.membershipType) {
			rows.push(profile.membershipType);
		}
		return rows;
	}

	function faceitBanLabel(profile: FaceitDetails | null | undefined) {
		const ban = profile?.latestBan ?? profile?.bans?.[0];
		if (!ban) {
			return null;
		}
		return ban.reason ?? ban.type ?? 'unknown';
	}

	function freshnessStatus(value: string) {
		if (value === 'error' || value === 'missing_config') return 'bad';
		if (value === 'not fetched') return 'warn';
		return 'ok';
	}

	function formatFreshness(value: string) {
		if (value === 'error') return 'Fetch failed';
		if (value === 'missing_config') return 'Not configured';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatLastRefreshed(value: string | Date | undefined) {
		if (!value) return 'never';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'unknown';
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function verdictLabel(verdict: ProviderReport['verdict']) {
		return verdict === 'likely_cheating' ? 'Likely cheating' : 'Likely not cheating';
	}

	function reportVoteTitle(vote: ReportVote, verdict: ProviderReport['verdict'] | undefined) {
		if (vote === 'up') {
			return verdict === 'likely_cheating' ? 'Confirm likely cheating' : 'Accuse of cheating';
		}
		return verdict === 'likely_not_cheating' ? 'Confirm likely not cheating' : 'Dispute cheating';
	}

	function reportVoteReason(vote: ReportVote, verdict: ProviderReport['verdict'] | undefined) {
		if (vote === 'up') {
			return verdict === 'likely_cheating'
				? 'Reporter agrees the player is likely cheating'
				: 'Reporter accuses the player of cheating';
		}
		return verdict === 'likely_not_cheating'
			? 'Reporter agrees the player is likely not cheating'
			: 'Reporter disputes the likely cheating verdict';
	}

	function reportReasonLabel(reason: string) {
		if (reason === 'legit') return 'not cheating / legit';
		return reason;
	}

	function navigateToReport(event: MouseEvent, href: string) {
		event.preventDefault();
		goto(href);
	}

	function rankName(rank: number | null | undefined) {
		if (!rank) return 'Unranked';
		return (
			[
				'Silver I',
				'Silver II',
				'Silver III',
				'Silver IV',
				'Silver Elite',
				'Silver Elite Master',
				'Gold Nova I',
				'Gold Nova II',
				'Gold Nova III',
				'Gold Nova Master',
				'Master Guardian I',
				'Master Guardian II',
				'Master Guardian Elite',
				'Distinguished Master Guardian',
				'Legendary Eagle',
				'Legendary Eagle Master',
				'Supreme Master First Class',
				'Global Elite'
			][rank - 1] ?? `Rank ${rank}`
		);
	}

	function rankImageUrl(rank: number | null | undefined) {
		return rank ? `https://leetify.com/assets/images/rank-icons/matchmaking${rank}.png` : null;
	}

	function premierTier(value: number | null | undefined) {
		if (typeof value !== 'number') return 0;
		if (value >= 30_000) return 6;
		if (value >= 25_000) return 5;
		if (value >= 20_000) return 4;
		if (value >= 15_000) return 3;
		if (value >= 10_000) return 2;
		if (value >= 5_000) return 1;
		return 0;
	}

	function premierParts(value: number | null | undefined) {
		if (typeof value !== 'number') return { large: '', small: '' };
		return {
			large: `${(value / 1000).toFixed(1)}k`,
			small: ''
		};
	}
</script>

<section class="cs-shell">
	{#if $reportQuery.isLoading}
		{@const generationSteps = generatingReportSteps()}
		<div class="cs-modal-backdrop --locked" role="presentation">
			<div
				class="cs-window cs-modal cs-refresh-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="generate-report-title"
				tabindex="-1"
			>
				<div class="cs-window-title">
					<p id="generate-report-title">Generating report</p>
				</div>
				<div class="cs-window-body">
					<div class="cs-refresh-panel cs-bevel-in" aria-live="polite">
						<div class="cs-refresh-panel-title">
							<span>Loading provider data</span>
							<span>generating</span>
						</div>
						<div class="cs-refresh-steps">
							{#each generationSteps as step}
								<div class="cs-refresh-row --{step.status}">
									<div class="cs-refresh-row-head">
										<span>{step.label}</span>
										<span>{step.detail}</span>
									</div>
									<div class="cs-loadbar cs-bevel-in" aria-label={`${step.label}: ${step.detail}`}>
										<span></span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else if $reportQuery.isError}
		<div class="cs-window">
			<div class="cs-window-title">
				<p>Report unavailable</p>
			</div>
			<div class="cs-window-body">
				<p class="text-(--cs-danger)">{$reportQuery.error?.message ?? 'Unknown oRPC error'}</p>
			</div>
		</div>
	{:else if report && resolved}
		<div class="cs-window">
			<div class="cs-window-title">
				<p>Report for player "{displayName}" ({resolved.steamId64})</p>
				<div class="cs-window-title-actions">
					<button class="cs-link" type="button" disabled={isRefreshing} onclick={refreshReport}>
						{isRefreshing ? 'Refreshing' : 'Refresh report'}
					</button>
					<span class="cs-title-meta">last refreshed {lastRefreshedLabel}</span>
				</div>
			</div>
			<div class="cs-window-body">
				<header class="grid gap-4">
					<div class="grid gap-4">
						<div class="cs-profile-header">
							<a
								class="cs-avatar cs-profile-avatar shrink-0 overflow-hidden"
								href={steamProfileUrl}
								aria-label={`Open ${displayName} on Steam`}
							>
								{#if steam?.avatarUrl}
									<img
										class="size-full object-cover"
										src={steam.avatarUrl}
										alt={`${displayName} Steam avatar`}
										referrerpolicy="no-referrer"
									/>
								{:else}
									<div class="grid size-full place-items-center text-xl text-(--cs-text-3)">
										{displayName.slice(0, 1).toUpperCase()}
									</div>
								{/if}
							</a>
							<div class="min-w-0 flex-1">
								<div class="cs-rank-and-name">
									<div class="cs-name-stack">
											<div class="cs-name-and-ranks">
												<a class="cs-link min-w-0" href={steamProfileUrl}>
													<h1 class="truncate text-3xl leading-none">{displayName}</h1>
												</a>
												<div class="cs-title-badges" aria-label="CS rank badges">
													{#if currentPremier}
														<div
															class="cs-title-rank"
															title={`${currentPremier.label} ${formatNumber(currentPremier.value)}`}
															aria-label={`${currentPremier.label} rating ${formatNumber(currentPremier.value)}`}
														>
															<div class="cs-rating --tier-{premierTier(currentPremier.value)}" aria-hidden="true">
																<svg viewBox="0 0 17 32" class="vertical-lines" aria-hidden="true">
																	<path
																		d="M5.44 2.13A2.6 2.6 0 0 1 7.99 0h1.86a.6.6 0 0 1 .6.7L4.83 31.5a.6.6 0 0 1-.6.5h-2.3c-1 0-1.76-.9-1.58-1.89l5.1-27.98ZM11.82.99c.1-.57.6-.99 1.18-.99h2.93a.6.6 0 0 1 .59.7l-5.4 30.31c-.1.57-.6.99-1.18.99H7a.6.6 0 0 1-.59-.7L11.82.98Z"
																	/>
																</svg>
																<div class="label-outer">
																	<div class="label-wrapper">
																		<span class="label-large">{currentPremierParts.large}</span>
																		{#if currentPremierParts.small}
																			<span class="label-small">{currentPremierParts.small}</span>
																		{/if}
																	</div>
																</div>
															</div>
														</div>
													{/if}
													{#if highestCompetitiveRank && highestCompetitiveRankImage}
														<a
															class="cs-title-rank cs-competitive-rank"
															href={profileStats?.profileUrl}
															title={`Highest map rank ${rankName(highestCompetitiveRank.displayRank)} on ${highestCompetitiveRank.map}`}
															aria-label={`Highest map rank ${rankName(highestCompetitiveRank.displayRank)} on ${highestCompetitiveRank.map}`}
														>
															<span>HIGH:</span>
															<img
																src={highestCompetitiveRankImage}
																alt={rankName(highestCompetitiveRank.displayRank)}
																loading="lazy"
																referrerpolicy="no-referrer"
															/>
														</a>
													{/if}
													{#if lowestCompetitiveRank && lowestCompetitiveRankImage}
														<a
															class="cs-title-rank cs-competitive-rank"
															href={profileStats?.profileUrl}
															title={`Lowest map rank ${rankName(lowestCompetitiveRank.displayRank)} on ${lowestCompetitiveRank.map}`}
															aria-label={`Lowest map rank ${rankName(lowestCompetitiveRank.displayRank)} on ${lowestCompetitiveRank.map}`}
														>
															<span>LOW:</span>
															<img
																src={lowestCompetitiveRankImage}
																alt={rankName(lowestCompetitiveRank.displayRank)}
																loading="lazy"
																referrerpolicy="no-referrer"
															/>
														</a>
													{/if}
												</div>
											</div>
										<div class="cs-source-links">
											{#each sourceLinks as source}
												{@const icon = sourceIcon(source.label)}
												<div class="cs-source-row">
													<a
														class="cs-source-logo {icon?.className ?? ''} {source.missing ? '--missing' : ''}"
														href={source.href}
														aria-label={source.missing
															? `${source.label} account not found`
															: `Open ${source.label}`}
														aria-disabled={source.missing}
														title={source.missing ? `${source.label} account not found` : source.label}
														onclick={(event) => source.missing && event.preventDefault()}
													>
														{#if icon}
															<span
																class="cs-source-mark"
																style={`--source-icon: url("${icon.url}")`}
																aria-hidden="true"
															></span>
															{#if source.label === 'CSStats'}
																<img
																	class="cs-source-image"
																	src={icon.url}
																	alt=""
																	aria-hidden="true"
																	loading="lazy"
																/>
															{/if}
														{:else}
															<span class="text-xs">{source.label.slice(0, 1)}</span>
														{/if}
													</a>
														{#if source.label === 'CSStats' && csstatsHeaderStats.length}
														<div class="cs-source-stats" aria-label="CSStats quick stats">
															{#each csstatsHeaderStats as [label, value]}
																<span><b>{label}:</b> {value}</span>
															{/each}
														</div>
													{/if}
													{#if source.label === 'Steam' && steamHeaderStats.length}
														<div class="cs-source-stats" aria-label="Steam quick stats">
															{#each steamHeaderStats as stat}
																<span class:--inventory-high={stat.tone === 'high'} class:--inventory-low={stat.tone === 'low'}>
																	<b>{stat.label}:</b> {stat.value}
																</span>
															{/each}
														</div>
													{/if}
													{#if source.label === 'Leetify' && leetifyHeaderStats.length}
														<div class="cs-source-stats" aria-label="Leetify quick stats">
															{#each leetifyHeaderStats as [label, value]}
																<span>
																	{#if label === 'crosshair'}
																		<b class="cs-crosshair-label" aria-label="Crosshair Placement"></b>
																	{:else}
																		<b>{label}:</b>
																	{/if}
																	{value ?? '-'}
																</span>
															{/each}
														</div>
													{/if}
													{#if source.label === 'FACEIT' && source.missing}
														<p class="cs-source-missing">FACEIT account not found</p>
													{/if}
													{#if source.label === 'FACEIT' && !source.missing && faceitActivityStats.length}
														<div class="cs-faceit-status">
															{#if faceitLevelBadge}
																<img
																	src={faceitLevelBadge}
																	alt={`FACEIT level ${faceit?.skillLevel}`}
																	loading="lazy"
																/>
															{/if}
															<div class="cs-source-stats --faceit" aria-label="FACEIT status">
																{#each faceitActivityStats as stat}
																	{#if stat.label === 'ELO'}
																		<span title={stat.title ?? undefined}>{stat.value}</span>
																	{:else}
																		<span title={stat.title ?? undefined}
																			><b>{stat.label}:</b> {stat.value}</span
																		>
																	{/if}
																{/each}
															</div>
														</div>
													{/if}
													{#if source.label === 'FACEIT' && !source.missing && faceitHeaderStats.length}
														<div class="cs-faceit-badges" aria-label="FACEIT membership badges">
															{#each faceitHeaderStats as badge}
																<span class:--esea={badge.toLowerCase() === 'esea'}>{badge}</span>
															{/each}
														</div>
													{/if}
													{#if source.label === 'FACEIT' && !source.missing && faceitBanLabel(faceit)}
														<p class="cs-faceit-ban">Banned: {faceitBanLabel(faceit)}</p>
													{/if}
												</div>
											{/each}
										</div>
									</div>
									<div class="cs-title-meta-stack">
										<div class="cs-title-verdict-card cs-bevel-in">
											<div class="min-w-0">
												<p class="cs-label">Verdict</p>
												<p
													class="cs-title-verdict {report.verdict === 'likely_cheating'
														? 'cs-verdict-danger'
														: 'cs-verdict-safe'}"
												>
													{verdictLabel(report.verdict)}
												</p>
											</div>
											{#if $sessionQuery.data?.user && !viewerHasPlayerReport && !viewerOwnsPlayer}
												<div class="cs-verdict-actions">
													<button
														class="cs-icon-btn cs-verdict-action --danger"
														type="button"
														disabled={isSubmittingReport}
														aria-label="Accuse of cheating"
														title="Accuse of cheating"
														onclick={() => openReportModal('up')}
													>
														<ThumbsUpSharpIcon height="1em" />
													</button>
													<button
														class="cs-icon-btn cs-verdict-action --safe"
														type="button"
														disabled={isSubmittingReport}
														aria-label="Dispute cheating"
														title="Dispute cheating"
														onclick={() => openReportModal('down')}
													>
														<ThumbsDownSharpIcon height="1em" />
													</button>
												</div>
											{/if}
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<hr class="cs-hr" />
					<p class="max-w-2xl text-(--cs-text-2)">{report.explanation}</p>
				</header>

				<div class="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
					<section class="cs-panel">
						<h2 class="cs-label">Strongest evidence</h2>
						{#if evidenceRows.length}
							<ul class="mt-3 grid gap-2">
								{#each evidenceRows as evidence}
									<li class="cs-evidence-row --{evidence.tone}">
										<span class="cs-evidence-title">{evidence.label}</span><span>: {evidence.value}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="mt-3 text-sm text-(--cs-text-3)">No risk signals above threshold.</p>
						{/if}
					</section>

					<section class="cs-panel">
						<h2 class="cs-label">Reports</h2>
						<div class="mt-3 grid gap-3">
							<div class="flex items-baseline gap-3">
								<p class="text-5xl leading-none text-[var(--cs-accent)]">
									{report.accusationReportCount ?? report.reportCount}
								</p>
								<p class="text-md text-[var(--cs-text-3)]">
									cheating accusation(s)
								</p>
							</div>
							<div class="flex items-baseline gap-3">
								<p class="text-3xl leading-none text-[var(--cs-text)]">{report.legitReportCount ?? 0}</p>
								<p class="text-md text-[var(--cs-text-3)]">
									cheating dispute(s)
								</p>
							</div>
						</div>
						{#if report.recentCheatingReports?.length}
							<div class="cs-report-list mt-4" aria-label="Recent cheating reports">
								{#each report.recentCheatingReports as playerReport}
									<div class="cs-report-list-item">
										<div class="flex min-w-0 items-baseline gap-2">
											{#if playerReport.reporterReportUrl}
												<a
													class="cs-report-reporter cs-link"
													href={playerReport.reporterReportUrl}
													onclick={(event) => navigateToReport(event, playerReport.reporterReportUrl ?? '/')}
												>
													{playerReport.reporterName}
												</a>
											{:else}
												<span class="cs-report-reporter">{playerReport.reporterName}</span>
											{/if}
											<span class="cs-report-reason">{reportReasonLabel(playerReport.reason)}</span>
										</div>
										{#if playerReport.notes}
											<p>{playerReport.notes}</p>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
						{#if $sessionQuery.data?.user && !viewerHasPlayerReport && !viewerOwnsPlayer}
							<div class="mt-4 flex flex-wrap gap-2">
								<button
									class="cs-btn --danger"
									type="button"
									disabled={isSubmittingReport}
									onclick={() => openReportModal('up')}
								>
									Accuse of cheating
								</button>
								<button
									class="cs-btn --safe"
									type="button"
									disabled={isSubmittingReport}
									onclick={() => openReportModal('down')}
								>
									Dispute cheating
								</button>
							</div>
						{:else if $sessionQuery.data?.user && viewerOwnsPlayer}
							<p class="mt-4 text-sm text-[var(--cs-text-3)]">
								You cannot report your own account.
							</p>
						{:else if $sessionQuery.data?.user && viewerHasPlayerReport}
							<p class="mt-4 text-sm text-[var(--cs-text-3)]">
								Your report is already recorded.
							</p>
						{:else}
							<p class="mt-4 text-sm">
								<a class="cs-link" href={reportSignInUrl}>Sign in with Steam</a>
								to submit a player report.
							</p>
						{/if}
					</section>
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<section class="cs-panel">
						<h2 class="cs-label">Missing data</h2>
						{#if missingRows.length}
							<ul class="mt-3 grid gap-2 text-sm">
								{#each missingRows as item}
									<li class="cs-provider-row">
										<span
											class="cs-indicator cs-bevel-in {item.status === 'bad'
												? 'cs-status-bad'
												: 'cs-status-warn'}"
										>
											<span class="cs-indicator-dot"></span>
											{item.label}
										</span>
										<span class="text-[var(--cs-text-2)]">{item.message}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="mt-3 text-sm text-[var(--cs-text-2)]">No provider gaps in the cached report.</p>
						{/if}
					</section>

					<section class="cs-panel">
						<h2 class="cs-label">Provider freshness</h2>
						<div class="mt-3 grid gap-2 text-sm">
							{#each freshnessRows as item}
								<div class="cs-provider-row">
									<span
										class="cs-indicator cs-bevel-in {item.status === 'ok'
											? 'cs-status-ok'
											: item.status === 'bad'
												? 'cs-status-bad'
												: 'cs-status-warn'}"
									>
										<span class="cs-indicator-dot"></span>
										{item.label}
									</span>
									<span class="truncate text-[var(--cs-text-3)]">{item.value}</span>
								</div>
							{/each}
						</div>
						<div class="mt-4 flex flex-wrap gap-2">
							<button class="cs-btn" type="button" disabled={isRefreshing} onclick={() => refresh('steam')}>Steam</button>
							<button class="cs-btn" type="button" disabled={isRefreshing} onclick={() => refresh('steam_bans')}>Bans</button>
							<button class="cs-btn" type="button" disabled={isRefreshing} onclick={() => refresh('steam_friends')}>Friends</button>
							<button class="cs-btn" type="button" disabled={isRefreshing} onclick={() => refresh('steam_inventory')}>Inventory</button>
							<button class="cs-btn" type="button" disabled={isRefreshing} onclick={() => refresh('csstats')}>CSStats</button>
							<button class="cs-btn" type="button" disabled={isRefreshing} onclick={() => refresh('leetify')}>Leetify</button>
							<button class="cs-btn" type="button" disabled={isRefreshing} onclick={() => refresh('faceit')}>FACEIT</button>
						</div>
					</section>
				</div>

				{#if profileStats}
					<section class="cs-panel">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<h2 class="cs-label">{profileStats.label} data</h2>
							<a class="cs-link text-sm" href={profileStats.statsUrl ?? profileStats.profileUrl}
								>Open {profileStats.label}</a
							>
						</div>
						<div class="cs-table-wrap mt-3">
							<table class="cs-table text-sm">
								<tbody>
									{#each csstatsRows as [label, value]}
										<tr>
											<th class="w-48">{label}</th>
											<td>{value ?? '-'}</td>
										</tr>
									{/each}
									{#if profileStats.premierRatings?.length}
										<tr>
											<th class="w-48">Premier seasons</th>
											<td>
												{#each profileStats.premierRatings as rating, index}
													{#if index > 0}<span class="text-[var(--cs-text-3)]"> / </span>{/if}
													{rating.season ? `S${rating.season}` : 'Leetify'}: {formatNumber(
														rating.latestRating
													)} current,
													{formatNumber(rating.bestRating)} best, {rating.wins} wins
												{/each}
											</td>
										</tr>
									{/if}
									{#if profileStats.competitiveRanks?.length}
										<tr>
											<th class="w-48">Competitive ranks</th>
											<td>
												{#each profileStats.competitiveRanks as rank, index}
													{#if index > 0}<span class="text-[var(--cs-text-3)]"> / </span>{/if}
													{rank.map}: {rank.latestRank ?? '-'} current, {rank.bestRank ?? '-'} best,
													{rank.wins} wins
												{/each}
											</td>
										</tr>
									{/if}
									{#if profileStats.wingman}
										<tr>
											<th class="w-48">Wingman</th>
											<td>
												{profileStats.wingman.latestRank ?? '-'} current,
												{profileStats.wingman.bestRank ?? '-'} best, {profileStats.wingman.wins} wins
											</td>
										</tr>
									{/if}
								</tbody>
							</table>
						</div>
					</section>
				{/if}
			</div>
		</div>
		{#if refreshPromise}
			<div class="cs-modal-backdrop --locked" role="presentation">
				<div
					class="cs-window cs-modal cs-refresh-modal"
					role="dialog"
					aria-modal="true"
					aria-labelledby="refresh-report-title"
					tabindex="-1"
				>
					<div class="cs-window-title">
						<p id="refresh-report-title">Refreshing report</p>
					</div>
					<div class="cs-window-body">
						{#await refreshPromise}
							<div class="cs-refresh-panel cs-bevel-in" aria-live="polite">
								<div class="cs-refresh-panel-title">
									<span>{refreshStatusMessage}</span>
									<span
										>{refreshSteps.filter((step) => step.status === 'done' || step.status === 'warn')
											.length}/{refreshSteps.length}</span
									>
								</div>
								<div class="cs-refresh-steps">
									{#each refreshSteps as step}
										<div class="cs-refresh-row --{step.status}">
											<div class="cs-refresh-row-head">
												<span>{step.label}</span>
												<span>{step.detail}</span>
											</div>
											<div class="cs-loadbar cs-bevel-in" aria-label={`${step.label}: ${step.detail}`}>
												<span></span>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{:catch error}
							<div class="cs-refresh-panel cs-bevel-in --error" aria-live="assertive">
								<div class="cs-refresh-panel-title">
									<span>{error instanceof Error ? error.message : 'Refresh failed'}</span>
									<span>failed</span>
								</div>
							</div>
						{/await}
					</div>
				</div>
			</div>
		{/if}
		{#if reportVote}
			<div class="cs-modal-backdrop" role="presentation" onclick={closeReportModal}>
				<div
					class="cs-window cs-modal"
					role="dialog"
					aria-modal="true"
					aria-labelledby="player-report-title"
					tabindex="-1"
					onclick={(event) => event.stopPropagation()}
					onkeydown={(event) => event.key === 'Escape' && closeReportModal()}
				>
					<div class="cs-window-title">
						<p id="player-report-title">{reportModalTitle}</p>
						<button
							class="cs-window-close"
							type="button"
							aria-label="Close report dialog"
							disabled={isSubmittingReport}
							onclick={closeReportModal}
						>
							x
						</button>
					</div>
					<form class="cs-window-body" onsubmit={(event) => (event.preventDefault(), submitPlayerReport())}>
						<div class="cs-panel">
							<p class="cs-label">Player report</p>
							<p class="mt-2 text-xl leading-none">{displayName}</p>
							<p class="mt-1 text-sm text-[var(--cs-text-3)]">{resolved.steamId64}</p>
							<p class="mt-3 text-sm text-[var(--cs-text-2)]">{reportModalReason}</p>
						</div>
						{#if reportVote === 'up'}
							<fieldset class="grid gap-2">
								<legend class="cs-label">Reason</legend>
								<div class="cs-reason-grid">
									{#each playerReportReasons as reason}
										<label class="cs-reason-option cs-bevel-in">
											<input
												class="sr-only"
												type="radio"
												name="player-report-reason"
												value={reason}
												bind:group={reportReason}
											/>
											<span>{reason}</span>
										</label>
									{/each}
								</div>
							</fieldset>
						{/if}
						<label class="grid gap-2">
							<span class="cs-label">Note</span>
							<textarea
								class="cs-input min-h-28 resize-y"
								maxlength="2000"
								bind:value={reportNote}
								placeholder="Optional"
							></textarea>
						</label>
						{#if $playerReportMutation.error}
							<p class="text-sm text-[var(--cs-danger)]">{$playerReportMutation.error.message}</p>
						{/if}
						<div class="flex flex-wrap justify-end gap-2">
							<button class="cs-btn" type="button" disabled={isSubmittingReport} onclick={closeReportModal}>
								Cancel
							</button>
							<button class="cs-btn" type="submit" disabled={isSubmittingReport}>
								{isSubmittingReport ? 'Submitting' : 'Submit report'}
							</button>
						</div>
					</form>
				</div>
			</div>
		{/if}
	{/if}
</section>
