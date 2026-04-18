# @forecastrdev/sdk

TypeScript SDK for verifiable AI forecast proofs on Base Mainnet.

Bring your own model. Forecastr anchors the proof — RFC 3161 timestamp + on-chain registry.
No escrow. No subscription. Gas only.

## Install

```bash
npm install @forecastrdev/sdk viem
```

## Use cases

### 1. BYOM — Submit your own model output for proof

Run inference with any model. Submit the output hash. Forecastr commits it on-chain with an RFC 3161 timestamp.

```typescript
import { ForecastrClient } from "@forecastrdev/sdk";

const client = new ForecastrClient({
  apiKey:     process.env.FORECASTR_API_KEY,
  // Optional: provide wallet to also register on-chain
  rpcUrl:     "https://mainnet.base.org",
  privateKey: process.env.AGENT_KEY as `0x${string}`,
});

const result = await client.submitProof({
  asset:          "brent-crude",
  horizon:        7,
  pointForecast:  [82.1, 82.4, 82.8, 83.1, 83.0, 82.7, 82.5],
  contextHash:    "sha256-of-your-input-data",
  registerOnChain: true,
  dueTimestamp:   Math.floor(Date.now() / 1000) + 7 * 86400,
});

console.log(result.resultHash);     // SHA-256 of your output
console.log(result.verifyUrl);      // forecastr.dev/verify/hash/...
console.log(result.onChainTxHash);  // Base Mainnet tx
```

### 2. Managed inference — TimesFM / Chronos with automatic proof

```typescript
const result = await client.forecast({
  asset:   "aave",
  horizon: 7,
  values:  [...],
  registerOnChain: true,
  dueTimestamp:    Math.floor(Date.now() / 1000) + 7 * 86400,
});

console.log(result.pointForecast);
console.log(result.verifyUrl);
console.log(result.onChainTxHash);
```

### 3. Batch registration (Pro tier)

```typescript
const txHash = await client.registerProofBatch([
  { resultHash: "abc123...", dueTimestamp: 1800000000 },
  { resultHash: "def456...", dueTimestamp: 1800086400 },
]);
```

### 4. Verify on-chain

```typescript
const isRegistered = await client.isRegistered("abc123...");
const proof = await client.getOnChainProof("abc123...");
console.log(proof.registrant, proof.registeredAt, proof.dueTimestamp);
```

## Proof Contract

| | |
|---|---|
| Network | Base Mainnet (8453) |
| Address | `0x6b9056EcE5D4C267d8d8959ce3A16f72C8933631` |
| Fee | None — gas only |
| Admin | None — immutable |
| Batch size | 50 max |
| Max horizon | 5 years |

[View on Basescan](https://basescan.org/address/0x6b9056EcE5D4C267d8d8959ce3A16f72C8933631)

## API Key

Free tier: 50 requests/day — [forecastr.dev](https://forecastr.dev)

## License

MIT