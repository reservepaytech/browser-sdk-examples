const { merchantId, installationId, amount, currency } = window.exampleConfig
const button = document.querySelector("#pay")
const qrCode = document.querySelector("#qr-code")
const status = document.querySelector("#status")

const reservepay = await window.Reservepay.initReservepay({ merchantId, installationId })

button.addEventListener("click", async () => {
  button.disabled = true
  qrCode.hidden = true

  try {
    status.textContent = `Payment: ${await pay()}`
  } catch (error) {
    console.error(error)
    status.textContent = "Payment could not be completed."
  }
  qrCode.hidden = true
  // A new click starts a new payment, for example after the QR code expires.
  button.disabled = false
})

async function pay() {
  // 1. Create a payment session for PromptPay. No card token is needed.
  const paymentSessionId = await reservepay.endpoints.sdk.selectPaymentMethod({
    amount,
    currency,
    payment_method: "PROMPTPAY",
  })

  // 2. Your backend authorizes the session with your secret API key.
  const response = await fetch("/api/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentSessionId, returnPath: location.pathname }),
  })
  if (!response.ok) throw new Error("Could not start the payment")

  const nextActionPolling = reservepay.endpoints.sdk.createDiscoverNextActionPolling()
  const checkStatusPolling = reservepay.endpoints.sdk.createCheckStatusPolling()
  let countdown

  try {
    // 3. Wait until the QR code is ready.
    const action = await nextActionPolling.execute({
      payment_session_id: paymentSessionId,
      pollingUntilAction: "DISPLAY_QR",
    })

    if (action === "DISPLAY_QR") {
      // 4. The QR data is Base64. Decode it and render it with any QR code library.
      const qrData = await reservepay.endpoints.sdk.retrieveQrData({ payment_session_id: paymentSessionId })
      renderQrCode(atob(qrData))
      status.textContent = "Scan the QR code."

      // The QR code is valid until the payment's expires_at (Unix seconds). Show the time left.
      const session = await reservepay.endpoints.sdk.retrievePaymentSession({ payment_session_id: paymentSessionId })
      countdown = session.expires_at && startCountdown(session.expires_at * 1000)
    }

    // 5. Poll while the QR code is on screen. Resolves with SUCCESSFUL, FAILED or EXPIRED.
    // Your backend should still confirm the status before fulfillment.
    return await checkStatusPolling.execute({ payment_session_id: paymentSessionId })
  } finally {
    // Always stop polling, or it keeps calling the API in the background.
    nextActionPolling.abort()
    checkStatusPolling.abort()
    clearInterval(countdown)
  }
}

// Returns the interval ID. When the time runs out, check-status resolves with EXPIRED.
function startCountdown(expiresAtMs) {
  const update = () => {
    const seconds = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000))
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    status.textContent = `Scan the QR code. Expires in ${time}.`
  }
  update()
  return setInterval(update, 1000)
}

function renderQrCode(text) {
  const qr = window.qrcode(0, "M")
  qr.addData(text)
  qr.make()
  qrCode.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true })
  qrCode.hidden = false
}
