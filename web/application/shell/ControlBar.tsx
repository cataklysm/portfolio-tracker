"use client"

import Link from "next/link"
import {
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material"
import type { ReactNode } from "react"

export interface ControlBarTab<TValue extends string> {
  value: TValue
  label: string
  count?: number
}

export interface ControlBarPeriodOption<TValue extends string> {
  value: TValue
  label: string
}

export interface ControlBarFilterBadge {
  id: string
  label?: string
  value: string
  onClear: () => void
}

export function ControlBar<TTab extends string, TPeriod extends string = string>({
  addHref,
  addLabel = "Add",
  badges = [],
  defaultPeriodValue,
  defaultTabValue,
  onAdd,
  onClearFilters,
  onPeriodChange,
  onReload,
  onSearchChange,
  onTabChange,
  periodAddon,
  periodLabel = "Period",
  periodOptions = [],
  periodValue,
  reloadIcon,
  reloadLabel = "Reload",
  reloadLoading = false,
  searchPlaceholder,
  searchValue,
  tabs,
  tabValue,
}: {
  addHref?: string
  addLabel?: string
  badges?: ControlBarFilterBadge[]
  defaultPeriodValue?: TPeriod
  defaultTabValue?: TTab
  onAdd?: () => void
  onClearFilters?: () => void
  onPeriodChange?: (value: TPeriod) => void
  onReload?: () => void
  onSearchChange: (value: string) => void
  onTabChange: (value: TTab) => void
  periodAddon?: ReactNode
  periodLabel?: string
  periodOptions?: readonly ControlBarPeriodOption<TPeriod>[]
  periodValue?: TPeriod
  reloadIcon?: ReactNode
  reloadLabel?: string
  reloadLoading?: boolean
  searchPlaceholder: string
  searchValue: string
  tabs: readonly ControlBarTab<TTab>[]
  tabValue: TTab
}) {
  const activeTab = tabs.find((tab) => tab.value === tabValue)
  const activePeriod = periodOptions.find((option) => option.value === periodValue)
  const generatedBadges: ControlBarFilterBadge[] = [
    ...(searchValue.trim()
      ? [{ id: "search", label: "Search", value: searchValue.trim(), onClear: () => onSearchChange("") }]
      : []),
    ...(activeTab && tabValue !== (defaultTabValue ?? tabs[0]?.value)
      ? [{ id: "tab", value: activeTab.label, onClear: () => onTabChange(defaultTabValue ?? tabs[0]!.value) }]
      : []),
    ...(activePeriod && periodValue !== undefined && periodValue !== defaultPeriodValue
      ? [{ id: "period", label: periodLabel, value: activePeriod.label, onClear: () => defaultPeriodValue && onPeriodChange?.(defaultPeriodValue) }]
      : []),
  ]
  const visibleBadges = [...generatedBadges, ...badges]
  const hasAdd = Boolean(addHref || onAdd)

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: "var(--app-border)",
        borderRadius: 1,
        bgcolor: "color-mix(in srgb, var(--app-surface-raised) 94%, transparent)",
        boxShadow: "var(--app-shadow)",
        overflow: "hidden",
      }}
    >
      <Stack
        spacing={0}
        divider={<Box sx={{ borderTop: "1px solid color-mix(in srgb, var(--app-border) 82%, transparent)" }} />}
      >
        <Box
          sx={{
            alignItems: "center",
            display: "grid",
            columnGap: 1.5,
            rowGap: 1,
            gridTemplateColumns: { xs: "1fr", md: "minmax(280px, 1fr) auto" },
            px: 1,
            py: 0.875,
          }}
        >
          <TextField
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            variant="outlined"
            size="small"
            placeholder={searchPlaceholder}
            sx={{
              width: "100%",
              "& .MuiInputBase-root": {
                bgcolor: "transparent",
                background: "linear-gradient(90deg, color-mix(in srgb, var(--app-surface) 64%, var(--app-surface-raised) 36%) 0%, color-mix(in srgb, var(--app-surface) 42%, var(--app-surface-raised) 58%) 72%, transparent 100%)",
                borderRadius: 1,
                color: "var(--app-text)",
                height: 40,
                position: "relative",
                transition: "background 140ms ease, box-shadow 140ms ease",
                "&::before": {
                  background: "linear-gradient(90deg, color-mix(in srgb, var(--app-border) 58%, transparent) 0%, color-mix(in srgb, var(--app-border) 44%, transparent) 72%, transparent 100%)",
                  borderRadius: "inherit",
                  content: "\"\"",
                  inset: 0,
                  padding: "1px",
                  pointerEvents: "none",
                  position: "absolute",
                  WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                },
                "&.Mui-focused": {
                  background: "linear-gradient(90deg, color-mix(in srgb, var(--app-surface) 78%, var(--app-surface-raised) 22%) 0%, color-mix(in srgb, var(--app-surface) 54%, var(--app-surface-raised) 46%) 76%, transparent 100%)",
                  boxShadow: "0 0 0 1px color-mix(in srgb, var(--app-accent) 28%, transparent)",
                },
                "&.Mui-focused::before": {
                  background: "linear-gradient(90deg, color-mix(in srgb, var(--app-accent) 48%, transparent) 0%, color-mix(in srgb, var(--app-accent) 34%, transparent) 76%, transparent 100%)",
                },
              },
              "& .MuiInputBase-input": {
                fontSize: 14,
                fontWeight: 600,
                py: 0,
                zIndex: 1,
                "&::placeholder": {
                  color: "var(--app-text-faint)",
                  opacity: 0.82,
                },
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "transparent",
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "transparent",
              },
              "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "transparent",
              },
              "& .MuiInputAdornment-root": { color: "var(--app-text-faint)", mr: 0.75, zIndex: 1 },
            }}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
              },
            }}
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
            {onReload ? (
              <Tooltip title={reloadLabel}>
                <IconButton
                  aria-label={reloadLabel}
                  onClick={onReload}
                  disabled={reloadLoading}
                  sx={{
                    border: "1px solid var(--app-border)",
                    borderRadius: 1,
                    color: "var(--app-text-muted)",
                    height: 40,
                    width: 40,
                    "&:hover": { bgcolor: "var(--app-surface-hover)", color: "var(--app-text)" },
                  }}
                >
                  {reloadLoading ? <CircularProgress size={16} /> : reloadIcon ?? <ReloadIcon />}
                </IconButton>
              </Tooltip>
            ) : null}
            {hasAdd ? (
              <Tooltip title={addLabel}>
                {addHref ? (
                  <IconButton
                    component={Link}
                    href={addHref}
                    aria-label={addLabel}
                    sx={{
                      border: "1px solid color-mix(in srgb, var(--app-accent) 62%, var(--app-border))",
                      borderRadius: 1,
                      bgcolor: "var(--app-primary)",
                      color: "white",
                      height: 40,
                      width: 40,
                      "&:hover": { bgcolor: "color-mix(in srgb, var(--app-primary) 88%, white)" },
                    }}
                  >
                    <AddIcon />
                  </IconButton>
                ) : (
                  <IconButton
                    aria-label={addLabel}
                    onClick={onAdd}
                    sx={{
                      border: "1px solid color-mix(in srgb, var(--app-accent) 62%, var(--app-border))",
                      borderRadius: 1,
                      bgcolor: "var(--app-primary)",
                      color: "white",
                      height: 40,
                      width: 40,
                      "&:hover": { bgcolor: "color-mix(in srgb, var(--app-primary) 88%, white)" },
                    }}
                  >
                    <AddIcon />
                  </IconButton>
                )}
              </Tooltip>
            ) : null}
          </Stack>
        </Box>

        <Box
          sx={{
            alignItems: "center",
            display: "flex",
            gap: 1.25,
            justifyContent: "space-between",
            px: 1,
            py: 0.75,
            minHeight: 52,
          }}
        >
          <Box sx={{ alignItems: "center", display: "flex", minWidth: 0 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={tabValue}
              onChange={(_, value: TTab | null) => { if (value) onTabChange(value) }}
              sx={{
                flexShrink: 0,
                flexWrap: "wrap",
                border: "1px solid var(--app-border)",
                borderRadius: 1,
                overflow: "hidden",
                "& .MuiToggleButton-root": {
                  alignItems: "center",
                  border: 0,
                  borderLeft: "1px solid var(--app-border)",
                  color: "var(--app-text)",
                  display: "inline-flex",
                  fontSize: 13,
                  fontWeight: 600,
                  height: 36,
                  justifyContent: "center",
                  letterSpacing: 0,
                  minHeight: 0,
                  minWidth: 132,
                  px: 2,
                  py: 0,
                  textTransform: "none",
                  "&:first-of-type": { borderLeft: 0 },
                  "&.Mui-selected": {
                    bgcolor: "color-mix(in srgb, var(--app-primary) 82%, white)",
                    color: "white",
                  },
                  "&.Mui-selected:hover": {
                    bgcolor: "color-mix(in srgb, var(--app-primary) 88%, white)",
                  },
                },
              }}
            >
              {tabs.map((tab) => (
                <ToggleButton key={tab.value} value={tab.value}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
                    <Box component="span">{tab.label}</Box>
                    {tab.count !== undefined ? (
                      <Chip
                        label={tab.count}
                        color="primary"
                        size="small"
                        sx={{
                          height: 20,
                          minWidth: 30,
                          "& .MuiChip-label": { fontSize: 11, fontWeight: 800, px: 0.75 },
                        }}
                      />
                    ) : null}
                  </Stack>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
            {periodOptions.length > 0 && periodValue !== undefined && onPeriodChange ? (
              <FormControl variant="standard" sx={{ minWidth: 180 }}>
                <Select
                  value={periodValue}
                  onChange={(event) => onPeriodChange(event.target.value as TPeriod)}
                  sx={{
                    color: "var(--app-text)",
                    fontSize: 14,
                    fontWeight: 600,
                    "& .MuiSelect-select": { py: 0.75 },
                    "&:before": { borderBottomColor: "var(--app-border)" },
                    "&:hover:not(.Mui-disabled):before": { borderBottomColor: "var(--app-text-muted)" },
                    "&:after": { borderBottomColor: "var(--app-accent)" },
                  }}
                >
                  {periodOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}
            {periodAddon}
          </Stack>
        </Box>

        {visibleBadges.length > 0 ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1, px: 1, py: 0.75 }}>
            {visibleBadges.map((badge) => (
              <Chip
                key={badge.id}
                label={badge.label ? `${badge.label}: ${badge.value}` : badge.value}
                onDelete={badge.onClear}
                variant="outlined"
                color="primary"
                sx={{
                  bgcolor: "var(--app-surface)",
                  borderColor: "var(--app-border)",
                  color: "var(--app-accent)",
                  fontSize: 13,
                  fontWeight: 600,
                  maxWidth: 280,
                  "& .MuiChip-deleteIcon": { color: "var(--app-text-muted)" },
                }}
              />
            ))}
            {onClearFilters ? (
              <Button size="small" onClick={onClearFilters} sx={{ fontWeight: 700, textTransform: "none" }}>Clear all</Button>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m21 21-4.4-4.4M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ReloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.2 12A6.5 6.5 0 0 0 7.1 7.4L4 12M5.8 12a6.5 6.5 0 0 0 11.1 4.6L20 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AddIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}
