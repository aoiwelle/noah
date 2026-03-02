use serde::{Deserialize, Serialize};
use tauri::State;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub created_at: String,
    pub message_count: usize,
}

#[tauri::command]
pub async fn create_session(state: State<'_, AppState>) -> Result<SessionInfo, String> {
    let mut orchestrator = state.orchestrator.lock().await;
    let id = orchestrator.create_session();

    let session = orchestrator
        .get_session(&id)
        .ok_or_else(|| "Failed to retrieve newly created session".to_string())?;

    Ok(SessionInfo {
        id: session.id.clone(),
        created_at: session.created_at.to_rfc3339(),
        message_count: session.messages.len(),
    })
}

#[tauri::command]
pub async fn get_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionInfo, String> {
    let orchestrator = state.orchestrator.lock().await;

    let session = orchestrator
        .get_session(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    Ok(SessionInfo {
        id: session.id.clone(),
        created_at: session.created_at.to_rfc3339(),
        message_count: session.messages.len(),
    })
}

#[tauri::command]
pub async fn end_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<bool, String> {
    let mut orchestrator = state.orchestrator.lock().await;
    Ok(orchestrator.end_session(&session_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_info_json_keys() {
        // Ensures the JSON keys match the TS SessionInfo interface.
        let info = SessionInfo {
            id: "abc-123".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            message_count: 0,
        };
        let json = serde_json::to_value(&info).unwrap();
        let obj = json.as_object().unwrap();

        // TS expects: { id, created_at, message_count }
        assert!(obj.contains_key("id"));
        assert!(obj.contains_key("created_at"));
        assert!(obj.contains_key("message_count"));
        assert_eq!(obj.len(), 3, "Unexpected extra fields in SessionInfo");

        // Verify values roundtrip
        assert_eq!(obj["id"], "abc-123");
        assert_eq!(obj["message_count"], 0);
    }
}
