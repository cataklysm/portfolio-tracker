import { notFound } from "next/navigation"
import { AssetDetailWorkspace } from "@/features/asset-detail/components/AssetDetailWorkspace"
import { fetchAssetDetailByPositionId } from "@/features/asset-detail/model/asset-detail-model"

interface PositionDetailPageProperties {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string }>
}

export default async function PositionDetailPage({ params, searchParams }: PositionDetailPageProperties) {
  const { id } = await params
  const { returnTo } = await searchParams
  const model = await fetchAssetDetailByPositionId(id)
  if (!model) notFound()

  return <AssetDetailWorkspace model={model} returnHref={safeReturnHref(returnTo)} />
}

function safeReturnHref(value: string | undefined): string | undefined {
  if (!value?.startsWith("/")) return undefined
  if (value.startsWith("//")) return undefined
  return value
}
