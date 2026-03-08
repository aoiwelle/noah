---
name: setup-nanoclaw/add-voice
description: Add voice message transcription to NanoClaw using OpenAI Whisper
platform: all
last_reviewed: 2026-03-08
author: noah-team
type: system
---

# Add Voice Transcription

Automatically transcribe WhatsApp voice notes so the agent can read
and respond to them. Uses OpenAI's Whisper API (~$0.006/minute).

## Prerequisites
NanoClaw must be installed and running (run `setup-nanoclaw` first).

## Step 1: Get OpenAI API Key

Ask the user if they have an OpenAI API key.

If not, guide them:
> 1. Go to https://platform.openai.com/api-keys
> 2. Create a new API key
> 3. Add a small credit balance ($5 is plenty for voice transcription)

Use WAIT_FOR_USER for the sign-up process.

## Step 2: Collect API Key

Collect the OpenAI API key via `secure_input` (secret_name: "openai_api_key").

## Step 3: Install and Configure

```
cd ~/nanoclaw && npm install openai
```

Create the transcription config file at `~/nanoclaw/.transcription.config.json`
using `write_secret` with format:
```json
{
  "provider": "openai",
  "openai": { "apiKey": "{{value}}", "model": "whisper-1" },
  "enabled": true,
  "fallbackMessage": "[Voice Message - transcription unavailable]"
}
```

## Step 4: Verify

Send a voice note on WhatsApp to the bot. Check logs for transcription
activity. The agent should respond to the content of the voice message.

## Tools referenced
- `mac_run_command` — npm install, verify
- `ui_user_question` with `secure_input` — OpenAI API key
- `ui_spa` with WAIT_FOR_USER — OpenAI sign-up
- `write_secret` — write API key to config file
