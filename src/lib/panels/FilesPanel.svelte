<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import { client } from '../client'
  import Panel from '../components/Panel.svelte'
  import { query } from '../query.svelte'
  import type { ColumnInfo } from '../types/contract'

  const ORGANIZATIONS: Record<string, string> = {
    heap: 'heap file',
    sequential: 'secuencial',
  }

  const INDEX_KINDS: Record<string, string> = {
    bplus_clustered: 'B+ agrupado',
    bplus_unclustered: 'B+ no agrupado',
    extendible_hash: 'hash extensible',
  }

  const expanded = new SvelteSet<string>()

  const tables = $derived(query.tables)
  const format = (value: number) => value.toLocaleString('es-PE')
  const typeLabel = (column: ColumnInfo) => (column.length ? `${column.type}(${column.length})` : column.type)

  function toggle(name: string) {
    if (expanded.has(name)) expanded.delete(name)
    else expanded.add(name)
  }
</script>

<Panel title="Archivos">
  {#snippet meta()}
    {#if tables.length > 0}
      <span class="font-mono tabular">{tables.length} {tables.length === 1 ? 'tabla' : 'tablas'}</span>
    {/if}
  {/snippet}

  {#snippet actions()}
    <button
      type="button"
      onclick={() => query.loadTables()}
      disabled={query.loadingTables}
      aria-label="Recargar tablas"
      title="Recargar tablas"
      class="grid size-6 place-items-center rounded-md text-subtle transition-colors duration-150 hover:bg-raised hover:text-text disabled:cursor-progress"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        class="size-3.5 {query.loadingTables ? 'animate-spin' : ''}"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89" />
        <path d="M13.5 2.5v3h-3" />
      </svg>
    </button>
  {/snippet}

  {#if tables.length === 0}
    <p class="max-w-56 px-3 py-3 text-subtle">
      {#if !client.connected}
        Sin conexión con el motor. Las tablas aparecen aquí al conectar SoupDB.
      {:else if query.loadingTables}
        Cargando tablas…
      {:else}
        El motor no tiene tablas todavía.
      {/if}
    </p>
  {:else}
    <ul class="py-1.5">
      {#each tables as table (table.name)}
        {@const open = expanded.has(table.name)}
        <li>
          <div class="group mx-1.5 flex items-center gap-1 rounded-md pr-1 transition-colors duration-150 hover:bg-raised">
            <button
              type="button"
              onclick={() => toggle(table.name)}
              aria-expanded={open}
              class="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-1.5 text-left"
            >
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                class="size-3 shrink-0 text-subtle transition-transform duration-200 ease-out-quart {open
                  ? 'rotate-90'
                  : ''}"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M4.5 3l3 3-3 3" />
              </svg>
              <span class="truncate font-mono font-medium text-text">{table.name}</span>
              <span class="ml-auto shrink-0 font-mono text-micro text-subtle tabular">{format(table.row_count)}</span>
            </button>
            <button
              type="button"
              onclick={() => (query.sql = `SELECT * FROM ${table.name};`)}
              aria-label="Consultar {table.name}"
              title="Escribir SELECT * FROM {table.name} en el editor"
              class="shrink-0 rounded-sm px-1.5 py-0.5 text-micro text-accent-text opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent-soft focus-visible:opacity-100"
            >
              Consultar
            </button>
          </div>

          <div
            class="grid transition-[grid-template-rows] duration-200 ease-out-quart {open
              ? 'grid-rows-[1fr]'
              : 'grid-rows-[0fr]'}"
          >
            <div class="min-h-0 overflow-hidden" inert={!open}>
              <div class="mb-2 ml-5 mr-3 border-l border-line pl-2.5 text-micro">
                <p class="pt-1 text-subtle">{ORGANIZATIONS[table.organization] ?? table.organization}</p>

                <ul class="mt-1.5 space-y-0.5" aria-label="Columnas de {table.name}">
                  {#each table.columns as column (column.name)}
                    <li class="flex items-baseline gap-2">
                      <span class="truncate font-mono text-text">{column.name}</span>
                      {#if column.primary_key}
                        <span class="shrink-0 font-mono text-[0.625rem] font-semibold text-accent-text">PK</span>
                      {/if}
                      <span class="ml-auto shrink-0 font-mono text-subtle">{typeLabel(column)}</span>
                    </li>
                  {/each}
                </ul>

                {#if table.indexes.length > 0}
                  <p class="mt-2.5 text-subtle">Índices</p>
                  <ul class="mt-1 space-y-1" aria-label="Índices de {table.name}">
                    {#each table.indexes as index (index.name)}
                      <li>
                        <div class="flex items-baseline gap-2">
                          <span class="truncate font-mono text-text">{index.name}</span>
                          <span class="ml-auto shrink-0 font-mono text-subtle">{index.column}</span>
                        </div>
                        <p class="text-muted">{INDEX_KINDS[index.kind] ?? index.kind}</p>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</Panel>
