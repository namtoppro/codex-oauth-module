import { webcrypto } from "node:crypto";
import { base64urlEncode } from "./base64url.js";

export async function generatePkcePair() {
  const verifierBytes = new Uint8Array(32);
  webcrypto.getRandomValues(verifierBytes);
  const verifier = base64urlEncode(verifierBytes);
  const digest = await webcrypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return {
    verifier,
    challenge: base64urlEncode(new Uint8Array(digest)),
  };
}
