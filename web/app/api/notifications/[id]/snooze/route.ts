import { cookies } from "next/headers"

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("token")?.value
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await request.text()
  const upstream = await fetch(`${GATEWAY_URL}/notifications/${encodeURIComponent(id)}/snooze`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body,
  })

  if (upstream.ok) return Response.json({ ok: true })
  return Response.json({ error: "Failed to snooze notification." }, { status: upstream.status || 502 })
}
