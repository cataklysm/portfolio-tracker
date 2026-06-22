import { cookies } from "next/headers"
import { GATEWAY_URL } from "@/lib/api"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  const token = (await cookies()).get("token")?.value
  if (!token) return Response.json({ unread_count: 0, notifications: [] }, { status: 401 })

  const url = new URL(request.url)
  const limit = url.searchParams.get("limit") ?? "10"
  const upstream = await fetch(`${GATEWAY_URL}/notifications?limit=${encodeURIComponent(limit)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-API-Version": "1",
    },
    cache: "no-store",
  })

  if (!upstream.ok) {
    return Response.json({ unread_count: 0, notifications: [] }, { status: upstream.status || 502 })
  }

  return Response.json(await upstream.json())
}
