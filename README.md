# Reservepay Browser SDK examples

Runnable examples for accepting payments on the web with Reservepay. Each one pairs a browser page with the backend code it needs, so you can read the whole integration end to end.

| Example | What it shows | Guide |
| --- | --- | --- |
| [`pre-built/embedded/`](pre-built/embedded) | Pre-built form inside your checkout page | [Pre-built forms](https://developer.reservepay.com/guides/accept-payments-via-pre-built-forms) |
| [`pre-built/popup/`](pre-built/popup) | Pre-built form opened from your own button | [Pre-built forms](https://developer.reservepay.com/guides/accept-payments-via-pre-built-forms) |
| [`hosted-checkout/`](hosted-checkout) | Redirect to a Reservepay-hosted payment page | [Hosted checkout](https://developer.reservepay.com/guides/accept-payments-via-hosted-checkout) |
| [`own-ui/card/`](own-ui/card) | Your own UI with secure card field iframes, plus 3D Secure | [Your own UI](https://developer.reservepay.com/guides/accept-payments-using-your-own-ui) |
| [`own-ui/promptpay/`](own-ui/promptpay) | Your own UI that renders a PromptPay QR code and waits for payment | [Your own UI](https://developer.reservepay.com/guides/accept-payments-using-your-own-ui) |
| [`server/`](server) | Backend for all of the above, plus webhook signature verification | [Real-time notifications](https://developer.reservepay.com/guides/real-time-notifications) |

## Run it

Requires Node.js 24 or later. There are no dependencies to install.

1. In the merchant dashboard, switch to **Test mode**, then under **Developer settings**:
   - Create an installation with platform **Web** and **Identifier - Domain** `demo.localhost`. Any `*.localhost` name points at your own machine, so you don't need to edit your hosts file.
   - Create an API key.
2. Copy `.env.example` to `.env` and fill in `RESERVEPAY_MERCHANT_ID`, `RESERVEPAY_INSTALLATION_ID` and `RESERVEPAY_API_KEY`.
3. Start the server:

   ```bash
   npm run dev
   ```

   It prints every URL it serves:

   ```
   Reservepay examples

     Pages
       http://demo.localhost:6767/
       http://demo.localhost:6767/pre-built/embedded/
       http://demo.localhost:6767/pre-built/popup/
       http://demo.localhost:6767/hosted-checkout/
       http://demo.localhost:6767/own-ui/card/
       http://demo.localhost:6767/own-ui/promptpay/

     Server
       GET  http://demo.localhost:6767/config.js
       POST http://demo.localhost:6767/api/payments
       GET  http://demo.localhost:6767/api/payments/:id
       POST http://demo.localhost:6767/api/checkouts
       GET  http://demo.localhost:6767/api/checkouts/:id
       POST http://demo.localhost:6767/webhooks/reservepay  (reachable only through a public tunnel, see README)
   ```

4. Open http://demo.localhost:6767 and pick an example. Use the [test card generator](https://developer.reservepay.com/tools/test-card-generator) for card numbers, with any future expiry such as `12/29` and any 3-digit CVV (4 digits for AMEX). Test payments move no money.

Got a value wrong? Edit `.env` and save. The server restarts with the new values; reload the page. Edits to the example pages show up on reload too.

## How the pieces fit

```
Browser page                    Your server (server/)                Reservepay API
-----------                     ---------------------                --------------
SDK creates payment session --> POST /api/payments --------------->  merchants/initiate-payment-flow
onPaymentSuccess            --> GET  /api/payments/:id ----------->  merchants/find-payment
Checkout button             --> POST /api/checkouts -------------->  merchants/start-checkout
Return page (hosted)        --> GET  /api/checkouts/:id ---------->  merchants/retrieve-checkout
                                                                     + merchants/find-payment
                                POST /webhooks/reservepay  <-------  payment_completed event
```

- **The API key stays on the server.** The browser only gets public values from `/config.js`: your merchant ID, installation ID, and the order amount and currency.
- **The server sets the amount.** Never trust an amount sent from the browser.
- **Callbacks are for UI.** Fulfill orders only after `merchants/find-payment` or a verified `payment_completed` webhook says `SUCCESSFUL`.
- **Load the SDK from `sdk.reservepay.com`.** Do not bundle or self-host it. This keeps you in the lightest PCI scope.

## Webhooks

`server/webhooks.js` verifies `HMAC_SHA256` and `ED25519` signatures against the raw request body.

Reservepay can't call `localhost` or a private IP, so give your local server a public HTTPS URL with a tunnel. The quickest is a Cloudflare quick tunnel, which needs no account:

1. Install and start the tunnel while `npm run dev` is running:

   ```bash
   brew install cloudflared        # or see developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads
   cloudflared tunnel --url http://localhost:6767
   ```

   It prints a URL such as `https://random-words.trycloudflare.com`.

2. In the dashboard, under **Developer settings**, choose **Create new webhook**:
   - **Destination**: `https://random-words.trycloudflare.com/webhooks/reservepay`
   - **Webhook signature type**: `HMAC_SHA256`
   - **Requested events**: `payment_completed`
3. Open the webhook you just created and copy its **Webhook signature** into `RESERVEPAY_WEBHOOK_KEY` in `.env`. If you chose `ED25519`, also set `RESERVEPAY_WEBHOOK_SIGNATURE_TYPE=ED25519`. The server restarts by itself.
4. Pay with any example. The terminal logs `webhook evt_... SUCCESSFUL order_...`, or `FAILED` for a declined test card.

A quick tunnel gets a new URL each time you start it. Edit the existing webhook's destination rather than creating a new one; the webhook keeps its signature key, so `.env` stays the same.

Any other tunnel works too, for example `ngrok http 6767`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Missing in .env: ...` when the server starts | Fill in the listed values in `.env`. |
| The card form never appears, or shows "Authentication failed" | `RESERVEPAY_MERCHANT_ID` or `RESERVEPAY_INSTALLATION_ID` is wrong, or the installation's platform is not **Web**. |
| `/api/payments` or `/api/checkouts` returns `502` | Reservepay rejected the API call. The response's `details` holds Reservepay's error list. Check that `RESERVEPAY_API_KEY` is a test mode key from the same merchant. |
| `webhook rejected` in the terminal, or `401` in the tunnel log | `RESERVEPAY_WEBHOOK_KEY` or `RESERVEPAY_WEBHOOK_SIGNATURE_TYPE` doesn't match the webhook in the dashboard. |
| PromptPay fails before showing a QR code | PromptPay isn't enabled for the installation. Select it under the installation's payment methods in the dashboard. |
| Custom card fields never show a 3D Secure challenge | Expected for some accounts. 3D Secure can be off or apply only above a minimum amount, so the payment goes straight to its final status. |

## License

MIT. Copy any example into your own project. See [LICENSE](LICENSE).
