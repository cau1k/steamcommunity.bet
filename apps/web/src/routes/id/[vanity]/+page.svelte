<script lang="ts">
	import ReportBoard from '../../../components/ReportBoard.svelte';

	const { data } = $props();
</script>

{#key data.path}
	<ReportBoard path={data.path} />
{/key}
