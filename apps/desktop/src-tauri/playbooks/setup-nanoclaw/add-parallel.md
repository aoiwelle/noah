---
name: setup-nanoclaw/add-parallel
description: Add web research capabilities via Parallel AI to NanoClaw
platform: all
last_reviewed: 2026-03-08
author: noah-team
type: system
---

# Add Parallel AI Research

Give the agent web research capabilities. Two tools:
- **Quick Search**: free, fast (2-5s) — use for simple lookups
- **Deep Research**: paid, slow (1-20 min) — use for thorough investigation

## Prerequisites
NanoClaw must be installed and running (run `setup-nanoclaw` first).

## Step 1: Get Parallel AI API Key

Guide the user:
> 1. Go to https://platform.parallel.ai
> 2. Sign up for an account
> 3. Create an API key in your dashboard

Use WAIT_FOR_USER for the sign-up.

## Step 2: Collect API Key

Collect via `secure_input` (secret_name: "parallel_api_key").

Write to `~/nanoclaw/.env` using `write_secret`:
```
PARALLEL_API_KEY={{value}}
```

## Step 3: Configure MCP Server

Add the Parallel AI MCP servers to the NanoClaw agent runner config.
The servers use HTTP type (not stdio):

Quick Search endpoint: `https://api.parallel.ai/mcp/search`
Deep Research endpoint: `https://api.parallel.ai/mcp/research`

Both require the API key as a Bearer token.

## Step 4: Set Permission Policy

Ask the user about deep research permissions:
- **Always ask first** (recommended) — agent asks permission before
  running expensive deep research
- **Auto-approve** — agent can run deep research without asking

## Step 5: Test

Ask the agent "what's the weather in San Francisco?" to test Quick Search.
Then try a research question to test Deep Research.

## Tools referenced
- `mac_run_command` — config file editing
- `ui_user_question` with `secure_input` — API key
- `ui_user_question` with options — permission policy
- `ui_spa` with WAIT_FOR_USER — Parallel AI sign-up
- `write_secret` — store API key in .env
