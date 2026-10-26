import assert from "node:assert/strict"
import { createHmac, generateKeyPairSync, randomBytes, sign } from "node:crypto"
import { test } from "node:test"
import { verifyEd25519, verifyHmacSha256, verifyReservepaySignature } from "../server/webhooks.js"

const body = Buffer.from('{"event_id":"evt_1","status":"SUCCESSFUL"}')

test("HMAC_SHA256 accepts a signature over the raw body", () => {
  const rawKey = randomBytes(32)
  const signature = createHmac("sha256", rawKey).update(body).digest("hex")
  assert.equal(verifyHmacSha256(body, `hmac_sha256=${signature}`, rawKey.toString("base64")), true)
})

test("HMAC_SHA256 rejects a tampered body, wrong scheme, or missing header", () => {
  const rawKey = randomBytes(32)
  const key = rawKey.toString("base64")
  const signature = createHmac("sha256", rawKey).update(body).digest("hex")
  assert.equal(verifyHmacSha256(Buffer.from(body.toString().replace("1", "2")), `hmac_sha256=${signature}`, key), false)
  assert.equal(verifyHmacSha256(body, `ed25519=${signature}`, key), false)
  assert.equal(verifyHmacSha256(body, undefined, key), false)
})

test("ED25519 accepts Reservepay's Base64 raw public key", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const rawPublicKey = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url")
  const signature = sign(null, body, privateKey).toString("hex")
  assert.equal(verifyEd25519(body, `ed25519=${signature}`, rawPublicKey.toString("base64")), true)
  assert.equal(verifyEd25519(Buffer.from("{}"), `ed25519=${signature}`, rawPublicKey.toString("base64")), false)
})

test("verification fails closed without a key", () => {
  assert.equal(verifyReservepaySignature(body, "hmac_sha256=00", { signatureType: "HMAC_SHA256", verificationKey: "" }), false)
})
