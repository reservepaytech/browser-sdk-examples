// Example backend for every integration in this repo. Plain node:http, no dependencies.
//
//   GET  /config.js                 public IDs for the browser (never the API key)
//   POST /api/payments              embedded, popup, custom card fields: initiate the payment flow
//   GET  /api/payments/:paymentId   confirm the payment status
//   POST /api/checkouts             hosted checkout: start a checkout, return its redirect_url
//   GET  /api/checkouts/:orderId    hosted checkout: status after the customer returns
//   POST /webhooks/reservepay       verify and record webhook events

import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { createReservepayClient, ReservepayApiError } from "./reservepay.js"
import { EXAMPLE_PAGES, PRODUCTION_SDK_URL, readStaticFile } from "./static.js"
import { verifyReservepaySignature } from "./webhooks.js"

// In a real shop this is your cart total. The server decides it, never the browser.
export const ORDER = { amount: "100000", currency: "THB" } // THB 1,000.00

export function loadConfig(env = process.env) {
  return {
    merchantId: env.RESERVEPAY_MERCHANT_ID ?? "",
    installationId: env.RESERVEPAY_INSTALLATION_ID ?? "",
    apiKey: env.RESERVEPAY_API_KEY ?? "",
    apiUrl: env.RESERVEPAY_API_URL || "https://api.reservepay.com",
    sdkUrl: env.RESERVEPAY_SDK_URL || PRODUCTION_SDK_URL,
    webhookSignatureType: env.RESERVEPAY_WEBHOOK_SIGNATURE_TYPE || "HMAC_SHA256",
    webhookKey: env.RESERVEPAY_WEBHOOK_KEY ?? "",
    // *.localhost resolves to this machine. Register demo.localhost as the installation's web domain.
    baseUrl: env.BASE_URL || `http://demo.localhost:${env.PORT || 6767}`,
    port: Number(env.PORT || 6767),
  }
}

