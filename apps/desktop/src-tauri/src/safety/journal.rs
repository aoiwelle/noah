use anyhow::{Context, Result};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use itman_tools::ChangeRecord;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalEntry {
    pub id: String,
    pub session_id: String,
    pub timestamp: String,
    pub tool_name: String,
    pub description: String,
    pub undo_tool: String,
    pub undo_input: Value,
    pub undone: bool,
}

/// Initialise the journal database, creating the table if it doesn't exist.
pub fn init_db(path: &str) -> Result<Connection> {
    let conn = Connection::open(path).context("Failed to open journal database")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS journal (
            id          TEXT PRIMARY KEY,
            session_id  TEXT NOT NULL,
            timestamp   TEXT NOT NULL,
            tool_name   TEXT NOT NULL,
            description TEXT NOT NULL,
            undo_tool   TEXT NOT NULL,
            undo_input  TEXT NOT NULL,
            undone      INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_journal_session ON journal(session_id);",
    )
    .context("Failed to create journal table")?;

    Ok(conn)
}

/// Record a change in the journal. Returns the generated change ID.
pub fn record_change(
    conn: &Connection,
    session_id: &str,
    tool_name: &str,
    change: &ChangeRecord,
) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();
    let undo_input_str =
        serde_json::to_string(&change.undo_input).context("Failed to serialise undo_input")?;

    conn.execute(
        "INSERT INTO journal (id, session_id, timestamp, tool_name, description, undo_tool, undo_input, undone)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
        rusqlite::params![
            id,
            session_id,
            timestamp,
            tool_name,
            change.description,
            change.undo_tool,
            undo_input_str,
        ],
    )
    .context("Failed to insert journal entry")?;

    Ok(id)
}

/// Retrieve all journal entries for a given session.
pub fn get_changes(conn: &Connection, session_id: &str) -> Result<Vec<JournalEntry>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, timestamp, tool_name, description, undo_tool, undo_input, undone
             FROM journal
             WHERE session_id = ?1
             ORDER BY timestamp ASC",
        )
        .context("Failed to prepare get_changes query")?;

    let entries = stmt
        .query_map(rusqlite::params![session_id], |row| {
            let undo_input_str: String = row.get(6)?;
            let undone_int: i32 = row.get(7)?;
            Ok(JournalEntry {
                id: row.get(0)?,
                session_id: row.get(1)?,
                timestamp: row.get(2)?,
                tool_name: row.get(3)?,
                description: row.get(4)?,
                undo_tool: row.get(5)?,
                undo_input: serde_json::from_str(&undo_input_str).unwrap_or_default(),
                undone: undone_int != 0,
            })
        })
        .context("Failed to execute get_changes query")?
        .collect::<std::result::Result<Vec<_>, _>>()
        .context("Failed to collect journal entries")?;

    Ok(entries)
}

/// Mark a change as undone.
pub fn mark_undone(conn: &Connection, change_id: &str) -> Result<()> {
    let rows = conn
        .execute(
            "UPDATE journal SET undone = 1 WHERE id = ?1",
            rusqlite::params![change_id],
        )
        .context("Failed to mark change as undone")?;

    if rows == 0 {
        anyhow::bail!("Change ID not found: {}", change_id);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Connection {
        init_db(":memory:").expect("Failed to init in-memory DB")
    }

    #[test]
    fn test_init_creates_table() {
        let conn = test_db();
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='journal'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_record_and_retrieve_change() {
        let conn = test_db();
        let change = ChangeRecord {
            description: "Set DNS to 8.8.8.8 (was 192.168.1.1)".to_string(),
            undo_tool: "mac_set_dns".to_string(),
            undo_input: serde_json::json!({"dns": "192.168.1.1"}),
        };

        let id = record_change(&conn, "session-1", "mac_flush_dns", &change).unwrap();
        assert!(!id.is_empty());

        let entries = get_changes(&conn, "session-1").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, id);
        assert_eq!(entries[0].session_id, "session-1");
        assert_eq!(entries[0].tool_name, "mac_flush_dns");
        assert_eq!(entries[0].description, "Set DNS to 8.8.8.8 (was 192.168.1.1)");
        assert_eq!(entries[0].undo_tool, "mac_set_dns");
        assert!(!entries[0].undone);
    }

    #[test]
    fn test_get_changes_empty_session() {
        let conn = test_db();
        let entries = get_changes(&conn, "nonexistent").unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_mark_undone() {
        let conn = test_db();
        let change = ChangeRecord {
            description: "test".to_string(),
            undo_tool: "test_tool".to_string(),
            undo_input: serde_json::json!({}),
        };
        let id = record_change(&conn, "s1", "tool", &change).unwrap();

        mark_undone(&conn, &id).unwrap();

        let entries = get_changes(&conn, "s1").unwrap();
        assert!(entries[0].undone);
    }

    #[test]
    fn test_mark_undone_missing_id() {
        let conn = test_db();
        let result = mark_undone(&conn, "does-not-exist");
        assert!(result.is_err());
    }

    #[test]
    fn test_journal_entry_serializes_with_snake_case_keys() {
        // This test ensures the JSON keys match what the TypeScript frontend expects.
        let entry = JournalEntry {
            id: "abc".to_string(),
            session_id: "s1".to_string(),
            timestamp: "2026-01-01T00:00:00Z".to_string(),
            tool_name: "mac_ping".to_string(),
            description: "did a thing".to_string(),
            undo_tool: "mac_undo".to_string(),
            undo_input: serde_json::json!({}),
            undone: false,
        };
        let json = serde_json::to_value(&entry).unwrap();
        let obj = json.as_object().unwrap();

        // These are the exact keys the TS ChangeEntry interface expects
        for key in ["id", "session_id", "timestamp", "tool_name", "description", "undone"] {
            assert!(obj.contains_key(key), "Missing expected key: {}", key);
        }
        // Must NOT have camelCase variants
        assert!(!obj.contains_key("sessionId"));
        assert!(!obj.contains_key("toolName"));
        assert!(!obj.contains_key("undoTool"));
    }
}
