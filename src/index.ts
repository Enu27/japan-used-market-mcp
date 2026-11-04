#!/usr/bin/env node
/**
 * japan-used-camera-mcp
 *
 *   stdio (Claude Desktop, Cursor, …):   APIFY_TOKEN=... npx -y @keiya-dev/japan-used-camera-mcp
 *   Streamable HTTP:                      APIFY_TOKEN=... npx -y @keiya-dev/japan-used-camera-mcp --http [--port 3000]
 *
 * In HTTP mode each request may carry its own token as `Authorization: Bearer <APIFY_TOKEN>`;
 * otherwise the server's APIFY_TOKEN is used. Stateless: one server instance per request.
 */
import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApifyClient } from './apify.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

if (flag('help') || flag('h')) {
    console.log(`${SERVER_NAME} MCP server ${SERVER_VERSION}

Usage:
  japan-used-camera-mcp              stdio transport (default)
  japan-used-camera-mcp --http       Streamable HTTP on /mcp (port: --port, $PORT or 3000)

Environment:
  APIFY_TOKEN   your Apify API token (required for stdio; optional default for HTTP)`);
    process.exit(0);
}

const readBody = (req: IncomingMessage) => new Promise<unknown>((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : undefined); } catch (e) { reject(e); } });
    req.on('error', reject);
});

if (flag('http')) {
    const port = Number(value('port') || process.env.PORT || 3000);
    const http = createHttpServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, name: SERVER_NAME, version: SERVER_VERSION })); return; }
        if (url.pathname !== '/mcp') { res.writeHead(404).end('Not found'); return; }
        if (req.method !== 'POST') {
            res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' })
                .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless server: POST only).' }, id: null }));
            return;
        }
        const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
        const token = bearer || process.env.APIFY_TOKEN || '';
        try {
            const body = await readBody(req);
            const server = createServer(() => new ApifyClient({ token }));
            const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
            res.on('close', () => { transport.close(); server.close(); });
            await server.connect(transport);
            await transport.handleRequest(req, res, body);
        } catch (e) {
            if (!res.headersSent) {
                res.writeHead(400, { 'content-type': 'application/json' })
                    .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: `Bad request: ${(e as Error).message}` }, id: null }));
            }
        }
    });
    http.listen(port, () => console.error(`${SERVER_NAME} MCP (Streamable HTTP) listening on http://localhost:${port}/mcp`));
} else {
    const server = createServer(() => new ApifyClient({ token: process.env.APIFY_TOKEN || '' }));
    await server.connect(new StdioServerTransport());
    console.error(`${SERVER_NAME} MCP (stdio) ready`);
}
