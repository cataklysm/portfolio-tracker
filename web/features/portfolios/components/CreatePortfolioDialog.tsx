"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react"
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material"
import { AppBadge } from "@/application/shell/AppBadge"
import { searchInstrumentsAction } from "@/features/positions/actions"
import { createPortfolioWithBenchmarkAction } from "@/features/portfolios/actions"
import { useTranslations } from "@/lib/i18n"
import type { InstrumentWithListings } from "@/lib/types"

interface SelectedBenchmark {
  listingId: string
  label: string
}

export function CreatePortfolioDialog({
  onClose,
  open,
}: {
  onClose: () => void
  open: boolean
}) {
  const router = useRouter()
  const t = useTranslations()
  const [portfolioName, setPortfolioName] = useState("")
  const [benchmarkQuery, setBenchmarkQuery] = useState("")
  const [benchmarkResults, setBenchmarkResults] = useState<InstrumentWithListings[]>([])
  const [selectedBenchmark, setSelectedBenchmark] = useState<SelectedBenchmark | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchingBenchmark, setSearchingBenchmark] = useState(false)
  const [benchmarkSearchCompleted, setBenchmarkSearchCompleted] = useState(false)
  const [creating, startCreate] = useTransition()
  const busy = searchingBenchmark || creating
  const trimmedName = portfolioName.trim()
  const benchmarkOptions = useMemo(
    () => benchmarkResults.flatMap((instrument) => instrument.listings.map((listing) => ({
      instrumentName: instrument.name,
      listingId: listing.id,
      label: `${instrument.name} · ${listing.symbol} · ${listing.exchange_mic ?? "?"} · ${listing.currency}`,
      meta: `${listing.symbol} · ${listing.exchange_mic ?? "?"} · ${listing.currency}`,
    }))),
    [benchmarkResults],
  )

  useEffect(() => {
    const query = benchmarkQuery.trim()
    if (selectedBenchmark || query.length < 3) {
      setBenchmarkResults([])
      setSearchingBenchmark(false)
      setBenchmarkSearchCompleted(false)
      return
    }

    let active = true
    setBenchmarkSearchCompleted(false)
    const handle = window.setTimeout(() => {
      setSearchingBenchmark(true)
      searchInstrumentsAction(query).then((results) => {
        if (!active) return
        setBenchmarkResults(results)
        setSearchingBenchmark(false)
        setBenchmarkSearchCompleted(true)
      })
    }, 300)

    return () => {
      active = false
      window.clearTimeout(handle)
    }
  }, [benchmarkQuery, selectedBenchmark])

  function closeDialog() {
    if (busy) return
    resetDialog()
    onClose()
  }

  function resetDialog() {
    setPortfolioName("")
    setBenchmarkQuery("")
    setBenchmarkResults([])
    setSelectedBenchmark(null)
    setBenchmarkSearchCompleted(false)
    setError(null)
  }

  function submitPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trimmedName) {
      setError("A portfolio name is required.")
      return
    }

    setError(null)
    startCreate(async () => {
      const result = await createPortfolioWithBenchmarkAction(trimmedName, selectedBenchmark?.listingId ?? null)
      if (result.error) {
        setError(result.error)
        return
      }

      resetDialog()
      onClose()
      if (result.portfolioId) router.push(`/dashboard?portfolio=${result.portfolioId}`)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="sm" slotProps={dialogPaperSlotProps}>
      <Box component="form" onSubmit={submitPortfolio}>
        <DialogTitle sx={dialogTitleSx}>
          <Stack spacing={0.25}>
            <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>Create portfolio</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent sx={dialogContentSx}>
          <Stack spacing={0}>
            {error ? <Message tone="error">{error}</Message> : null}

            <Stack spacing={1}>
              <SectionLabel>Basics</SectionLabel>
              <TextField
                autoFocus
                fullWidth
                placeholder={t("createPortfolio.namePlaceholder")}
                value={portfolioName}
                onChange={(event) => setPortfolioName(event.target.value)}
                disabled={creating}
                size="small"
                slotProps={{ htmlInput: { maxLength: 120 } }}
                sx={compactTextFieldSx}
              />
            </Stack>

            <Stack spacing={1} sx={dialogSectionSx}>
              <Box sx={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 1 }}>
                <SectionLabel>Benchmark asset</SectionLabel>
                {selectedBenchmark ? (
                  <Button size="small" onClick={() => setSelectedBenchmark(null)} disabled={creating} sx={ghostButtonSx}>
                    Clear
                  </Button>
                ) : null}
              </Box>

              {selectedBenchmark ? (
                <Box sx={selectedBenchmarkSx}>
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 800 }} noWrap>
                      {selectedBenchmark.label}
                    </Typography>
                    <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10, fontWeight: 600 }}>
                      Selected benchmark
                    </Typography>
                  </Stack>
                  <AppBadge kind="status" label="Selected" />
                </Box>
              ) : (
                <>
                  <TextField
                    fullWidth
                    placeholder="Search index, ETF, or ticker"
                    value={benchmarkQuery}
                    onChange={(event) => setBenchmarkQuery(event.target.value)}
                    disabled={creating}
                    size="small"
                    sx={compactTextFieldSx}
                  />
                  {benchmarkQuery.trim().length > 0 && benchmarkQuery.trim().length < 3 ? (
                    <Typography sx={{ color: "var(--app-text-faint)", fontSize: 11, fontWeight: 700 }}>
                      Type at least 3 characters.
                    </Typography>
                  ) : null}
                  {searchingBenchmark ? (
                    <Typography sx={{ color: "var(--app-text-faint)", fontSize: 11, fontWeight: 700 }}>
                      Searching...
                    </Typography>
                  ) : null}
                  {benchmarkSearchCompleted && benchmarkOptions.length === 0 ? (
                    <Typography sx={{ color: "var(--app-text-faint)", fontSize: 11, fontWeight: 700 }}>
                      No match.
                    </Typography>
                  ) : null}
                  {benchmarkOptions.length > 0 ? (
                    <Stack spacing={0.5} sx={resultListSx}>
                      {benchmarkOptions.slice(0, 5).map((option) => (
                        <button
                          key={option.listingId}
                          type="button"
                          onClick={() => {
                            setSelectedBenchmark({ listingId: option.listingId, label: option.label })
                            setBenchmarkQuery("")
                            setBenchmarkResults([])
                            setBenchmarkSearchCompleted(false)
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-2.5 py-2 text-left transition hover:border-[color-mix(in_srgb,var(--app-accent)_52%,var(--app-border))] hover:bg-[var(--app-surface-hover)]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-[var(--app-text)]">{option.instrumentName}</span>
                            <span className="block text-[10px] font-semibold text-[var(--app-text-faint)]">{option.meta}</span>
                          </span>
                          <span className="shrink-0 text-[10px] font-bold text-[var(--app-accent)]">Select</span>
                        </button>
                      ))}
                    </Stack>
                  ) : null}
                </>
              )}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button onClick={closeDialog} disabled={busy} sx={cancelButtonSx}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={creating || !trimmedName} variant="contained" sx={primaryButtonSx}>
            {creating ? t("createPortfolio.creating") : t("createPortfolio.submit")}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10, fontWeight: 800, letterSpacing: 0.4, lineHeight: 1.35, textTransform: "uppercase" }}>
      {children}
    </Typography>
  )
}

