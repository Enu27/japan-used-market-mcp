/** Minimal Apify API client for the japan-used-*-market Actors (no SDK dependency). */

/** Camera Actor; kept for 0.2.x importers. Pass the market's actorId to the methods instead. */
export const ACTOR_ID = 'keiya_dev~japan-used-camera-market';
const API = process.env.APIFY_API_BASE_URL || 'https://api.apify.com/v2';

export class ApifyError extends Error {
    constructor(message: string, readonly status?: number) { super(message); }
}

export interface ApifyClientOptions { token: string; fetchImpl?: typeof fetch }

export class ApifyClient {
    private readonly token: string;
    private readonly fetchImpl: typeof fetch;

    constructor({ token, fetchImpl }: ApifyClientOptions) {
        if (!token) throw new ApifyError('APIFY_TOKEN is not set. Get one at https://console.apify.com/settings/integrations and pass it as the APIFY_TOKEN environment variable.');
        this.token = token;
        this.fetchImpl = fetchImpl ?? fetch;
    }

    private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
        const res = await this.fetchImpl(`${API}/${path}`, {
            method,
            headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
        if (!res.ok) {
            const msg = json?.error?.message || text.slice(0, 300) || res.statusText;
            throw new ApifyError(`Apify API ${res.status}: ${msg}`, res.status);
        }
        return (json && typeof json === 'object' && 'data' in json && !Array.isArray(json) ? json.data : json) as T;
    }

    /**
     * Run the Actor and return its dataset items (synchronous run, max 300 s on Apify's side).
     * A failed run comes back as HTTP 400 with the Actor's status message, which explains what to do.
     */
    async runSync(input: Record<string, unknown>, { timeoutSecs = 290, actorId = ACTOR_ID }: { timeoutSecs?: number; actorId?: string } = {}): Promise<any[]> {
        return this.request<any[]>('POST', `acts/${actorId}/run-sync-get-dataset-items?timeout=${timeoutSecs}&clean=1&format=json`, input);
    }

    async createTask(name: string, input: Record<string, unknown>, actorId = ACTOR_ID) {
        return this.request<{ id: string; name: string }>('POST', 'actor-tasks', {
            actId: actorId, name, input, options: { memoryMbytes: 1024, timeoutSecs: 900 },
        });
    }

    async createSchedule(name: string, cron: string, timezone: string, taskId: string) {
        return this.request<{ id: string; nextRunAt?: string }>('POST', 'schedules', {
            name, cronExpression: cron, timezone, isEnabled: true, isExclusive: true,
            description: 'Created by japan-used-market-mcp (start_monitor).',
            actions: [{ type: 'RUN_ACTOR_TASK', actorTaskId: taskId }],
        });
    }

    async runTask(taskId: string) {
        return this.request<{ id: string }>('POST', `actor-tasks/${taskId}/runs`, {});
    }
}
