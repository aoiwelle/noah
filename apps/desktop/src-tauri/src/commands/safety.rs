use tauri::State;

use crate::safety::journal::{self, JournalEntry};
use crate::AppState;

#[tauri::command]
pub async fn get_changes(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<JournalEntry>, String> {
    let conn = state.db.lock().await;
    journal::get_changes(&conn, &session_id).map_err(|e| format!("Failed to get changes: {}", e))
}

#[tauri::command]
pub async fn undo_change(
    state: State<'_, AppState>,
    change_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().await;
    journal::mark_undone(&conn, &change_id).map_err(|e| format!("Failed to undo change: {}", e))
}
