---
name: setup-nanoclaw/add-x
description: Add X (Twitter) posting capability to NanoClaw via browser automation
platform: macos
last_reviewed: 2026-03-08
author: noah-team
type: system
---

# Add X (Twitter) Integration

Post tweets, like, reply, retweet, and quote via the agent. Uses browser
automation with the user's real Chrome browser (no API costs).

## Prerequisites
NanoClaw must be installed and running (run `setup-nanoclaw` first).

## Step 1: Install Dependencies

```
cd ~/nanoclaw && npm install playwright dotenv-cli
npx playwright install chromium
```

## Step 2: Log In to X

The integration uses the user's real Chrome browser to avoid detection.
A dedicated browser profile is created for the X session.

Tell the user:
> I'll open Chrome with a clean profile. Please log in to your X account.
> This login will be saved so the agent can post on your behalf.

Run the login script:
```
cd ~/nanoclaw && node scripts/x-login.js
```

Use WAIT_FOR_USER — a Chrome window opens for manual login.

## Step 3: Verify Access

Run a quick test to verify the browser session works:
```
cd ~/nanoclaw && node scripts/x-verify.js
```

This should load x.com successfully without prompting for login.

## Step 4: Configure Tools

Register the X tools (x_post, x_like, x_reply, x_retweet, x_quote)
in the agent runner. These run as host-side scripts via IPC.

Only the main group should have X access (not all channels).

## Step 5: Test

Send a message to the agent: "Post a tweet saying: Testing NanoClaw!"
Verify it appears on X.

> **Important**: The agent should always ask for permission before
> posting to X. Tweets are public and permanent.

## Caveats
- Chrome profile stored in `~/nanoclaw/data/x-browser-profile/` (gitignored)
- If X changes their UI, the Playwright selectors may need updating
- Browser must not be in headless mode (X detects headless browsers)
- Only works on macOS (needs a display for Chrome)

## Tools referenced
- `mac_run_command` — npm install, login script, test
- `ui_spa` with WAIT_FOR_USER — Chrome login
