<script lang="ts">
  import '@fontsource-variable/ibm-plex-sans'
  import '@fontsource-variable/jetbrains-mono'
  import '../app.css'

  let { children } = $props()
</script>

<div class="h-full">
  {@render children()}
</div>
