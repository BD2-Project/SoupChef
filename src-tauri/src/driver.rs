//! Comandos de Tauri que exponen el driver rsoup al frontend.
//!
//! Los tipos de rsoup no derivan `Serialize`, así que se traducen aquí a una
//! forma serializable (protocolo v1.1: `type_name`/`encoding`, `VECTOR` y
//! valores opacos). El `TransactionManager` vive en el estado de la app para
//! que una transacción siga abierta entre comandos.

use rsoup::{QueryResult, TransactionManager, Value};
use serde::Serialize;
use tauri::State;
use tokio::sync::Mutex;

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 55432;

/// Header de columna v1.1: el `type_code` numérico se reemplazó por el nombre
/// del tipo + encoding. El frontend lee `type_name`, nunca el código.
#[derive(Serialize)]
pub struct WireColumn {
    pub name: String,
    pub type_name: String,
    pub encoding: u8,
    pub size: u32,
    pub length: u16,
}

#[derive(Serialize)]
pub struct WireResult {
    pub columns: Vec<WireColumn>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub affected: u32,
}

/// Error con la misma forma que espera el panel de consulta del frontend.
#[derive(Debug, Serialize)]
pub struct WireError {
    pub kind: String,
    pub message: String,
}

impl WireError {
    fn connection(message: String) -> Self {
        Self {
            kind: "ConnectionError".to_string(),
            message,
        }
    }

    fn unsupported(message: impl Into<String>) -> Self {
        Self {
            kind: "Unsupported".to_string(),
            message: message.into(),
        }
    }
}

impl From<rsoup::DriverError> for WireError {
    fn from(error: rsoup::DriverError) -> Self {
        Self {
            kind: kind_for(error.code).to_string(),
            message: error.message,
        }
    }
}

/// Códigos del protocolo (ver SoupDB/docs/protocolo.md).
fn kind_for(code: u8) -> &'static str {
    match code {
        0x01 => "ParseError",
        0x02 => "ExecutionError",
        0x03 => "TransactionError",
        0x04 => "LockTimeout",
        0x05 => "Deadlock",
        0x06 => "RecordNotFound",
        0x07 => "ContractViolation",
        0x08 => "Unsupported",
        _ => "DriverError",
    }
}

fn to_json(value: &Value) -> serde_json::Value {
    match value {
        Value::Null => serde_json::Value::Null,
        Value::Int(number) => serde_json::Value::from(*number),
        Value::Float(number) => serde_json::Value::from(*number),
        Value::Text(text) => serde_json::Value::from(text.clone()),
        Value::Bool(flag) => serde_json::Value::from(*flag),
        // El frontend espera { x, y }: x es longitud e y latitud, igual que el
        // GeoPoint del contrato y que el Point(x, y) del motor.
        Value::Point(x, y) => serde_json::json!({ "x": x, "y": y }),
        // VECTOR(n): array plano. El tipo para renderizar viaja en la columna.
        Value::Vector(values) => serde_json::json!(values),
        // Tipo extensible: el frontend lo muestra como ‹type_name› n bytes.
        Value::Unknown { type_name, bytes } => serde_json::json!({
            "$opaque": true,
            "type_name": type_name,
            "bytes": bytes,
        }),
    }
}

