/**
 * ForecastrClient — verifiable AI forecast proofs on Base Mainnet.
 *
 * Two use cases:
 *
 * 1. BYOM (Bring Your Own Model):
 *    Submit your own model output for RFC 3161 + on-chain proof.
 *    const result = await client.submitProof({ ... });
 *
 * 2. Managed Inference:
 *    Run TimesFM/Chronos inference via Forecastr API with automatic proof.
 *    const result = await client.forecast({ ... });
 *
 * On-chain registry: ForecastrProof on Base Mainnet
 * Contract: 0x6b9056EcE5D4C267d8d8959ce3A16f72C8933631
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  getContract,
  type WalletClient,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { forecastrInputHash, forecastrOutputHash, HASH_ANCHORS } from "./hashing.js";

// ── ABI ────────────────────────────────────────────────────────────────────

const FORECASTR_PROOF_ABI = [
  {
    inputs: [
      { name: "result_hash",   type: "bytes32" },
      { name: "due_timestamp", type: "uint256" },
    ],
    name: "registerProof",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "result_hashes",  type: "bytes32[]" },
      { name: "due_timestamps", type: "uint256[]" },
    ],
    name: "registerProofBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "result_hash", type: "bytes32" }],
    name: "isRegistered",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "result_hash", type: "bytes32" }],
    name: "getProof",
    outputs: [
      { name: "registrant",    type: "address" },
      { name: "registered_at", type: "uint256" },
      { name: "due_timestamp", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MAX_FUTURE_SECONDS",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MAX_BATCH_SIZE",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Default contract address ───────────────────────────────────────────────

export const FORECASTR_PROOF_ADDRESS: Address =
  "0x6b9056EcE5D4C267d8d8959ce3A16f72C8933631";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ForecastrClientConfig {
  apiKey:           string;
  /** Optional: provide to enable on-chain registration via registerProof */
  rpcUrl?:          string;
  privateKey?:      `0x${string}`;
  /** Defaults to FORECASTR_PROOF_ADDRESS */
  contractAddress?: Address;
  apiUrl?:          string;
}

/** Submit your own model output for proof */
export interface SubmitProofParams {
  asset:          string;
  horizon:        number;
  pointForecast:  number[];
  modelId?:       string;
  contextHash:    string;   // SHA-256 hex of your input data
  /** If true and wallet configured, also registers on-chain */
  registerOnChain?: boolean;
  dueTimestamp?:  number;   // Unix timestamp, required if registerOnChain=true
}

export interface SubmitProofResult {
  resultHash:     string;
  inputHash:      string;
  rfcTimestamp:   string;
  verifyUrl:      string;
  onChainTxHash?: string;
  registered:     boolean;
}

/** Run Forecastr managed inference */
export interface ForecastParams {
  asset:   string;
  horizon: number;
  values:  number[];
  /** If true and wallet configured, also registers on-chain */
  registerOnChain?: boolean;
  dueTimestamp?:    number;
}

export interface ForecastResult {
  jobId:            string;
  asset:            string;
  horizon:          number;
  pointForecast:    number[];
  quantileForecast: number[][];
  resultHash:       string;
  inputHash:        string;
  modelVersion:     string;
  latencyMs:        number;
  regimeFlag:       string;
  warnings:         string[];
  verifyUrl:        string;
  onChainTxHash?:   string;
  registered:       boolean;
}

// ── Client ─────────────────────────────────────────────────────────────────

export class ForecastrClient {
  private config: ForecastrClientConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private wallet?: WalletClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private contract?: any;

  constructor(config: ForecastrClientConfig) {
    this.config = config;

    if (config.rpcUrl && config.privateKey) {
      const account = privateKeyToAccount(config.privateKey);
      this.wallet = createWalletClient({
        account,
        chain: base,
        transport: http(config.rpcUrl),
      });
      this.publicClient = createPublicClient({
        chain: base,
        transport: http(config.rpcUrl),
      });
      this.contract = getContract({
        address: config.contractAddress ?? FORECASTR_PROOF_ADDRESS,
        abi: FORECASTR_PROOF_ABI,
        client: { public: this.publicClient, wallet: this.wallet },
      });
    }
  }

