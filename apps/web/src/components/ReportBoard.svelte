<script lang="ts">
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
	};

	const props: Props = $props();
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
	const profileStats = $derived(report?.providerDetails?.profileStats ?? csstats);
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
					['Recent', profileStats.recentResults?.join(' ') || null],
					['Most played', profileStats.mostPlayedMap]
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

	function refreshReport() {
		$refreshReportMutation.mutate({ path: props.path });
	}

	function refresh(provider: 'steam' | 'steam_bans' | 'leetify' | 'csstats') {
		if (!resolved) {
			return;
		}
		$refreshMutation.mutate({ steamId64: resolved.steamId64, provider });
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

	function formatBoolean(value: boolean | null | undefined) {
		if (value === true) return 'yes';
		if (value === false) return 'no';
		return null;
	}

	function sourceIcon(label: string) {
		if (label === 'Steam') return '/source-icons/steam.png';
		if (label === 'CSStats') return '/source-icons/csstats.jpg';
		if (label === 'Leetify') return '/source-icons/leetify.png';
		return null;
	}

	function providerLabel(provider: string) {
		if (provider === 'steam') return 'Steam';
		if (provider === 'steam_bans') return 'Steam bans';
		if (provider === 'csstats') return 'CSStats';
		if (provider === 'leetify') return 'Leetify';
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

	function verdictLabel(verdict: ProviderReport['verdict']) {
		return verdict === 'likely_cheating' ? 'Likely cheating' : 'Likely not cheating';
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
		const text = formatNumber(value);
		if (!text) return { large: '', small: '' };
		const splitAt = text.length > 4 ? text.length - 3 : text.length;
		return {
			large: text.slice(0, splitAt),
			small: text.slice(splitAt)
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
				<p class="text-[var(--cs-danger)]">{$reportQuery.error?.message ?? 'Unknown oRPC error'}</p>
			</div>
		</div>
	{:else if report && resolved}
		<div class="cs-window">
			<div class="cs-window-title">
				<p>Report: {displayName}</p>
				<p class="hidden sm:block">{resolved.steamId64}</p>
			</div>
			<div class="cs-window-body">
				<header class="grid gap-4">
					<div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
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
									<div class="grid size-full place-items-center text-xl text-[var(--cs-text-3)]">
										{displayName.slice(0, 1).toUpperCase()}
									</div>
								{/if}
							</a>
							<div class="min-w-0">
								<div class="cs-rank-and-name">
									<a class="cs-link min-w-0" href={steamProfileUrl}>
										<h1 class="truncate text-3xl leading-none">{displayName}</h1>
									</a>
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
								<a class="cs-link block min-w-0" href={steamProfileUrl}>
									<p class="mt-1 truncate text-sm text-[var(--cs-text-3)]">{steamProfileUrl}</p>
								</a>
								<div class="mt-3 flex flex-wrap gap-2">
									{#each report.sourceLinks as source}
										{@const icon = sourceIcon(source.label)}
										<a
											class="cs-icon-btn"
											href={source.href}
											aria-label={`Open ${source.label}`}
											title={source.label}
										>
											{#if icon}
												<img
													class="max-h-5 max-w-5 object-contain"
													src={icon}
													alt=""
													aria-hidden="true"
												/>
											{:else}
												<span class="text-xs">{source.label.slice(0, 1)}</span>
											{/if}
										</a>
									{/each}
								</div>
							</div>
						</div>
						<div class="cs-action-row sm:justify-end">
							<button class="cs-btn" type="button" disabled={isRefreshing} onclick={refreshReport}>
								{isRefreshing ? 'Refreshing' : 'Refresh report'}
							</button>
						</div>
					</div>
					<hr class="cs-hr" />
					<div class="flex flex-wrap items-end justify-between gap-4">
						<p class="max-w-2xl text-[var(--cs-text-2)]">{report.explanation}</p>
						<div
							class="cs-verdict cs-bevel-in {report.verdict === 'likely_cheating'
								? 'cs-verdict-danger'
								: 'cs-verdict-safe'}"
						>
							<p class="cs-label">Verdict</p>
							<p class="text-xl leading-none">{verdictLabel(report.verdict)}</p>
						</div>
					</div>
				</header>

				<div class="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
					<section class="cs-panel">
						<h2 class="cs-label">Strongest evidence</h2>
						{#if evidenceRows.length}
							<ul class="mt-3 grid gap-2">
								{#each evidenceRows as evidence}
									<li class="cs-panel-inset cs-bevel-in cs-evidence-row text-[var(--cs-text-2)]">
										<span class="cs-chip w-fit text-[var(--cs-accent)]">{evidence.label}</span>
										<span>{evidence.value}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="mt-3 text-sm text-[var(--cs-text-3)]">No risk signals above threshold.</p>
						{/if}
					</section>

					<section class="cs-panel">
						<h2 class="cs-label">Reports</h2>
						<p class="mt-3 text-5xl leading-none text-[var(--cs-accent)]">{report.reportCount}</p>
						<p class="mt-2 text-sm text-[var(--cs-text-3)]">active signed-in player reports</p>
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
	{/if}
</section>
