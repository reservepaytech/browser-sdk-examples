import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { createServer } from "node:http"
import { after, before, test } from "node:test"
import { createApp, loadConfig, ORDER } from "../server/index.js"
import { ReservepayApiError } from "../server/reservepay.js"

const webhookKey = Buffer.from("test-webhook-key").toString("base64")
const config = loadConfig({
  RESERVEPAY_MERCHANT_ID: "123456789100",
  RESERVEPAY_INSTALLATION_ID: "ins_123",
  RESERVEPAY_API_KEY: "secret_api_key",
  RESERVEPAY_WEBHOOK_KEY: webhookKey,
  RESERVEPAY_SDK_URL: "https://sdk.example.test/reservepay.js",
  BASE_URL: "https://shop.example.test",
})

const calls = []
const reservepay = {
  async initiatePaymentFlow(args) {
    calls.push(["initiatePaymentFlow", args])
    if (args.payment_session_id === "bad") throw new ReservepayApiError("initiate-payment-flow", 422, [{ code: "INVALID" }])
    return { payment_id: "pay_1" }
  },
  async startCheckout(args) {
    calls.push(["startCheckout", args])
    return { checkout_id: "chk_1", redirect_url: "https://checkout.example.test/chk_1" }
  },
  async retrieveCheckout() {
    return { checkout_id: "chk_1", payment_id: "pay_1" }
  },
  async findPayment(paymentId) {
    return { payment_id: paymentId, status: "SUCCESSFUL" }
  },
}

let server
let baseUrl

before(async () => {
  server = createServer(createApp(config, { reservepay }))
  await new Promise((resolve) => server.listen(0, resolve))
  baseUrl = `http://localhost:${server.address().port}`
})

after(() => server.close())

const postJson = (path, body) =>
  fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

test("config.js exposes public IDs and never the API key", async () => {
  const text = await (await fetch(`${baseUrl}/config.js`)).text()
  assert.match(text, /123456789100/)
  assert.match(text, /ins_123/)
  assert.doesNotMatch(text, /secret_api_key/)
})

test("initiating a payment uses the server-side amount and a same-origin return URL", async () => {
  const response = await postJson("/api/payments", { paymentSessionId: "ps_1", returnPath: "//evil.example/x" })
  assert.deepEqual(await response.json(), { paymentId: "pay_1" })
  const [, args] = calls.findLast(([name]) => name === "initiatePaymentFlow")
  assert.equal(args.amount, ORDER.amount)
  assert.equal(args.return_url, "https://shop.example.test/")
  assert.match(args.external_id, /^order_/)
})

test("API errors surface as 502 with the Reservepay error body", async () => {
  const response = await postJson("/api/payments", { paymentSessionId: "bad" })
  assert.equal(response.status, 502)
  assert.deepEqual((await response.json()).details, [{ code: "INVALID" }])
})

test("hosted checkout redirects, then confirms status by order", async () => {
  const { redirectUrl } = await (await postJson("/api/checkouts", {})).json()
  assert.equal(redirectUrl, "https://checkout.example.test/chk_1")

  const [, args] = calls.findLast(([name]) => name === "startCheckout")
  const orderId = new URL(args.return_url).searchParams.get("order")
  const result = await (await fetch(`${baseUrl}/api/checkouts/${orderId}`)).json()
  assert.deepEqual(result, { orderId, paymentId: "pay_1", status: "SUCCESSFUL" })
})

test("webhooks reject bad signatures and accept valid ones", async () => {
  const body = '{"event_id":"evt_1","status":"SUCCESSFUL"}'
  const signature = createHmac("sha256", Buffer.from(webhookKey, "base64")).update(body).digest("hex")
  const send = (header) =>
    fetch(`${baseUrl}/webhooks/reservepay`, { method: "POST", headers: { "Reservepay-Signature": header }, body })

  assert.equal((await send("hmac_sha256=deadbeef")).status, 401)
  assert.equal((await send(`hmac_sha256=${signature}`)).status, 200)
  // A retried delivery still gets 200 so Reservepay stops retrying.
  assert.equal((await send(`hmac_sha256=${signature}`)).status, 200)
})

test("pages are served with the configured SDK URL", async () => {
  for (const page of ["/", "/embedded-form/", "/popup-form/", "/hosted-checkout/", "/custom-card-fields/"]) {
    const response = await fetch(`${baseUrl}${page}`)
    assert.equal(response.status, 200, page)
    const html = await response.text()
    assert.doesNotMatch(html, /sdk\.reservepay\.com/, page)
  }
  assert.match(await (await fetch(`${baseUrl}/embedded-form/`)).text(), /sdk\.example\.test/)
})

test("server code and secrets are not served", async () => {
  for (const path of ["/server/index.js", "/.env", "/.env.example", "/package.json", "/embedded-form/../server/index.js"]) {
    assert.equal((await fetch(`${baseUrl}${path}`)).status, 404, path)
  }
})
