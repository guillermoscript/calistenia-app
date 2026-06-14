# Calistenia MCP Server — Setup Guide

## What it does
Gives Claude (or any MCP client) direct access to your Calistenia app data:
- Log and query workout sessions and exercise sets
- View your current training program and exercise progressions
- Track body weight, lumbar health checks, and personal records
- Log and analyze meals / nutrition macros
- Smart prompts to plan your week, analyze progress, and get nutrition advice

## Auth: how it works
The server validates your **PocketBase JWT token** on every request. The token is the same one the Calistenia web app uses — no separate login needed.

**Get your token:**
1. Open the Calistenia app in your browser
2. Open DevTools (F12) → Application → Local Storage
3. Find the `pb_auth` key → expand → copy the `token` value

---

## Option A: Connector (recommended — deployed server, OAuth login)

The deployed server (`https://gym-server.guille.tech`) supports OAuth 2.1 with
dynamic client registration, so Claude Desktop can connect as a native
**Connector** — no token pasting, no JSON editing.

### 1. Add the connector
Claude Desktop → **Settings → Connectors → Add custom connector** → paste:

```
https://gym-server.guille.tech/mcp
```

Claude reads the discovery docs, opens a browser to log in via PocketBase, and
stores the token automatically.

> **Requires** the `SERVER_URL` env var to be set to the public origin on the
> deployed server (in Dokploy env vars), otherwise OAuth metadata advertises
> `localhost` and the flow fails. It is read at runtime — no rebuild needed,
> just set it and restart. Verify after deploy with:
> ```bash
> curl -s https://gym-server.guille.tech/.well-known/oauth-authorization-server
> # issuer / authorization_endpoint / token_endpoint must show the public domain
> ```

---

## Option B: stdio mode (local subprocess, manual token)

### 1. Build + copy env
```bash
cd mcp-server
npm install && npm run build
cp .env.example .env
# Edit .env: set POCKETBASE_URL and PB_TOKEN
```

### 2. Add to Claude Desktop config
File (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "calistenia": {
      "command": "node",
      "args": ["/Users/YOUR_NAME/Documents/ejercicios/calistenia-app/mcp-server/build/server.js"],
      "env": {
        "POCKETBASE_URL": "https://gym.guille.tech",
        "PB_TOKEN": "YOUR_POCKETBASE_JWT_TOKEN_HERE"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

---

## Option C: remote HTTP via mcp-remote (manual token, no OAuth)

Useful if you want to hit the deployed server but skip the OAuth flow.

```json
{
  "mcpServers": {
    "calistenia": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://gym-server.guille.tech/mcp",
        "--header", "Authorization: Bearer YOUR_POCKETBASE_JWT_TOKEN"
      ]
    }
  }
}
```

The server validates the token against PocketBase on every request.

After connecting via any option, ask Claude to run **`cal_whoami`** to confirm
auth works.

---

## Available tools (22 total)

### Workouts
| Tool | Description |
|------|-------------|
| `cal_list_sessions` | List completed workout sessions |
| `cal_log_session` | Log a completed workout |
| `cal_delete_session` | Delete a session |
| `cal_list_sets` | List exercise sets with reps |
| `cal_log_set` | Log an exercise set |
| `cal_get_exercise_history` | Full history for a specific exercise |

### Programs
| Tool | Description |
|------|-------------|
| `cal_list_programs` | List available training programs |
| `cal_get_current_program` | Current program with all exercises |
| `cal_set_current_program` | Switch to a different program |
| `cal_list_exercise_progressions` | Progression chains by category |

### Progress & Health
| Tool | Description |
|------|-------------|
| `cal_get_settings` | Phase, PRs, weekly goal |
| `cal_update_settings` | Update any setting or PR |
| `cal_list_weight_entries` | Body weight history |
| `cal_add_weight_entry` | Log a weight measurement |
| `cal_delete_weight_entry` | Delete a weight entry |
| `cal_list_lumbar_checks` | Lumbar health check history |
| `cal_add_lumbar_check` | Log lumbar score + sleep + sitting |
| `cal_get_progress_summary` | Overall progress overview |

### Nutrition
| Tool | Description |
|------|-------------|
| `cal_get_nutrition_goals` | Daily macro targets |
| `cal_update_nutrition_goals` | Update macro targets or goal type |
| `cal_list_nutrition_entries` | Meal log for a date range |
| `cal_add_nutrition_entry` | Log a meal manually |
| `cal_delete_nutrition_entry` | Delete a meal entry |
| `cal_get_nutrition_summary` | Avg macros vs goals over a period |

## Resources
- `user://profile` — Your profile, settings, and current program summary
- `nutrition://today` — Today's meals and macros vs goals
- `progress://weekly` — This week's sessions and consistency

## Prompts
- `plan_training_week` — AI-assisted weekly workout plan
- `analyze_progress` — Deep-dive into your last N days
- `nutrition_advice` — Personalized nutrition review and tips

---

## Development
```bash
npm run dev        # HTTP server with hot reload
npm run dev:stdio  # stdio mode with hot reload
npm run build      # Compile TypeScript
```
