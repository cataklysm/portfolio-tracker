import { redirect } from "next/navigation"

export default function NotificationSettingsPage() {
  redirect("/notifications?view=rules")
}
