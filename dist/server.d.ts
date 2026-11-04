import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApifyClient } from './apify.js';
export declare const SERVER_NAME = "japan-used-camera-market";
export declare const SERVER_VERSION = "0.1.0";
/** Build an MCP server whose tools call the Actor with the given Apify token. */
export declare function createServer(getClient: () => ApifyClient): McpServer;
