import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export default async function RootPage() {
  const token = (await cookies()).get("token")?.value
  redirect(token ? "/dashboard" : "/login")
}
