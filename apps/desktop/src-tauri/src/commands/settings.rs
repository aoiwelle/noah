use serde::Serialize;
use tauri::State;

use crate::safety::journal;
use crate::AppState;

#[tauri::command]
pub async fn has_api_key(state: State<'_, AppState>) -> Result<bool, String> {
    let orch = state.orchestrator.lock().await;
    Ok(orch.has_api_key())
}

#[tauri::command]
pub async fn set_api_key(state: State<'_, AppState>, api_key: String) -> Result<(), String> {
    // Save to disk so it persists across restarts.
    crate::save_api_key(&state.app_dir, &api_key)?;

    // Update the in-memory LLM client.
    let mut orch = state.orchestrator.lock().await;
    orch.set_api_key(api_key);

    Ok(())
}

#[tauri::command]
pub async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub async fn get_telemetry_consent(state: State<'_, AppState>) -> Result<bool, String> {
    let conn = state.db.lock().await;
    let value = journal::get_setting(&conn, "telemetry_consent")
        .map_err(|e| format!("Failed to get setting: {}", e))?;
    Ok(value.as_deref() == Some("true"))
}

#[tauri::command]
pub async fn set_telemetry_consent(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    let conn = state.db.lock().await;
    journal::set_setting(&conn, "telemetry_consent", if enabled { "true" } else { "false" })
        .map_err(|e| format!("Failed to save setting: {}", e))
}

#[tauri::command]
pub async fn track_event(
    state: State<'_, AppState>,
    event_type: String,
    data: String,
) -> Result<(), String> {
    // Only record if telemetry is opted-in
    let conn = state.db.lock().await;
    let consent = journal::get_setting(&conn, "telemetry_consent")
        .map_err(|e| format!("{}", e))?;
    if consent.as_deref() != Some("true") {
        return Ok(());
    }
    journal::record_telemetry_event(&conn, &event_type, &data)
        .map_err(|e| format!("Failed to track event: {}", e))
}

#[derive(Debug, Serialize)]
pub struct FeedbackContext {
    pub version: String,
    pub os: String,
    pub traces: Vec<TraceSummary>,
}

#[derive(Debug, Serialize)]
pub struct TraceSummary {
    pub timestamp: String,
    pub request: String,
    pub response: String,
}

#[tauri::command]
pub async fn get_feedback_context(state: State<'_, AppState>) -> Result<FeedbackContext, String> {
    let conn = state.db.lock().await;
    let traces = journal::get_recent_traces(&conn, 5)
        .map_err(|e| format!("Failed to get traces: {}", e))?;

    let trace_summaries: Vec<TraceSummary> = traces
        .into_iter()
        .map(|(ts, req, resp)| TraceSummary {
            timestamp: ts,
            request: req,
            response: resp,
        })
        .collect();

    Ok(FeedbackContext {
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        traces: trace_summaries,
    })
}
