import { headers } from "next/headers"

/** Reads the browser's primary locale from the Accept-Language request header. */
export async function getLocale(): Promise<string> {
  const al = (await headers()).get("accept-language")
  const candidate = al?.split(",")[0]?.split(";")[0]?.trim()
  if (!candidate || candidate === "*") return "en-US"
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? "en-US"
  } catch {
    return "en-US"
  }
}
