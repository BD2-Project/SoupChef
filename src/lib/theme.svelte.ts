export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'soupchef-theme'

class ThemeState {
  // SSR y el primer render del cliente deben coincidir; onMount aplica la
  // preferencia real que app.html ya dejó en el DOM.
  current = $state<Theme>('dark')

  sync(): void {
    if (typeof document === 'undefined') return
    this.current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  }

  toggle(): void {
    this.set(this.current === 'dark' ? 'light' : 'dark')
  }

  set(theme: Theme): void {
    this.current = theme
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Sin almacenamiento disponible el tema solo dura la sesión.
    }
  }
}

export const theme = new ThemeState()
