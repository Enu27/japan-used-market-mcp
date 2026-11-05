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
            if (req.url.startsWith('/v2/acts/keiya_dev~japan-used-watch-market/run-sync-get-dataset-items')) {
                if (call.body.mode === 'search') return json(201, [{ source: 'watchnian', title: 'グランドセイコー SBGA211', brand: 'Grand Seiko', model: 'grand seiko sbga211', ref: 'SBGA211', gender: 'men', conditionGrade: 'SA', conditionGradeRaw: 'SA', accessories: { box: true, warrantyCard: true, summary: 'box + warranty card', raw: '箱・保証書' }, priceJpy: 650000, priceUsd: 4250, inStock: true, url: 'https://example/w1', scrapedAt: 'x', fxJpyPerUsd: 153 }]);
                return json(201, [{ model: 'grand seiko sbga211', count: 1, medianJpy: 650000 }]);
            }
            if (req.url.startsWith('/v2/acts/keiya_dev~japan-used-instrument-market/run-sync-get-dataset-items')) {
                return json(201, [{ source: 'offmall', title: 'JB62-58 (エレキベース)', brand: 'Fender Japan', brandRaw: 'FENDER JAPAN', model: 'fender japan jb62-58', ref: 'JB62-58', instrumentType: 'bass', madeIn: 'Japan', madeInSource: 'brand', year: 2002, yearFrom: 2002, yearTo: 2002, era: '2000s', conditionGrade: 'VERY_GOOD', conditionGradeRaw: 'B', reverbCondition: 'Very Good', accessories: { caseType: 'soft', originalCase: false, summary: 'soft case', raw: 'ソフトケース' }, shop: 'ハードオフ東大阪若江店', priceJpy: 88000, priceUsd: 555.94, inStock: true, url: 'https://example/i1', scrapedAt: 'x', fxJpyPerUsd: 158 }]);
            }
            if (req.url.startsWith('/v2/acts/keiya_dev~japan-used-model-train-market/run-sync-get-dataset-items')) {
                return json(201, [{ source: 'offmall', title: '10-1332 (285系0番台〈サンライズエクスプレス〉7両セット)', brand: 'KATO', brandJa: 'カトー', model: 'kato 10-1332', productCode: '10-1332', productCodeSource: 'title', ref: '10-1332', scale: 'N', scaleRatio: null, setType: 'set', motorized: true, accessories: { case: true, manual: null, sleeve: null, note: '付属品 付属品あり ケースキズやスレあり' }, lotYear: null, shop: 'ホビーオフ多摩和田店', conditionGrade: 'VERY_GOOD', conditionGradeRaw: 'B', priceJpy: 19800, priceUsd: 125.12, inStock: true, url: 'https://example/t1', scrapedAt: 'x', fxJpyPerUsd: 158 }]);
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
    assert.deepEqual(tools.map((t) => t.name).sort(), ['list_markets', 'price_history', 'price_stats', 'search_listings', 'start_monitor']);

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
    assert.equal(task.body.name, 'jucm-monitor-leica-watch', '0.2.0 task name for camera');
    const sched = calls.find((c) => c.path === '/v2/schedules');
    assert.equal(sched.body.cronExpression, '0 * * * *'); assert.equal(sched.body.actions[0].actorTaskId, 'TASK1');
}

const lastRunSync = (calls) => calls.findLast((c) => c.path.includes('run-sync'));

