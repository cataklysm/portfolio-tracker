"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"
import type { ApiTokenCreated } from "@/lib/types"

/** Creates a personal access token; returns the plaintext secret once. */
export async function createApiTokenAction(
  _prevState: { token: ApiTokenCreated } | { error: string } | null,
  formData: FormData,
): Promise<{ token: ApiTokenCreated } | { error: string }> {
  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "A name is required." }

  const scopes = formData.getAll("scopes").filter((s): s is string => typeof s === "string")
  const days = Number(formData.get("expires_in_days"))

  const body: Record<string, unknown> = { name }
  if (scopes.length > 0) body.scopes = scopes
  if (Number.isFinite(days) && days > 0) body.expires_in_days = days

  let resp: Response
  try {
    resp = await apiFetch("/me/api-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return { error: "Cannot reach the gateway." }
  }
  if (!resp.ok) return { error: await problemDetail(resp, "Failed to create the token.") }

  const token = (await resp.json()) as ApiTokenCreated
  revalidatePath("/settings")
  return { token }
}

export async function revokeApiTokenAction(id: string): Promise<{ error: string } | null> {
  try {
    const resp = await apiFetch(`/me/api-tokens/${id}`, { method: "DELETE" })
    if (!resp.ok) return { error: await problemDetail(resp, "Failed to revoke the token.") }
  } catch {
    return { error: "Cannot reach the gateway." }
  }
  revalidatePath("/settings")
  return null
}
