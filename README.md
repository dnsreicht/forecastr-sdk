# @forecastrdev/sdk

TypeScript SDK for trustless AI inference with on-chain SLA settlement on Base Mainnet.

## How it works

1. Agent locks USDC escrow on-chain via `ForecastrSLA`
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
  contractAddress: "0xDc3eBf3cC1542180F6d9d89aeF8A5768b0BcB936",
  apiKey:          process.env.FORECASTR_API_KEY,
});

const result = await client.forecast({
  asset:   "aave",
  horizon: 7,
  values:  [...],
  escrow:  "0.057",
});

console.log(result.pointForecast);
console.log(result.verified);
console.log(result.slaId);
```

## Contract

| | |
|---|---|
| Network | Base Mainnet (8453) |
| Address | `0xDc3eBf3cC1542180F6d9d89aeF8A5768b0BcB936` |
| Token | USDC |
| Min escrow | 0.057 USDC (7d) · 0.080 USDC (30d) · 0.306 USDC (256d) |
| Pricing | 0.05 USDC base + 0.001 USDC/day |
| Challenge window | 6 hours |
| Settlement | Automatic, permissionless |

[View on Basescan](https://basescan.org/address/0xDc3eBf3cC1542180F6d9d89aeF8A5768b0BcB936)

## License

MIT
