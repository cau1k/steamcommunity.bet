<script lang="ts">
	import { goto } from '$app/navigation';
	import { normalizeSteamProfileInput } from '@steamcommunity.bet/api/steam-profile-input';

	let lookup = $state('');
	let error = $state<string | null>(null);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const target = normalizeSteamProfileInput(lookup)?.sourcePath;
		if (!target) {
			error = 'Paste a Steam profile URL, SteamID64, or Steam ID.';
			return;
		}
		error = null;
		goto(target);
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
						Check a Counter-Strike player before you queue, report, or cope. Pulls Steam, CSStats,
						Leetify, and FACEIT into one readable call.
					</p>
					<p class="max-w-2xl text-base text-[var(--cs-text-2)]">
						Shortcut: replace steamcommunity<strong class="cs-domain-example">.com</strong> with
						steamcommunity<strong class="cs-domain-example">.bet</strong>. Example:
						steamcommunity<strong class="cs-domain-example">.com</strong>/id/caulkenstein becomes
						steamcommunity<strong class="cs-domain-example">.bet</strong>/id/caulkenstein.
					</p>
				</div>

				<form class="grid gap-3 md:grid-cols-[1fr_auto]" onsubmit={submit}>
					<input
						class="cs-input"
						bind:value={lookup}
						placeholder="Steam profile URL, SteamID64, STEAM_0:1:123, or [U:1:247]"
					/>
					<button class="cs-btn" type="submit">Generate report</button>
				</form>

				{#if error}
					<p class="text-sm text-[var(--cs-danger)]">{error}</p>
				{/if}

			</div>
		</div>
	</div>
</section>
