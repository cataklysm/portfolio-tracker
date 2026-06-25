import { notFound } from "next/navigation"
import { AssetDetailWorkspace } from "@/features/asset-detail/components/AssetDetailWorkspace"
import { fetchAssetDetailByListingId } from "@/features/asset-detail/model/asset-detail-model"

interface AssetDetailPageProperties {
  params: Promise<{ listingId: string }>
  searchParams: Promise<{ portfolio?: string; returnTo?: string }>
}

export default async function AssetDetailPage({ params, searchParams }: AssetDetailPageProperties) {
  const { listingId } = await params
  const { portfolio, returnTo } = await searchParams
  const model = await fetchAssetDetailByListingId(listingId, portfolio)
  if (!model) notFound()

  return <AssetDetailWorkspace model={model} returnHref={safeReturnHref(returnTo)} />
}

function safeReturnHref(value: string | undefined): string | undefined {
  if (!value?.startsWith("/")) return undefined
  if (value.startsWith("//")) return undefined
  return value
}