/// Convierte un parámetro JSON del frontend al `Value` tipado del protocolo.
///
/// La forma es la misma que devuelve `to_json`, así que un resultado puede
/// reutilizarse como parámetro de un prepared statement.
fn from_json(value: &serde_json::Value) -> Result<Value, WireError> {
    match value {
        serde_json::Value::Null => Ok(Value::Null),
        serde_json::Value::Bool(flag) => Ok(Value::Bool(*flag)),
        serde_json::Value::String(text) => Ok(Value::Text(text.clone())),
        serde_json::Value::Number(number) => {
            if let Some(integer) = number.as_i64() {
                if let Ok(integer) = i32::try_from(integer) {
                    return Ok(Value::Int(integer));
                }
            }
            number
                .as_f64()
                .map(Value::Float)
                .ok_or_else(|| WireError::unsupported(format!("número no representable: {number}")))
        }
        serde_json::Value::Array(items) => {
            let mut values = Vec::with_capacity(items.len());
            for item in items {
                let number = item
                    .as_f64()
                    .ok_or_else(|| WireError::unsupported("un VECTOR solo admite números"))?;
                values.push(number);
            }
            Ok(Value::Vector(values))
        }
        serde_json::Value::Object(map) => {
            if map.get("$opaque").and_then(|flag| flag.as_bool()) == Some(true) {
                let type_name = map
                    .get("type_name")
                    .and_then(|name| name.as_str())
                    .unwrap_or("OPAQUE")
                    .to_string();
                let bytes = map
                    .get("bytes")
                    .and_then(|bytes| bytes.as_array())
                    .ok_or_else(|| WireError::unsupported("valor opaco sin bytes"))?
                    .iter()
                    .map(|byte| {
                        byte.as_u64()
                            .and_then(|byte| u8::try_from(byte).ok())
                            .ok_or_else(|| WireError::unsupported("byte fuera de rango"))
                    })
                    .collect::<Result<Vec<u8>, WireError>>()?;
                return Ok(Value::Unknown { type_name, bytes });
            }
            match (
                map.get("x").and_then(|x| x.as_f64()),
                map.get("y").and_then(|y| y.as_f64()),
            ) {
                (Some(x), Some(y)) => Ok(Value::Point(x, y)),
                _ => Err(WireError::unsupported(
                    "objeto no reconocido como POINT ni como valor opaco",
                )),
            }
        }
    }
}

fn to_wire(result: QueryResult) -> WireResult {
    match result {
        QueryResult::ResultSet(set) => WireResult {
            columns: set
                .columns
                .into_iter()
                .map(|column| WireColumn {
                    name: column.name,
                    type_name: column.type_name,
                    encoding: column.encoding,
                    size: column.size,
                    length: column.length,
                })
                .collect(),
            rows: set
                .rows
                .iter()
                .map(|row| row.iter().map(to_json).collect())
                .collect(),
            affected: 0,
        },
        QueryResult::Affected(rows) => WireResult {
            columns: Vec::new(),
            rows: Vec::new(),
            affected: rows,
        },
    }
}

/// Conexión compartida: mantener el manager vivo conserva la transacción activa.
#[derive(Default)]
pub struct Driver {
    manager: Mutex<Option<TransactionManager>>,
    endpoint: Mutex<(String, u16)>,
}

impl Driver {
    pub fn new() -> Self {
        Self {
            manager: Mutex::new(None),
            endpoint: Mutex::new((DEFAULT_HOST.to_string(), DEFAULT_PORT)),
        }
    }
}

async fn ensure_connected(driver: &Driver) -> Result<(), WireError> {
    let mut slot = driver.manager.lock().await;
    if slot.is_some() {
        return Ok(());
    }
    let (host, port) = driver.endpoint.lock().await.clone();
    let manager = TransactionManager::connect(&host, port)
        .await
        .map_err(|error| WireError::connection(format!("{host}:{port} — {error}")))?;
    *slot = Some(manager);
    Ok(())
}

#[tauri::command]
pub async fn connect(
    driver: State<'_, Driver>,
    host: Option<String>,
    port: Option<u16>,
) -> Result<(), WireError> {
    {
        let mut endpoint = driver.endpoint.lock().await;
        *endpoint = (
            host.unwrap_or_else(|| DEFAULT_HOST.to_string()),
            port.unwrap_or(DEFAULT_PORT),
        );
    }
    *driver.manager.lock().await = None;
    ensure_connected(&driver).await
}

async fn query_once(driver: &Driver, sql: &str) -> Result<QueryResult, WireError> {
    ensure_connected(driver).await?;
    let mut slot = driver.manager.lock().await;
    let manager = slot.as_mut().expect("conexión establecida");
    Ok(manager.query(sql).await?)
}

async fn in_active_transaction(driver: &Driver) -> bool {
    let slot = driver.manager.lock().await;
    slot.as_ref().map(|m| m.in_transaction()).unwrap_or(false)
}

