import { PageLoadingShell, SettingsCardSkeleton, ToolbarSkeleton } from "@/application/shell/PageLoading"

export default function ProvidersAdministrationLoading() {
  return (
    <PageLoadingShell kind="admin" breadcrumb={["Administration", "Providers"]}>
      <ToolbarSkeleton tabs={3} search />
      <SettingsCardSkeleton count={2} />
    </PageLoadingShell>
  )
}
