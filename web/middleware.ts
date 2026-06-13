import { NextRequest, NextResponse } from "next/server"

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // Skip the login page itself to avoid redirect loops
  if (pathname === "/login") return NextResponse.next()

  const token = request.cookies.get("token")?.value
  const refreshToken = request.cookies.get("refresh_token")?.value

  // Access token present — proceed
  if (token) return NextResponse.next()

  // No access token but refresh token present — attempt silent refresh
  if (refreshToken) {
    try {
      const resp = await fetch(`${GATEWAY_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Version": "1" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (resp.ok) {
        const data = (await resp.json()) as {
          access_token: string
          refresh_token: string
        }
        const response = NextResponse.next()
        response.cookies.set("token", data.access_token, {
          ...COOKIE_OPTS,
          maxAge: 900,
        })
        response.cookies.set("refresh_token", data.refresh_token, {
          ...COOKIE_OPTS,
          maxAge: 30 * 24 * 60 * 60,
        })
        return response
      }
    } catch {
      // auth service unreachable — fall through to login redirect
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
