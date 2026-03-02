use tauri::State;

use crate::AppState;

#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    session_id: String,
    message: String,
) -> Result<String, String> {
    let mut orchestrator = state.orchestrator.lock().await;

    orchestrator
        .send_message(&session_id, &message, &app_handle, &state.db)
        .await
        .map_err(|e| format!("Agent error: {}", e))
}

#[tauri::command]
pub async fn approve_action(
    state: State<'_, AppState>,
    approval_id: String,
) -> Result<bool, String> {
    let orchestrator = state.orchestrator.lock().await;
    let found = orchestrator.resolve_approval(&approval_id, true).await;
    Ok(found)
}

#[tauri::command]
pub async fn deny_action(
    state: State<'_, AppState>,
    approval_id: String,
) -> Result<bool, String> {
    let orchestrator = state.orchestrator.lock().await;
    let found = orchestrator.resolve_approval(&approval_id, false).await;
    Ok(found)
}
