<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';

	const sessionQuery = authClient.useSession();

	async function handleSignOut() {
		await authClient.signOut({
		fetchOptions: {
			onSuccess: () => {
				goto('/');
			},
			onError: (error) => {
				console.error('Sign out failed:', error);
			}
		}
		});
	}

	function goToLogin() {
		goto('/login');
	}

</script>

<div class="relative">
	{#if $sessionQuery.isPending}
		<div class="cs-bevel-in h-7 w-24 animate-pulse bg-[var(--cs-bg-2)]"></div>
	{:else if $sessionQuery.data?.user}
		{@const user = $sessionQuery.data.user}
		<div class="flex items-center gap-3">
			<span class="cs-muted hidden min-w-0 max-w-40 truncate text-sm sm:inline" title={user.name || 'Steam user'}>
				{user.name || 'Steam user'}
			</span>
			<button onclick={handleSignOut} class="cs-btn text-sm">
				Sign Out
			</button>
		</div>
	{:else}
		<div class="flex items-center gap-2">
			<button onclick={goToLogin} class="cs-btn text-sm">
				Steam Sign In
			</button>
		</div>
	{/if}
</div>
