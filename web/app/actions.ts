"use server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"

export async function logoutAction() {
  const jar = await cookies()
  const refreshToken = jar.get("refresh_token")?.value

  if (refreshToken) {
    await fetch(`${GATEWAY_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Version": "1" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {})
  }

  jar.delete("token")
  jar.delete("refresh_token")
  redirect("/login")
}
