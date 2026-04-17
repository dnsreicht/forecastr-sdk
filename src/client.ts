/**
 * ForecastrClient — trustless AI inference with on-chain SLA settlement.
 *
 * Usage:
 *   const client = new ForecastrClient({
 *     rpcUrl:          "https://mainnet.base.org",
 *     privateKey:      process.env.AGENT_KEY as `0x${string}`,
 *     contractAddress: "0xDc3eBf3cC1542180F6d9d89aeF8A5768b0BcB936",
 *     apiKey:          process.env.FORECASTR_API_KEY,
 *   });
 *
 *   const result = await client.forecast({
 *     asset:   "aave",
 *     horizon: 7,
 *     values:  [...],
 *     escrow:  "0.10",
 *   });
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  getContract,
  type WalletClient,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { forecastrInputHash, forecastrOutputHash, HASH_ANCHORS } from "./hashing.js";

// ── ABI ────────────────────────────────────────────────────────────────────

const FORECASTR_SLA_ABI = [
  {
    inputs: [
      { name: "escrow",          type: "uint256" },
      { name: "input_hash",      type: "bytes32" },
      { name: "model_hash",      type: "bytes32" },
      { name: "deadline_offset", type: "uint256" },
    ],
    name: "createSLA",
    outputs: [{ name: "id", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "id",          type: "uint256" },
      { name: "output_hash", type: "bytes32" },
    ],
    name: "confirmOutput",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "id", type: "uint256" }],
    name: "getSLA",
    outputs: [{ components: [
      { name: "client",           type: "address" },
      { name: "status",           type: "uint8"   },
      { name: "escrow",           type: "uint256" },
      { name: "input_hash",       type: "bytes32" },
      { name: "model_hash",       type: "bytes32" },
      { name: "committed_output", type: "bytes32" },
      { name: "deadline",         type: "uint256" },
      { name: "committed_at",     type: "uint256" },
      { name: "challenge_end",    type: "uint256" },
    ], type: "tuple" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "id", type: "uint256" }],
    name: "getStatus",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "id", type: "uint256" }],
    name: "cancelSLA",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "deadline_offset", type: "uint256" }],
    name: "minEscrow",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const USDC_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const USDC_ADDRESS: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ForecastrClientConfig {
  rpcUrl:          string;
  privateKey:      `0x${string}`;
  contractAddress: Address;
  apiUrl?:         string;
  apiKey?:         string;
}

export interface ForecastParams {
  asset:   string;
  horizon: number;
  values:  number[];
  escrow:  string;           // USDC amount e.g. "0.10"
  deadlineSeconds?: number;  // default 3600
}

export interface ForecastResult {
  slaId:            bigint;
  jobId:            string;
  asset:            string;
  horizon:          number;
  pointForecast:    number[];
  quantileForecast: number[][];
  resultHash:       string;
  inputHash:        string;
  outputHash:       string;
  modelVersion:     string;
  latencyMs:        number;
  regimeFlag:       string;
  warnings:         string[];
  verified:         boolean;
}

// ── Client ─────────────────────────────────────────────────────────────────

export class ForecastrClient {
  private wallet: WalletClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private public: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private contract: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private usdc: any;
  private config: ForecastrClientConfig;

  constructor(config: ForecastrClientConfig) {
    this.config = config;
    const account = privateKeyToAccount(config.privateKey);

    this.wallet = createWalletClient({
      account,
      chain: base,
      transport: http(config.rpcUrl),
    });

    this.public = createPublicClient({
      chain: base,
      transport: http(config.rpcUrl),
    });

    this.contract = getContract({
      address: config.contractAddress,
      abi: FORECASTR_SLA_ABI,
      client: { public: this.public, wallet: this.wallet },
    });

    this.usdc = getContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      client: { public: this.public, wallet: this.wallet },
    });
  }

  async forecast(params: ForecastParams): Promise<ForecastResult> {
    const account = privateKeyToAccount(this.config.privateKey);
    const escrowUnits = parseUnits(params.escrow, USDC_DECIMALS);
    const deadline = BigInt(params.deadlineSeconds ?? 3600);

    // 1. Compute input hash
    const payload = new TextEncoder().encode(
      JSON.stringify({ asset: params.asset, horizon: params.horizon, values: params.values })
    );
    const inputHash = forecastrInputHash("/forecast", payload);
    const modelHash = forecastrInputHash("/model", new TextEncoder().encode("timesfm-2.5-200m"));

    // 2. Approve USDC
    await this.usdc.write.approve([this.config.contractAddress, escrowUnits]);

    // 3. Create SLA on-chain
    const slaId = await this.contract.write.createSLA([
      escrowUnits,
      inputHash as `0x${string}`,
      modelHash as `0x${string}`,
      deadline,
    ]);

    // Wait for SLA to be confirmed
    await new Promise(r => setTimeout(r, 3000));

    // Get actual SLA ID from nextId - 1
    const nextId = await this.public.readContract({
      address: this.config.contractAddress,
      abi: [{ inputs: [], name: "nextId", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" }],
      functionName: "nextId",
    }) as bigint;
    const actualSlaId = nextId - 1n;

    // 4. Call Forecastr API
    const apiUrl = this.config.apiUrl ?? "https://api.forecastr.dev";
    const response = await fetch(`${apiUrl}/agent/forecast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
      },
      body: JSON.stringify({
        sla_id:  Number(actualSlaId),
        asset:   params.asset,
        horizon: params.horizon,
        values:  params.values,
      }),
    });

    if (!response.ok) {
      throw new Error(`Forecastr API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();

    // 5. Verify output locally
    const outputBytes = new TextEncoder().encode(
      JSON.stringify({ point_forecast: data.point_forecast, asset: params.asset, horizon: params.horizon })
    );
    const localOutputHash = forecastrOutputHash(outputBytes);
    const verified = localOutputHash.toLowerCase() === (`0x${data.output_hash}`).toLowerCase()
      || data.output_hash === localOutputHash;

    // 6. Confirm on-chain
    const resultHashBytes = data.result_hash.startsWith("0x")
      ? data.result_hash as `0x${string}`
      : `0x${data.result_hash}` as `0x${string}`;

    await this.contract.write.confirmOutput([actualSlaId, resultHashBytes]);

    return {
      slaId:            actualSlaId,
      jobId:            data.job_id,
      asset:            data.asset,
      horizon:          data.horizon,
      pointForecast:    data.point_forecast,
      quantileForecast: data.quantile_forecast,
      resultHash:       data.result_hash,
      inputHash:        data.input_hash,
      outputHash:       data.output_hash,
      modelVersion:     data.model_version,
      latencyMs:        data.latency_ms,
      regimeFlag:       data.regime_flag,
      warnings:         data.warnings,
      verified,
    };
  }

  async getSLAStatus(slaId: bigint): Promise<number> {
    return await this.public.readContract({
      address: this.config.contractAddress,
      abi: FORECASTR_SLA_ABI,
      functionName: "getStatus",
      args: [slaId],
    }) as number;
  }
}
