const button = document.querySelector("#checkout")
const status = document.querySelector("#status")

button.addEventListener("click", async () => {
  button.disabled = true
  // Your backend calls merchants/start-checkout and returns the checkout's redirect_url.
  const response = await fetch("/api/checkouts", { method: "POST" })
  if (!response.ok) {
    status.textContent = "Could not start the checkout."
    button.disabled = false
    return
  }
  const { redirectUrl } = await response.json()

  window.location.href = redirectUrl
  button.disabled = false
})
