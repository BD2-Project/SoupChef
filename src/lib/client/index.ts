import { isTauri } from '@tauri-apps/api/core'

import type { SoupClient } from './client'
import { DisconnectedClient } from './disconnected-client'
import { MockClient } from './mock/mock-client'
import { TauriClient } from './tauri-client'

// En la app de escritorio se habla con el motor real a través del driver rsoup.
// En el navegador no hay sockets TCP: queda el mock (VITE_SOUPCHEF_MOCK=true) o sin conexión.
function pickClient(): SoupClient {
  if (import.meta.env.VITE_SOUPCHEF_MOCK === 'true') return new MockClient()
  if (isTauri()) return new TauriClient()
  return new DisconnectedClient()
}

export const client: SoupClient = pickClient()

export type { SoupClient }
