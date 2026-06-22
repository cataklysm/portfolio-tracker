import { MetricGridSkeleton, NewsWorkspaceSkeleton, PageLoadingShell, ToolbarSkeleton } from "@/application/shell/PageLoading"

export default function NewsLoading() {
  return (
    <PageLoadingShell kind="workspace" breadcrumb={["Portfolio", "News"]}>
      <MetricGridSkeleton count={4} columns={{ xs: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }} />
      <ToolbarSkeleton tabs={4} search actions={1} />
      <NewsWorkspaceSkeleton />
    </PageLoadingShell>
  )
}
