"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

export async function markNotificationReadAction(id: string): Promise<{ error: string } | null> {
  try {
    const resp = await apiFetch(`/notifications/${id}/read`, { method: "POST" })
    if (!resp.ok) return { error: await problemDetail(resp, "Failed to mark read.") }
  } catch {
    return { error: "Cannot reach the gateway." }
  }
  revalidatePath("/notifications")
  revalidatePath("/", "layout")
  return null
}

export async function markAllNotificationsReadAction(): Promise<{ error: string } | null> {
  try {
    const resp = await apiFetch(`/notifications/read-all`, { method: "POST" })
    if (!resp.ok) return { error: await problemDetail(resp, "Failed to mark all read.") }
  } catch {
    return { error: "Cannot reach the gateway." }
  }
  revalidatePath("/notifications")
  revalidatePath("/", "layout")
  return null
}
