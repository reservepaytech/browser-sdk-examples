const { merchantId, installationId, amount, currency } = window.exampleConfig
const form = document.querySelector("#card-form")
const status = document.querySelector("#status")

const reservepay = await window.Reservepay.initReservepay({ merchantId, installationId })

const cardFields = await reservepay.customCardFields.create({
  fields: {
    cardNumber: { container: "#card-number", placeholder: "4242 4242 4242 4242" },
    expirationDate: { container: "#expiration-date", placeholder: "MM / YY" },
    cvv: { container: "#cvv", placeholder: "123" },
  },
  // Text styles inside the iframes. Style borders and padding on the containers instead.
  styles: {
    input: { "font-size": "16px" },
    ".invalid": { color: "#dc2626" },
  },
})

// Drive your own validation UI from field events.
const containers = {
  cardNumber: document.querySelector("#card-number"),
  expirationDate: document.querySelector("#expiration-date"),
  cvv: document.querySelector("#cvv"),
}
const validity = { cardNumber: false, expirationDate: false, cvv: false }

cardFields.on("focus", ({ field }) => containers[field].classList.add("field--focused"))
cardFields.on("blur", ({ field, isValid }) => {
  containers[field].classList.remove("field--focused")
  containers[field].classList.toggle("field--error", !isValid)
})
cardFields.on("validityChange", ({ field, isValid }) => {
  validity[field] = isValid
  if (isValid) containers[field].classList.remove("field--error")
})

form.addEventListener("submit", async (event) => {
  event.preventDefault()
  if (!Object.values(validity).every(Boolean)) {
    status.textContent = "Check the card details."
    return
  }
  form.querySelector("button").disabled = true

  try {
    showResult(await pay())
  } catch (error) {
    console.error(error)
    status.textContent = "Payment could not be completed."
    form.querySelector("button").disabled = false
  }
})

async function pay() {
  // 1. Tokenize the card. Raw card data stays inside Reservepay's iframes.
  const { token } = await cardFields.tokenize({
    name: document.querySelector("#cardholder-name").value,
    usage: "SINGLE",
  })

  // 2. Create a payment session with the token.
  const paymentSessionId = await reservepay.endpoints.sdk.selectPaymentMethod({
    amount,
    currency,
    payment_method: "CARD",
    token,
  })

  // 3. Your backend authorizes the session with your secret API key.
  const response = await fetch("/api/initiate-payment-flow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentSessionId, returnPath: location.pathname }),
  })
  if (!response.ok) throw new Error("Could not start the payment")

  // 4. Wait for the next action. Cards may need a 3D Secure challenge, or may go straight to CHECK_STATUS.
  const nextActionPolling = reservepay.endpoints.sdk.createDiscoverNextActionPolling()
  const checkStatusPolling = reservepay.endpoints.sdk.createCheckStatusPolling()
  let threeDSecure

  try {
    const action = await nextActionPolling.execute({
      payment_session_id: paymentSessionId,
      pollingUntilAction: "REDIRECT",
    })

    if (action === "REDIRECT") {
      const url = await reservepay.endpoints.sdk.getRedirectUrl({ payment_session_id: paymentSessionId })
      // Mount the challenge inline. Alternatively: window.location.href = url
      threeDSecure = reservepay.customCardFields.openThreeDSecure({
        url,
        container: document.querySelector("#three-d-secure"),
        onError: (error) => console.error(error),
      })
    }

    // 5. Wait for the final status: SUCCESSFUL or FAILED.
    await checkStatusPolling.execute({ payment_session_id: paymentSessionId })
    return paymentSessionId
  } finally {
    // Always stop polling, or it keeps calling the API for up to 30 minutes.
    nextActionPolling.abort()
    checkStatusPolling.abort()
    threeDSecure?.destroy()
  }
}

// The result page asks your backend for the real status (find-payment).
function showResult(paymentSessionId) {
  location.href = `/result/?session=${encodeURIComponent(paymentSessionId)}&back=${encodeURIComponent(location.pathname)}`
}
