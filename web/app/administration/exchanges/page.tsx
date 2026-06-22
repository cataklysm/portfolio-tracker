import { redirect } from "next/navigation"
import { fetchMe } from "@/lib/api"
import { ExchangeAdministration } from "@/features/administration/exchanges/components/ExchangeAdministration"

export default async function ExchangesAdministrationPage() {
  const me = await fetchMe()
  if (me?.role !== "admin") redirect("/dashboard")

  return <ExchangeAdministration exchanges={[]} />
}
