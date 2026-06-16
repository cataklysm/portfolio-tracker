import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { MeData } from "./types"

/**
 * The frontend talks to a single public edge — the gateway — which routes to
 * the owning services, verifies the token, and applies CORS/rate limiting.
 */
export const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"

const API_VERSION = "1"
const RETRYABLE_FETCH_ERROR_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "UND_ERR_SOCKET"])

/** Returns the current user's profile or null if not authenticated (never redirects). */
export async function fetchMe(): Promise<MeData | null> {
  const token = (await cookies()).get("token")?.value
  if (!token) return null
  try {
    const resp = await fetchGateway("/me", {
      headers: { Authorization: `Bearer ${token}`, "X-API-Version": API_VERSION },
      cache: "no-store",
    })
    if (!resp.ok) return null
    return resp.json() as Promise<MeData>
  } catch {
    return null
  }
}

/**
 * Fetch a gateway endpoint from a Server Component or Server Action. The
 * middleware ensures a valid access token exists before the page renders, so
 * this forwards it. On 401 (token expired mid-render) it redirects to /login.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = (await cookies()).get("token")?.value
  if (!token) redirect("/login")

  const resp = await fetchGateway(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      "X-API-Version": API_VERSION,
    },
  })

  if (resp.status === 401) redirect("/login")
  return resp
}

async function fetchGateway(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${GATEWAY_URL}${path}`, init)
  } catch (error) {
    if (!isRetryableFetchError(error) || !isSafeToRetry(init)) throw error
    await delay(75)
    return fetch(`${GATEWAY_URL}${path}`, init)
  }
}

function isSafeToRetry(init: RequestInit): boolean {
  const method = (init.method ?? "GET").toUpperCase()
  return method === "GET" || method === "HEAD"
}

function isRetryableFetchError(error: unknown): boolean {
  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause?: unknown }).cause : undefined
  const code = typeof cause === "object" && cause !== null && "code" in cause ? String((cause as { code?: unknown }).code) : ""
  return RETRYABLE_FETCH_ERROR_CODES.has(code)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Reads a JSON error's `detail`/`title` from an RFC 9457 problem response. */
export async function problemDetail(resp: Response, fallback: string): Promise<string> {
  try {
    const body = (await resp.json()) as { detail?: string; title?: string }
    return body.detail ?? body.title ?? fallback
  } catch {
    return fallback
  }
}