#[tauri::command]
pub async fn query_sql(driver: State<'_, Driver>, sql: String) -> Result<WireResult, WireError> {
    let first = query_once(&driver, &sql).await;
    let error = match first {
        Ok(result) => return Ok(to_wire(result)),
        Err(error) => error,
    };

    // El gestor cierra las conexiones inactivas (SOCKET_TIMEOUT). Un error de
    // transporte deja el socket muerto: se reconecta y se reintenta una vez.
    // Dentro de una transacción no se reintenta: el estado se habría perdido.
    let transport = error.kind == "DriverError" || error.kind == "ConnectionError";
    if !transport || in_active_transaction(&driver).await {
        eprintln!("[driver] {}: {}", error.kind, error.message);
        return Err(error);
    }

    *driver.manager.lock().await = None;
    Ok(to_wire(query_once(&driver, &sql).await?))
}

// --- Prepared statements (protocolo v1.1) ----------------------------------

#[tauri::command]
pub async fn prepare_sql(
    driver: State<'_, Driver>,
    name: String,
    sql: String,
) -> Result<(), WireError> {
    ensure_connected(&driver).await?;
    let mut slot = driver.manager.lock().await;
    slot.as_mut()
        .expect("conexión establecida")
        .prepare(&name, &sql)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn execute_sql(
    driver: State<'_, Driver>,
    name: String,
    params: Vec<serde_json::Value>,
) -> Result<WireResult, WireError> {
    ensure_connected(&driver).await?;
    let values = params
        .iter()
        .map(from_json)
        .collect::<Result<Vec<_>, WireError>>()?;
    let mut slot = driver.manager.lock().await;
    let manager = slot.as_mut().expect("conexión establecida");
    Ok(to_wire(manager.execute(&name, &values).await?))
}

#[tauri::command]
pub async fn deallocate_sql(driver: State<'_, Driver>, name: String) -> Result<(), WireError> {
    ensure_connected(&driver).await?;
    let mut slot = driver.manager.lock().await;
    slot.as_mut()
        .expect("conexión establecida")
        .deallocate(&name)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn begin(driver: State<'_, Driver>) -> Result<(), WireError> {
    ensure_connected(&driver).await?;
    let mut slot = driver.manager.lock().await;
    slot.as_mut().expect("conexión establecida").begin().await?;
    Ok(())
}

#[tauri::command]
pub async fn commit(driver: State<'_, Driver>) -> Result<(), WireError> {
    ensure_connected(&driver).await?;
    let mut slot = driver.manager.lock().await;
    slot.as_mut()
        .expect("conexión establecida")
        .commit()
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn rollback(driver: State<'_, Driver>) -> Result<(), WireError> {
    ensure_connected(&driver).await?;
    let mut slot = driver.manager.lock().await;
    slot.as_mut()
        .expect("conexión establecida")
        .rollback()
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn in_transaction(driver: State<'_, Driver>) -> Result<bool, WireError> {
    Ok(in_active_transaction(&driver).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rsoup::protocol::{ENC_FIXED, ENC_OPAQUE};
    use rsoup::{Column, ResultSet};

    #[test]
    fn point_becomes_the_geopoint_the_frontend_expects() {
        // El contrato del frontend es { x, y }: x longitud, y latitud, igual que
        // el Point(x, y) del motor. Sin esta conversión el panel de mapa recibe
        // un valor que no sabe dibujar.
        let json = to_json(&Value::Point(-77.0298, -12.1211));
        assert_eq!(json["x"], serde_json::json!(-77.0298));
        assert_eq!(json["y"], serde_json::json!(-12.1211));
    }

    #[test]
    fn point_keeps_full_precision() {
        let json = to_json(&Value::Point(-77.042793, -12.046374));
        assert_eq!(json["x"].as_f64().unwrap(), -77.042793);
        assert_eq!(json["y"].as_f64().unwrap(), -12.046374);
    }

    #[test]
    fn maps_result_set_values_to_json() {
        let result = QueryResult::ResultSet(ResultSet {
            columns: vec![Column::native("id", "INT", 0)],
            rows: vec![
                vec![Value::Int(42)],
                vec![Value::Null],
                vec![Value::Text("papers".to_string())],
            ],
        });

        let wire = to_wire(result);

        assert_eq!(wire.columns[0].name, "id");
        assert_eq!(wire.columns[0].type_name, "INT");
        assert_eq!(wire.columns[0].encoding, rsoup::protocol::ENC_NATIVE);
        assert_eq!(wire.rows[0][0], serde_json::json!(42));
        assert_eq!(wire.rows[1][0], serde_json::Value::Null);
        assert_eq!(wire.rows[2][0], serde_json::json!("papers"));
        assert_eq!(wire.affected, 0);
    }

    #[test]
    fn maps_vector_and_opaque_columns() {
        // Protocolo v1.1: el header lleva type_name/encoding/size y los valores
        // nuevos cruzan el puente Tauri en formas que el contrato TS entiende.
        let result = QueryResult::ResultSet(ResultSet {
            columns: vec![
                Column::native("id", "INT", 0),
                Column::new("embedding", "VECTOR", ENC_FIXED, 24, 0),
                Column::new("custom", "GEOHASH_CUSTOM", ENC_OPAQUE, 0, 0),
            ],
            rows: vec![vec![
                Value::Int(1),
                Value::Vector(vec![0.1, 0.2, 0.3]),
                Value::Unknown {
                    type_name: "GEOHASH_CUSTOM".to_string(),
                    bytes: vec![0xDE, 0xAD],
                },
            ]],
        });

        let wire = to_wire(result);

        assert_eq!(wire.columns[1].type_name, "VECTOR");
        assert_eq!(wire.columns[1].encoding, ENC_FIXED);
        assert_eq!(wire.columns[1].size, 24);
        assert_eq!(wire.rows[0][1], serde_json::json!([0.1, 0.2, 0.3]));

        assert_eq!(wire.columns[2].type_name, "GEOHASH_CUSTOM");
        assert_eq!(wire.columns[2].encoding, ENC_OPAQUE);
        assert_eq!(wire.rows[0][2]["$opaque"], serde_json::json!(true));
        assert_eq!(
            wire.rows[0][2]["type_name"],
            serde_json::json!("GEOHASH_CUSTOM")
        );
        assert_eq!(wire.rows[0][2]["bytes"], serde_json::json!([0xDE, 0xAD]));
    }

    #[test]
    fn maps_affected_rows() {
        let wire = to_wire(QueryResult::Affected(3));
        assert!(wire.columns.is_empty());
        assert!(wire.rows.is_empty());
        assert_eq!(wire.affected, 3);
    }

    #[test]
    fn parses_typed_prepared_params() {
        let params = [
            serde_json::json!(7),
            serde_json::json!(1.5),
            serde_json::json!("hola"),
            serde_json::json!(true),
            serde_json::json!([0.5, -0.25]),
            serde_json::json!({ "x": -77.0, "y": -12.0 }),
            serde_json::json!({ "$opaque": true, "type_name": "X", "bytes": [1, 2] }),
            serde_json::json!(null),
        ];

        let values = params
            .iter()
            .map(from_json)
            .collect::<Result<Vec<_>, WireError>>()
            .unwrap();

        assert_eq!(values[0], Value::Int(7));
        assert_eq!(values[1], Value::Float(1.5));
        assert_eq!(values[2], Value::Text("hola".to_string()));
        assert_eq!(values[3], Value::Bool(true));
        assert_eq!(values[4], Value::Vector(vec![0.5, -0.25]));
        assert_eq!(values[5], Value::Point(-77.0, -12.0));
        assert_eq!(
            values[6],
            Value::Unknown {
                type_name: "X".to_string(),
                bytes: vec![1, 2],
            }
        );
        assert_eq!(values[7], Value::Null);
    }

    #[test]
    fn rejects_objects_that_are_not_points() {
        let error = from_json(&serde_json::json!({ "foo": 1 })).unwrap_err();
        assert_eq!(error.kind, "Unsupported");
    }

    #[test]
    fn maps_protocol_error_codes_to_kinds() {
        assert_eq!(kind_for(0x01), "ParseError");
        assert_eq!(kind_for(0x02), "ExecutionError");
        assert_eq!(kind_for(0x05), "Deadlock");
        assert_eq!(kind_for(0x06), "RecordNotFound");
        assert_eq!(kind_for(0x07), "ContractViolation");
        assert_eq!(kind_for(0x08), "Unsupported");
        assert_eq!(kind_for(0xff), "DriverError");
    }
}
