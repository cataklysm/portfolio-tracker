"use client"

import { useRouter } from "next/navigation"
import { AppIcon } from "@/design/icons/AppIcon"

interface AssetBackButtonProperties {
  fallbackHref: string
}

export function AssetBackButton({ fallbackHref }: AssetBackButtonProperties) {
  const router = useRouter()

  function goBack() {
    if (typeof window !== "undefined") {
      const referrer = document.referrer ? new URL(document.referrer) : null
      if (referrer?.origin === window.location.origin && window.history.length > 1) {
        router.back()
        return
      }
    }
    router.push(fallbackHref)
  }

  return (
    <button
      aria-label="Back"
      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--app-border)] text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
      onClick={goBack}
      type="button"
    >
      <AppIcon className="h-4 w-4" name="chevronLeft" strokeWidth={2} />
    </button>
  )
}
