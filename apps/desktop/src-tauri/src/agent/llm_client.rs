use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const MODEL: &str = "claude-sonnet-4-20250514";
const TITLE_MODEL: &str = "claude-haiku-4-5-20251001";
const API_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 4096;
const REQUEST_TIMEOUT_SECS: u64 = 90;

// ── Request types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: MessageContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_error: Option<bool>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

// ── Response types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub id: String,
    #[serde(rename = "type")]
    pub response_type: String,
    pub role: String,
    pub content: Vec<ResponseBlock>,
    pub model: String,
    pub stop_reason: Option<String>,
    pub usage: Usage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ResponseBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

// ── API request body ───────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct ApiRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<ToolDef>,
}

// ── LLM Client ─────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct LlmClient {
    api_key: String,
    client: reqwest::Client,
}

/// Map an HTTP status code from the Anthropic API to a user-friendly error message.
fn friendly_api_error(status: reqwest::StatusCode, body: &str) -> String {
    match status.as_u16() {
        401 => "Your API key is invalid or has been revoked. Please check it in Settings.".to_string(),
        403 => "Your API key doesn't have permission for this request. Check your Anthropic account.".to_string(),
        429 => "Too many requests — Claude is rate-limited. Wait a moment and try again.".to_string(),
        500 | 502 | 503 => "Claude is having temporary issues. Please try again in a minute.".to_string(),
        529 => "Claude is currently overloaded. Please try again in a few minutes.".to_string(),
        _ => format!("Unexpected API error ({}): {}", status, body),
    }
}

impl LlmClient {
    pub fn new(api_key: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { api_key, client }
    }

    pub fn set_api_key(&mut self, key: String) {
        self.api_key = key;
    }

    pub fn has_api_key(&self) -> bool {
        !self.api_key.is_empty()
    }

    /// Generate a short session title from the first user message using a fast, cheap model.
    pub async fn generate_title(&self, user_message: &str) -> Result<String> {
        let body = ApiRequest {
            model: TITLE_MODEL.to_string(),
            max_tokens: 30,
            system: "Generate a short title (max 6 words) for a computer support session based on the user's message. Output only the title, nothing else. No quotes.".to_string(),
            messages: vec![Message {
                role: "user".to_string(),
                content: MessageContent::Text(user_message.to_string()),
            }],
            tools: vec![],
        };

        let resp = self
            .client
            .post(API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .context("Title generation request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let error_body = resp.text().await.unwrap_or_default();
            anyhow::bail!("{}", friendly_api_error(status, &error_body));
        }

        let response: Response = resp
            .json()
            .await
            .context("Failed to parse title response")?;

        let title = response
            .content
            .iter()
            .find_map(|b| match b {
                ResponseBlock::Text { text } => Some(text.trim().to_string()),
                _ => None,
            })
            .unwrap_or_else(|| user_message.chars().take(60).collect());

        Ok(title)
    }

    pub async fn send_message(
        &self,
        messages: Vec<Message>,
        tools: Vec<ToolDef>,
        system: &str,
    ) -> Result<Response> {
        let body = ApiRequest {
            model: MODEL.to_string(),
            max_tokens: MAX_TOKENS,
            system: system.to_string(),
            messages,
            tools,
        };

        let resp = self
            .client
            .post(API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    anyhow::anyhow!("Claude is taking too long to respond. Please try again.")
                } else if e.is_connect() {
                    anyhow::anyhow!("Can't reach Claude — check your internet connection.")
                } else {
                    anyhow::anyhow!("Can't reach Claude — check your internet connection.")
                }
            })?;

        let status = resp.status();
        if !status.is_success() {
            let error_body = resp
                .text()
                .await
                .unwrap_or_else(|_| "unknown error".to_string());
            anyhow::bail!("{}", friendly_api_error(status, &error_body));
        }

        let response: Response = resp
            .json()
            .await
            .context("Failed to parse Anthropic API response")?;

        Ok(response)
    }
}
