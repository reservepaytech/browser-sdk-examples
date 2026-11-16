const button = document.querySelector("#checkout")
const status = document.querySelector("#status")
const locale = document.querySelector("#locale")

button.addEventListener("click", async () => {
  button.disabled = true
  // Your backend calls merchants/start-checkout and returns the checkout's redirect_url.
  const response = await fetch("/api/start-checkout", { method: "POST" })
  if (!response.ok) {
    status.textContent = "Could not start the checkout."
    button.disabled = false
    return
  }
  const { redirectUrl } = await response.json()

  // Open the checkout in the customer's language: en or th. Any other value opens it in English.
  const url = new URL(redirectUrl)
  url.searchParams.set("locale", locale.value)
  window.location.href = url
  button.disabled = false
})
