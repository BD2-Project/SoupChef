import type { SoupClient } from './client'
import { DisconnectedClient } from './disconnected-client'
import { MockClient } from './mock/mock-client'

// El mock solo se activa a propósito con VITE_SOUPCHEF_MOCK=true; sin la variable, Vite
// elimina la rama en el build y la app no trae datos de ejemplo.
// Único punto de cambio al integrar: se reemplaza DisconnectedClient por el cliente que usa invoke hacia rsoup.
export const client: SoupClient =
  import.meta.env.VITE_SOUPCHEF_MOCK === 'true' ? new MockClient() : new DisconnectedClient()

export type { SoupClient }
