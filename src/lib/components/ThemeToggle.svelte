<script lang="ts">
  import { theme } from '../theme.svelte'

  const label = $derived(theme.current === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro')
</script>

<button
  type="button"
  onclick={() => theme.toggle()}
  aria-label={label}
  title={label}
  class="relative grid size-7 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-raised hover:text-text"
>
  <svg
    viewBox="0 0 16 16"
    aria-hidden="true"
    class="absolute size-4 transition-[opacity,rotate] duration-200 ease-out-quart {theme.current === 'dark'
      ? 'rotate-0 opacity-100'
      : '-rotate-90 opacity-0'}"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
  >
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" />
  </svg>
  <svg
    viewBox="0 0 16 16"
    aria-hidden="true"
    class="absolute size-4 transition-[opacity,rotate] duration-200 ease-out-quart {theme.current === 'light'
      ? 'rotate-0 opacity-100'
      : 'rotate-90 opacity-0'}"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linejoin="round"
  >
    <path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z" />
  </svg>
</button>
