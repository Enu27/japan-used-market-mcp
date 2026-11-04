// End-to-end: real MCP client ↔ dist/index.js (stdio and Streamable HTTP) ↔ fake Apify API.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function fakeApify() {
    const calls = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            const call = { method: req.method, path: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null };
            calls.push(call);
            const json = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
            if (req.url.startsWith('/v2/acts/keiya_dev~japan-used-camera-market/run-sync-get-dataset-items')) {
                const mode = call.body.mode;
                if (mode === 'search') return json(201, [{ source: 'fujiya', title: 'M6 ボディ', brand: 'Leica', model: 'leica m6', conditionGrade: 'AB', conditionGradeRaw: 'AB', priceJpy: 400000, priceUsd: 2600, inStock: true, url: 'https://example/1', scrapedAt: 'x', fxJpyPerUsd: 153 }]);
                if (mode === 'stats') return json(201, [{ model: 'leica m6', count: 1, minJpy: 400000, medianJpy: 400000, maxJpy: 400000 }]);
                if (mode === 'history') return json(201, [{ model: 'leica m6', date: '2026-11-05', count: 1, minJpy: 400000, medianJpy: 400000, maxJpy: 400000 }]);
                return json(400, { error: { type: 'run-failed', message: 'Actor run failed: History mode needs a filter' } });
            }
            if (req.url === '/v2/actor-tasks') return json(201, { data: { id: 'TASK1', name: call.body.name } });
            if (req.url === '/v2/schedules') return json(201, { data: { id: 'SCHED1', nextRunAt: '2026-11-05T01:00:00.000Z' } });
            if (req.url === '/v2/actor-tasks/TASK1/runs') return json(201, { data: { id: 'RUN1' } });
            json(404, { error: { message: `unexpected ${req.url}` } });
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, base: `http://127.0.0.1:${server.address().port}/v2` })));
}

const parse = (result) => JSON.parse(result.content[0].text.split('\n\n').slice(1).join('\n\n'));

async function exercise(client, calls, expectedAuth) {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['price_history', 'price_stats', 'search_listings', 'start_monitor']);

    const search = await client.callTool({ name: 'search_listings', arguments: { keywords: ['Leica M6'], sources: ['fujiya'], maxItems: 5 } });
    assert.ok(!search.isError, search.content[0].text);
    assert.deepEqual(parse(search)[0], { shop: 'fujiya', title: 'M6 ボディ', brand: 'Leica', model: 'leica m6', grade: 'AB', gradeRaw: 'AB', priceJpy: 400000, priceUsd: 2600, inStock: true, url: 'https://example/1' });
    const sent = calls.findLast((c) => c.path.includes('run-sync'));
    assert.deepEqual(sent.body, { mode: 'search', keywords: ['Leica M6'], sources: ['fujiya'], maxItems: 5 });
    assert.equal(sent.auth, expectedAuth);

    const stats = await client.callTool({ name: 'price_stats', arguments: { keywords: ['Leica M6'] } });
    assert.equal(parse(stats)[0].model, 'leica m6');
    assert.equal(calls.findLast((c) => c.path.includes('run-sync')).body.maxItems, 300, 'default maxItems');

    const hist = await client.callTool({ name: 'price_history', arguments: { models: ['leica m6'], days: 30 } });
    assert.equal(parse(hist)[0].date, '2026-11-05');
    assert.deepEqual(calls.findLast((c) => c.path.includes('run-sync')).body, { mode: 'history', models: ['leica m6'], days: 30 });

    const n = calls.length;
    const noFilter = await client.callTool({ name: 'price_history', arguments: {} });
    assert.equal(noFilter.isError, true);
    assert.equal(calls.length, n, 'no API call without a filter');

    const mon = await client.callTool({ name: 'start_monitor', arguments: { name: 'leica-watch', keywords: ['Leica'], alertWebhookUrl: 'https://hooks.slack.com/services/x' } });
    assert.ok(!mon.isError, mon.content[0].text);
    const m = parse(mon);
    assert.equal(m.taskId, 'TASK1'); assert.equal(m.scheduleId, 'SCHED1'); assert.equal(m.firstRunId, 'RUN1');
    const task = calls.find((c) => c.path === '/v2/actor-tasks');
    assert.equal(task.body.actId, 'keiya_dev~japan-used-camera-market');
    assert.deepEqual(task.body.input, { mode: 'monitor', monitorId: 'leica-watch', keywords: ['Leica'], alertWebhookUrl: 'https://hooks.slack.com/services/x' });
    const sched = calls.find((c) => c.path === '/v2/schedules');
    assert.equal(sched.body.cronExpression, '0 * * * *'); assert.equal(sched.body.actions[0].actorTaskId, 'TASK1');
}

test('stdio transport: 4 tools, correct Actor input, token from APIFY_TOKEN', { timeout: 30_000 }, async () => {
    const api = await fakeApify();
    const client = new Client({ name: 'test', version: '1' });
    try {
        await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN], env: { ...process.env, APIFY_TOKEN: 'tok-stdio', APIFY_API_BASE_URL: api.base } }));
        await exercise(client, api.calls, 'Bearer tok-stdio');
    } finally { await client.close(); api.server.close(); }
});

test('stdio transport without APIFY_TOKEN returns a helpful tool error', { timeout: 30_000 }, async () => {
    const env = { ...process.env }; delete env.APIFY_TOKEN;
    const client = new Client({ name: 'test', version: '1' });
    try {
        await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN], env }));
        const r = await client.callTool({ name: 'search_listings', arguments: { keywords: ['Leica'] } });
        assert.equal(r.isError, true);
        assert.match(r.content[0].text, /APIFY_TOKEN is not set/);
    } finally { await client.close(); }
});

test('HTTP transport: per-request Bearer token is forwarded to Apify', { timeout: 30_000 }, async () => {
    const api = await fakeApify();
    const port = 39000 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, [BIN, '--http', '--port', String(port)], { env: { ...process.env, APIFY_TOKEN: '', APIFY_API_BASE_URL: api.base } });
    await new Promise((resolve) => child.stderr.on('data', (d) => { if (/listening/.test(String(d))) resolve(); }));
    const client = new Client({ name: 'test', version: '1' });
    try {
        const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
        assert.equal(health.ok, true);
        await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { Authorization: 'Bearer tok-http' } } }));
        await exercise(client, api.calls, 'Bearer tok-http');
    } finally { await client.close(); child.kill(); api.server.close(); }
});
