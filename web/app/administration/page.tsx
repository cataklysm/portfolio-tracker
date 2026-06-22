import Link from "next/link"
import { redirect } from "next/navigation"
import { Box, Breadcrumbs, Card, CardActionArea, Divider, Stack, Typography } from "@mui/material"
import { PageShell } from "@/application/shell/PageShell"
import { fetchMe } from "@/lib/api"

const administrationSections = [
  {
    href: "/administration/symbols",
    title: "Symbols",
    description: "Manage instrument listings, provider assignments, and catalog usage.",
    icon: "symbols",
  },
  {
    href: "/administration/providers",
    title: "Providers",
    description: "Configure provider availability, data quality, batching, and refresh cadence.",
    icon: "providers",
  },
  {
    href: "/administration/exchanges",
    title: "Exchanges",
    description: "Maintain exchange metadata, trading hours, and calendar configuration.",
    icon: "exchanges",
  },
] as const

export default async function AdministrationPage() {
  const me = await fetchMe()
  if (me?.role !== "admin") redirect("/dashboard")

  return (
    <PageShell kind="admin">
      <Breadcrumbs aria-label="breadcrumb">
        <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700 }}>
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
              minHeight: 180,
              overflow: "hidden",
              borderColor: "var(--app-border)",
              bgcolor: "var(--app-surface-raised)",
              boxShadow: "var(--app-shadow)",
            }}
          >
            <CardActionArea
              component={Link}
              href={section.href}
              sx={{ alignItems: "stretch", display: "flex", flex: 1, p: 2 }}
            >
              <Stack spacing={1.25} sx={{ flex: 1, width: "100%" }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Box sx={{ alignItems: "center", bgcolor: "var(--app-accent-soft)", border: "1px solid color-mix(in srgb, var(--app-accent) 45%, var(--app-border))", borderRadius: 1, color: "var(--app-accent)", display: "flex", height: 44, justifyContent: "center", width: 44 }}>
                    <SectionIcon icon={section.icon} />
                  </Box>
                  <Typography component="h1" sx={{ color: "var(--app-text)", fontSize: 15, fontWeight: 700 }}>
                    {section.title}
                  </Typography>
                </Stack>
                <Divider />
                <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12, lineHeight: 1.55 }}>
                  {section.description}
                </Typography>
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </PageShell>
  )
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
