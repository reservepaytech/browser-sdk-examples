// Minimal Reservepay Merchant API client. Server-side only: it sends your secret API key.

const API_VERSION = "2025-04-01"

export class ReservepayApiError extends Error {
  constructor(endpoint, status, body) {
    super(`${endpoint} failed with HTTP ${status}`)
    this.status = status
    // Error responses are JSON arrays of error objects.
    this.body = body
  }
}

export function createReservepayClient({ apiUrl, apiKey, fetch = globalThis.fetch }) {
  async function call(endpoint, body) {
    const response = await fetch(`${apiUrl}/merchants/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Api-Version": API_VERSION,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) throw new ReservepayApiError(endpoint, response.status, json)
    return json
  }

  return {
    // Embedded, popup and custom card fields: authorize the session the browser created.
    initiatePaymentFlow: (args) => call("initiate-payment-flow", args),
    // Hosted checkout: create a checkout and send the customer to its redirect_url.
    startCheckout: (args) => call("start-checkout", args),
    retrieveCheckout: (checkoutId) => call("retrieve-checkout", { checkout_id: checkoutId }),
    // The authoritative payment status. Check it before you fulfill an order.
    findPayment: (paymentId) => call("find-payment", { payment_id: paymentId }),
  }
}
