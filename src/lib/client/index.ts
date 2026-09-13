import type { SoupClient } from './client'
import { MockClient } from './mock/mock-client'

// Único punto de cambio al integrar: se reemplaza por un cliente que usa invoke hacia rsoup.
export const client: SoupClient = new MockClient()

export type { SoupClient }
