import { cookies } from "next/headers"

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"

export async function GET() {
  const token = (await cookies()).get("token")?.value
  if (!token) return Response.json({ public_key: null }, { status: 401 })

  const upstream = await fetch(`${GATEWAY_URL}/notifications/push/public-key`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })

  if (!upstream.ok) return Response.json({ public_key: null }, { status: upstream.status || 502 })
  return Response.json(await upstream.json())
}
