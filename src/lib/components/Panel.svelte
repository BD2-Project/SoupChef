<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    title: string
    meta?: Snippet
    actions?: Snippet
    children: Snippet
  }

  let { title, meta, actions, children }: Props = $props()

  const headingId = $props.id()
</script>

<section
  aria-labelledby={headingId}
  class="flex min-h-0 min-w-0 flex-col bg-surface transition-colors duration-200"
>
  <header class="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
    <h2 id={headingId} class="text-ui font-medium text-text">{title}</h2>
    {#if meta}
      <div class="text-micro text-subtle">{@render meta()}</div>
    {/if}
    {#if actions}
      <div class="ml-auto flex items-center gap-1.5">{@render actions()}</div>
    {/if}
  </header>
  <div class="min-h-0 flex-1 overflow-auto">
    {@render children()}
  </div>
</section>
