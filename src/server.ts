import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApifyClient, ApifyError } from './apify.js';
import { ALL_GRADES, ALL_SHOPS, DEFAULT_MARKET, MARKETS, MARKET_IDS, checkMarketArgs, type Market, type MarketId } from './markets.js';

export const SERVER_NAME = 'japan-used-market';
export const SERVER_VERSION = '0.5.1';

const EVENTS = ['NEW', 'PRICE_DROP', 'PRICE_UP', 'SOLD_OUT'] as const;

const shopList = MARKET_IDS.map((id) => `${id}: ${Object.keys(MARKETS[id].shops).join(', ')}`).join('; ');
const gradeList = MARKET_IDS.map((id) => `${id}: ${MARKETS[id].gradeNote}`).join('; ');

const filterShape = {
    market: z.enum(MARKET_IDS).default(DEFAULT_MARKET).describe(`Which market: ${MARKET_IDS.map((id) => `"${id}" (${MARKETS[id].title.toLowerCase()})`).join(' or ')}. Default "${DEFAULT_MARKET}". Shops and grades depend on it — see list_markets.`),
    keywords: z.array(z.string()).optional().describe('Match any of these in brand + title (case-insensitive, English or Japanese; watches, instruments and model trains also match reference / model / product codes), e.g. ["Leica M6"], ["Grand Seiko", "SBGA211"], ["Fender Japan", "ST57"] or ["KATO", "10-1332"].'),
    brands: z.array(z.string()).optional().describe('Exact brand names, e.g. ["Leica", "Nikon"], ["Rolex", "Grand Seiko"] ["Fender Japan", "Gibson"] (instruments: Fender is split into Fender Japan / Fender USA / Fender Mexico / Fender) or ["KATO", "TOMIX", "MicroAce"] (model trains).'),
    sources: z.array(z.enum(ALL_SHOPS)).optional().describe(`Shops of the chosen market (default: all of them). ${shopList}.`),
    grades: z.array(z.enum(ALL_GRADES)).optional().describe(`Normalized condition grades of the chosen market, best to worst. ${gradeList}.`),
    minPriceJpy: z.number().int().min(0).optional(),
    maxPriceJpy: z.number().int().min(0).optional(),
};

const strip = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)));

const asText = (summary: string, data: unknown) => ({
    content: [{ type: 'text' as const, text: `${summary}\n\n${JSON.stringify(data, null, 1)}` }],
});
const asError = (e: unknown) => ({
    isError: true,
    content: [{ type: 'text' as const, text: e instanceof ApifyError ? e.message : `Unexpected error: ${(e as Error)?.message ?? e}` }],
});

/** Listing fields an agent needs; drops scrapedAt / fx / raw duplicates to keep context small. */
const slimListing = (market: Market) => (it: any) => ({
    shop: it.source, title: it.title, brand: it.brand, model: it.model, grade: it.conditionGrade, gradeRaw: it.conditionGradeRaw,
    priceJpy: it.priceJpy, priceUsd: it.priceUsd, inStock: it.inStock, ...market.slimExtra(it), url: it.url,
});

/**
 * Resolve the market and validate shops / grades against it.
 * Returns the market and the Actor input (without `market`, which the Actors don't know), or a tool error.
 */
type Prepared<A> = { ok: false; error: ReturnType<typeof asError> } | { ok: true; market: Market; input: Omit<A, 'market'> };
function prepare<A extends { market?: MarketId; sources?: string[]; grades?: string[] }>(args: A): Prepared<A> {
    const { market: id = DEFAULT_MARKET, ...rest } = args;
    const market: Market = MARKETS[id];
    const problem = checkMarketArgs(market, rest);
    return problem ? { ok: false, error: asError(new ApifyError(problem)) } : { ok: true, market, input: rest };
}

