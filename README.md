# Japan Used Camera Market — MCP server

MCP server for Japan's used camera shops — **Fujiya Camera**, **Sanpou Camera** and **Naniwa / Lemon-sha** (new arrivals). It runs the [Japan Used Camera Market](https://apify.com/keiya_dev/japan-used-camera-market) Actor on Apify with your own token.

| Tool | What it does |
|---|---|
| `search_listings` | Current listings matching keywords / brands / condition grades / price, from all three shops (title, brand, normalized grade, JPY + USD, stock, URL). |
| `price_stats` | Per-model price summary right now: count, min / median / max, by shop and condition grade. |
| `price_history` | Daily min / median / max / count per model, by shop and grade, from stored daily snapshots (since 2026-11-05). |
| `start_monitor` | Creates a scheduled monitor in your Apify account that emits only changes (NEW / PRICE_DROP / PRICE_UP / SOLD_OUT), optionally POSTed to Slack / Discord / n8n. |

Condition grades are normalized across shops: `NEW > A > AB+ > AB > AB- > B > ASIS > PARTS`.

## Setup

You need an Apify API token: [console.apify.com → Settings → API & Integrations](https://console.apify.com/settings/integrations). Runs are billed to your Apify account (pay per result; the free plan's monthly credit covers light use).

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "japan-used-camera": {
      "command": "npx",
      "args": ["-y", "@keiya-dev/japan-used-camera-mcp"],
      "env": { "APIFY_TOKEN": "apify_api_..." }
    }
  }
}
```

Restart Claude Desktop, then ask e.g. *"What's the cheapest AB-or-better Leica M6 in Tokyo shops right now?"* or *"How has the median Nikon Zf price moved this month?"*

### Claude Code

```bash
claude mcp add japan-used-camera -e APIFY_TOKEN=apify_api_... -- npx -y @keiya-dev/japan-used-camera-mcp
```

### Streamable HTTP

```bash
APIFY_TOKEN=apify_api_... npx -y @keiya-dev/japan-used-camera-mcp --http --port 3000
# endpoint: http://localhost:3000/mcp   (health: /health)
```

Each HTTP request may send its own token as `Authorization: Bearer <APIFY_TOKEN>`; otherwise the server's `APIFY_TOKEN` is used. The server is stateless (POST only).

## Notes

- `search_listings` and `price_stats` crawl the shops live (15 s – 4 min). Narrow with keywords to stay fast.
- `price_history` reads stored snapshots and returns in seconds; the series starts on 2026-11-05.
- `start_monitor` creates a Task and a Schedule in your account and starts the first run (baseline). Remove them in Apify Console when you no longer need them.
- Not affiliated with any of the shops.
