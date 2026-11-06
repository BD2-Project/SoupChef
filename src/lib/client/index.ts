import { isTauri } from '@tauri-apps/api/core'

import type { SoupClient } from './client'
import { MockClient } from './mock/mock-client'
import { TauriClient } from './tauri-client'
import { WebClient } from './web-client'

// Escritorio: driver rsoup vía Tauri. Navegador (y SSR): endpoints de SvelteKit,
// que son quienes abren el TCP contra el motor. El mock sigue disponible con
// VITE_SOUPCHEF_MOCK para desarrollar sin gestor.
function pickClient(): SoupClient {
  if (import.meta.env.VITE_SOUPCHEF_MOCK === 'true') return new MockClient()
  if (isTauri()) return new TauriClient()
  return new WebClient()
}

export const client: SoupClient = pickClient()

export type { SoupClient }
