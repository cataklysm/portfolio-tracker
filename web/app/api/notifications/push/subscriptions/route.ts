import { cookies } from "next/headers"

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"

export async function POST(request: Request) {
  const token = (await cookies()).get("token")?.value
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.text()
  const upstream = await fetch(`${GATEWAY_URL}/notifications/push/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body,
  })

  if (upstream.ok) return Response.json({ ok: true }, { status: 201 })
  return Response.json({ error: "Failed to register push subscription." }, { status: upstream.status || 502 })
}
