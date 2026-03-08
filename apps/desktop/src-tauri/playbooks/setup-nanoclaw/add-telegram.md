---
name: setup-nanoclaw/add-telegram
description: Add Telegram as a messaging channel for NanoClaw
platform: all
last_reviewed: 2026-03-08
author: noah-team
type: system
---

# Add Telegram Channel

Add Telegram support to NanoClaw. The bot can replace WhatsApp, run
alongside it, or serve as a control/notification channel.

## Prerequisites
NanoClaw must be installed and running (run `setup-nanoclaw` first).

## Step 1: Choose Mode

Ask the user how they want to use Telegram:
- **Replace WhatsApp** — Telegram becomes the only messaging channel
- **Alongside WhatsApp** — both channels active simultaneously
- **Control only** — Telegram triggers the agent but doesn't receive outputs
- **Notifications only** — receives agent outputs but can't trigger

## Step 2: Install Grammy

Run `cd ~/nanoclaw && npm install grammy`.

## Step 3: Create Telegram Bot

Tell the user to create a bot via BotFather:

> 1. Open Telegram and search for **@BotFather**
> 2. Send `/newbot` and follow the prompts
> 3. Choose a friendly name (e.g., "Andy Assistant")
> 4. Choose a username ending in "bot" (e.g., "andy_ai_bot")
> 5. Copy the bot token — it looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`

Use WAIT_FOR_USER — the user does this in Telegram.

Then collect the bot token via `secure_input` (secret_name: "telegram_bot_token").
Write to `.env` using `write_secret`:
```
TELEGRAM_BOT_TOKEN={{value}}
```

## Step 4: Get Chat ID

Tell the user:

> 1. Open Telegram and find your new bot
> 2. Send it any message (like "hello")
> 3. I'll retrieve the chat ID

Run the bot briefly to capture the chat ID:
```
cd ~/nanoclaw && node -e "
const { Bot } = require('grammy');
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
bot.on('message', (ctx) => { console.log('CHAT_ID=' + ctx.chat.id); bot.stop(); });
bot.start();
setTimeout(() => { console.log('Timeout — no message received'); bot.stop(); }, 60000);
"
```

Alternatively, ask the user to paste the chat ID if they know it.

## Step 5: Configure Channel

Write Telegram channel configuration to NanoClaw config files.
The specific file modifications depend on the NanoClaw version —
check `src/channels/` for existing patterns.

Add the chat ID to the registered groups or channels configuration.

## Step 6: Disable Group Privacy (if using groups)

If the user wants the bot in a group chat:

> In BotFather:
> 1. Send `/mybots` → select your bot → Bot Settings → Group Privacy
> 2. Turn OFF group privacy (bot needs to see all messages)

Use WAIT_FOR_USER.

## Step 7: Test

Restart NanoClaw and send a test message in Telegram.
Check logs for Telegram channel activity.

## Tools referenced
- `mac_run_command` — npm install, run scripts
- `ui_user_question` with options — mode selection
- `ui_user_question` with `secure_input` — bot token
- `ui_user_question` with `text_input` — chat ID
- `ui_spa` with WAIT_FOR_USER — BotFather, group privacy
- `write_secret` — store bot token in .env
