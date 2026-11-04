# @keiya-dev/japan-used-camera-mcp → renamed

This package is now **[@keiya-dev/japan-used-market-mcp](https://www.npmjs.com/package/@keiya-dev/japan-used-market-mcp)**, which covers used **cameras and watches** in Japan.

Existing configs keep working: `npx -y @keiya-dev/japan-used-camera-mcp` starts the new server. Tool calls without `market` behave exactly as in 0.2.0 (camera shops).

To switch, replace the package name in your MCP config:

```json
"args": ["-y", "@keiya-dev/japan-used-market-mcp"]
```

Source: https://github.com/Enu27/japan-used-market-mcp