function Message({ children, tone }: { children: string; tone: "error" | "warning" }) {
  const color = tone === "error" ? "var(--app-negative)" : "var(--app-warning)"
  return (
    <Box
      sx={{
        border: `1px solid color-mix(in srgb, ${color} 38%, var(--app-border))`,
        borderRadius: 1,
        bgcolor: `color-mix(in srgb, ${color} 10%, transparent)`,
        color,
        fontSize: 12,
        fontWeight: 700,
        px: 1.25,
        py: 1,
      }}
    >
      {children}
    </Box>
  )
}

const dialogPaperSlotProps = {
  paper: {
    sx: {
      bgcolor: "var(--app-surface-panel)",
      backgroundImage: "none",
      border: "1px solid var(--app-border)",
      borderRadius: 1,
      boxShadow: "var(--app-shadow)",
      color: "var(--app-text)",
      maxWidth: 560,
      overflow: "hidden",
      width: "calc(100% - 48px)",
    },
  },
}

const dialogTitleSx = {
  borderBottom: "1px solid var(--app-divider)",
  bgcolor: "var(--app-surface-header)",
  px: 2,
  py: 1.5,
}

const dialogContentSx = {
  bgcolor: "var(--app-surface-raised)",
  px: "16px !important",
  pb: "22px !important",
  pt: "20px !important",
}

const dialogSectionSx = {
  borderTop: "1px solid var(--app-divider)",
  mt: "20px !important",
  pt: "18px !important",
}

const dialogActionsSx = {
  borderTop: "1px solid var(--app-divider)",
  bgcolor: "color-mix(in srgb, var(--app-surface-header) 82%, var(--app-surface-panel))",
  boxShadow: "inset 0 1px 0 color-mix(in srgb, white 4%, transparent)",
  gap: 1,
  justifyContent: "flex-end",
  px: 2,
  py: 1.25,
}

const compactTextFieldSx = {
  "& .MuiInputBase-root": {
    bgcolor: "var(--app-surface-inset)",
    borderRadius: 1,
    color: "var(--app-text)",
    fontSize: 13,
    fontWeight: 700,
    minHeight: 38,
  },
  "& .MuiInputBase-input": { py: 0.85 },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--app-border)" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--app-border-strong)" },
  "& .Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "var(--app-accent)" },
  "& .MuiInputBase-input::placeholder": { color: "var(--app-text-faint)", opacity: 0.85 },
}

const primaryButtonSx = {
  bgcolor: "var(--app-accent)",
  borderRadius: 1,
  boxShadow: "none",
  fontSize: 12,
  fontWeight: 800,
  height: 34,
  px: 2,
  textTransform: "none",
  "&:hover": { bgcolor: "color-mix(in srgb, var(--app-accent) 88%, white)", boxShadow: "none" },
}

const cancelButtonSx = {
  color: "var(--app-text-muted)",
  fontSize: 12,
  fontWeight: 800,
  height: 34,
  px: 1.5,
  textTransform: "none",
}

const ghostButtonSx = {
  color: "var(--app-text-muted)",
  fontSize: 11,
  fontWeight: 800,
  minHeight: 0,
  px: 0.75,
  py: 0.25,
  textTransform: "none",
}

const resultListSx = {
  border: "1px solid var(--app-border)",
  borderRadius: 1,
  bgcolor: "var(--app-surface)",
  maxHeight: 164,
  overflowY: "auto",
  p: 0.75,
}

const selectedBenchmarkSx = {
  alignItems: "center",
  border: "1px solid color-mix(in srgb, var(--app-positive) 38%, var(--app-border))",
  borderRadius: 1,
  bgcolor: "color-mix(in srgb, var(--app-positive) 8%, var(--app-surface-inset))",
  display: "flex",
  gap: 1,
  justifyContent: "space-between",
  px: 1.25,
  py: 1,
  "& .MuiChip-root": {
    flexShrink: 0,
    maxWidth: "none",
  },
}
