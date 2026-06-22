import { PageLoadingShell, TablePanelSkeleton, ToolbarSkeleton } from "@/application/shell/PageLoading"

export default function SymbolsAdministrationLoading() {
  return (
    <PageLoadingShell kind="admin" maxWidth={1640} breadcrumb={["Administration", "Symbols"]}>
      <ToolbarSkeleton tabs={4} search actions={1} />
      <TablePanelSkeleton
        title="Symbols"
        rightLabel="Equity"
        columns={[
          { label: "Instrument" },
          { label: "Listing", align: "right", width: 140 },
          { label: "Providers", align: "right", width: 100 },
          { label: "Usage", align: "right", width: 96 },
          { label: "Actions", align: "right", width: 132 },
        ]}
      />
    </PageLoadingShell>
  )
}
