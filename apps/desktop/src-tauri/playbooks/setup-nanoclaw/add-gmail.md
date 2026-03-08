---
name: setup-nanoclaw/add-gmail
description: Add Gmail as a tool or full email channel for NanoClaw
platform: all
last_reviewed: 2026-03-08
author: noah-team
type: system
---

# Add Gmail Integration

Add Gmail capabilities to NanoClaw. Two modes available:
- **Tool Mode**: Agent can search and send emails when asked
- **Channel Mode**: Emails trigger the agent and get replies automatically

## Prerequisites
NanoClaw must be installed and running (run `setup-nanoclaw` first).

## Step 1: Choose Mode

Ask the user:
- **Tool Mode** (simpler) — Agent gains email search/send tools.
  User must explicitly ask the agent to check or send email.
- **Channel Mode** (advanced) — Incoming emails trigger the agent
  automatically. The agent can reply by email. Requires a filter
  setup (label, address prefix, or subject tag).

## Step 2: Create Google Cloud Project

Tell the user they need to create OAuth credentials in Google Cloud:

> 1. Go to https://console.cloud.google.com
> 2. Create a new project (or select an existing one)
> 3. Enable the **Gmail API** (APIs & Services > Library > search "Gmail")
> 4. Go to APIs & Services > Credentials > Create Credentials > OAuth Client ID
> 5. Application type: **Desktop app**
> 6. Download the credentials JSON file

Use WAIT_FOR_USER — this is a multi-step process in the browser.

## Step 3: Authorize Gmail Access

Ask the user to provide the path to the downloaded credentials JSON,
or its content. Use `text_input` for the file path.

Set up the Gmail MCP directory:
```
mkdir -p ~/.gmail-mcp
cp <credentials_file> ~/.gmail-mcp/credentials.json
```

Run the OAuth flow:
```
cd ~/nanoclaw && node scripts/gmail-auth.js
```

Use WAIT_FOR_USER — a browser window opens for Google sign-in.

## Step 4: Verify Access

Test Gmail access by listing recent messages:
```
cd ~/nanoclaw && node -e "require('./src/gmail').listRecent(5)"
```

## Step 5: Configure Integration

For **Tool Mode**: Mount the Gmail MCP directory into the container
and register the Gmail MCP server in the agent runner config.

For **Channel Mode**: additionally configure:
- Trigger mode (ask user): labeled emails, specific address, or subject prefix
- Polling interval (default: 60 seconds)
- Reply behavior (always reply, or only when asked)

Use `text_input` for the trigger configuration.

## Step 6: Test

For Tool Mode: Send a WhatsApp message like "check my email" and verify
the agent can search and read emails.

For Channel Mode: Send a test email matching the trigger and verify
the agent responds.

## Tools referenced
- `mac_run_command` — directory setup, npm scripts, auth flow
- `ui_user_question` with options — mode selection, trigger mode
- `ui_user_question` with `text_input` — credentials path, trigger config
- `ui_spa` with WAIT_FOR_USER — GCP setup, OAuth sign-in
