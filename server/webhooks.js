// Webhook signature verification.
// Always verify the raw request body, before you parse it. Re-encoding JSON changes the bytes.

import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto"

function splitHeader(header, expectedScheme) {
  const [scheme, signature] = (header ?? "").split("=")
  return scheme === expectedScheme && signature ? signature : null
}

// HMAC_SHA256: the verification key is a Base64-encoded secret.
export function verifyHmacSha256(rawBody, header, verificationKey) {
  const signature = splitHeader(header, "hmac_sha256")
  if (!signature) return false

  const expected = createHmac("sha256", Buffer.from(verificationKey, "base64"))
    .update(rawBody)
    .digest("hex")

  const received = Buffer.from(signature)
  const computed = Buffer.from(expected)
  return received.length === computed.length && timingSafeEqual(received, computed)
}

// ED25519: the verification key is Reservepay's Base64-encoded 32-byte public key.
export function verifyEd25519(rawBody, header, verificationKey) {
  const signature = splitHeader(header, "ed25519")
  if (!signature) return false

  const publicKey = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(verificationKey, "base64").toString("base64url") },
    format: "jwk",
  })
  return verify(null, rawBody, publicKey, Buffer.from(signature, "hex"))
}

export function verifyReservepaySignature(rawBody, header, { signatureType, verificationKey }) {
  if (!verificationKey) return false
  switch (signatureType) {
    case "HMAC_SHA256":
      return verifyHmacSha256(rawBody, header, verificationKey)
    case "ED25519":
      return verifyEd25519(rawBody, header, verificationKey)
    default:
      // The legacy SHA256 type is not shown here. Use HMAC_SHA256 or ED25519 for new endpoints.
      throw new Error(`Unsupported signature type: ${signatureType}`)
  }
}
