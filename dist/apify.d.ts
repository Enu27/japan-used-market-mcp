/** Minimal Apify API client for the japan-used-camera-market Actor (no SDK dependency). */
export declare const ACTOR_ID = "keiya_dev~japan-used-camera-market";
export declare class ApifyError extends Error {
    readonly status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
export interface ApifyClientOptions {
    token: string;
    fetchImpl?: typeof fetch;
}
export declare class ApifyClient {
    private readonly token;
    private readonly fetchImpl;
    constructor({ token, fetchImpl }: ApifyClientOptions);
    private request;
    /**
     * Run the Actor and return its dataset items (synchronous run, max 300 s on Apify's side).
     * A failed run comes back as HTTP 400 with the Actor's status message, which explains what to do.
     */
    runSync(input: Record<string, unknown>, { timeoutSecs }?: {
        timeoutSecs?: number;
    }): Promise<any[]>;
    createTask(name: string, input: Record<string, unknown>): Promise<{
        id: string;
        name: string;
    }>;
    createSchedule(name: string, cron: string, timezone: string, taskId: string): Promise<{
        id: string;
        nextRunAt?: string;
    }>;
    runTask(taskId: string): Promise<{
        id: string;
    }>;
}