  private get apiUrl(): string {
    return this.config.apiUrl ?? "https://api.forecastr.dev";
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-API-Key": this.config.apiKey,
    };
  }

  /**
   * Submit your own model output for RFC 3161 + optional on-chain proof.
   * This is the BYOM (Bring Your Own Model) path.
   */
  async submitProof(params: SubmitProofParams): Promise<SubmitProofResult> {
    const response = await fetch(`${this.apiUrl}/submit-output`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        asset:          params.asset,
        horizon:        params.horizon,
        point_forecast: params.pointForecast,
        payload_type:   "forecast",
        model_id:       params.modelId ?? "custom",
        context_hash:   params.contextHash,
      }),
    });

    if (!response.ok) {
      throw new Error(`Forecastr API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    let onChainTxHash: string | undefined;

    if (params.registerOnChain && this.contract) {
      if (!params.dueTimestamp) {
        throw new Error("dueTimestamp required for on-chain registration");
      }
      const resultHashBytes = data.result_hash.startsWith("0x")
        ? data.result_hash as `0x${string}`
        : `0x${data.result_hash}` as `0x${string}`;

      onChainTxHash = await this.contract.write.registerProof([
        resultHashBytes,
        BigInt(params.dueTimestamp),
      ]);
    }

    return {
      resultHash:   data.result_hash,
      inputHash:    data.input_hash,
      rfcTimestamp: data.rfc_timestamp ?? "",
      verifyUrl:    data.verify_url ?? `${this.apiUrl}/verify/hash/${data.result_hash}`,
      onChainTxHash,
      registered:   !!onChainTxHash,
    };
  }

  /**
   * Run Forecastr managed inference (TimesFM / Chronos) with automatic proof.
   */
  async forecast(params: ForecastParams): Promise<ForecastResult> {
    const response = await fetch(`${this.apiUrl}/forecast`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        asset:   params.asset,
        horizon: params.horizon,
        values:  params.values,
      }),
    });

    if (!response.ok) {
      throw new Error(`Forecastr API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    let onChainTxHash: string | undefined;

    if (params.registerOnChain && this.contract) {
      if (!params.dueTimestamp) {
        throw new Error("dueTimestamp required for on-chain registration");
      }
      const resultHashBytes = data.result_hash.startsWith("0x")
        ? data.result_hash as `0x${string}`
        : `0x${data.result_hash}` as `0x${string}`;

      onChainTxHash = await this.contract.write.registerProof([
        resultHashBytes,
        BigInt(params.dueTimestamp),
      ]);
    }

    return {
      jobId:            data.job_id,
      asset:            data.asset,
      horizon:          data.horizon,
      pointForecast:    data.point_forecast,
      quantileForecast: data.quantile_forecast,
      resultHash:       data.result_hash,
      inputHash:        data.input_hash,
      modelVersion:     data.model_version,
      latencyMs:        data.latency_ms,
      regimeFlag:       data.regime_flag,
      warnings:         data.warnings,
      verifyUrl:        data.verify_url ?? `${this.apiUrl}/verify/hash/${data.result_hash}`,
      onChainTxHash,
      registered:       !!onChainTxHash,
    };
  }

  /**
   * Register multiple hashes on-chain in a single transaction (Pro tier).
   * Requires wallet configuration.
   */
  async registerProofBatch(
    entries: Array<{ resultHash: string; dueTimestamp: number }>
  ): Promise<string> {
    if (!this.contract) {
      throw new Error("Wallet not configured — provide rpcUrl and privateKey");
    }

    const hashes = entries.map(e =>
      (e.resultHash.startsWith("0x") ? e.resultHash : `0x${e.resultHash}`) as `0x${string}`
    );
    const timestamps = entries.map(e => BigInt(e.dueTimestamp));

    return await this.contract.write.registerProofBatch([hashes, timestamps]);
  }

  /**
   * Check if a hash is registered on-chain.
   */
  async isRegistered(resultHash: string): Promise<boolean> {
    if (!this.publicClient) {
      throw new Error("Wallet not configured — provide rpcUrl");
    }
    const h = (resultHash.startsWith("0x") ? resultHash : `0x${resultHash}`) as `0x${string}`;
    return await this.contract.read.isRegistered([h]);
  }

  /**
   * Get on-chain proof data for a hash.
   */
  async getOnChainProof(resultHash: string): Promise<{
    registrant: string;
    registeredAt: number;
    dueTimestamp: number;
  }> {
    if (!this.publicClient) {
      throw new Error("Wallet not configured — provide rpcUrl");
    }
    const h = (resultHash.startsWith("0x") ? resultHash : `0x${resultHash}`) as `0x${string}`;
    const [registrant, registered_at, due_timestamp] = await this.contract.read.getProof([h]);
    return {
      registrant,
      registeredAt: Number(registered_at),
      dueTimestamp: Number(due_timestamp),
    };
  }

  /**
   * Verify a forecast hash via Forecastr API.
   */
  async verify(resultHash: string): Promise<unknown> {
    const response = await fetch(`${this.apiUrl}/verify/hash/${resultHash}`, {
      headers: this.headers,
    });
    if (!response.ok) {
      throw new Error(`Verify error: ${response.status}`);
    }
    return response.json();
  }
}