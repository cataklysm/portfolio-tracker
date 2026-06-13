"use server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
}

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"

export async function loginAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  let resp: Response
  try {
    resp = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Version": "1" },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    return "Cannot reach the gateway. Is it running?"
  }

  if (!resp.ok) {
    return "Invalid email or password."
  }

  const data = (await resp.json()) as {
    access_token: string
    refresh_token: string
  }

  const jar = await cookies()
  jar.set("token", data.access_token, { ...COOKIE_OPTS, maxAge: 900 })
  jar.set("refresh_token", data.refresh_token, {
    ...COOKIE_OPTS,
    maxAge: 30 * 24 * 60 * 60,
  })

  redirect("/dashboard")
}
