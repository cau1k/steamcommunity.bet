<script lang="ts">
	import UserMenu from './UserMenu.svelte';
</script>

<header class="cs-nav">
	<div class="mx-auto flex min-h-10 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
		<nav class="flex flex-wrap items-center gap-4 text-sm">
			<a href="/" class="cs-nav-link">Find Player</a>
			<a href="/dashboard" class="cs-nav-link">Dashboard</a>
		</nav>
		<div class="flex items-center gap-2">
			<UserMenu />
		</div>
	</div>
</header>
