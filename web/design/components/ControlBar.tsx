"use client"

import Link from "next/link"
import {
  Box,
  Button,
  Card,
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
import { AppBadge } from "@/design/components/AppBadge"
import { AppIcon } from "@/design/icons/AppIcon"

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
  actions,
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
  actions?: ReactNode
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

  function clearVisibleFilters() {
    if (onClearFilters) {
      onClearFilters()
      return
    }

    visibleBadges.forEach((badge) => badge.onClear())
  }

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: "var(--app-border)",
        borderRadius: 1,
        bgcolor: "var(--app-surface-panel)",
        boxShadow: "var(--app-shadow)",
        overflow: "hidden",
      }}
    >
      <Stack
        spacing={0}
        divider={<Box sx={{ borderTop: "1px solid var(--app-divider)" }} />}
      >
        <Box
          sx={{
            alignItems: "center",
            bgcolor: "var(--app-surface-toolbar)",
            display: "grid",
            columnGap: 1.5,
            rowGap: 1,
            gridTemplateColumns: { xs: "1fr", md: "minmax(280px, 1fr) auto" },
            px: 1,
            py: 0.875,
          }}
        >
          <AppSearchField
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            value={searchValue}
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
            {onReload ? (
              <Tooltip title={reloadLabel}>
                <span>
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
                </span>
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
                      bgcolor: "var(--app-accent)",
                      color: "white",
                      height: 40,
                      width: 40,
                      "&:hover": { bgcolor: "color-mix(in srgb, var(--app-accent) 88%, white)" },
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
                      bgcolor: "var(--app-accent)",
                      color: "white",
                      height: 40,
                      width: 40,
                      "&:hover": { bgcolor: "color-mix(in srgb, var(--app-accent) 88%, white)" },
                    }}
                  >
                    <AddIcon />
                  </IconButton>
                )}
              </Tooltip>
            ) : null}
            {actions}
          </Stack>
        </Box>

        <Box
          sx={{
            alignItems: "center",
            bgcolor: "var(--app-surface-header)",
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
                  position: "relative",
                  textTransform: "none",
                  "&:first-of-type": { borderLeft: 0 },
                  "&.Mui-selected": {
                    bgcolor: "color-mix(in srgb, var(--app-accent) 82%, white)",
                    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 46%, transparent)",
                    color: "white",
                  },
                  "&.Mui-selected:hover": {
                    bgcolor: "color-mix(in srgb, var(--app-accent) 88%, white)",
                  },
                },
                "& .MuiToggleButtonGroup-grouped": {
                  margin: 0,
                },
              }}
            >
              {tabs.map((tab) => {
                const selected = tab.value === tabValue
                return (
                  <ToggleButton key={tab.value} value={tab.value}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
                      <Box component="span">{tab.label}</Box>
                      {tab.count !== undefined ? (
                        <AppBadge
                          label={tab.count}
                          kind="count"
                          sx={selected ? {
                            bgcolor: "color-mix(in srgb, white 20%, transparent)",
                            borderColor: "color-mix(in srgb, white 38%, transparent)",
                            color: "white",
                            "& .MuiChip-label": { color: "white" },
                          } : undefined}
                          tone="accent"
                        />
                      ) : null}
                    </Stack>
                  </ToggleButton>
                )
              })}
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
          <Box
            sx={{
              alignItems: "center",
              display: "flex",
              gap: 1,
              justifyContent: "space-between",
              px: 1,
              py: 0.75,
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", flex: "1 1 auto", flexWrap: "wrap", gap: 1, minWidth: 0 }}
            >
              {visibleBadges.map((badge) => (
                <AppBadge
                  key={badge.id}
                  label={badge.label ? `${badge.label}: ${badge.value}` : badge.value}
                  kind="category"
                  onDelete={badge.onClear}
                  sx={{ maxWidth: 280 }}
                />
              ))}
            </Stack>
            <Button
              size="small"
              onClick={clearVisibleFilters}
              startIcon={<ClearFiltersIcon />}
              sx={{
                border: "1px solid var(--app-border)",
                borderRadius: 1,
                color: "var(--app-text-muted)",
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 700,
                height: 30,
                px: 1.25,
                textTransform: "none",
                "& .MuiButton-startIcon": { mr: 0.5 },
                "&:hover": {
                  bgcolor: "var(--app-surface-hover)",
                  borderColor: "var(--app-border-strong)",
                  color: "var(--app-text)",
                },
              }}
            >
              Clear all
            </Button>
          </Box>
        ) : null}
      </Stack>
    </Card>
  )
}

function ReloadIcon() {
  return <AppIcon className="h-4 w-4" name="reload" />
}

function AddIcon() {
  return <AppIcon className="h-4 w-4" name="plus" />
}

function ClearFiltersIcon() {
  return <AppIcon className="h-3.5 w-3.5" name="x" />
}

function AppSearchField({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  return (
    <TextField
      value={value}
      onChange={(event) => onChange(event.target.value)}
      variant="outlined"
      size="small"
      placeholder={placeholder}
      sx={{
        width: "100%",
        "& .MuiInputBase-root": {
          bgcolor: "var(--app-surface-inset)",
          background: "linear-gradient(90deg, color-mix(in srgb, var(--app-surface-inset) 86%, var(--app-surface) 14%) 0%, color-mix(in srgb, var(--app-surface-inset) 72%, var(--app-surface-header) 28%) 72%, transparent 100%)",
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
            background: "linear-gradient(90deg, color-mix(in srgb, var(--app-surface-inset) 70%, var(--app-accent) 8%) 0%, color-mix(in srgb, var(--app-surface-header) 86%, var(--app-accent) 14%) 76%, transparent 100%)",
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
  )
}

function SearchIcon() {
  return <AppIcon className="h-[18px] w-[18px]" name="search" />
}
