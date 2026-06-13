"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

export async function createPortfolioAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const name = (formData.get("name") as string)?.trim()
  if (!name) return "A portfolio name is required."

  let resp: Response
  try {
    resp = await apiFetch("/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
  } catch {
    return "Cannot reach the gateway."
  }

  if (!resp.ok) return problemDetail(resp, "Failed to create portfolio.")
  revalidatePath("/dashboard")
  return null
}
