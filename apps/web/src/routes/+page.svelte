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

<section class="mx-auto grid max-w-4xl gap-8 px-4 py-12">
	<div class="grid gap-3">
		<p class="text-sm uppercase tracking-wide text-neutral-500">Counter-Strike risk board</p>
		<h1 class="text-4xl font-semibold">steamcommunity.bet</h1>
		<p class="max-w-2xl text-neutral-300">
			Paste a Steam profile. Get a conservative cheating-risk report with evidence links, provider freshness, and missing data.
		</p>
	</div>

	<form class="grid gap-3 md:grid-cols-[1fr_auto]" onsubmit={submit}>
		<input
			class="border border-neutral-700 bg-neutral-950 px-3 py-3 text-neutral-100 outline-none focus:border-sky-400"
			bind:value={lookup}
			placeholder="Steam profile URL, vanity URL, or SteamID64"
		/>
		<button class="border border-sky-400 px-5 py-3 font-medium text-sky-100 hover:bg-sky-400 hover:text-neutral-950" type="submit">
			Generate report
		</button>
	</form>

	{#if error}
		<p class="text-sm text-red-300">{error}</p>
	{/if}

	<a class="text-sm text-sky-300 hover:text-sky-200" href="/profiles/76561199857251932">
		Open calibration profile
	</a>
</section>
