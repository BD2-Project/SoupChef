<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    title: string
    actions?: Snippet
    children: Snippet
  }

  let { title, actions, children }: Props = $props()
</script>

<section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-slate-800 bg-slate-900">
  <header class="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 px-3">
    <h2 class="text-xs font-semibold tracking-wide text-slate-400 uppercase">{title}</h2>
    {#if actions}
      <div class="flex items-center gap-2">{@render actions()}</div>
    {/if}
  </header>
  <div class="min-h-0 flex-1 overflow-auto">
    {@render children()}
  </div>
</section>
