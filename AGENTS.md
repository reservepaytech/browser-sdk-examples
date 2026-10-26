# AGENTS.md

Public, merchant-facing integration examples for the Reservepay Browser SDK.

## This repository is public

Everything here is read by merchants. Before writing code, comments, commits or PR text:

- No internal hosts, account IDs, merchant IDs, installation IDs, API keys or webhook keys. Staging hosts belong in `.env`, never in committed files.
- No internal tooling, debugging switches, environment toggles or references to internal repos, tickets or people.
- Production hosts (`sdk.reservepay.com`, `api.reservepay.com`) are the only defaults.

## Rules for examples

- Load the SDK only with `<script src="https://sdk.reservepay.com/js/v1/reservepay.js">`. Never import an npm package; the guides forbid bundling the SDK.
- The API key lives only in `server/`. The browser gets public IDs from `/config.js`.
- The server decides the amount (`ORDER` in `server/index.js`).
- Each example folder stays self-contained: `index.html` + `main.js`, plain browser JavaScript, no build step. A merchant should be able to copy one folder.
- Comments explain the integration step for a merchant, not implementation trivia.
- Keep the code in step with the developer portal guides. When they disagree, the guides win; fix the example or raise the guide bug.
- No runtime dependencies. `server/` uses `node:http` and `fetch` only.

## Commands

```bash
npm run dev                  # server on http://demo.localhost:6767, restarts when .env or server code changes
npm test                     # node --test
```
