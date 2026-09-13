# SoupChef

Cliente de escritorio de **SoupDB**, el motor de base de datos multimodal del proyecto de Base de Datos 2 (UTEC, 2026-2).

Implementa la interfaz de usuario del enunciado (2.1.5) con cuatro paneles:

| Panel | Qué muestra |
|---|---|
| Archivos | Tablas cargadas y su estructura |
| Consulta | Editor SQL |
| Resultados | Tabla con el resultado de la consulta |
| Plan de ejecución | Árbol de operadores (`PlanNode`) con filas, tiempo y accesos a disco |

## Arquitectura

```text
SoupChef (Svelte + Tauri)  ──invoke──▶  rsoup (driver Rust, TCP)  ──▶  SoupDB (motor Python)
```

Mientras `rsoup` no esté integrado, la app arranca **sin conexión**: los paneles funcionan pero no hay datos. Para desarrollar con datos de ejemplo (tablas `papers` y `chunks` generadas en memoria), activa el mock:

```bash
cp .env.example .env.local
# en .env.local: VITE_SOUPCHEF_MOCK=true
pnpm dev
```

El mock usa los mismos tipos del contrato y no se incluye en el build cuando la variable no está activa.

## Stack

Svelte 5 · TypeScript · Tailwind CSS 4 · Vite · Tauri 2 · pnpm

## Requisitos

- Node.js 20+ y pnpm
- Rust (solo para la app de escritorio): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- macOS: Xcode Command Line Tools (`xcode-select --install`)

## Uso

```bash
pnpm install

pnpm dev          # app web en http://localhost:1420
pnpm tauri dev    # app de escritorio (requiere Rust)

pnpm check        # tipos de Svelte y TypeScript
pnpm build        # build de producción en dist/
pnpm tauri build  # instalador de escritorio
```

## Estructura

```text
src/
├── App.svelte          # layout de los cuatro paneles
├── main.ts
├── app.css             # Tailwind
└── lib/
    ├── components/     # piezas reutilizables (Panel)
    └── panels/         # un componente por panel
src-tauri/              # proyecto nativo de Tauri
```

## Contribuir

Convenciones compartidas en el repositorio `.agents` (commits, flujo de issues y PRs). Los mensajes de commit siguen `<tipo>(frontend): <descripción en español>`.

## Licencia

MIT — ver [LICENSE](LICENSE).
