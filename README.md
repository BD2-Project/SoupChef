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

SoupChef tiene dos modos que comparten la misma UI (`src/App.svelte`):

```text
Escritorio:  SoupChef (Svelte + Tauri) ──invoke──▶ rsoup (Rust) ──TCP──▶ SoupDB
Web:         Navegador ──HTTP──▶ SvelteKit (Node) ──TCPl────────────────▶ SoupDB
```

- **Escritorio**: la app Tauri sigue usando `rsoup` vía `TauriClient`.
- **Web**: SvelteKit renderiza del lado del servidor y expone `/api/*`; el servidor
  Node implementa el protocolo binario v1.1 (v2, schema-driven) en TypeScript.
  El navegador nunca abre TCP: solo habla con el servidor.
- La app Tauri se sigue compilando como SPA aparte (`vite.tauri.config.ts`), así
  que el cambio a SvelteKit no rompe el escritorio.

### Contra el motor real (web SSR)

```bash
# 1. Levanta el gestor (en el repo SoupDB)
SOUP_DB_PATH=./data uv run python scripts/run_server.py   # escucha en 127.0.0.1:55432

# 2. Levanta el servidor SSR (en este repo)
SOUPDB_HOST=127.0.0.1 SOUPDB_PORT=55432 pnpm dev
# http://localhost:5173
```

> **Protocolo**: el driver SSR envía frames `0x02` para recibir el header
> schema-driven (v1.1); con `SOUPDB_WIRE_VERSION=1` habla el formato legado. El
> decoder acepta el `size` u16 del codec Python y también el u32 de la propuesta
> de `rsoup`, y valida que el payload se consuma completo para no confundirlos.

### Contra el motor real (app de escritorio)

```bash
pnpm tauri dev
```

El panel de Archivos se llena leyendo el catálogo del motor (`SysTables`, `SysColumns`, `SysIndexes`, `SysPlugins`, `SysTypes`) y el editor ejecuta SQL real, incluidas transacciones y prepared statements. Requiere Rust instalado.

### Con datos de ejemplo (navegador)

Para desarrollar sin motor, con las tablas `docs`, `imagenes`, `canciones`, `papers` y `chunks` generadas en memoria, activa el mock:

```bash
cp .env.example .env.local
# en .env.local: VITE_SOUPCHEF_MOCK=true
pnpm dev
```

El mock usa los mismos tipos del contrato y no se incluye en el build cuando la variable no está activa.

## Imagen Docker (SSR)

La imagen sirve el build de SvelteKit con `adapter-node` (Node 22). Por defecto
espera el gestor en el host `engine`, puerto `55432` (el servicio de
`SoupDB/docker-compose.yml`):

```bash
docker build -t soupchef .
docker run --rm -p 3000:3000 \
  -e SOUPDB_HOST=engine -e SOUPDB_PORT=55432 \
  soupchef
```

| Variable | Default | Uso |
|---|---|---|
| `SOUPDB_HOST` | `engine` | Host del gestor |
| `SOUPDB_PORT` | `55432` | Puerto del driver |
| `SOUPDB_WIRE_VERSION` | `2` | `2` = header v1.1; `1` = legado |
| `SOUPDB_TIMEOUT_MS` | `15000` | Timeout de conexión/respuesta |
| `PORT` | `3000` | Puerto HTTP del servidor |
| `HOST` | `0.0.0.0` | Interfaz de escucha |

El workflow `.github/workflows/container.yml` publica
`ghcr.io/BD2-Project/soupchef` al empujar un tag `v*`.

Para la demo completa, comparte la red con el `docker-compose.yml` de SoupDB
(el servicio se llama `engine`):

```bash
docker run --rm --network soupbd_default -p 3000:3000 \
  -e SOUPDB_HOST=engine -e SOUPDB_PORT=55432 \
  ghcr.io/BD2-Project/soupchef:v0.3.0
```

Si el paquete de GHCR queda **privado**, autentícate antes del `pull`:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <usuario> --password-stdin
docker pull ghcr.io/BD2-Project/soupchef:v0.3.0
```

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

Svelte 5 · SvelteKit 3 · TypeScript · Tailwind CSS 4 · Vite · Tauri 2 · pnpm

## Requisitos

- Node.js 22.17+ y pnpm 10
- Rust (solo para la app de escritorio): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- macOS: Xcode Command Line Tools (`xcode-select --install`)

## Uso

```bash
pnpm install

pnpm dev           # SSR web en http://localhost:5173
pnpm dev:tauri     # SPA de escritorio en http://localhost:1420 (la usa Tauri)
pnpm tauri dev     # app de escritorio (requiere Rust)

pnpm check         # tipos de Svelte y TypeScript
pnpm build         # build SSR (adapter-node) en build/
pnpm build:tauri   # build SPA para Tauri en dist/
pnpm start         # sirve el build SSR (node build)
pnpm tauri build   # instalador de escritorio
```

## Estructura

```text
src/
├── App.svelte          # layout de los cuatro paneles
├── app.html            # plantilla SSR (tema antes del primer pintado)
├── app.css             # Tailwind
├── hooks.server.ts     # cookie de sesión (conexión TCP por navegador)
├── routes/
│   ├── +layout.svelte  # fuentes + estilos
│   ├── +page.svelte    # renderiza App
│   └── api/            # query, catalog, tx, prepared (solo servidor)
└── lib/
    ├── catalog.ts      # mapeo compartido del catálogo
    ├── components/     # piezas reutilizables (Panel, editor, mapa…)
    ├── panels/         # un componente por panel
    ├── client/         # TauriClient (escritorio), WebClient (SSR), mock
    └── server/soupdb/  # codec binario v1.1, conexión TCP, sesiones, catálogo
src-tauri/              # proyecto nativo de Tauri
vite.config.ts          # build SSR (SvelteKit + adapter-node)
vite.tauri.config.ts    # build SPA para Tauri
```

## Contribuir

Convenciones compartidas en el repositorio `.agents` (commits, flujo de issues y PRs). Los mensajes de commit siguen `<tipo>(frontend): <descripción en español>`.

## Licencia

MIT — ver [LICENSE](LICENSE).
