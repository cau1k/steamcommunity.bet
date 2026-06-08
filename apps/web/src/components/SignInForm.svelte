<script lang="ts">
	import { browser } from '$app/environment';
	import { PUBLIC_SERVER_URL } from '$env/static/public';

	let callbackURL = $state('/dashboard');
	$effect(() => {
		if (browser) {
			callbackURL = new URL('/dashboard', window.location.origin).toString();
		}
	});

	const steamSignInURL = $derived(
		`${PUBLIC_SERVER_URL}/api/auth/steam?callbackURL=${encodeURIComponent(callbackURL)}`
	);
</script>

<div class="cs-shell max-w-md">
	<div class="cs-window">
		<div class="cs-window-title">
			<p>Steam Login</p>
		</div>
		<div class="cs-window-body">
			<h1 class="text-3xl leading-none">Dashboard Access</h1>
			<a class="steam-login-button" href={steamSignInURL} aria-label="Sign in through Steam">
				<img src="/steam-signin.png" alt="Sign in through Steam" />
			</a>
			<p class="cs-muted text-sm">
				Reports are tied to the Steam account that submits them.
			</p>
		</div>
	</div>
</div>
