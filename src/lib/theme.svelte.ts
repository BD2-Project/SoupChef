export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'soupchef-theme'

class ThemeState {
  current = $state<Theme>(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

  toggle(): void {
    this.set(this.current === 'dark' ? 'light' : 'dark')
  }

  set(theme: Theme): void {
    this.current = theme
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Sin almacenamiento disponible el tema solo dura la sesión.
    }
  }
}

export const theme = new ThemeState()
