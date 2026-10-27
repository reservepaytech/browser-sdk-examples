// Serves the example pages. Plumbing for this repo only; your shop serves its own pages.

import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

export const PRODUCTION_SDK_URL = "https://sdk.reservepay.com/js/v1/reservepay.js"
export const EXAMPLE_PAGES = ["pre-built/embedded", "pre-built/popup", "hosted-checkout", "own-ui/card", "own-ui/promptpay"]

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const PUBLIC_DIRS = ["shared", ...new Set(EXAMPLE_PAGES.map((page) => page.split("/")[0]))]
const CONTENT_TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }

// Returns { status, body, contentType }. Only files under PUBLIC_DIRS (and the root index.html) are served.
export async function readStaticFile(pathname, { sdkUrl }) {
  if (pathname.endsWith("/")) pathname += "index.html"
  const file = normalize(join(ROOT, pathname))
  const topDir = pathname.split("/")[1]
  const isPublic = pathname === "/index.html" || PUBLIC_DIRS.includes(topDir)
  if (!isPublic || !file.startsWith(ROOT)) return notFound()

  let body
  try {
    body = await readFile(file, "utf8")
  } catch {
    return notFound()
  }
  // Pages reference the production SDK. Swap it when RESERVEPAY_SDK_URL points elsewhere.
  if (file.endsWith(".html")) body = body.replaceAll(PRODUCTION_SDK_URL, sdkUrl)
  return { status: 200, body, contentType: CONTENT_TYPES[extname(file)] ?? "application/octet-stream" }
}

function notFound() {
  return { status: 404, body: "Not found", contentType: "text/plain" }
}
