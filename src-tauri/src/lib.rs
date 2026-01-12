use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Position window in bottom-left corner
            if let Some(window) = app.get_webview_window("main") {
                if let Some(monitor) = window.current_monitor().ok().flatten() {
                    let screen_size = monitor.size();
                    let screen_pos = monitor.position();
                    let window_size = window.outer_size().unwrap_or_default();
                    
                    // Bottom-left with small padding
                    let x = screen_pos.x + 20;
                    let y = screen_pos.y + screen_size.height as i32 - window_size.height as i32 - 24;
                    
                    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
