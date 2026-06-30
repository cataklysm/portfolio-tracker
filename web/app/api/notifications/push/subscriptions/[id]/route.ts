import { cookies } from "next/headers"

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("token")?.value
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const upstream = await fetch(`${GATEWAY_URL}/notifications/push/subscriptions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })

  if (upstream.ok) return Response.json({ ok: true })
  return Response.json({ error: "Failed to delete push subscription." }, { status: upstream.status || 502 })
}
