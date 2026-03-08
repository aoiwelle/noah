---
name: setup-nanoclaw/install-node
description: Install Node.js 22+ for NanoClaw (sub-module)
platform: macos
last_reviewed: 2026-03-08
author: noah-team
type: system
---

# Install Node.js

NanoClaw requires Node.js 22+. This module installs it.

## Step 1: Choose Installation Method

Ask the user how they'd like to install Node.js:
- **Homebrew** (recommended if brew is available): `brew install node@22`
- **nvm** (recommended for developers): install nvm then `nvm install 22`
- **Direct download** from nodejs.org

## Step 2: Install

For Homebrew: run `brew install node@22` then `brew link node@22`.
For nvm: run `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash`
then `nvm install 22 && nvm use 22`.
For direct: use WAIT_FOR_USER and guide to nodejs.org download page.

## Step 3: Verify

Run `node --version` and confirm it shows v22.x or higher.
If it shows an old version, check PATH ordering.

## Tools referenced
- `mac_run_command` — install and verify Node.js
- `ui_user_question` — installation method choice
- `ui_spa` with WAIT_FOR_USER — for manual download
