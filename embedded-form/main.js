const { merchantId, installationId, amount } = window.exampleConfig
const status = document.querySelector("#status")

let paymentId

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
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentSessionId: sessionId, returnPath: location.pathname }),
      })
      if (!response.ok) throw new Error("Could not start the payment")
      ;({ paymentId } = await response.json())
    },
    // 2. Use callbacks for the UI only. Fulfill the order after your backend
    //    confirms the status (find-payment) or a payment_completed webhook arrives.
    async onPaymentSuccess() {
      const response = await fetch(`/api/payments/${paymentId}`)
      const payment = await response.json()
      status.textContent = `Payment ${payment.paymentId}: ${payment.status}`
    },
    onPaymentFailed() {
      status.textContent = "Payment failed. Try again."
    },
  },
})
