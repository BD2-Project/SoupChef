//! Comandos de Tauri que exponen el driver rsoup al frontend.
//!
//! Los tipos de rsoup no derivan `Serialize`, así que se traducen aquí a una
//! forma serializable. El `TransactionManager` vive en el estado de la app para
//! que una transacción siga abierta entre comandos.

use rsoup::{QueryResult, TransactionManager, Value};
use serde::Serialize;
use tauri::State;
use tokio::sync::Mutex;

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 55432;

#[derive(Serialize)]
pub struct WireColumn {
    pub name: String,
    pub type_code: u8,
    pub length: u16,
}

#[derive(Serialize)]
pub struct WireResult {
    pub columns: Vec<WireColumn>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub affected: u32,
}

/// Error con la misma forma que espera el panel de consulta del frontend.
#[derive(Serialize)]
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
}

impl From<rsoup::DriverError> for WireError {
    fn from(error: rsoup::DriverError) -> Self {
        Self {
            kind: kind_for(error.code).to_string(),
            message: error.message,
        }
    }
}

/// Códigos del protocolo v1 (ver SoupDB/docs/protocolo.md).
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
                    type_code: column.type_code,
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
    use rsoup::{Column, ResultSet};

    #[test]
    fn maps_result_set_values_to_json() {
        let result = QueryResult::ResultSet(ResultSet {
            columns: vec![Column {
                name: "id".to_string(),
                type_code: 0x01,
                length: 0,
            }],
            rows: vec![
                vec![Value::Int(42)],
                vec![Value::Null],
                vec![Value::Text("papers".to_string())],
            ],
        });

        let wire = to_wire(result);

        assert_eq!(wire.columns[0].name, "id");
        assert_eq!(wire.rows[0][0], serde_json::json!(42));
        assert_eq!(wire.rows[1][0], serde_json::Value::Null);
        assert_eq!(wire.rows[2][0], serde_json::json!("papers"));
        assert_eq!(wire.affected, 0);
    }

    #[test]
    fn maps_affected_rows() {
        let wire = to_wire(QueryResult::Affected(3));
        assert!(wire.columns.is_empty());
        assert!(wire.rows.is_empty());
        assert_eq!(wire.affected, 3);
    }

    #[test]
    fn maps_protocol_error_codes_to_kinds() {
        assert_eq!(kind_for(0x01), "ParseError");
        assert_eq!(kind_for(0x02), "ExecutionError");
        assert_eq!(kind_for(0x05), "Deadlock");
        assert_eq!(kind_for(0xff), "DriverError");
    }
}
