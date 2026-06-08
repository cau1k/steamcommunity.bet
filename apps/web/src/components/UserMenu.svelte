<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { PUBLIC_SERVER_URL } from '$env/static/public';
	import { authClient } from '$lib/auth-client';

	const sessionQuery = authClient.useSession();
	const steamSignInURL = $derived(
		`${PUBLIC_SERVER_URL}/api/auth/steam?callbackURL=${encodeURIComponent(page.url.href)}`
	);

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
			<a class="steam-login-button --compact" href={steamSignInURL} aria-label="Sign in through Steam">
				<img src="/steam-signin.png" alt="Sign in through Steam" />
			</a>
		</div>
	{/if}
</div>
