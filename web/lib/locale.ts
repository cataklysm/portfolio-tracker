import { headers } from "next/headers"

/** Reads the browser's primary locale from the Accept-Language request header. */
export async function getLocale(): Promise<string> {
  const al = (await headers()).get("accept-language")
  return al?.split(",")[0]?.split(";")[0]?.trim() ?? "en-US"
}
