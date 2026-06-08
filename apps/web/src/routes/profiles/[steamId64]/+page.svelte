<script lang="ts">
	import ReportBoard from '../../../components/ReportBoard.svelte';

	const { data } = $props();
</script>

<ReportBoard path={data.path} />
