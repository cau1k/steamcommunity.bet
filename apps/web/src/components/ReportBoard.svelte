<script lang="ts">
	import { orpc } from '$lib/orpc';
	import { createMutation, createQuery } from '@tanstack/svelte-query';

	type Props = {
		path: string;
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

	const report = $derived($reportQuery.data?.report);
	const resolved = $derived($reportQuery.data?.resolved);
	const freshnessEntries = $derived(Object.entries(report?.providerFreshness ?? {}));
	const isRefreshing = $derived($refreshReportMutation.isPending || $refreshMutation.isPending);
	const steam = $derived(report?.providerDetails?.steam);
	const csstats = $derived(report?.providerDetails?.csstats);
	const displayName = $derived(steam?.name ?? resolved?.steamId64 ?? 'Unknown profile');
	const steamProfileUrl = $derived(
		steam?.profileUrl ??
			(resolved ? `https://steamcommunity.com/profiles/${resolved.steamId64}` : '')
	);
	const csstatsRows = $derived(
		csstats
			? [
					['Name', csstats.name],
					['Current Premier', formatNumber(csstats.premierRating)],
					['Best Premier', formatNumber(csstats.bestPremierRating)],
					['CSStats rating', formatDecimal(csstats.bestRating)],
					['FACEIT linked', formatBoolean(csstats.hasFaceit)],
					['Matches', formatNumber(csstats.matches)],
					['Winrate', formatPercent(csstats.winRate)],
					['K/D', formatDecimal(csstats.kdRatio)],
					['HLTV rating', formatDecimal(csstats.hltvRating)],
					['HS', formatPercent(csstats.hsPercentage)],
					['ADR', formatNumber(csstats.adr)],
					['Clutch', formatPercent(csstats.clutchPercentage)],
					['Recent', csstats.recentResults?.join(' ') || null],
					['Most played', csstats.mostPlayedMap]
				]
			: []
	);

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
</script>

<section class="mx-auto grid max-w-5xl gap-5 px-4 py-6">
	{#if $reportQuery.isLoading}
		<div class="border border-neutral-800 bg-neutral-950 p-5">
			<p class="text-sm uppercase tracking-wide text-neutral-500">Generating board</p>
			<p class="mt-2 text-neutral-300">Loading cached report and provider snapshots.</p>
		</div>
	{:else if $reportQuery.isError}
		<div class="border border-red-900 bg-red-950/30 p-5">
			<p class="text-sm uppercase tracking-wide text-red-300">Report unavailable</p>
			<p class="mt-2 text-red-100">{$reportQuery.error?.message ?? 'Unknown oRPC error'}</p>
		</div>
	{:else if report && resolved}
		<header class="grid gap-6 border-b border-neutral-800 pb-6">
			<div class="flex flex-wrap items-start justify-between gap-5">
				<div class="flex min-w-0 items-center gap-4 text-neutral-100">
					<a
						class="size-16 shrink-0 overflow-hidden border border-neutral-800 bg-neutral-950"
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
							<div class="grid size-full place-items-center text-xl font-semibold text-neutral-500">
								{displayName.slice(0, 1).toUpperCase()}
							</div>
						{/if}
					</a>
					<div class="min-w-0">
						<p class="text-xs uppercase tracking-wide text-neutral-500">steamcommunity.bet</p>
						<a class="block min-w-0" href={steamProfileUrl}>
							<h1 class="truncate text-2xl font-semibold sm:text-3xl">{displayName}</h1>
							<p class="mt-1 truncate text-sm text-neutral-500">{steamProfileUrl}</p>
						</a>
						<div class="mt-3 flex flex-wrap gap-2">
							{#each report.sourceLinks as source}
								{@const icon = sourceIcon(source.label)}
								<a
									class="grid size-9 place-items-center border border-neutral-800 bg-neutral-950 transition hover:border-neutral-500"
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
										<span class="text-xs text-neutral-400">{source.label.slice(0, 1)}</span>
									{/if}
								</a>
							{/each}
						</div>
					</div>
				</div>
				<div class="flex flex-wrap items-start justify-end gap-3">
					<button
						class="border border-neutral-700 px-3 py-2 text-sm text-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-500"
						type="button"
						disabled={isRefreshing}
						onclick={refreshReport}>{isRefreshing ? 'Refreshing' : 'Refresh report'}</button
					>
				</div>
			</div>
			<div class="flex flex-wrap items-end justify-between gap-4">
				<p class="max-w-2xl text-neutral-300">{report.explanation}</p>
				<div class="flex flex-wrap items-center justify-end gap-3">
					<div class="border px-4 py-3 text-right {report.verdict === 'likely_cheating' ? 'border-red-500 text-red-200' : 'border-emerald-600 text-emerald-200'}">
						<p class="text-xs uppercase tracking-wide text-neutral-500">Verdict</p>
						<p class="text-xl font-semibold">{report.verdict}</p>
					</div>
				</div>
			</div>
		</header>

		<div class="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
			<section class="border border-neutral-800 p-4">
				<h2 class="text-sm uppercase tracking-wide text-neutral-500">Strongest evidence</h2>
				<ul class="mt-3 grid gap-2">
					{#each report.strongestEvidence as evidence}
						<li class="border-l border-neutral-700 pl-3 text-neutral-100">{evidence}</li>
					{/each}
				</ul>
			</section>

			<section class="border border-neutral-800 p-4">
				<h2 class="text-sm uppercase tracking-wide text-neutral-500">Reports</h2>
				<p class="mt-3 text-4xl font-semibold">{report.reportCount}</p>
				<p class="mt-1 text-sm text-neutral-400">active signed-in player reports</p>
			</section>
		</div>

			<div class="grid gap-4 md:grid-cols-2">
			<section class="border border-neutral-800 p-4">
				<h2 class="text-sm uppercase tracking-wide text-neutral-500">Missing data</h2>
				{#if report.missingData.length}
					<ul class="mt-3 grid gap-2 text-sm text-neutral-300">
						{#each report.missingData as item}
							<li>{item}</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-3 text-sm text-neutral-300">No provider gaps in the cached report.</p>
				{/if}
			</section>

			<section class="border border-neutral-800 p-4">
				<h2 class="text-sm uppercase tracking-wide text-neutral-500">Provider freshness</h2>
				<div class="mt-3 grid gap-2 text-sm">
					{#each freshnessEntries as [provider, value]}
						<div class="flex items-center justify-between gap-3">
							<span>{provider}</span>
							<span class="text-right text-neutral-400">{value}</span>
						</div>
					{/each}
				</div>
				<div class="mt-4 flex flex-wrap gap-2">
					<button class="border border-neutral-700 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:text-neutral-500" type="button" disabled={isRefreshing} onclick={() => refresh('steam')}>Steam</button>
					<button class="border border-neutral-700 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:text-neutral-500" type="button" disabled={isRefreshing} onclick={() => refresh('steam_bans')}>Bans</button>
					<button class="border border-neutral-700 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:text-neutral-500" type="button" disabled={isRefreshing} onclick={() => refresh('csstats')}>CSStats</button>
					<button class="border border-neutral-700 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:text-neutral-500" type="button" disabled={isRefreshing} onclick={() => refresh('leetify')}>Leetify</button>
				</div>
			</section>

			</div>

			{#if csstats}
				<section class="border border-neutral-800 p-4">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<h2 class="text-sm uppercase tracking-wide text-neutral-500">CSStats data</h2>
						<a class="text-sm text-sky-300 hover:text-sky-200" href={csstats.statsUrl ?? csstats.profileUrl}>Open CSStats</a>
					</div>
					<div class="mt-3 overflow-x-auto">
						<table class="w-full min-w-[520px] border-collapse text-sm">
							<tbody>
								{#each csstatsRows as [label, value]}
									<tr class="border-t border-neutral-900">
										<th class="w-48 py-2 pr-4 text-left font-medium text-neutral-500">{label}</th>
										<td class="py-2 text-neutral-100">{value ?? '-'}</td>
									</tr>
								{/each}
								{#if csstats.premierRatings?.length}
									<tr class="border-t border-neutral-900">
										<th class="w-48 py-2 pr-4 text-left font-medium text-neutral-500">Premier seasons</th>
										<td class="py-2 text-neutral-100">
											{#each csstats.premierRatings as rating, index}
												{#if index > 0}<span class="text-neutral-600"> / </span>{/if}
												S{rating.season}: {formatNumber(rating.latestRating)} current, {formatNumber(rating.bestRating)} best, {rating.wins} wins
											{/each}
										</td>
									</tr>
								{/if}
								{#if csstats.competitiveRanks?.length}
									<tr class="border-t border-neutral-900">
										<th class="w-48 py-2 pr-4 text-left font-medium text-neutral-500">Competitive ranks</th>
										<td class="py-2 text-neutral-100">
											{#each csstats.competitiveRanks as rank, index}
												{#if index > 0}<span class="text-neutral-600"> / </span>{/if}
												{rank.map}: {rank.latestRank ?? '-'} current, {rank.bestRank ?? '-'} best, {rank.wins} wins
											{/each}
										</td>
									</tr>
								{/if}
								{#if csstats.wingman}
									<tr class="border-t border-neutral-900">
										<th class="w-48 py-2 pr-4 text-left font-medium text-neutral-500">Wingman</th>
										<td class="py-2 text-neutral-100">
											{csstats.wingman.latestRank ?? '-'} current, {csstats.wingman.bestRank ?? '-'} best, {csstats.wingman.wins} wins
										</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>
				</section>
			{/if}
		{/if}
	</section>
