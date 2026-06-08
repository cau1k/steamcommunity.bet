<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { orpc } from '$lib/orpc';
	import { createMutation, createQuery } from '@tanstack/svelte-query';

	type Props = {
		path: string;
	};

	type ProviderReport = {
		verdict: 'likely_cheating' | 'likely_not_cheating';
		explanation: string;
		strongestEvidence: string[];
		missingData: string[];
		providerFreshness: Record<string, string>;
		refreshedAt: string | Date;
		sourceLinks: Array<{ label: string; href: string }>;
		reportCount: number;
		providerDetails?: {
			steam?: {
				name: string | null;
				avatarUrl: string | null;
				profileUrl: string | null;
				visibilityState: number | null;
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

	const playerReportReasons: PlayerReportReason[] = [
		'rage hacking/spinning',
		'walling',
		'aim hacking',
		'radar'
	];

	const props: Props = $props();
	const sessionQuery = authClient.useSession();
	let reportVote = $state<ReportVote | null>(null);
	let reportReason = $state<PlayerReportReason>('walling');
	let reportNote = $state('');
	// svelte-ignore state_referenced_locally -- SvelteKit recreates this route component per path.
	const reportQuery = createQuery(
		orpc.report.getOrGenerate.queryOptions({ input: { path: props.path } })
	);
	const refreshReportMutation = createMutation(
		orpc.report.refresh.mutationOptions({
			onSuccess: () => {
				$reportQuery.refetch();
			}
		})
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
	const isRefreshing = $derived($refreshReportMutation.isPending || $refreshMutation.isPending);
	const steam = $derived(report?.providerDetails?.steam);
	const csstats = $derived(report?.providerDetails?.csstats);
	const faceit = $derived(report?.providerDetails?.faceit);
	const leetify = $derived(report?.providerDetails?.leetify);
	const profileStats = $derived(report?.providerDetails?.profileStats ?? csstats);
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
					['Crosshair Placement', formatDegrees(leetify.crosshairPlacement)]
				]
			: []
	);
	const evidenceRows = $derived(
		(report?.strongestEvidence ?? []).map((item) => {
			const [signal, ...rest] = item.split(': ');
			return {
				label: humanSignal(signal),
				value: rest.join(': ') || item
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
	const highestCurrentCompetitiveRank = $derived(
		(profileStats?.competitiveRanks ?? [])
			.filter((rank) => typeof rank.latestRank === 'number')
			.toSorted((a, b) => (b.latestRank ?? 0) - (a.latestRank ?? 0))[0] ?? null
	);
	const currentPremier = $derived(
		profileStats?.premierRating
			? {
					label: 'Current Premier',
					value: profileStats.premierRating
				}
			: null
	);
	const highestCurrentCompetitiveRankImage = $derived(
		rankImageUrl(highestCurrentCompetitiveRank?.latestRank)
	);
	const currentPremierParts = $derived(premierParts(currentPremier?.value));
	const lastRefreshedLabel = $derived(formatLastRefreshed(report?.refreshedAt));
	const reportModalTitle = $derived(reportVote ? reportVoteTitle(reportVote, report?.verdict) : '');
	const reportModalReason = $derived(reportVote ? reportVoteReason(reportVote, report?.verdict) : '');
	const reportVotePrimary = $derived(report?.verdict === 'likely_cheating' ? 'up' : 'down');
	const isSubmittingReport = $derived($playerReportMutation.isPending);

	function refreshReport() {
		$refreshReportMutation.mutate({ path: props.path });
	}

	function refresh(provider: 'steam' | 'steam_bans' | 'leetify' | 'csstats' | 'faceit') {
		if (!resolved) {
			return;
		}
		$refreshMutation.mutate({ steamId64: resolved.steamId64, provider });
	}

	function openReportModal(vote: ReportVote) {
		if (!$sessionQuery.data?.user) {
			return;
		}
		reportVote = vote;
		reportReason = vote === 'up' ? 'aim hacking' : 'walling';
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
		$playerReportMutation.mutate({
			steamId64: resolved.steamId64,
			reason: reportReason,
			notes: notes || undefined
		});
	}

	function formatNumber(value: number | null | undefined) {
		return typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : null;
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

	function humanMissingMessage(message: string) {
		if (message === 'not fetched') return 'Not fetched yet';
		if (message === 'missing_config') return 'Provider not configured';
		if (/404/.test(message)) return 'No public profile';
		return message;
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
			return verdict === 'likely_cheating' ? 'Confirm likely cheating' : 'Dispute not cheating';
		}
		return verdict === 'likely_not_cheating' ? 'Confirm likely not cheating' : 'Dispute cheating';
	}

	function reportVoteReason(vote: ReportVote, verdict: ProviderReport['verdict'] | undefined) {
		if (vote === 'up') {
			return verdict === 'likely_cheating'
				? 'Reporter agrees the player is likely cheating'
				: 'Reporter disputes the likely not cheating verdict';
		}
		return verdict === 'likely_not_cheating'
			? 'Reporter agrees the player is likely not cheating'
			: 'Reporter disputes the likely cheating verdict';
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
		<div class="cs-window">
			<div class="cs-window-title">
				<p>Generating board</p>
			</div>
			<div class="cs-window-body">
				<p class="cs-muted">Loading cached report and provider snapshots.</p>
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
									<a class="cs-link min-w-0" href={steamProfileUrl}>
										<h1 class="truncate text-3xl leading-none">{displayName}</h1>
									</a>
									<div class="cs-title-meta-stack">
										<p
											class="cs-title-verdict {report.verdict === 'likely_cheating'
												? 'cs-verdict-danger'
												: 'cs-verdict-safe'}"
										>
											{verdictLabel(report.verdict)}
										</p>
										<div class="cs-title-badges" aria-label="CS rank badges">
											{#if currentPremier}
												<div
													class="cs-title-rank"
													title={`Premier ${formatNumber(currentPremier.value)}`}
													aria-label={`Premier rating ${formatNumber(currentPremier.value)}`}
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
											{#if highestCurrentCompetitiveRank && highestCurrentCompetitiveRankImage}
												<a
													class="cs-title-rank cs-competitive-rank"
													href={profileStats?.profileUrl}
													title={`${rankName(highestCurrentCompetitiveRank.latestRank)} on ${highestCurrentCompetitiveRank.map}`}
													aria-label={`Highest current competitive rank ${rankName(highestCurrentCompetitiveRank.latestRank)} on ${highestCurrentCompetitiveRank.map}`}
												>
													<img
														src={highestCurrentCompetitiveRankImage}
														alt={rankName(highestCurrentCompetitiveRank.latestRank)}
														loading="lazy"
														referrerpolicy="no-referrer"
													/>
												</a>
											{/if}
										</div>
									</div>
								</div>
								<div class="cs-source-links mt-3">
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
											{#if source.label === 'Leetify' && leetifyHeaderStats.length}
												<div class="cs-source-stats" aria-label="Leetify quick stats">
													{#each leetifyHeaderStats as [label, value]}
														<span><b>{label}:</b> {value ?? '-'}</span>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
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
									<li class="cs-panel-inset cs-bevel-in cs-evidence-row text-(--cs-text-2)">
										<span class="cs-chip w-fit text-(--cs-accent)">{evidence.label}</span>
										<span>{evidence.value}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="mt-3 text-sm text-(--cs-text-3)">No risk signals above threshold.</p>
						{/if}
					</section>

					<section class="cs-panel">
						<h2 class="cs-label">Reports</h2>
						<p class="mt-3 text-5xl leading-none text-[var(--cs-accent)]">{report.reportCount}</p>
						<p class="mt-2 text-sm text-[var(--cs-text-3)]">active signed-in player reports</p>
						{#if $sessionQuery.data?.user}
							<div class="mt-4 flex flex-wrap gap-2">
								<button
									class="cs-btn cs-vote-btn {reportVotePrimary === 'up' ? '--primary' : ''}"
									type="button"
									disabled={isSubmittingReport}
									aria-label="Thumbs up report"
									onclick={() => openReportModal('up')}
								>
									<span aria-hidden="true">+</span>
								</button>
								<button
									class="cs-btn cs-vote-btn {reportVotePrimary === 'down' ? '--primary' : ''}"
									type="button"
									disabled={isSubmittingReport}
									aria-label="Thumbs down report"
									onclick={() => openReportModal('down')}
								>
									<span aria-hidden="true">-</span>
								</button>
							</div>
						{:else}
							<p class="mt-4 text-sm">
								<a class="cs-link" href="/login">Sign in with Steam</a>
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
