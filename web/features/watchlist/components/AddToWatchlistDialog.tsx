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
import { addToWatchlistAction } from "@/features/watchlist/actions"
import { useTranslations } from "@/lib/i18n"
import type { InstrumentWithListings } from "@/lib/types"

interface SelectedListing {
  listingId: string
  label: string
}

interface ListingOption extends SelectedListing {
  instrumentName: string
  meta: string
}

interface AddToWatchlistDialogProperties {
  onClose: () => void
  open: boolean
}

export function AddToWatchlistDialog({ onClose, open }: AddToWatchlistDialogProperties) {
  const router = useRouter()
  const translations = useTranslations()
  const [query, setQuery] = useState("")
  const [note, setNote] = useState("")
  const [instrumentResults, setInstrumentResults] = useState<InstrumentWithListings[]>([])
  const [selectedListing, setSelectedListing] = useState<SelectedListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchCompleted, setSearchCompleted] = useState(false)
  const [searching, setSearching] = useState(false)
  const [adding, startAdd] = useTransition()
  const busy = adding || searching

  const listingOptions = useMemo<ListingOption[]>(
    () => instrumentResults.flatMap((instrument) => instrument.listings.map((listing) => ({
      instrumentName: instrument.name,
      listingId: listing.id,
      label: `${instrument.name} - ${listing.symbol} - ${listing.exchange_mic ?? "?"} - ${listing.currency}`,
      meta: `${listing.symbol} - ${listing.exchange_mic ?? "?"} - ${listing.currency}`,
    }))),
    [instrumentResults],
  )

  useEffect(() => {
    const trimmedQuery = query.trim()
    if (selectedListing || trimmedQuery.length < 3) {
      setInstrumentResults([])
      setSearching(false)
      setSearchCompleted(false)
      return
    }

    let active = true
    setSearchCompleted(false)
    const handle = window.setTimeout(() => {
      setSearching(true)
      searchInstrumentsAction(trimmedQuery).then((nextResults) => {
        if (!active) return
        setInstrumentResults(nextResults)
        setSearching(false)
        setSearchCompleted(true)
      })
    }, 300)

    return () => {
      active = false
      window.clearTimeout(handle)
    }
  }, [query, selectedListing])

  function closeDialog() {
    if (busy) return
    resetDialog()
    onClose()
  }

  function resetDialog() {
    setQuery("")
    setNote("")
    setInstrumentResults([])
    setSelectedListing(null)
    setSearchCompleted(false)
    setError(null)
  }

  function submitWatchlistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedListing) {
      setError("Select an instrument first.")
      return
    }

    setError(null)
    startAdd(async () => {
      const result = await addToWatchlistAction(selectedListing.listingId, note.trim() || null)
      if (result) {
        setError(result)
        return
      }

      resetDialog()
      onClose()
      router.refresh()
    })
  }

  function selectListing(option: ListingOption) {
    setSelectedListing({ listingId: option.listingId, label: option.label })
    setQuery("")
    setInstrumentResults([])
    setSearchCompleted(false)
  }

  return (
    <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="sm" slotProps={dialogPaperSlotProps}>
      <Box component="form" onSubmit={submitWatchlistItem}>
        <DialogTitle sx={dialogTitleSx}>
          <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>
            Add to watchlist
          </Typography>
        </DialogTitle>
        <DialogContent sx={dialogContentSx}>
          <Stack spacing={0}>
            {error ? <Message>{error}</Message> : null}

            <Stack spacing={1}>
              <Box sx={{ alignItems: "center", display: "flex", gap: 1, justifyContent: "space-between" }}>
                <SectionLabel>Instrument</SectionLabel>
                {selectedListing ? (
                  <Button size="small" onClick={() => setSelectedListing(null)} disabled={adding} sx={ghostButtonSx}>
                    Clear
                  </Button>
                ) : null}
              </Box>

              {selectedListing ? (
                <Box sx={selectedListingSx}>
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 800 }} noWrap>
                      {selectedListing.label}
                    </Typography>
                    <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10, fontWeight: 600 }}>
                      Selected watchlist asset
                    </Typography>
                  </Stack>
                  <AppBadge kind="status" label="Selected" />
                </Box>
              ) : (
                <>
                  <TextField
                    autoFocus
                    fullWidth
                    placeholder="Search asset, ETF, index, or ticker"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    disabled={adding}
                    size="small"
                    sx={compactTextFieldSx}
                  />
                  {query.trim().length > 0 && query.trim().length < 3 ? (
                    <Hint>Type at least 3 characters.</Hint>
                  ) : null}
                  {searching ? <Hint>{translations("addPosition.searching")}</Hint> : null}
                  {searchCompleted && listingOptions.length === 0 ? <Hint>{translations("common.noMatches")}</Hint> : null}
                  {listingOptions.length > 0 ? (
                    <Stack spacing={0.5} sx={resultListSx}>
                      {listingOptions.slice(0, 7).map((option) => (
                        <button
                          key={option.listingId}
                          type="button"
                          onClick={() => selectListing(option)}
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

            <Stack spacing={1} sx={dialogSectionSx}>
              <SectionLabel>Entry note</SectionLabel>
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                placeholder="Optional: trigger, target price, or setup"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={adding}
                size="small"
                slotProps={{ htmlInput: { maxLength: 240 } }}
                sx={compactTextFieldSx}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button onClick={closeDialog} disabled={busy} sx={cancelButtonSx}>
            {translations("common.cancel")}
          </Button>
          <Button type="submit" disabled={adding || !selectedListing} variant="contained" sx={primaryButtonSx}>
            {adding ? "Adding..." : "Add asset"}
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

function Hint({ children }: { children: string }) {
  return <Typography sx={{ color: "var(--app-text-faint)", fontSize: 11, fontWeight: 700 }}>{children}</Typography>
}

function Message({ children }: { children: string }) {
  return (
    <Box
      sx={{
        border: "1px solid color-mix(in srgb, var(--app-negative) 38%, var(--app-border))",
        borderRadius: 1,
        bgcolor: "color-mix(in srgb, var(--app-negative) 10%, transparent)",
        color: "var(--app-negative)",
        fontSize: 12,
        fontWeight: 700,
        mb: 2,
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
  maxHeight: "min(68vh, 640px)",
  overflowY: "auto",
  pb: "22px !important",
  pt: "20px !important",
  px: "16px !important",
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

const selectedListingSx = {
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

const resultListSx = {
  border: "1px solid var(--app-border)",
  borderRadius: 1,
  bgcolor: "var(--app-surface)",
  maxHeight: 184,
  overflowY: "auto",
  p: 0.75,
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
