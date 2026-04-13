import { keccak256, encodeAbiParameters, toHex } from "viem";

export function forecastrInputHash(
  endpoint: string,
  payload: Uint8Array
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "bytes" }],
      [endpoint, toHex(payload)]
    )
  );
}

export function forecastrOutputHash(output: Uint8Array): `0x${string}` {
  return keccak256(toHex(output));
}

export const HASH_ANCHORS = {
  input:  "0x8d289c8dc0097c1462ecd56612688df1566c0d68ff33b2130d13237c45cb777b",
  output: "0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658",
};
