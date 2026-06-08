<script lang="ts">
	type Row = Record<string, unknown>;
	type Column = {
		key: string;
		label: string;
		hrefKey?: string;
		sort?: 'string' | 'number' | 'date';
	};

	type Props = {
		columns: Column[];
		rows: Row[];
		empty?: string;
	};

	const { columns, rows, empty = 'No rows.' }: Props = $props();
	let sortKey = $state('');
	let sortDirection = $state<'asc' | 'desc'>('asc');

	$effect(() => {
		if (!sortKey && columns[0]) {
			sortKey = columns[0].key;
		}
	});

	const sortedRows = $derived(
		[...rows].sort((left, right) => {
			const column = columns.find((item) => item.key === sortKey);
			const result = compareValues(left[sortKey], right[sortKey], column?.sort ?? 'string');
			return sortDirection === 'asc' ? result : -result;
		})
	);

	function setSort(key: string) {
		if (sortKey === key) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
			return;
		}
		sortKey = key;
		sortDirection = 'asc';
	}

	function compareValues(left: unknown, right: unknown, mode: Column['sort']) {
		if (mode === 'number') {
			return Number(left ?? 0) - Number(right ?? 0);
		}
		if (mode === 'date') {
			return new Date(String(left ?? 0)).getTime() - new Date(String(right ?? 0)).getTime();
		}
		return String(left ?? '').localeCompare(String(right ?? ''));
	}

	function cellValue(row: Row, column: Column) {
		const value = row[column.key];
		if (value === null || value === undefined || value === '') return '-';
		return String(value);
	}

	function cellHref(row: Row, column: Column) {
		return column.hrefKey ? String(row[column.hrefKey] ?? '') : '';
	}
</script>

{#if rows.length}
	<div class="cs-table-wrap mt-3">
		<table class="cs-table text-sm">
			<thead>
				<tr>
					{#each columns as column}
						<th>
							<button class="cs-table-sort" type="button" onclick={() => setSort(column.key)}>
								{column.label}
								{#if sortKey === column.key}
									<span>{sortDirection === 'asc' ? 'asc' : 'desc'}</span>
								{/if}
							</button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each sortedRows as row}
					<tr>
						{#each columns as column}
							<td>
								{#if cellHref(row, column)}
									<a class="cs-link" href={cellHref(row, column)}>{cellValue(row, column)}</a>
								{:else}
									{cellValue(row, column)}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="mt-3 text-sm text-[var(--cs-text-3)]">{empty}</p>
{/if}
