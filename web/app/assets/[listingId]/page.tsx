import { notFound } from "next/navigation"
import { AssetDetailWorkspace } from "@/features/asset-detail/components/AssetDetailWorkspace"
import { fetchAssetDetailByListingId } from "@/features/asset-detail/model/asset-detail-model"

interface AssetDetailPageProperties {
  params: Promise<{ listingId: string }>
  searchParams: Promise<{ portfolio?: string }>
}

export default async function AssetDetailPage({ params, searchParams }: AssetDetailPageProperties) {
  const { listingId } = await params
  const { portfolio } = await searchParams
  const model = await fetchAssetDetailByListingId(listingId, portfolio)
  if (!model) notFound()

  return <AssetDetailWorkspace model={model} />
}
