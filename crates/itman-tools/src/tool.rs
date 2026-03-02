use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;

use crate::types::{SafetyTier, ToolResult};

#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn input_schema(&self) -> Value;
    fn safety_tier(&self) -> SafetyTier;
    async fn execute(&self, input: &Value) -> Result<ToolResult>;
}
