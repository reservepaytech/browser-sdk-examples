const { merchantId, installationId, amount } = window.exampleConfig

window.Reservepay.initReservepayFormUI({
  formType: "embedded",
  merchantId,
  installationId,
  formOptions: {
    containerSelector: "#reservepay-mount",
    amount,
    // 1. The customer entered payment details. Send the session to your backend,
    //    which authorizes it with your secret API key.
    async onPaymentSessionReady(sessionId) {
      const response = await fetch("/api/initiate-payment-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // After a redirect to the customer's bank, Reservepay sends them to the result page.
        body: JSON.stringify({ paymentSessionId: sessionId, returnPath: resultPath(sessionId) }),
      })
      if (!response.ok) throw new Error("Could not start the payment")
    },
    // 2. Use callbacks for the UI only. The result page asks your backend for the real status.
    //    Fulfill the order after find-payment or a payment_completed webhook says SUCCESSFUL.
    onPaymentSuccess: showResult,
    // An expired session also lands here, with details.reason "EXPIRED" instead of "FAILED".
    // On PromptPay, return early on "EXPIRED" to keep the form open for a new QR.
    onPaymentFailed(sessionId, details) {
      if (details?.reason === "EXPIRED") console.log("Payment session expired", sessionId)
      showResult(sessionId)
    },
  },
})

function showResult(sessionId) {
  location.href = resultPath(sessionId)
}

function resultPath(sessionId) {
  return `/result/?session=${encodeURIComponent(sessionId)}&back=${encodeURIComponent(location.pathname)}`
}
