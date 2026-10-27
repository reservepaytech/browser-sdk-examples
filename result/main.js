// Shown after onPaymentSuccess or onPaymentFailed. The browser callback only says the flow ended;
// your backend confirms the status with find-payment before you fulfill the order.
const params = new URLSearchParams(location.search)
const title = document.querySelector("#title")
const detail = document.querySelector("#detail")
const back = document.querySelector("#back")

const RESULTS = {
  SUCCESSFUL: ["Payment successful", "Thank you. Your order is confirmed."],
  FAILED: ["Payment failed", "The payment did not go through."],
  EXPIRED: ["Payment expired", "The payment was not completed in time."],
}

// Only same-origin paths. Reject "//host" and "/\host", which browsers treat as another site.
const backPath = params.get("back")
if (backPath && /^\/(?![\/\\])/.test(backPath)) {
  back.href = backPath
  back.textContent = "Try another payment"
}

const response = await fetch("/api/find-payment", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ paymentSessionId: params.get("session") }),
})
const result = await response.json()

if (!response.ok) {
  title.textContent = "Could not check the payment"
  detail.textContent = result.error
} else {
  const [heading, message] = RESULTS[result.status] ?? ["Payment processing", "Refresh this page in a moment."]
  title.textContent = heading
  detail.textContent = `${message} Payment ${result.paymentId}: ${result.status}`
  document.body.dataset.status = result.status
}
