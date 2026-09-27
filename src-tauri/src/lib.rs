mod driver;

use driver::Driver;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Driver::new())
        .invoke_handler(tauri::generate_handler![
            driver::connect,
            driver::query_sql,
            driver::begin,
            driver::commit,
            driver::rollback,
            driver::in_transaction,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
