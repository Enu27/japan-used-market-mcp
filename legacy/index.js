#!/usr/bin/env node
// @keiya-dev/japan-used-camera-mcp → renamed to @keiya-dev/japan-used-market-mcp.
// stdout carries the MCP protocol in stdio mode, so the notice goes to stderr.
if (!process.argv.includes('--help')) console.error('[japan-used-camera-mcp] renamed to @keiya-dev/japan-used-market-mcp — update your config when convenient; this one keeps working.');
await import('@keiya-dev/japan-used-market-mcp/cli');