export function createApp(config, { reservepay = createReservepayClient(config) } = {}) {
  // Demo storage. Use your database in production.
  const checkoutsByOrder = new Map()
  const seenEventIds = new Set()

  const routes = {
    "GET /config.js": (req, res) => {
      const publicConfig = {
        merchantId: config.merchantId,
        installationId: config.installationId,
        amount: ORDER.amount,
        currency: ORDER.currency,
      }
      send(res, 200, `window.exampleConfig = ${JSON.stringify(publicConfig)}\n`, "text/javascript")
    },

    "POST /api/payments": async (req, res) => {
      const { paymentSessionId, returnPath } = JSON.parse(await readBody(req))
      const payment = await reservepay.initiatePaymentFlow({
        amount: ORDER.amount,
        currency: ORDER.currency,
        payment_session_id: paymentSessionId,
        capture: true,
        return_url: returnUrl(config, returnPath),
        // Your order reference. Retrying with the same external_id returns the same payment.
        external_id: `order_${randomUUID()}`,
      })
      sendJson(res, 200, { paymentId: payment.payment_id })
    },

    "GET /api/payments/:id": async (req, res, paymentId) => {
      const payment = await reservepay.findPayment(paymentId)
      sendJson(res, 200, { paymentId, status: payment.status })
    },

    "POST /api/checkouts": async (req, res) => {
      const orderId = `order_${randomUUID()}`
      const checkout = await reservepay.startCheckout({
        installation_id: config.installationId,
        amount: ORDER.amount,
        currency: ORDER.currency,
        return_url: `${config.baseUrl}/hosted-checkout/return.html?order=${orderId}`,
      })
      checkoutsByOrder.set(orderId, checkout.checkout_id)
      sendJson(res, 200, { redirectUrl: checkout.redirect_url })
    },

    "GET /api/checkouts/:id": async (req, res, orderId) => {
      const checkoutId = checkoutsByOrder.get(orderId)
      if (!checkoutId) return sendJson(res, 404, { error: "Unknown order" })

      // Returning to return_url does not mean the payment succeeded. Ask the API.
      const checkout = await reservepay.retrieveCheckout(checkoutId)
      if (!checkout.payment_id) return sendJson(res, 200, { orderId, status: "UNPAID" })
      const payment = await reservepay.findPayment(checkout.payment_id)
      sendJson(res, 200, { orderId, paymentId: payment.payment_id, status: payment.status })
    },

    "POST /webhooks/reservepay": async (req, res) => {
      const rawBody = await readBody(req)
      const valid = verifyReservepaySignature(rawBody, req.headers["reservepay-signature"], {
        signatureType: config.webhookSignatureType,
        verificationKey: config.webhookKey,
      })
      if (!valid) {
        console.warn(
          `webhook rejected: signature check failed. Check RESERVEPAY_WEBHOOK_KEY and RESERVEPAY_WEBHOOK_SIGNATURE_TYPE (${config.webhookSignatureType}).`,
        )
        return send(res, 401, "")
      }

      const event = JSON.parse(rawBody.toString("utf8"))
      // Events can be retried and arrive out of order. Deduplicate by event_id.
      if (!seenEventIds.has(event.event_id)) {
        seenEventIds.add(event.event_id)
        // Respond within 10 seconds. Do slow work, such as fulfillment, in a background job.
        console.log("webhook", event.event_id, event.status, event.external_id ?? "")
      }
      send(res, 200, "")
    },
  }

  const app = async (req, res) => {
    const { pathname } = new URL(req.url, config.baseUrl)
    const [handler, param] = matchRoute(routes, req.method, pathname)
    try {
      if (handler) return await handler(req, res, param)
      if (req.method === "GET") {
        const file = await readStaticFile(pathname, config)
        return send(res, file.status, file.body, file.contentType)
      }
      send(res, 404, "Not found")
    } catch (error) {
      if (error instanceof ReservepayApiError) return sendJson(res, 502, { error: error.message, details: error.body })
      if (error instanceof SyntaxError) return sendJson(res, 400, { error: "Invalid JSON" })
      console.error(error)
      sendJson(res, 500, { error: "Internal error" })
    }
  }
  app.routes = Object.keys(routes)
  return app
}

function matchRoute(routes, method, pathname) {
  if (routes[`${method} ${pathname}`]) return [routes[`${method} ${pathname}`]]
  const match = pathname.match(/^(\/api\/\w+)\/([\w-]+)$/)
  if (match && routes[`${method} ${match[1]}/:id`]) return [routes[`${method} ${match[1]}/:id`], match[2]]
  return []
}

// Only same-origin paths, so the return URL cannot point at another site.
function returnUrl(config, returnPath) {
  const path = typeof returnPath === "string" && /^\/(?!\/)/.test(returnPath) ? returnPath : "/"
  return new URL(path, config.baseUrl).toString()
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })
}

function send(res, status, body, contentType = "text/plain") {
  res.writeHead(status, { "Content-Type": `${contentType}; charset=utf-8` })
  res.end(body)
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), "application/json")
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig()
  const missing = ["RESERVEPAY_MERCHANT_ID", "RESERVEPAY_INSTALLATION_ID", "RESERVEPAY_API_KEY"].filter(
    (name) => !process.env[name],
  )
  if (missing.length) console.warn(`Missing in .env: ${missing.join(", ")}. Copy .env.example to .env and fill them in.`)
  const app = createApp(config)
  createServer(app).listen(config.port, () => console.log(startupMessage(config, app.routes)))
}

function startupMessage({ baseUrl }, routes) {
  const pages = ["", ...EXAMPLE_PAGES].map((page) => `    ${baseUrl}/${page}${page && "/"}`)
  const api = routes.map((route) => {
    const [method, path] = route.split(" ")
    const note = path.startsWith("/webhooks/") ? "  (reachable only through a public tunnel, see README)" : ""
    return `    ${method.padEnd(5)}${baseUrl}${path}${note}`
  })
  return ["", "Reservepay examples", "", "  Pages", ...pages, "", "  Server", ...api, ""].join("\n")
}
