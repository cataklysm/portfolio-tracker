import { NextRequest, NextResponse } from "next/server"

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"
const RETRYABLE_FETCH_ERROR_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "UND_ERR_SOCKET"])

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
}

const ACCESS_TOKEN_MAX_AGE = 900
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60

interface TokenPair {
  access_token: string
  refresh_token: string
}

/**
 * Single-flight refresh, keyed by the presented (old) refresh token.
 *
 * Refresh tokens rotate on every use, and the auth service treats a second
 * presentation of an already-rotated token as theft — it revokes the whole
 * session. So when several requests reach the middleware at once after the access
 * token expired (link prefetch, parallel navigations, multiple tabs), each would
 * otherwise refresh with the same token and every one but the first would be
 * rejected as reuse, logging the user out. Here all concurrent — and briefly
 * delayed — requests with the same old token share ONE refresh and the same
 * rotated tokens.
 *
 * State is per server instance (a single self-hosted Next process). Successful
 * results are kept for a short window so a straggler still carrying the old
 * cookie reuses the rotated tokens instead of tripping reuse detection.
 */
const REFRESH_CACHE_MS = 10_000
const refreshInFlight = new Map<string, { at: number; promise: Promise<TokenPair | null> }>()

function refreshSession(refreshToken: string): Promise<TokenPair | null> {
  const now = Date.now()
  for (const [key, entry] of refreshInFlight) {
    if (now - entry.at >= REFRESH_CACHE_MS) refreshInFlight.delete(key)
  }

  const cached = refreshInFlight.get(refreshToken)
  if (cached) return cached.promise

  const promise = performRefresh(refreshToken)
  refreshInFlight.set(refreshToken, { at: now, promise })
  // Keep successes cached for the window (stragglers reuse the rotation); drop
  // failures immediately so a transient auth-service outage isn't sticky.
  void promise.then((result) => {
    if (result === null) refreshInFlight.delete(refreshToken)
  })
  return promise
}

async function performRefresh(refreshToken: string): Promise<TokenPair | null> {
  try {
    const resp = await fetchWithRetry(`${GATEWAY_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Version": "1" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!resp.ok) return null
    return (await resp.json()) as TokenPair
  } catch {
    return null // auth service unreachable
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // Skip the login page itself to avoid redirect loops
  if (pathname === "/login") return NextResponse.next()

  const token = request.cookies.get("token")?.value
  const refreshToken = request.cookies.get("refresh_token")?.value

  // Access token present — proceed
  if (token) return NextResponse.next()

  // No access token but refresh token present — attempt a single-flight refresh
  if (refreshToken) {
    const tokens = await refreshSession(refreshToken)
    if (tokens) {
      const response = NextResponse.next()
      response.cookies.set("token", tokens.access_token, { ...COOKIE_OPTS, maxAge: ACCESS_TOKEN_MAX_AGE })
      response.cookies.set("refresh_token", tokens.refresh_token, { ...COOKIE_OPTS, maxAge: REFRESH_TOKEN_MAX_AGE })
      return response
    }

    // Refresh failed: clear stale cookies and redirect
    const response = NextResponse.redirect(new URL("/login", request.url))
    response.cookies.delete("token")
    response.cookies.delete("refresh_token")
    return response
  }

  // No tokens at all
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    if (!isRetryableFetchError(error)) throw error
    await delay(75)
    return fetch(url, init)
  }
}

function isRetryableFetchError(error: unknown): boolean {
  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause?: unknown }).cause : undefined
  const code = typeof cause === "object" && cause !== null && "code" in cause ? String((cause as { code?: unknown }).code) : ""
  return RETRYABLE_FETCH_ERROR_CODES.has(code)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
