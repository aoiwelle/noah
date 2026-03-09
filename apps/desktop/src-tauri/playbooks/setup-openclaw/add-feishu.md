---
name: setup-openclaw/add-feishu
description: Add Feishu (飞书) or Lark as a messaging channel for OpenClaw
platform: all
last_reviewed: 2026-03-08
author: noah-team
type: system
---

# Add Feishu/Lark Channel

Connect Feishu (飞书) or Lark to OpenClaw. Feishu is the most common
messaging platform for Chinese teams and organizations.

## Prerequisites
OpenClaw must be installed (`openclaw --version` should work).

## Step 1: Create a Feishu App

Tell the user to create an enterprise app in the Feishu developer console:

> **Chinese tenants (飞书):** Go to https://open.feishu.cn/app
> **International (Lark):** Go to https://open.larksuite.com/app
>
> 1. Click "创建企业自建应用" (Create enterprise app)
> 2. Enter an app name and description
> 3. In the **凭证与基础信息** (Credentials) section, copy the **App ID**
>    (format: `cli_xxx`) and **App Secret**
> 4. Keep the App Secret private!

Use WAIT_FOR_USER — the user does this in their browser.

## Step 2: Configure Permissions

Tell the user to set up permissions in the Feishu console:

> In your app settings, go to **权限管理** (Permissions):
> 1. Click "批量开通" (Batch import)
> 2. Add these permissions: `im:message`, `im:message:send_as_bot`,
>    `im:chat.access_event.bot_p2p_chat:read`
> 3. Go to **事件订阅** (Event Subscriptions)
> 4. Select "使用长连接接收事件" (Use long connection) — this avoids
>    needing a public URL
> 5. Add event: `im.message.receive_v1`
> 6. **Publish the app** (发布应用) — it must be published to work

Use WAIT_FOR_USER.

## Step 3: Configure OpenClaw

Collect App ID and App Secret via `secure_input`.

The quickest way:
```
openclaw channels add
```
Select Feishu and provide the credentials.

Or configure directly in `~/.openclaw/openclaw.json`:
```json5
{
  channels: {
    feishu: {
      enabled: true,
      accounts: {
        main: {
          appId: "${FEISHU_APP_ID}",
          appSecret: "${FEISHU_APP_SECRET}",
          botName: "AI Assistant"  // display name
        }
      }
    }
  },
  env: {
    FEISHU_APP_ID: "<app_id>",
    FEISHU_APP_SECRET: "<app_secret>"
  }
}
```

For Lark (international), add `domain: "lark"` to the account config.

## Step 4: Set Access Policy

Ask who should be allowed to message the bot:

- **Pairing** (default): new users need approval
- **Allowlist**: only specific Feishu Open IDs (`ou_xxx`)
- **Open**: anyone in the organization can message

For groups:
- By default, groups require @mention of the bot
- `groupPolicy: "open"` to allow all groups
- `groupPolicy: "allowlist"` with `groupAllowFrom: ["oc_xxx"]` for specific groups

## Step 5: Restart and Test

Restart gateway:
```
openclaw gateway restart
```

Verify: `openclaw channels status --probe`

Have the user send a DM to the bot in Feishu. If using pairing mode,
approve the request.

**Finding IDs:** If the user needs their group chat ID (`oc_xxx`) or
user ID (`ou_xxx`), have them @mention the bot in the group and check
`openclaw logs --follow` for the IDs.

## Step 6: Optional Tuning

Reduce Feishu API quota usage for high-traffic bots:
```json5
{
  channels: {
    feishu: {
      typingIndicator: false,      // skip typing status calls
      resolveSenderNames: false    // skip name lookups
    }
  }
}
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Bot not responding | Check app is published, permissions granted, events subscribed |
| No messages in groups | Verify bot is added to group, @mention required by default |
| Permission denied | Check `im:message:send_as_bot` permission is granted |
| Connection drops | Verify long connection mode, check `openclaw logs --follow` |

## Tools referenced
- `shell_run` — openclaw CLI commands
- `ui_user_question` with `secure_input` — App ID and App Secret
- `ui_user_question` with options — access policy
- `ui_spa` with WAIT_FOR_USER — Feishu console setup
