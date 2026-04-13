import { forecastrInputHash, forecastrOutputHash, HASH_ANCHORS } from "./hashing.js";

const endpoint = "/forecast";
const payload = new TextEncoder().encode('{"series":[1,2,3],"horizon":7}');

const inputHash  = forecastrInputHash(endpoint, payload);
const outputHash = forecastrOutputHash(new TextEncoder().encode("test"));

console.log("--- Cross-language hash verification ---");
console.log("input_hash: ", inputHash);
console.log("expected:   ", HASH_ANCHORS.input);
console.log("match:      ", inputHash.toLowerCase() === HASH_ANCHORS.input.toLowerCase());
console.log("");
console.log("output_hash:", outputHash);
console.log("expected:   ", HASH_ANCHORS.output);
console.log("match:      ", outputHash.toLowerCase() === HASH_ANCHORS.output.toLowerCase());
