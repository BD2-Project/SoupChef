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

## Próxima versión

- **v0.3.0**: cierre de *Avance 3* — score de relevancia en búsquedas de texto, galería de imágenes y reproductor de audio para `SIMILAR_TO` (issues #35–#37). Debe sincronizarse con el tag `v0.5.0` del motor SoupDB.

## Motor asociado

El motor **SoupDB** (repo fuente de las entregas) mantiene los tags de referencia por milestone; este repo los acompaña con su UI correspondiente.
