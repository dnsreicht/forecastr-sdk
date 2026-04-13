# @forecastr/sdk

TypeScript SDK for trustless AI inference with on-chain SLA settlement on Base Mainnet.

## How it works

1. Agent locks USDC escrow on-chain via `ForecastrSLAv2`
2. Forecastr runs inference, commits output hash on-chain
3. Agent verifies hash locally, confirms on-chain
4. After 6h challenge window, escrow releases to Forecastr automatically

No subscription. No invoice. Pay per inference settled.

## Install

```bash
npm install @forecastrdev/sdk viem
```

## Usage

```typescript
import { ForecastrClient } from "@forecastrdev/sdk";

const client = new ForecastrClient({
  rpcUrl:          "https://mainnet.base.org",
  privateKey:      process.env.AGENT_KEY as `0x${string}`,
  contractAddress: "0xc7c57875e96E86A741593c51195D7912972Fe655",
  apiKey:          process.env.FORECASTR_API_KEY,
});

const result = await client.forecast({
  asset:   "aave",      // DeFi TVL asset
  horizon: 7,           // days
  values:  [...],       // min 32 historical data points
  escrow:  "0.10",      // USDC
});

console.log(result.pointForecast); // [131.8, 132.9, ...]
console.log(result.verified);      // true — hash verified locally
console.log(result.slaId);         // on-chain SLA ID
```

## Contract

| | |
|---|---|
| Network | Base Mainnet (8453) |
| Address | `0xc7c57875e96E86A741593c51195D7912972Fe655` |
| Token | USDC |
| Min escrow | 0.01 USDC |
| Challenge window | 6 hours |
| Settlement | Automatic, permissionless |

[View on Basescan →](https://basescan.org/address/0xc7c57875e96E86A741593c51195D7912972Fe655)

## Hash verification

Python and TypeScript produce identical hashes — cross-language verified:

```typescript
import { forecastrInputHash, forecastrOutputHash } from "@forecastrdev/sdk";

// Verified against Python backend:
// forecastrInputHash("/forecast", payload)
//   → 8d289c8dc0097c1462ecd56612688df1566c0d68ff33b2130d13237c45cb777b
// forecastrOutputHash(new TextEncoder().encode("test"))
//   → 9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658
```

## License

MIT
