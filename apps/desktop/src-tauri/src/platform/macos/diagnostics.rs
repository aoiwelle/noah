use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::process::Command;

use itman_tools::{ChangeRecord, SafetyTier, Tool, ToolResult};

// ── MacSystemSummary ───────────────────────────────────────────────────

pub struct MacSystemSummary;

#[async_trait]
impl Tool for MacSystemSummary {
    fn name(&self) -> &str {
        "mac_system_summary"
    }

    fn description(&self) -> &str {
        "One-shot system summary: OS version, hardware, disk space, network status, and uptime."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
            "required": []
        })
    }

    fn safety_tier(&self) -> SafetyTier {
        SafetyTier::ReadOnly
    }

    async fn execute(&self, _input: &Value) -> Result<ToolResult> {
        let sw_vers = Command::new("sw_vers")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|e| format!("error: {}", e));

        let hostname = Command::new("hostname")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|e| format!("error: {}", e));

        let uptime = Command::new("uptime")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|e| format!("error: {}", e));

        let cpu = Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|e| format!("error: {}", e));

        let mem = Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output()
            .map(|o| {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                s.parse::<u64>()
                    .map(|b| format!("{} GB", b / (1024 * 1024 * 1024)))
                    .unwrap_or(s)
            })
            .unwrap_or_else(|e| format!("error: {}", e));

        let disk = Command::new("df")
            .args(["-h", "/"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|e| format!("error: {}", e));

        let network = Command::new("networksetup")
            .args(["-getinfo", "Wi-Fi"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|e| format!("error: {}", e));

        let output = format!(
            "=== System Summary ===\n\
             Hostname: {}\n\
             {}\n\
             CPU: {}\n\
             Memory: {}\n\
             Uptime: {}\n\n\
             === Disk (/) ===\n{}\n\n\
             === Network (Wi-Fi) ===\n{}",
            hostname, sw_vers, cpu, mem, uptime, disk, network
        );

        Ok(ToolResult::read_only(
            output,
            json!({
                "hostname": hostname,
                "sw_vers": sw_vers,
                "cpu": cpu,
                "memory": mem,
                "uptime": uptime,
                "disk": disk,
                "network": network,
            }),
        ))
    }
}

// ── MacReadFile ────────────────────────────────────────────────────────

pub struct MacReadFile;

/// Paths that are never allowed to be read.
const FORBIDDEN_PATH_PREFIXES: &[&str] = &[
    "/System/",
    "/usr/sbin/",
    "/usr/libexec/",
    "/private/var/db/",
    "/private/var/root/",
];

/// Allowed path prefixes for reading.
const ALLOWED_PATH_PREFIXES: &[&str] = &[
    "/Users/",
    "/tmp/",
    "/var/log/",
    "/Library/Logs/",
    "/Library/Preferences/",
    "/etc/",
    "/usr/local/",
    "/opt/",
    "/Applications/",
    "/private/var/log/",
    "/private/tmp/",
];

fn is_path_allowed(path: &str) -> bool {
    // Reject forbidden paths
    for prefix in FORBIDDEN_PATH_PREFIXES {
        if path.starts_with(prefix) {
            return false;
        }
    }
    // Allow if under an allowed prefix
    for prefix in ALLOWED_PATH_PREFIXES {
        if path.starts_with(prefix) {
            return true;
        }
    }
    false
}

#[async_trait]
impl Tool for MacReadFile {
    fn name(&self) -> &str {
        "mac_read_file"
    }

    fn description(&self) -> &str {
        "Read the contents of a file. The path must be under a user-accessible location (~/*, /var/log/*, /etc/*, /tmp/*, /Applications/*, etc.). System-protected paths are rejected."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute path to the file to read"
                }
            },
            "required": ["path"]
        })
    }

    fn safety_tier(&self) -> SafetyTier {
        SafetyTier::ReadOnly
    }

    async fn execute(&self, input: &Value) -> Result<ToolResult> {
        let path = input["path"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing required parameter: path"))?;

        // Normalise and validate path
        let canonical = std::fs::canonicalize(path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string());

        if !is_path_allowed(&canonical) {
            return Ok(ToolResult::read_only(
                format!(
                    "Access denied: '{}' is outside the allowed scope. Allowed locations include ~/*, /var/log/*, /etc/*, /tmp/*, /Applications/*.",
                    path
                ),
                json!({ "error": "access_denied", "path": path }),
            ));
        }

        match std::fs::read_to_string(&canonical) {
            Ok(contents) => {
                // Limit to 500 lines
                let lines: Vec<&str> = contents.lines().collect();
                let truncated = if lines.len() > 500 {
                    format!(
                        "... (showing first 500 of {} lines)\n{}",
                        lines.len(),
                        lines[..500].join("\n")
                    )
                } else {
                    contents.clone()
                };

                Ok(ToolResult::read_only(
                    truncated,
                    json!({
                        "path": canonical,
                        "lines": lines.len(),
                        "size_bytes": contents.len(),
                    }),
                ))
            }
            Err(e) => Ok(ToolResult::read_only(
                format!("Failed to read '{}': {}", path, e),
                json!({ "error": e.to_string(), "path": path }),
            )),
        }
    }
}

