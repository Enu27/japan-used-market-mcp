/** Minimal Apify API client for the japan-used-camera-market Actor (no SDK dependency). */
export const ACTOR_ID = 'keiya_dev~japan-used-camera-market';
const API = process.env.APIFY_API_BASE_URL || 'https://api.apify.com/v2';
export class ApifyError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
export class ApifyClient {
    token;
    fetchImpl;
    constructor({ token, fetchImpl }) {
        if (!token)
            throw new ApifyError('APIFY_TOKEN is not set. Get one at https://console.apify.com/settings/integrations and pass it as the APIFY_TOKEN environment variable.');
        this.token = token;
        this.fetchImpl = fetchImpl ?? fetch;
    }
    async request(method, path, body) {
        const res = await this.fetchImpl(`${API}/${path}`, {
            method,
            headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        }
        catch { /* non-JSON */ }
        if (!res.ok) {
            const msg = json?.error?.message || text.slice(0, 300) || res.statusText;
            throw new ApifyError(`Apify API ${res.status}: ${msg}`, res.status);
        }
        return (json && typeof json === 'object' && 'data' in json && !Array.isArray(json) ? json.data : json);
    }
    /**
     * Run the Actor and return its dataset items (synchronous run, max 300 s on Apify's side).
     * A failed run comes back as HTTP 400 with the Actor's status message, which explains what to do.
     */
    async runSync(input, { timeoutSecs = 290 } = {}) {
        return this.request('POST', `acts/${ACTOR_ID}/run-sync-get-dataset-items?timeout=${timeoutSecs}&clean=1&format=json`, input);
    }
    async createTask(name, input) {
        return this.request('POST', 'actor-tasks', {
            actId: ACTOR_ID, name, input, options: { memoryMbytes: 1024, timeoutSecs: 900 },
        });
    }
    async createSchedule(name, cron, timezone, taskId) {
        return this.request('POST', 'schedules', {
            name, cronExpression: cron, timezone, isEnabled: true, isExclusive: true,
            description: 'Created by japan-used-camera-mcp (start_monitor).',
            actions: [{ type: 'RUN_ACTOR_TASK', actorTaskId: taskId }],
        });
    }
    async runTask(taskId) {
        return this.request('POST', `actor-tasks/${taskId}/runs`, {});
    }
}
