<script lang="ts">
    import { QueryClientProvider } from '@tanstack/svelte-query';
    import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools'
	import '../app.css';
    import { queryClient } from '$lib/orpc';
    import Footer from '../components/Footer.svelte';
    import Header from '../components/Header.svelte';

	const { children } = $props();
</script>

<QueryClientProvider client={queryClient}>
    <div class="cs-layout grid h-svh grid-rows-[auto_1fr_auto]">
		<Header />
		<main class="overflow-y-auto">
			{@render children()}
		</main>
		<Footer />
    </div>
    <SvelteQueryDevtools />
</QueryClientProvider>