// ── MacReadLog ─────────────────────────────────────────────────────────

pub struct MacReadLog;

#[async_trait]
impl Tool for MacReadLog {
    fn name(&self) -> &str {
        "mac_read_log"
    }

    fn description(&self) -> &str {
        "Read macOS unified logs using 'log show' with a predicate filter and time duration."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "predicate": {
                    "type": "string",
                    "description": "Log predicate filter, e.g. 'process == \"kernel\"' or 'eventMessage CONTAINS \"error\"'"
                },
                "duration": {
                    "type": "string",
                    "description": "How far back to look, e.g. '1h', '30m', '1d'. Default: '30m'",
                    "default": "30m"
                }
            },
            "required": ["predicate"]
        })
    }

    fn safety_tier(&self) -> SafetyTier {
        SafetyTier::ReadOnly
    }

    async fn execute(&self, input: &Value) -> Result<ToolResult> {
        let predicate = input["predicate"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing required parameter: predicate"))?;
        let duration = input["duration"].as_str().unwrap_or("30m");

        let output = Command::new("log")
            .args([
                "show",
                "--predicate",
                predicate,
                "--last",
                duration,
                "--style",
                "compact",
            ])
            .output()
            .map(|o| {
                let stdout = String::from_utf8_lossy(&o.stdout).to_string();
                if stdout.trim().is_empty() {
                    format!(
                        "No log entries found matching predicate '{}' in the last {}.",
                        predicate, duration
                    )
                } else {
                    // Limit output to last 200 lines
                    let lines: Vec<&str> = stdout.lines().collect();
                    let start = if lines.len() > 200 {
                        lines.len() - 200
                    } else {
                        0
                    };
                    let truncated = lines[start..].join("\n");
                    if start > 0 {
                        format!(
                            "... (showing last 200 of {} log entries)\n{}",
                            lines.len(),
                            truncated
                        )
                    } else {
                        truncated
                    }
                }
            })
            .unwrap_or_else(|e| format!("log show failed: {}", e));

        Ok(ToolResult::read_only(
            output.clone(),
            json!({
                "predicate": predicate,
                "duration": duration,
                "raw_output": output,
            }),
        ))
    }
}

// ── ShellRun ───────────────────────────────────────────────────────────

pub struct ShellRun;

#[async_trait]
impl Tool for ShellRun {
    fn name(&self) -> &str {
        "shell_run"
    }

    fn description(&self) -> &str {
        "Execute an arbitrary shell command. Use this as a last resort when no specific tool exists. Requires user approval. The command runs via /bin/zsh -c."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute"
                }
            },
            "required": ["command"]
        })
    }

    fn safety_tier(&self) -> SafetyTier {
        SafetyTier::NeedsApproval
    }

    async fn execute(&self, input: &Value) -> Result<ToolResult> {
        let command = input["command"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing required parameter: command"))?;

        let output = Command::new("/bin/zsh")
            .args(["-c", command])
            .output()
            .map(|o| {
                let stdout = String::from_utf8_lossy(&o.stdout).to_string();
                let stderr = String::from_utf8_lossy(&o.stderr).to_string();
                let exit_code = o.status.code().unwrap_or(-1);

                let mut result = String::new();
                if !stdout.is_empty() {
                    result.push_str(&stdout);
                }
                if !stderr.is_empty() {
                    if !result.is_empty() {
                        result.push_str("\n--- stderr ---\n");
                    }
                    result.push_str(&stderr);
                }
                if result.is_empty() {
                    result = format!("(no output, exit code: {})", exit_code);
                } else {
                    result.push_str(&format!("\n\n[exit code: {}]", exit_code));
                }
                result
            })
            .unwrap_or_else(|e| format!("Failed to execute command: {}", e));

        // Limit output length
        let truncated = if output.len() > 10_000 {
            format!("{}...\n\n(output truncated at 10000 chars)", &output[..10_000])
        } else {
            output.clone()
        };

        Ok(ToolResult::with_changes(
            truncated,
            json!({
                "command": command,
            }),
            vec![ChangeRecord {
                description: format!("Executed shell command: {}", command),
                undo_tool: String::new(),
                undo_input: json!(null),
            }],
        ))
    }
}
