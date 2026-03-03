use tauri::State;

use crate::knowledge::{self, KnowledgeEntry};
use crate::AppState;

#[tauri::command]
pub async fn list_knowledge(
    state: State<'_, AppState>,
    category: Option<String>,
) -> Result<Vec<KnowledgeEntry>, String> {
    knowledge::list_knowledge_tree(&state.knowledge_dir, category.as_deref())
        .map_err(|e| format!("Failed to list knowledge: {}", e))
}

#[tauri::command]
pub async fn read_knowledge_file(
    state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let full_path = knowledge::safe_resolve(&state.knowledge_dir, &path)
        .map_err(|e| format!("Invalid path: {}", e))?;
    std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn delete_knowledge_file(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    knowledge::delete_knowledge_file(&state.knowledge_dir, &path)
        .map_err(|e| format!("Failed to delete: {}", e))
}
