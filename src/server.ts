import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApifyClient, ApifyError } from './apify.js';

export const SERVER_NAME = 'japan-used-camera-market';
export const SERVER_VERSION = '0.2.0';

const SHOPS = ['fujiya', 'sanpou', 'naniwa', 'hardoff'] as const;
const GRADES = ['NEW', 'A', 'AB+', 'AB', 'AB-', 'B', 'ASIS', 'PARTS'] as const;
const EVENTS = ['NEW', 'PRICE_DROP', 'PRICE_UP', 'SOLD_OUT'] as const;

const filterShape = {
    keywords: z.array(z.string()).optional().describe('Match any of these in brand + title (case-insensitive, English or Japanese), e.g. ["Leica M6", "X100VI"].'),
    brands: z.array(z.string()).optional().describe('Exact brand names, e.g. ["Leica", "Nikon", "FUJIFILM"].'),
    sources: z.array(z.enum(SHOPS)).optional().describe('Shops: fujiya (full used stock), sanpou (full used stock), naniwa (new arrivals only), hardoff (Hard Off Off Mall cameras + lenses on sale, ~16,000). Default: all four.'),
    grades: z.array(z.enum(GRADES)).optional().describe('Normalized condition grades, best to worst: NEW > A > AB+ > AB > AB- > B > ASIS > PARTS.'),
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
const slimListing = (it: any) => ({
    shop: it.source, title: it.title, brand: it.brand, model: it.model, grade: it.conditionGrade, gradeRaw: it.conditionGradeRaw,
    priceJpy: it.priceJpy, priceUsd: it.priceUsd, inStock: it.inStock, variant: it.variant ?? undefined, url: it.url,
});

/** Build an MCP server whose tools call the Actor with the given Apify token. */
export function createServer(getClient: () => ApifyClient): McpServer {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

    server.registerTool('search_listings', {
        title: 'Search used camera listings in Japan',
        description: 'Search current used camera / lens listings at Japanese shops (Fujiya Camera, Sanpou Camera, Naniwa new arrivals, Hard Off Off Mall). '
            + 'Returns title, brand, normalized condition grade, price in JPY and USD, stock status and URL. Takes ~15–60 s.',
        inputSchema: {
            ...filterShape,
            includeSoldOut: z.boolean().optional().describe('Also return listings marked sold out.'),
            maxItems: z.number().int().min(1).max(200).default(20).describe('Stop after this many matching listings (1–200).'),
        },
    }, async (args) => {
        try {
            const items = await getClient().runSync(strip({ mode: 'search', ...args }));
            return asText(`${items.length} listings.`, items.map(slimListing));
        } catch (e) { return asError(e); }
    });

    server.registerTool('price_stats', {
        title: 'Current price stats per model',
        description: 'Per-model price summary of in-stock listings right now: count and min / median / max (JPY and USD), '
            + 'broken down by shop and by normalized condition grade, plus the cheapest listing. Use keywords to stay fast (~1–4 min).',
        inputSchema: {
            ...filterShape,
            maxItems: z.number().int().min(0).max(5000).default(300).describe('Listings to read before summarizing (0 = all; a full read of all shops takes ~4 min).'),
        },
    }, async (args) => {
        try {
            const rows = await getClient().runSync(strip({ mode: 'stats', ...args }));
            return asText(`${rows.length} models.`, rows.slice(0, 100));
        } catch (e) { return asError(e); }
    });

    server.registerTool('price_history', {
        title: 'Daily price history per model',
        description: 'Daily min / median / max / count per model, by shop and condition grade, from stored daily snapshots of the shops '
            + '(Fujiya, Sanpou and Naniwa; collected since 2026-11-05, so the first month is short). No crawling — returns in seconds. Needs keywords, brands or models.',
        inputSchema: {
            ...filterShape,
            models: z.array(z.string()).optional().describe('Exact model keys as returned by price_stats ("model" field), e.g. ["leica m6", "nikon zf"].'),
            days: z.number().int().min(1).max(3650).default(90).describe('Days back from today (Japan time).'),
        },
    }, async (args) => {
        if (!args.keywords?.length && !args.brands?.length && !args.models?.length) {
            return asError(new ApifyError('price_history needs keywords, brands or models — otherwise it would return every model for every day.'));
        }
        try {
            const rows = await getClient().runSync(strip({ mode: 'history', ...args }));
            return asText(`${rows.length} rows (one per model × day).`, rows.slice(0, 500));
        } catch (e) { return asError(e); }
    });

    server.registerTool('start_monitor', {
        title: 'Start a change monitor (scheduled)',
        description: 'Creates, in the user\'s own Apify account, a saved Task running this Actor in monitor mode and a Schedule for it '
            + '(hourly by default), then starts the first run to record the baseline. Later runs emit only changes '
            + '(NEW / PRICE_DROP / PRICE_UP / SOLD_OUT) and can POST them to a Slack / Discord / n8n webhook. '
            + 'This creates resources and recurring runs that use the user\'s Apify credit — confirm with the user first.',
        inputSchema: {
            ...filterShape,
            name: z.string().regex(/^[a-z0-9-]{3,50}$/).describe('Short id for the Task and Schedule, lowercase letters, digits and dashes, e.g. "leica-m-watch".'),
            alertWebhookUrl: z.string().url().optional().describe('Slack / Discord incoming webhook or any URL that accepts a JSON POST.'),
            alertEvents: z.array(z.enum(EVENTS)).optional().describe('Event types to output and send. Default: NEW and PRICE_DROP.'),
            cron: z.string().default('0 * * * *').describe('Cron expression for the Schedule (default hourly). Please not more often than every 15 minutes.'),
            timezone: z.string().default('Asia/Tokyo'),
        },
    }, async ({ name, cron, timezone, ...rest }) => {
        try {
            const client = getClient();
            const taskName = `jucm-monitor-${name}`;
            const input = strip({ mode: 'monitor', monitorId: name, ...rest });
            const task = await client.createTask(taskName, input);
            const schedule = await client.createSchedule(taskName, cron, timezone, task.id);
            const run = await client.runTask(task.id);
            return asText('Monitor created. The first run records the baseline and emits nothing; later runs emit only changes.', {
                taskId: task.id, taskUrl: `https://console.apify.com/actors/tasks/${task.id}`,
                scheduleId: schedule.id, scheduleUrl: `https://console.apify.com/schedules/${schedule.id}`, nextRunAt: schedule.nextRunAt,
                firstRunId: run.id, firstRunUrl: `https://console.apify.com/actors/runs/${run.id}`,
                input,
            });
        } catch (e) { return asError(e); }
    });

    return server;
}
