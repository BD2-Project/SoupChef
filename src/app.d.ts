declare global {
  namespace App {
    interface Locals {
      /** Cookie que ancla la conexión TCP y la transacción del navegador. */
      sessionId: string
    }
  }
}

export {}
