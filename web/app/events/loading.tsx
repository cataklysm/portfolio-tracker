import { EventsWorkspaceSkeleton, MetricGridSkeleton, PageLoadingShell, ToolbarSkeleton } from "@/application/shell/PageLoading"

export default function EventsLoading() {
  return (
    <PageLoadingShell kind="reporting" breadcrumb={["Portfolio", "Events"]}>
      <MetricGridSkeleton count={3} columns={{ xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }} />
      <ToolbarSkeleton tabs={4} search actions={1} />
      <EventsWorkspaceSkeleton />
    </PageLoadingShell>
  )
}
