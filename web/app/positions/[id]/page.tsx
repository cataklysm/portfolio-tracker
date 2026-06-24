import { notFound } from "next/navigation"
import { AssetDetailWorkspace } from "@/features/asset-detail/components/AssetDetailWorkspace"
import { fetchAssetDetailByPositionId } from "@/features/asset-detail/model/asset-detail-model"

interface PositionDetailPageProperties {
  params: Promise<{ id: string }>
}

export default async function PositionDetailPage({ params }: PositionDetailPageProperties) {
  const { id } = await params
  const model = await fetchAssetDetailByPositionId(id)
  if (!model) notFound()

  return <AssetDetailWorkspace model={model} />
}
