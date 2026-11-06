# Versionado y entregas

Convención formalizada el 2026-11-02 tras la auditoría de ramas, tags y milestones (eran los primeros tags del repositorio).

## Esquema

- SemVer simplificado `vX.Y.Z` mediante **tags anotados** de Git.
- `X.YZ`: bump de **minor** por cada entrega de milestone fusionada a `main`; **patch** para fixes publicados entre entregas.
- El tag se crea en el commit de `main` que cierra la entrega.
- `package.json`, `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml` deben reflejar la versión del último tag.

## Flujo de trabajo

1. Issues ligadas a un milestone (el GitHub Project **Entrega 1 (SoupDB)** rastrea este repo y SoupDB).
2. Rama por issue (`<número>-<tema>`) → PR a `main` (CI en verde).
3. Tag inmediato al fusionar la entrega.

## Mapa de tags

| Tag | Fecha | Entrega | PR de anclaje | Cambio clave |
|---|---|---|---|---|
| `v0.1.0` | 2026-09-27 | **Avance 1** | #20 | Cuatro paneles (archivos, consultas CodeMirror, resultados virtualizados, plan), sistema de diseño, conexión al motor real vía driver rsoup |
| `v0.2.0` | 2026-10-05 | **Entrega Parcial** (espacial) | #34 | Contrato POINT, mapa Leaflet, gráficas secuencial vs R-Tree vs GiST (2.2.4), mapa con datos reales del motor, polígonos de intersección, plan estructurado dibujado, fixes de driver Tauri |
| `v0.3.0` | 2026-11-06 | **Plugins + web SSR** | #39 | SQL `SEARCH ... USING ... WITH (...)`, `SCORE()`, índices auto-mantenidos visibles, protocolo v1.1 (`VECTOR`/opacos), prepared statements y autocompletado de plugins. Migración a SvelteKit con SSR, driver binario en TypeScript, imagen `ghcr.io/BD2-Project/soupchef` y CI |

## Próxima versión

- **v0.4.0**: LSP propio sobre el parser del gestor (completado y diagnósticos), galería de imágenes y reproductor de audio para resultados multimedia, y TLS cuando el motor lo soporte.

## Matriz de compatibilidad

| SoupChef | rsoup | Gestor (protocolo) | Notas |
|---|---|---|---|
| `v0.2.0` | `0.1.0` | v1 (`type_code` numérico) | 6 tipos nativos |
| `v0.3.0` | `0.2.0` (rama `feat/driver-v11`, commit `21358f7`) | v1.1 (`type_name`/`encoding`, prepared, `VECTOR`, opaque) + plugins (`SEARCH`/`SCORE`, catálogo consultable) | objetivo de esta entrega |

## Distribución web

El tag `v0.3.0` publica `ghcr.io/BD2-Project/soupchef:v0.3.0` (y `:0.3`) mediante
`.github/workflows/container.yml`. La imagen sirve el build SSR de SvelteKit con
`adapter-node`; `SOUPDB_HOST`/`SOUPDB_PORT` apuntan al gestor. El escritorio
(Tauri) se sigue empaquetando aparte y usa `rsoup`.

## Motor asociado

El motor **SoupDB** (repo fuente de las entregas) mantiene los tags de referencia por milestone; este repo los acompaña con su UI correspondiente. La UI tolera que el gestor todavía no exponga las Fases 4–6: el mock del navegador (`VITE_SOUPCHEF_MOCK=true`) demuestra `SEARCH`/`SCORE`, `VECTOR` y prepared, y el catálogo se degrada si faltan columnas nuevas.
