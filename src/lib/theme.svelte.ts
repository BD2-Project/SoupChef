export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'soupchef-theme'

/** En SSR no hay DOM; el script de app.html fija el tema al hidratar. */
function initialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

class ThemeState {
  current = $state<Theme>(initialTheme())

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
