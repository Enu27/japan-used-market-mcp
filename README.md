# Japan Used Market — MCP server (cameras, watches, guitars, model trains)

[![CI](https://github.com/Enu27/japan-used-market-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Enu27/japan-used-market-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@keiya-dev/japan-used-market-mcp)](https://www.npmjs.com/package/@keiya-dev/japan-used-market-mcp)

An MCP server that lets Claude and other MCP clients search, price and watch **Japan's used camera, watch, musical-instrument and model-train shops**. Every tool takes a `market`: `"camera"` (default), `"watch"`, `"instrument"` or `"model-train"`.

| Market | Shop (`sources` id) | Coverage | Grades, best → worst |
|---|---|---|---|
| `camera` | **Fujiya Camera**, Nakano (`fujiya`) | full used stock, ~3,500 | `NEW > A > AB+ > AB > AB- > B > ASIS > PARTS` |
| | **Sanpou Camera**, Jiyugaoka (`sanpou`) | full used stock, ~1,300 | |
| | **Naniwa / Lemon-sha / Takachiho** (`naniwa`) | new arrivals only, ~200–300 | |
| | **Hard Off Off Mall** (`hardoff`) | cameras and lenses on sale, ~16,000 | |
| `watch` | **WATCHNIAN** (`watchnian`) | full used stock, ~3,900; box / warranty card | `NEW > UNUSED > SA > A > AB > B > C > JUNK`, plus `ANTIQUE` |
| | **GINZA RASIN** (`rasin`) | used luxury watches of 21 brands, ~4,000; not graded | |
| | **Jackroad** (`jackroad`) | new arrivals only, ~800 | |
| | **Hard Off Off Mall** (`offmall`) | wristwatches on sale, ~24,000 | |
| `instrument` | **Shimokura Gakki** (`shimokura`) | full used stock, ~1,400 guitars, basses, wind instruments, effects; not graded | Reverb scale: `BRAND_NEW > MINT > EXCELLENT > VERY_GOOD > GOOD > FAIR > POOR > NON_FUNCTIONING` |
| | **J-Guitar** (`jguitar`) | marketplace listing shops across Japan, ~11,000 used; one 9-step scale; listing shop in `store` | |
| | **Ishibashi Music** (`ishibashi`) | full used stock, ~8,500 | |
| | **Shimamura Music** (`shimamura`) | full used stock, ~5,500; not graded | |
| | **Ikebe Music** (`ikebe`) | used and vintage, ~1,400; not graded | |
| | **Hard Off Off Mall** (`offmall`) | guitars, basses, woodwinds, brass on sale, ~13,000 | |
| `model-train` | **Hobbyland Pochi** (`pochi`) | full used stock, ~12,000 N / HO trains; maker code + JAN | `NEW > MINT > EXCELLENT > VERY_GOOD > GOOD > FAIR > JUNK`, plus `CUSTOM` |
| | **Hard Off Off Mall** (`offmall`) | model trains on sale, ~9,600; motor + case | |

Grades are normalized across shops, and every shop's own label is kept as well. Prices come in JPY and USD. Watches also carry the **reference number** (e.g. `SBGA211`, `16233`). Instruments carry the **model code** (`ST57-70TX`, `JB62-58`), **country of manufacture** (`madeIn`; Fender is split into Fender Japan / USA / Mexico), **production year / era**, **case** and the Reverb condition name. Model trains carry the maker's **product code** (KATO `10-1332`, TOMIX `98313`, MicroAce `A-6590`), **scale** (N / HO / Z), **set type** (set / add-on / single), whether a **powered car** is included, case / manual / sleeve and the lot year.

It runs the [Japan Used Camera Market](https://apify.com/keiya_dev/japan-used-camera-market) and [Japan Used Watch Market](https://apify.com/keiya_dev/japan-used-watch-market), [Japan Used Guitar & Instrument Market](https://apify.com/keiya_dev/japan-used-instrument-market) and [Japan Used Model Train Market](https://apify.com/keiya_dev/japan-used-model-train-market) Actors on [Apify](https://apify.com) **with your own Apify token**, so runs are billed to your Apify account. That is pay per result, and the free plan's monthly credit covers light use.

> **Renamed from `@keiya-dev/japan-used-camera-mcp`.** The old package still works (it now just starts this one), and calls without `market` behave exactly as in 0.2.0. Switch the package name in your config when convenient.

## Install

You need Node.js 20+ and an Apify API token: [Apify Console → Settings → API & Integrations](https://console.apify.com/settings/integrations).

### Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "japan-used-market": {
      "command": "npx",
      "args": ["-y", "@keiya-dev/japan-used-market-mcp"],
      "env": { "APIFY_TOKEN": "apify_api_..." }
    }
  }
}
```

Restart Claude Desktop. The five tools appear under the 🔨 icon.

### Claude Code

```bash
claude mcp add japan-used-market -e APIFY_TOKEN=apify_api_... -- npx -y @keiya-dev/japan-used-market-mcp
```

### Cursor / other stdio clients

Command `npx`, args `["-y", "@keiya-dev/japan-used-market-mcp"]`, env `APIFY_TOKEN`.

### Streamable HTTP

```bash
APIFY_TOKEN=apify_api_... npx -y @keiya-dev/japan-used-market-mcp --http --port 3000
```

- Endpoint `http://localhost:3000/mcp`; health check `/health`.
- Each request may send its own token as `Authorization: Bearer <APIFY_TOKEN>`; otherwise the server's `APIFY_TOKEN` is used.
- The server is stateless (POST only, JSON responses).

## Tools

| Tool | What it does | Typical time |
|---|---|---|
| `list_markets` | The markets, their shop ids, grades, price-history coverage and example keywords. No Apify run. | instant |
| `search_listings` | Current listings matching `keywords` / `brands` / `grades` / `minPriceJpy` / `maxPriceJpy` from the selected `sources`. Returns shop, title, brand, model key, normalized + raw grade, JPY, USD, stock flag and URL; watches add `ref`, `gender` and `accessories` (e.g. `box + warranty card`; WATCHNIAN, GINZA RASIN and Jackroad); instruments add `ref`, `type`, `madeIn`, `year`, `era`, `case`, `reverbCondition` and `store`; model trains add `productCode`, `scale`, `setType`, `motorized`, `accessories`, `lotYear` and `store`. `maxItems` 1–200 (default 20). | 15–60 s |
| `price_stats` | Per-model summary of in-stock listings **right now**: count, min / median / max (JPY and USD) by shop and by grade, cheapest listing. `maxItems` = listings read first (default 300; 0 = everything, ~25 min with all shops). | 1–4 min |
| `price_history` | **Daily** min / median / max / count per model, by shop, grade and shop × grade, for the last `days` (default 90). Reads stored snapshots (since 2026-11-05: daily for Fujiya, Sanpou, Naniwa, WATCHNIAN, GINZA RASIN, Jackroad, Shimokura, Ishibashi, Shimamura, Ikebe and Hobbyland Pochi; weekly on Sundays for J-Guitar and Hard Off), so there is no crawling. Needs `keywords`, `brands` or `models` (model keys from `price_stats`). | seconds |
| `start_monitor` | Creates, **in your Apify account**, a saved Task in monitor mode plus a Schedule (default hourly, `cron`, `timezone`) and starts the first run (baseline). Later runs emit only `NEW` / `PRICE_DROP` / `PRICE_UP` / `SOLD_OUT`, optionally POSTed to `alertWebhookUrl` (Slack, Discord, n8n…). Your client should confirm with you first; delete the Task/Schedule in Apify Console when done. | ~1 min to set up |

`sources` and `grades` must belong to the chosen `market` (default: all of its shops). A mismatch, e.g. `market: "watch"` with `sources: ["fujiya"]`, returns an error naming the valid values without starting a run. Monitors are named `jucm-monitor-<name>` (camera), `juwm-monitor-<name>` (watch), `juim-monitor-<name>` (instrument) or `jutm-monitor-<name>` (model-train) in your Apify account.

### Example prompts

- "What's the cheapest AB-or-better Leica M6 in Japanese shops right now?"
- "Compare Nikon Zf prices by shop and grade."
- "How has the median Fujifilm X100VI price moved over the last 30 days?"
- "Watch for new Voigtländer lenses under ¥80,000 and post them to my Slack webhook https://hooks.slack.com/services/…"
- "Find a Grand Seiko SBGA211 in SA or better with box and papers, and give me the USD price."
- "What's the median price of a Rolex 16233 in Japan, by shop?"
- "Alert me on Discord when a new King Seiko appears."
- "Find a Made in Japan Fender Jazz Bass from the 80s or 90s with a hard case, with the USD price."
- "What do Fender Japan ST57s sell for in Japan, by shop and condition?"
- "Alert me when a new Tokai or Greco Les Paul appears in Japan."
- "Find a KATO 0-series Shinkansen set that includes the motor car, under $150."
- "What does TOMIX 98313 sell for in Japan, by shop and condition?"
- "Alert me when a MicroAce Odakyu set appears in Japan."

## Develop

```bash
npm install
npm test            # tsc build + end-to-end tests (stdio, HTTP, missing token; camera + watch + instrument + model-train, market validation) against a fake Apify API
npm run start       # stdio
npm run start:http  # HTTP on :3000
```

`APIFY_API_BASE_URL` overrides the Apify API base URL (used by the tests).

## Notes

- Not affiliated with any of the shops. Prices are the shops' tax-included asking prices, not sold prices.
- Data comes from the shops' public listing pages (plus product pages in `search`: WATCHNIAN, GINZA RASIN and Jackroad for box / warranty card; the instrument shops for case, store, year and country; Pochi and Off Mall model trains for maker code, motor and case). Serial numbers are not read.
- The Actors' READMEs cover coverage, limits and pricing: https://apify.com/keiya_dev/japan-used-camera-market · https://apify.com/keiya_dev/japan-used-watch-market · https://apify.com/keiya_dev/japan-used-instrument-market · https://apify.com/keiya_dev/japan-used-model-train-market
- `legacy/` is the old `@keiya-dev/japan-used-camera-mcp` package: a thin wrapper that starts this server.

## License

MIT
