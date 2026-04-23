mod types;
mod commands;

use commands::{cancel_export, check_tools, detect_encoders, export_segments, load_video, scan_ffmpeg};
use types::ExportState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ExportState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            check_tools,
            load_video,
            export_segments,
            detect_encoders,
            cancel_export,
            scan_ffmpeg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
