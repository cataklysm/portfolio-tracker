import Link from "next/link"
import { redirect } from "next/navigation"
import { Box, Breadcrumbs, Card, CardActionArea, Divider, Stack, Typography } from "@mui/material"
import { PageShell } from "@/application/shell/PageShell"
import { appTypography } from "@/application/shell/appTypography"
import { apiFetch, fetchMe } from "@/lib/api"
import type { AdminSymbolsPage, ExchangeView, ProviderSettingsView } from "@/lib/types"

const administrationSections = [
  {
    href: "/administration/symbols",
    title: "Symbols",
    description: "Manage instrument listings, provider assignments, and catalog usage.",
    icon: "symbols",
    metricKey: "symbols",
  },
  {
    href: "/administration/providers",
    title: "Providers",
    description: "Configure provider availability, data quality, batching, and refresh cadence.",
    icon: "providers",
    metricKey: "providers",
  },
  {
    href: "/administration/exchanges",
    title: "Exchanges",
    description: "Maintain exchange metadata, trading hours, and calendar configuration.",
    icon: "exchanges",
    metricKey: "exchanges",
  },
] as const

type AdminSectionKey = (typeof administrationSections)[number]["metricKey"]

type AdminSectionMetric = {
  detail: string
  label: string
  signal: string
  value: string
}

export default async function AdministrationPage() {
  const me = await fetchMe()
  if (me?.role !== "admin") redirect("/dashboard")
  const metrics = await fetchAdministrationMetrics()

  return (
    <PageShell kind="admin">
      <Breadcrumbs aria-label="breadcrumb">
        <Typography sx={appTypography.breadcrumbCurrent}>
          Administration
        </Typography>
      </Breadcrumbs>

      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
        {administrationSections.map((section) => (
          <Card
            key={section.href}
            variant="outlined"
            sx={{
              display: "flex",
              minHeight: 156,
              overflow: "hidden",
              borderColor: "var(--app-border)",
              bgcolor: "var(--app-surface-panel)",
              boxShadow: "var(--app-shadow)",
            }}
          >
            <CardActionArea
              component={Link}
              href={section.href}
              sx={{ alignItems: "stretch", display: "flex", flex: 1, p: 1.5 }}
            >
              <Stack spacing={1.25} sx={{ flex: 1, width: "100%" }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Box sx={{ alignItems: "center", bgcolor: "var(--app-accent-soft)", border: "1px solid color-mix(in srgb, var(--app-accent) 38%, var(--app-border))", borderRadius: 1, color: "var(--app-accent)", display: "flex", height: 40, justifyContent: "center", width: 40 }}>
                    <SectionIcon icon={section.icon} />
                  </Box>
                  <Typography component="h1" sx={appTypography.panelTitle}>
                    {section.title}
                  </Typography>
                </Stack>
                <Divider sx={{ borderColor: "var(--app-divider)" }} />
                <Typography sx={{ ...appTypography.tableSecondary, lineHeight: 1.5 }}>
                  {section.description}
                </Typography>
                <Box sx={{ mt: "auto", pt: 0.5 }}>
                  <SectionMetric metric={metrics[section.metricKey]} />
                </Box>
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </PageShell>
  )
}

function SectionMetric({ metric }: { metric: AdminSectionMetric }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: "flex-end",
        borderTop: "1px solid var(--app-divider)",
        justifyContent: "space-between",
        pt: 1.25,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline" }}>
          <Typography sx={{ ...appTypography.numeric, fontSize: 20, lineHeight: 1 }}>
            {metric.value}
          </Typography>
          <Typography sx={appTypography.tableSecondary}>
            {metric.label}
          </Typography>
        </Stack>
        <Typography noWrap sx={{ ...appTypography.metadata, mt: 0.5 }}>
          {metric.detail}
        </Typography>
      </Box>
      <Typography
        sx={{
          border: "1px solid var(--app-divider)",
          borderRadius: 1,
          color: "var(--app-text-muted)",
          flexShrink: 0,
          fontSize: 10.5,
          fontWeight: 650,
          px: 0.75,
          py: 0.35,
        }}
      >
        {metric.signal}
      </Typography>
    </Stack>
  )
}

async function fetchAdministrationMetrics(): Promise<Record<AdminSectionKey, AdminSectionMetric>> {
  const [symbols, providers, exchanges] = await Promise.all([
    fetchSymbolsMetric(),
    fetchProvidersMetric(),
    fetchExchangesMetric(),
  ])
  return { exchanges, providers, symbols }
}

async function fetchSymbolsMetric(): Promise<AdminSectionMetric> {
  try {
    const resp = await apiFetch("/instruments/admin/symbols?asset_type=equity&limit=1&offset=0", { cache: "no-store" })
    if (!resp.ok) throw new Error("symbols")
    const page = (await resp.json()) as AdminSymbolsPage
    const total = Object.values(page.counts).reduce((sum, count) => sum + count, 0)
    return {
      detail: `${page.counts.equity} equity / ${page.counts.fund} funds / ${page.counts.crypto} crypto / ${page.counts.index} index`,
      label: plural(total, "symbol"),
      signal: "Live catalog",
      value: formatNumber(total),
    }
  } catch {
    return unavailableMetric("symbols")
  }
}

async function fetchProvidersMetric(): Promise<AdminSectionMetric> {
  try {
    const resp = await apiFetch("/admin/providers", { cache: "no-store" })
    if (!resp.ok) throw new Error("providers")
    const body = (await resp.json()) as { providers: ProviderSettingsView[] }
    const providers = body.providers
    const disabled = providers.filter((provider) => !provider.enabled).length
    const symbolProviders = providers.filter((provider) => provider.providerClass === "symbol").length
    const referenceProviders = providers.filter((provider) => provider.providerClass === "reference").length
    return {
      detail: `${symbolProviders} symbol / ${referenceProviders} reference`,
      label: plural(providers.length, "provider"),
      signal: disabled > 0 ? `${disabled} disabled` : "All enabled",
      value: formatNumber(providers.length),
    }
  } catch {
    return unavailableMetric("providers")
  }
}

async function fetchExchangesMetric(): Promise<AdminSectionMetric> {
  try {
    const resp = await apiFetch("/exchanges?include_inactive=true", { cache: "no-store" })
    if (!resp.ok) throw new Error("exchanges")
    const exchanges = (await resp.json()) as ExchangeView[]
    const active = exchanges.filter((exchange) => exchange.active).length
    const disabled = exchanges.length - active
    return {
      detail: `${active} active / ${disabled} disabled`,
      label: plural(exchanges.length, "exchange"),
      signal: "Calendars",
      value: formatNumber(exchanges.length),
    }
  } catch {
    return unavailableMetric("items")
  }
}

function unavailableMetric(label: string): AdminSectionMetric {
  return {
    detail: "Gateway unavailable",
    label,
    signal: "Check",
    value: "-",
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function plural(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`
}

function SectionIcon({ icon }: { icon: (typeof administrationSections)[number]["icon"] }) {
  const pathByIcon = {
    symbols: "M4 6h16M4 12h16M4 18h10",
    providers: "M7 7v4a5 5 0 0 0 10 0V7M9 3v4M15 3v4M12 16v5",
    exchanges: "M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm4 8h3m-3 4h6",
  } as const

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d={pathByIcon[icon]} />
    </svg>
  )
}
