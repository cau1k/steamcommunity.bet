<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { orpc } from '$lib/orpc';
	import { createQuery } from '@tanstack/svelte-query';

	const sessionQuery = authClient.useSession();

	const privateDataQuery = createQuery(orpc.privateData.queryOptions());

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
					<p class="cs-muted mt-2">API: {$privateDataQuery.data?.message}</p>
				</section>
			</div>
		</div>
	</div>
{/if}
