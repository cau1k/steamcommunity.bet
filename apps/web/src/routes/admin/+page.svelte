<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { orpc } from '$lib/orpc';
	import { createQuery } from '@tanstack/svelte-query';
	import { derived } from 'svelte/store';
	import SortableTable from '../../components/SortableTable.svelte';

	const sessionQuery = authClient.useSession();
	const adminCheckQuery = createQuery(orpc.admin.check.queryOptions());
	const usersQuery = createQuery(
		derived(adminCheckQuery, ($adminCheckQuery) => ({
			...orpc.admin.users.queryOptions(),
			enabled: Boolean($adminCheckQuery.data?.isAdmin)
		}))
	);
	const reportedPlayersQuery = createQuery(
		derived(adminCheckQuery, ($adminCheckQuery) => ({
			...orpc.admin.reportedPlayers.queryOptions(),
			enabled: Boolean($adminCheckQuery.data?.isAdmin)
		}))
	);

	const userRows = $derived(
		($usersQuery.data?.users ?? []).map((user) => ({
			name: user.name,
			steamId: user.steamId ?? '-',
			role: user.isAdmin ? 'admin' : (user.role ?? 'user'),
			banned: user.banned ? 'yes' : 'no',
			createdAt: new Date(user.createdAt).toLocaleDateString()
		}))
	);
	const playerRows = $derived(
		($reportedPlayersQuery.data?.players ?? []).map((player) => ({
			player: player.playerName,
			reportUrl: player.reportUrl,
			steamId: player.steamId,
			verdict: player.verdict.replaceAll('_', ' '),
			accusations: player.accusationCount,
			disputes: player.disputeCount,
			total: player.totalReports,
			lastCheckedAt: player.lastCheckedAt ? new Date(player.lastCheckedAt).toLocaleString() : '-',
			recent: player.recentReports
				.map((report) => {
					const note = report.notes ? ` - ${report.notes}` : '';
					return `${report.reporterName}: ${reportReasonLabel(report.reason)}${note}`;
				})
				.join(' | ')
		}))
	);

	function reportReasonLabel(reason: string) {
		return reason === 'legit' ? 'not cheating / legit' : reason;
	}

	$effect(() => {
		if (!$sessionQuery.isPending && !$sessionQuery.data) {
			goto('/login');
		}
	});
</script>

{#if $sessionQuery.isPending || $adminCheckQuery.isPending}
	<div class="cs-shell">
		<div class="cs-window">
			<div class="cs-window-title"><p>Admin</p></div>
			<div class="cs-window-body"><p>Loading...</p></div>
		</div>
	</div>
{:else if !$sessionQuery.data}
	<div class="cs-shell">
		<div class="cs-window">
			<div class="cs-window-title"><p>Admin</p></div>
			<div class="cs-window-body"><p>Redirecting to login...</p></div>
		</div>
	</div>
{:else if !$adminCheckQuery.data?.isAdmin}
	<div class="cs-shell">
		<div class="cs-window">
			<div class="cs-window-title"><p>Admin</p></div>
			<div class="cs-window-body"><p>Access denied.</p></div>
		</div>
	</div>
{:else}
	<div class="cs-shell">
		<div class="cs-window">
			<div class="cs-window-title"><p>Admin</p></div>
			<div class="cs-window-body">
				<section class="cs-panel">
					<h1 class="text-3xl leading-none">Admin</h1>
					<p class="mt-3 text-sm text-[var(--cs-text-3)]">Global users and checked reported players.</p>
				</section>

				<section class="cs-panel">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<h2 class="cs-label">Users</h2>
						<button class="cs-btn" type="button" onclick={() => $usersQuery.refetch()}>Refresh</button>
					</div>
					{#if $usersQuery.isPending}
						<p class="mt-3 text-sm text-[var(--cs-text-3)]">Loading users...</p>
					{:else if $usersQuery.error}
						<p class="mt-3 text-sm text-[var(--cs-danger)]">{$usersQuery.error.message}</p>
					{:else}
						<SortableTable
							rows={userRows}
							columns={[
								{ key: 'name', label: 'User', sort: 'string' },
								{ key: 'steamId', label: 'SteamID', sort: 'string' },
								{ key: 'role', label: 'Role', sort: 'string' },
								{ key: 'banned', label: 'Banned', sort: 'string' },
								{ key: 'createdAt', label: 'Created', sort: 'date' }
							]}
							empty="No users."
						/>
					{/if}
				</section>

				<section class="cs-panel">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<h2 class="cs-label">Checked reported players</h2>
						<button class="cs-btn" type="button" onclick={() => $reportedPlayersQuery.refetch()}>Refresh</button>
					</div>
					{#if $reportedPlayersQuery.isPending}
						<p class="mt-3 text-sm text-[var(--cs-text-3)]">Loading reported players...</p>
					{:else if $reportedPlayersQuery.error}
						<p class="mt-3 text-sm text-[var(--cs-danger)]">{$reportedPlayersQuery.error.message}</p>
					{:else}
						<SortableTable
							rows={playerRows}
							columns={[
								{ key: 'player', label: 'Player', hrefKey: 'reportUrl', sort: 'string' },
								{ key: 'steamId', label: 'SteamID', sort: 'string' },
								{ key: 'verdict', label: 'Verdict', sort: 'string' },
								{ key: 'accusations', label: 'Accuse', sort: 'number' },
								{ key: 'disputes', label: 'Dispute', sort: 'number' },
								{ key: 'total', label: 'Total', sort: 'number' },
								{ key: 'lastCheckedAt', label: 'Checked', sort: 'date' },
								{ key: 'recent', label: 'Recent reports', sort: 'string' }
							]}
							empty="No checked reported players."
						/>
					{/if}
				</section>
			</div>
		</div>
	</div>
{/if}
