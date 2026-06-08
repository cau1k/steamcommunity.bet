<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { orpc } from '$lib/orpc';
	import { createQuery } from '@tanstack/svelte-query';

	const sessionQuery = authClient.useSession();
	const playerReportsQuery = createQuery(orpc.playerReport.listMine.queryOptions());

	$effect(() => {
		if (!$sessionQuery.isPending && !$sessionQuery.data) {
			goto('/login');
		}
	});

</script>

{#if $sessionQuery.isPending}
	<div class="cs-shell">
		<div class="cs-window">
			<div class="cs-window-title"><p>Dashboard</p></div>
			<div class="cs-window-body"><p>Loading...</p></div>
		</div>
	</div>
{:else if !$sessionQuery.data}
	<div class="cs-shell">
		<div class="cs-window">
			<div class="cs-window-title"><p>Dashboard</p></div>
			<div class="cs-window-body"><p>Redirecting to login...</p></div>
		</div>
	</div>
{:else}
	<div class="cs-shell">
		<div class="cs-window">
			<div class="cs-window-title"><p>Dashboard</p></div>
			<div class="cs-window-body">
				<section class="cs-panel">
					<h1 class="text-3xl leading-none">Dashboard</h1>
					<p class="mt-3">Welcome {$sessionQuery.data.user.name}</p>
				</section>
				<section class="cs-panel">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<h2 class="cs-label">Player reports</h2>
						<button class="cs-btn" type="button" onclick={() => $playerReportsQuery.refetch()}>
							Refresh
						</button>
					</div>
					{#if $playerReportsQuery.isPending}
						<p class="mt-3 text-sm text-[var(--cs-text-3)]">Loading reports...</p>
					{:else if $playerReportsQuery.error}
						<p class="mt-3 text-sm text-[var(--cs-danger)]">{$playerReportsQuery.error.message}</p>
					{:else if !$playerReportsQuery.data?.reports.length}
						<p class="mt-3 text-sm text-[var(--cs-text-3)]">No player reports yet.</p>
					{:else}
						<div class="cs-table-wrap mt-3">
							<table class="cs-table text-sm">
								<thead>
									<tr>
										<th>Player</th>
										<th>Reason</th>
										<th>Ban status</th>
										<th>Steam ban type</th>
										<th>Verdict</th>
										<th>Created</th>
									</tr>
								</thead>
								<tbody>
									{#each $playerReportsQuery.data.reports as report}
										<tr>
											<td>
												<a class="cs-link" href={report.reportUrl}>{report.playerName}</a>
												<p class="text-xs text-[var(--cs-text-3)]">{report.steamId}</p>
											</td>
											<td>{report.reason}</td>
											<td>
												<span
													class="cs-indicator cs-bevel-in {report.ban.status === 'banned'
														? 'cs-status-bad'
														: 'cs-status-ok'}"
												>
													<span class="cs-indicator-dot"></span>
													{report.ban.status === 'banned' ? 'banned' : 'not banned'}
												</span>
											</td>
											<td>{report.ban.types.length ? report.ban.types.join(', ') : '-'}</td>
											<td>{report.reportVerdict?.replaceAll('_', ' ') ?? '-'}</td>
											<td>{new Date(report.createdAt).toLocaleDateString()}</td>
										</tr>
										{#if report.notes}
											<tr>
												<th>Note</th>
												<td colspan="5">{report.notes}</td>
											</tr>
										{/if}
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</section>
			</div>
		</div>
	</div>
{/if}
