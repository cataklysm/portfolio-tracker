import { cookies } from "next/headers"
import { GATEWAY_URL } from "@/lib/api"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(): Promise<Response> {
  const token = (await cookies()).get("token")?.value
  if (!token) return new Response("Unauthorized", { status: 401 })

  const upstream = await fetch(`${GATEWAY_URL}/positions/stream`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-API-Version": "1",
      Accept: "text/event-stream",
    },
    cache: "no-store",
  })

  if (!upstream.ok || !upstream.body) {
    return new Response("Position stream unavailable", { status: upstream.status || 502 })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
