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

La app de escritorio habla con el motor a través del driver `rsoup`. En el navegador no hay sockets TCP, así que ahí queda el mock o el estado sin conexión.

### Contra el motor real (app de escritorio)

```bash
# 1. Levanta el gestor (en el repo SoupDB)
SOUP_DB_PATH=./data uv run python scripts/run_server.py   # escucha en 127.0.0.1:55432

# 2. Levanta la app (en este repo)
pnpm tauri dev
```

El panel de Archivos se llena leyendo el catálogo del motor (`SysTables`, `SysColumns`, `SysIndexes`) y el editor ejecuta SQL real, incluidas transacciones. Requiere Rust instalado.

El host y el puerto por defecto son `127.0.0.1:55432`; se pueden cambiar invocando el comando `connect`.

### Con datos de ejemplo (navegador)

Para desarrollar sin motor, con las tablas `papers` y `chunks` generadas en memoria, activa el mock:

```bash
cp .env.example .env.local
# en .env.local: VITE_SOUPCHEF_MOCK=true
pnpm dev
```

El mock usa los mismos tipos del contrato y no se incluye en el build cuando la variable no está activa.

## Plan de ejecución

El plan se pide de forma explícita, como en PostgreSQL. Una consulta normal devuelve solo filas; anteponiendo `EXPLAIN ANALYZE` la consulta se ejecuta pero, en lugar de filas, devuelve el plan: en **Resultados** aparece en texto (operador, detalle, filas, tiempo y accesos a disco) y a la derecha como **diagrama**:

```sql
EXPLAIN ANALYZE SELECT id, autor FROM papers ORDER BY autor DESC LIMIT 3;
```

## Búsquedas de plugins (v0.3.0)

El gestor expone índices full-text y vectoriales como plugins. El SQL de búsqueda
es uniforme para todos:

```sql
SELECT *, SCORE()
FROM docs
WHERE SEARCH(contenido, 'índice invertido') USING INVERTED
  WITH (method = 'bm25', k = 10)
ORDER BY SCORE() DESC;

SELECT id, nombre, SCORE()
FROM imagenes
WHERE SEARCH(archivo, 'foto-03.jpg') USING HNSW
  WITH (metric = 'cosine', k = 5);
```

La UI acompaña esos cambios:

- **Archivos** lista los índices de plugin (`INVERTED`/`IVF`/`HNSW`) con sus
  opciones `WITH`, los plugins cargados (`SysPlugins`) y los tipos registrados
  para el wire (`SysTypes`).
- **Resultados** muestra `SCORE()` como número, columnas `VECTOR` truncadas y
  valores opacos (`‹tipo› n bytes`) del protocolo v1.1.
- **Consulta** incluye un selector de **Ejemplos** (texto, vectorial, plan,
  catálogo y DML) y un botón **Prepared** que prepara `SELECT … WHERE id = $1`,
  la ejecuta dos veces y muestra que el plan se reutiliza.
- El **autocompletado** conoce `SEARCH`/`SCORE`/`USING`/`WITH`, los plugins del
  catálogo y sus opciones, además de las tablas y columnas.

Con el mock (`VITE_SOUPCHEF_MOCK=true`) las tablas `docs`, `imagenes` y
`canciones` permiten probar todo sin motor; el `INSERT`/`DELETE` del mock se
refleja en las búsquedas para demostrar el mantenimiento automático del índice.
Contra el motor real, estas funciones dependen de que el gestor tenga activas
sus fases de SQL de plugins (v0.5.0) y de que el driver `rsoup` sea v0.2.0.

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
