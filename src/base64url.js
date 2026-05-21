export function base64urlEncode(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

export function base64urlDecode(value) {
  return Buffer.from(value, "base64url");
}
