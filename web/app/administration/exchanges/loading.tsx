import { Card, Skeleton, Stack } from "@mui/material"
import { PageLoadingShell, ToolbarSkeleton } from "@/application/shell/PageLoading"

export default function ExchangesAdministrationLoading() {
  return (
    <PageLoadingShell kind="admin" breadcrumb={["Administration", "Exchanges"]}>
      <ToolbarSkeleton search actions={1} />
      <Stack sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "320px minmax(0, 1fr)" } }}>
        <Card variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", boxShadow: "var(--app-shadow)", p: 1 }}>
          {Array.from({ length: 8 }, (_, index) => (
            <Stack key={index} direction="row" spacing={1} sx={{ alignItems: "center", borderRadius: 1, mb: 0.5, px: 1, py: 1 }}>
              <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                <Skeleton animation="wave" variant="text" width={54} height={18} />
                <Skeleton animation="wave" variant="text" width="72%" height={14} />
              </Stack>
              <Skeleton animation="wave" variant="circular" width={28} height={28} />
            </Stack>
          ))}
        </Card>

        <Card variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", boxShadow: "var(--app-shadow)" }}>
          <Stack spacing={0.75} sx={{ borderBottom: "1px solid var(--app-border)", px: 2, py: 1.5 }}>
            <Skeleton animation="wave" variant="text" width={80} height={26} />
            <Skeleton animation="wave" variant="text" width={260} height={18} />
          </Stack>
          <Stack spacing={1.5} sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              <Skeleton animation="wave" variant="rounded" height={56} sx={{ flex: 0.35 }} />
              <Skeleton animation="wave" variant="rounded" height={56} sx={{ flex: 1 }} />
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              <Skeleton animation="wave" variant="rounded" height={56} sx={{ flex: 0.6 }} />
              <Skeleton animation="wave" variant="rounded" height={56} sx={{ flex: 0.35 }} />
              <Skeleton animation="wave" variant="rounded" height={56} sx={{ flex: 0.35 }} />
            </Stack>
            <Skeleton animation="wave" variant="rounded" height={180} />
          </Stack>
        </Card>
      </Stack>
    </PageLoadingShell>
  )
}