/** Build an MCP server whose tools call the Actors with the given Apify token. */
export function createServer(getClient: () => ApifyClient): McpServer {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

    server.registerTool('list_markets', {
        title: 'List markets, shops and grades',
        description: 'Lists the markets this server covers (used cameras, used watches, used musical instruments, used model trains) with each market\'s shop ids, condition grades (best to worst), '
            + 'price-history coverage and example keywords. Free and instant — call it first when unsure which sources / grades are valid.',
        inputSchema: {},
    }, async () => asText(`${MARKET_IDS.length} markets. Pass the id as "market" to the other tools (default "${DEFAULT_MARKET}").`,
        MARKET_IDS.map((id) => {
            const m = MARKETS[id];
            return { market: id, title: m.title, shops: m.shops, grades: m.grades, gradeOrder: m.gradeNote, priceHistory: m.history, exampleKeywords: m.exampleKeywords, actor: m.actorUrl };
        })));

    server.registerTool('search_listings', {
        title: 'Search used listings in Japan',
        description: 'Search current used listings at Japanese shops — cameras / lenses (Fujiya Camera, Sanpou Camera, Naniwa new arrivals, Hard Off Off Mall) '
            + 'or wristwatches (WATCHNIAN, Hard Off Off Mall) or guitars / basses / wind instruments (Shimokura Gakki, Hard Off Off Mall) or N / HO model trains (Hobbyland Pochi, Hard Off Off Mall). '
            + 'Returns title, brand, normalized condition grade, price in JPY and USD, stock status and URL; '
            + 'watches add reference number, gender and box / warranty card (WATCHNIAN); instruments add model code, instrument type, '
            + 'country of manufacture (madeIn), production year / era, case, Reverb condition name and store; model trains add maker product code, '
            + 'scale (N / HO / Z), set type (set / add-on / single), motorized flag, case / manual / sleeve and lot year. Takes ~15–60 s.',
        inputSchema: {
            ...filterShape,
            includeSoldOut: z.boolean().optional().describe('Also return listings marked sold out.'),
            maxItems: z.number().int().min(1).max(200).default(20).describe('Stop after this many matching listings (1–200).'),
        },
    }, async (args) => {
        const p = prepare(args);
        if (!p.ok) return p.error;
        try {
            const items = await getClient().runSync(strip({ mode: 'search', ...p.input }), { actorId: p.market.actorId });
            return asText(`${items.length} listings.`, items.map(slimListing(p.market)));
        } catch (e) { return asError(e); }
    });

    server.registerTool('price_stats', {
        title: 'Current price stats per model',
        description: 'Per-model price summary of in-stock listings right now: count and min / median / max (JPY and USD), '
            + 'broken down by shop and by normalized condition grade, plus the cheapest listing. Watches are grouped by brand + reference number, instruments by brand + model code, model trains by maker + product code. '
            + 'Use keywords to stay fast (~1–4 min).',
        inputSchema: {
            ...filterShape,
            maxItems: z.number().int().min(0).max(5000).default(300).describe('Listings to read before summarizing (0 = all; a full read of every shop can take 5–30 min).'),
        },
    }, async (args) => {
        const p = prepare(args);
        if (!p.ok) return p.error;
        try {
            const rows = await getClient().runSync(strip({ mode: 'stats', ...p.input }), { actorId: p.market.actorId });
            return asText(`${rows.length} models.`, rows.slice(0, 100));
        } catch (e) { return asError(e); }
    });

    server.registerTool('price_history', {
        title: 'Daily price history per model',
        description: 'Daily min / median / max / count per model, by shop and condition grade, from stored snapshots of the shops '
            + `(${MARKET_IDS.map((id) => `${id}: ${MARKETS[id].history}`).join(' ')} The first month is short). `
            + 'No crawling — returns in seconds. Needs keywords, brands or models.',
        inputSchema: {
            ...filterShape,
            models: z.array(z.string()).optional().describe('Exact model keys as returned by price_stats ("model" field), e.g. ["leica m6", "nikon zf"], ["grand seiko sbga211"] or ["fender japan jb62-58"].'),
            days: z.number().int().min(1).max(3650).default(90).describe('Days back from today (Japan time).'),
        },
    }, async (args) => {
        const p = prepare(args);
        if (!p.ok) return p.error;
        if (!args.keywords?.length && !args.brands?.length && !args.models?.length) {
            return asError(new ApifyError('price_history needs keywords, brands or models — otherwise it would return every model for every day.'));
        }
        try {
            const rows = await getClient().runSync(strip({ mode: 'history', ...p.input }), { actorId: p.market.actorId });
            return asText(`${rows.length} rows (one per model × day).`, rows.slice(0, 500));
        } catch (e) { return asError(e); }
    });

    server.registerTool('start_monitor', {
        title: 'Start a change monitor (scheduled)',
        description: 'Creates, in the user\'s own Apify account, a saved Task running the market\'s Actor in monitor mode and a Schedule for it '
            + '(hourly by default), then starts the first run to record the baseline. Later runs emit only changes '
            + '(NEW / PRICE_DROP / PRICE_UP / SOLD_OUT) and can POST them to a Slack / Discord / n8n webhook. '
            + 'This creates resources and recurring runs that use the user\'s Apify credit — confirm with the user first.',
        inputSchema: {
            ...filterShape,
            name: z.string().regex(/^[a-z0-9-]{3,50}$/).describe('Short id for the Task and Schedule, lowercase letters, digits and dashes, e.g. "leica-m-watch" or "gs-sbga211".'),
            alertWebhookUrl: z.string().url().optional().describe('Slack / Discord incoming webhook or any URL that accepts a JSON POST.'),
            alertEvents: z.array(z.enum(EVENTS)).optional().describe('Event types to output and send. Default: NEW and PRICE_DROP.'),
            cron: z.string().default('0 * * * *').describe('Cron expression for the Schedule (default hourly). Please not more often than every 15 minutes.'),
            timezone: z.string().default('Asia/Tokyo'),
        },
    }, async ({ name, cron, timezone, ...args }) => {
        const p = prepare(args);
        if (!p.ok) return p.error;
        try {
            const client = getClient();
            const taskName = `${p.market.monitorPrefix}${name}`;
            const input = strip({ mode: 'monitor', monitorId: name, ...p.input });
            const task = await client.createTask(taskName, input, p.market.actorId);
            const schedule = await client.createSchedule(taskName, cron, timezone, task.id);
            const run = await client.runTask(task.id);
            return asText('Monitor created. The first run records the baseline and emits nothing; later runs emit only changes.', {
                market: p.market.id,
                taskId: task.id, taskUrl: `https://console.apify.com/actors/tasks/${task.id}`,
                scheduleId: schedule.id, scheduleUrl: `https://console.apify.com/schedules/${schedule.id}`, nextRunAt: schedule.nextRunAt,
                firstRunId: run.id, firstRunUrl: `https://console.apify.com/actors/runs/${run.id}`,
                input,
            });
        } catch (e) { return asError(e); }
    });

    return server;
}
