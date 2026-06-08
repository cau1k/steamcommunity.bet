<script lang="ts">
	import { goto } from '$app/navigation';

	let lookup = $state('https://steamcommunity.com/profiles/76561199857251932');
	let error = $state<string | null>(null);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const target = resolveInput(lookup);
		if (!target) {
			error = 'Paste a Steam profile URL, vanity URL, or SteamID64.';
			return;
		}
		error = null;
		goto(target);
	}

	function resolveInput(value: string) {
		const trimmed = value.trim();
		if (/^\d{17}$/.test(trimmed)) {
			return `/profiles/${trimmed}`;
		}
		try {
			const url = new URL(trimmed);
			if (url.pathname.startsWith('/profiles/') || url.pathname.startsWith('/id/')) {
				return url.pathname;
			}
		} catch {
			if (trimmed.startsWith('/profiles/') || trimmed.startsWith('/id/')) {
				return trimmed;
			}
		}
		return null;
	}
</script>

<section class="cs-shell">
	<div class="cs-window">
		<div class="cs-window-title">
			<p>Counter-Strike Risk Board</p>
			<p class="hidden sm:block">steamcommunity.bet</p>
		</div>
		<div class="cs-window-body min-h-[calc(100svh-110px)] content-center">
			<div class="grid max-w-3xl gap-5">
				<div class="grid gap-3">
					<p class="cs-label">Player lookup</p>
					<h1 class="text-4xl leading-none sm:text-5xl">steamcommunity.bet</h1>
					<p class="max-w-2xl text-lg text-[var(--cs-text-2)]">
						Paste a Steam profile. Get a conservative cheating-risk report with evidence links,
						provider freshness, and missing data.
					</p>
				</div>

				<form class="grid gap-3 md:grid-cols-[1fr_auto]" onsubmit={submit}>
					<input
						class="cs-input"
						bind:value={lookup}
						placeholder="Steam profile URL, vanity URL, or SteamID64"
					/>
					<button class="cs-btn" type="submit">Generate report</button>
				</form>

				{#if error}
					<p class="text-sm text-[var(--cs-danger)]">{error}</p>
				{/if}

				<div class="flex flex-wrap gap-3">
					<a class="cs-btn inline-flex items-center" href="/profiles/76561199857251932">
						Open calibration profile
					</a>
					<a class="cs-btn inline-flex items-center" href="/id/piewhat">Open piewhat</a>
				</div>
			</div>
		</div>
	</div>
</section>
