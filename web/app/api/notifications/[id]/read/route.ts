import { cookies } from "next/headers"
import { GATEWAY_URL } from "@/lib/api"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const token = (await cookies()).get("token")?.value
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const upstream = await fetch(`${GATEWAY_URL}/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-API-Version": "1",
    },
    cache: "no-store",
  })

  if (!upstream.ok) {
    return Response.json({ error: "Failed to mark notification read." }, { status: upstream.status || 502 })
  }

  return Response.json({ ok: true })
}
