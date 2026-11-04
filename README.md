# Japan Used Camera Market — MCP server

[![CI](https://github.com/Enu27/japan-used-camera-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Enu27/japan-used-camera-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@keiya-dev/japan-used-camera-mcp)](https://www.npmjs.com/package/@keiya-dev/japan-used-camera-mcp)

An MCP server that lets Claude and other MCP clients search, price and watch **Japan's used camera shops**:

- **Fujiya Camera** (Nakano): full used stock, ~3,500 listings
- **Sanpou Camera** (Jiyugaoka): full used stock, ~1,300 listings
- **Naniwa / Lemon-sha / Takachiho**: new arrivals only, ~200–300
- **Hard Off Off Mall** (nationwide): cameras and lenses on sale, ~16,000

Condition grades are normalized across shops (`NEW > A > AB+ > AB > AB- > B > ASIS > PARTS`), and every shop's own label is kept as well. Prices come in JPY and USD.

It runs the [Japan Used Camera Market](https://apify.com/keiya_dev/japan-used-camera-market) Actor on [Apify](https://apify.com) **with your own Apify token**, so runs are billed to your Apify account. That is pay per result, and the free plan's monthly credit covers light use.

## Install

You need Node.js 20+ and an Apify API token: [Apify Console → Settings → API & Integrations](https://console.apify.com/settings/integrations).

### Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

Restart Claude Desktop. The four tools appear under the 🔨 icon.

### Claude Code

```bash
claude mcp add japan-used-camera -e APIFY_TOKEN=apify_api_... -- npx -y @keiya-dev/japan-used-camera-mcp
```

### Cursor / other stdio clients

Command `npx`, args `["-y", "@keiya-dev/japan-used-camera-mcp"]`, env `APIFY_TOKEN`.

### Streamable HTTP

```bash
APIFY_TOKEN=apify_api_... npx -y @keiya-dev/japan-used-camera-mcp --http --port 3000
```

- Endpoint `http://localhost:3000/mcp`; health check `/health`.
- Each request may send its own token as `Authorization: Bearer <APIFY_TOKEN>`; otherwise the server's `APIFY_TOKEN` is used.
- The server is stateless (POST only, JSON responses).

## Tools

| Tool | What it does | Typical time |
|---|---|---|
| `search_listings` | Current listings matching `keywords` / `brands` / `grades` / `minPriceJpy` / `maxPriceJpy` from the selected `sources`. Returns shop, title, brand, model key, normalized + raw grade, JPY, USD, stock flag and URL. `maxItems` 1–200 (default 20). | 15–60 s |
| `price_stats` | Per-model summary of in-stock listings **right now**: count, min / median / max (JPY and USD) by shop and by grade, cheapest listing. `maxItems` = listings read first (default 300; 0 = everything, ~25 min with all shops). | 1–4 min |
| `price_history` | **Daily** min / median / max / count per model, by shop, grade and shop × grade, for the last `days` (default 90). Reads stored daily snapshots (Fujiya, Sanpou, Naniwa; since 2026-11-05), so there is no crawling. Needs `keywords`, `brands` or `models` (model keys from `price_stats`). | seconds |
| `start_monitor` | Creates, **in your Apify account**, a saved Task in monitor mode plus a Schedule (default hourly, `cron`, `timezone`) and starts the first run (baseline). Later runs emit only `NEW` / `PRICE_DROP` / `PRICE_UP` / `SOLD_OUT`, optionally POSTed to `alertWebhookUrl` (Slack, Discord, n8n…). Your client should confirm with you first; delete the Task/Schedule in Apify Console when done. | ~1 min to set up |

`sources` (all tools): `fujiya`, `sanpou`, `naniwa`, `hardoff`. All four by default.

### Example prompts

- "What's the cheapest AB-or-better Leica M6 in Japanese shops right now?"
- "Compare Nikon Zf prices by shop and grade."
- "How has the median Fujifilm X100VI price moved over the last 30 days?"
- "Watch for new Voigtländer lenses under ¥80,000 and post them to my Slack webhook https://hooks.slack.com/services/…"

## Develop

```bash
npm install
npm test            # tsc build + end-to-end tests (stdio, HTTP, missing token) against a fake Apify API
npm run start       # stdio
npm run start:http  # HTTP on :3000
```

`APIFY_API_BASE_URL` overrides the Apify API base URL (used by the tests).

## Notes

- Not affiliated with any of the shops. Prices are the shops' tax-included asking prices, not sold prices.
- Data comes from the shops' public listing pages only. Product pages, serial numbers and condition notes are not read.
- The Actor's README covers coverage, limits and pricing: https://apify.com/keiya_dev/japan-used-camera-market

## License

MIT