async function exerciseWatch(client, calls) {
    const lm = await client.callTool({ name: 'list_markets', arguments: {} });
    const markets = parse(lm);
    assert.deepEqual(markets.map((m) => m.market), ['camera', 'watch', 'instrument', 'model-train']);
    assert.deepEqual(Object.keys(markets[3].shops), ['pochi', 'offmall']);
    assert.equal(markets[3].grades.at(-1), 'CUSTOM');
    assert.deepEqual(Object.keys(markets[1].shops), ['watchnian', 'rasin', 'jackroad', 'offmall']);
    assert.deepEqual(Object.keys(markets[2].shops), ['shimokura', 'jguitar', 'ishibashi', 'shimamura', 'ikebe', 'offmall']);
    assert.equal(markets[2].grades[0], 'BRAND_NEW');

    const search = await client.callTool({ name: 'search_listings', arguments: { market: 'watch', keywords: ['SBGA211'], sources: ['watchnian'], grades: ['SA', 'A'] } });
    assert.ok(!search.isError, search.content[0].text);
    assert.deepEqual(parse(search)[0], { shop: 'watchnian', title: 'グランドセイコー SBGA211', brand: 'Grand Seiko', model: 'grand seiko sbga211', grade: 'SA', gradeRaw: 'SA', priceJpy: 650000, priceUsd: 4250, inStock: true, ref: 'SBGA211', gender: 'men', accessories: 'box + warranty card', url: 'https://example/w1' });
    const sent = lastRunSync(calls);
    assert.match(sent.path, /^\/v2\/acts\/keiya_dev~japan-used-watch-market\//);
    assert.deepEqual(sent.body, { mode: 'search', keywords: ['SBGA211'], sources: ['watchnian'], grades: ['SA', 'A'], maxItems: 20 }, '"market" is not sent to the Actor');

    const stats = await client.callTool({ name: 'price_stats', arguments: { market: 'watch', brands: ['Grand Seiko'] } });
    assert.ok(!stats.isError); assert.match(lastRunSync(calls).path, /japan-used-watch-market/);

    // Shop / grade that belong to the other market: helpful error, no API call.
    const n = calls.length;
    const wrongShop = await client.callTool({ name: 'search_listings', arguments: { market: 'watch', sources: ['fujiya'] } });
    assert.equal(wrongShop.isError, true);
    assert.match(wrongShop.content[0].text, /fujiya is not a shop of the watch market\. Its shops are: watchnian, rasin, jackroad, offmall\. Did you mean market: "camera"\?/);
    const wrongShop2 = await client.callTool({ name: 'price_stats', arguments: { sources: ['watchnian'] } });
    assert.match(wrongShop2.content[0].text, /not a shop of the camera market.*Did you mean market: "watch"/);
    const wrongGrade = await client.callTool({ name: 'price_history', arguments: { market: 'camera', grades: ['SA'], keywords: ['Leica'] } });
    assert.equal(wrongGrade.isError, true);
    assert.match(wrongGrade.content[0].text, /SA is not a grade of the camera market\. Its grades are: NEW, A, AB\+/);
    const wrongMon = await client.callTool({ name: 'start_monitor', arguments: { market: 'watch', name: 'gs-x', grades: ['AB+'] } });
    assert.equal(wrongMon.isError, true);
    const badMarket = await client.callTool({ name: 'search_listings', arguments: { market: 'bikes' } });
    assert.equal(badMarket.isError, true);
    assert.equal(calls.length, n, 'no API call for invalid arguments');

    // Instrument market: Actor id, instrument fields kept, market not sent, wrong shop rejected.
    const ins = await client.callTool({ name: 'search_listings', arguments: { market: 'instrument', keywords: ['Fender Japan'], grades: ['VERY_GOOD'] } });
    assert.ok(!ins.isError, ins.content[0].text);
    assert.deepEqual(parse(ins)[0], { shop: 'offmall', title: 'JB62-58 (エレキベース)', brand: 'Fender Japan', model: 'fender japan jb62-58', grade: 'VERY_GOOD', gradeRaw: 'B', priceJpy: 88000, priceUsd: 555.94, inStock: true, ref: 'JB62-58', type: 'bass', madeIn: 'Japan', year: 2002, era: '2000s', case: 'soft case', reverbCondition: 'Very Good', store: 'ハードオフ東大阪若江店', url: 'https://example/i1' });
    const sentI = lastRunSync(calls);
    assert.match(sentI.path, /^\/v2\/acts\/keiya_dev~japan-used-instrument-market\//);
    assert.deepEqual(sentI.body, { mode: 'search', keywords: ['Fender Japan'], grades: ['VERY_GOOD'], maxItems: 20 });
    const m = calls.length;
    const wrongInsShop = await client.callTool({ name: 'search_listings', arguments: { market: 'instrument', sources: ['watchnian'] } });
    assert.equal(wrongInsShop.isError, true);
    assert.match(wrongInsShop.content[0].text, /watchnian is not a shop of the instrument market\. Its shops are: shimokura, jguitar, ishibashi, shimamura, ikebe, offmall\. Did you mean market: "watch"\?/);
    const wrongInsGrade = await client.callTool({ name: 'search_listings', arguments: { market: 'instrument', grades: ['AB'] } });
    assert.match(wrongInsGrade.content[0].text, /AB is not a grade of the instrument market/);
    assert.equal(calls.length, m, 'no API call for invalid instrument arguments');

    // Model-train market: Actor id, train fields kept (accessories reduced to the stated facts), wrong shop rejected.
    const tr = await client.callTool({ name: 'search_listings', arguments: { market: 'model-train', keywords: ['KATO'], sources: ['offmall'] } });
    assert.ok(!tr.isError, tr.content[0].text);
    assert.deepEqual(parse(tr)[0], { shop: 'offmall', title: '10-1332 (285系0番台〈サンライズエクスプレス〉7両セット)', brand: 'KATO', model: 'kato 10-1332', grade: 'VERY_GOOD', gradeRaw: 'B', priceJpy: 19800, priceUsd: 125.12, inStock: true, productCode: '10-1332', scale: 'N', setType: 'set', motorized: true, accessories: { case: true }, store: 'ホビーオフ多摩和田店', url: 'https://example/t1' });
    const sentT = lastRunSync(calls);
    assert.match(sentT.path, /^\/v2\/acts\/keiya_dev~japan-used-model-train-market\//);
    assert.deepEqual(sentT.body, { mode: 'search', keywords: ['KATO'], sources: ['offmall'], maxItems: 20 });
    const t = calls.length;
    const wrongTrShop = await client.callTool({ name: 'search_listings', arguments: { market: 'model-train', sources: ['shimokura'] } });
    assert.equal(wrongTrShop.isError, true);
    assert.match(wrongTrShop.content[0].text, /shimokura is not a shop of the model-train market\. Its shops are: pochi, offmall\. Did you mean market: "instrument"\?/);
    assert.equal(calls.length, t, 'no API call for invalid model-train arguments');

    const mon = await client.callTool({ name: 'start_monitor', arguments: { market: 'watch', name: 'gs-sbga211', keywords: ['SBGA211'] } });
    assert.ok(!mon.isError, mon.content[0].text);
    assert.equal(parse(mon).market, 'watch');
    const task = calls.findLast((c) => c.path === '/v2/actor-tasks');
    assert.equal(task.body.actId, 'keiya_dev~japan-used-watch-market');
    assert.equal(task.body.name, 'juwm-monitor-gs-sbga211');
    assert.deepEqual(task.body.input, { mode: 'monitor', monitorId: 'gs-sbga211', keywords: ['SBGA211'] });
}

test('stdio transport: 5 tools, camera default unchanged, watch market, correct Actor input, token from APIFY_TOKEN', { timeout: 30_000 }, async () => {
    const api = await fakeApify();
    const client = new Client({ name: 'test', version: '1' });
    try {
        await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN], env: { ...process.env, APIFY_TOKEN: 'tok-stdio', APIFY_API_BASE_URL: api.base } }));
        await exercise(client, api.calls, 'Bearer tok-stdio');
        await exerciseWatch(client, api.calls);
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
        await exerciseWatch(client, api.calls);
    } finally { await client.close(); child.kill(); api.server.close(); }
});
