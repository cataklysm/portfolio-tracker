"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { Box, Button, DialogActions, DialogContent, Stack, Typography } from "@mui/material"
import { AppBadge } from "@/design/components/AppBadge"
import { createPositionAction, searchInstrumentsAction } from "@/features/positions/actions"
import { useTranslations } from "@/lib/i18n"
import type { ExchangeView, InstrumentWithListings, Portfolio } from "@/lib/types"

interface SelectedListing {
  listingId: string
  label: string
  currency: string
}

interface ListingOption extends SelectedListing {
  instrumentName: string
  meta: string
}

interface AddPositionFormProperties {
  portfolios: Portfolio[]
  exchanges: ExchangeView[]
  defaultPortfolioId?: string
  onCancel: () => void
  redirectTo?: string
}

export function AddPositionForm({ portfolios, exchanges, defaultPortfolioId, onCancel, redirectTo }: AddPositionFormProperties) {
  const translations = useTranslations()
  const [error, formAction, isPending] = useActionState(createPositionAction, null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<InstrumentWithListings[]>([])
  const [searchCompleted, setSearchCompleted] = useState(false)
  const [selected, setSelected] = useState<SelectedListing | null>(null)
  const [manual, setManual] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const listingOptions = useMemo<ListingOption[]>(
    () => results.flatMap((instrument) => instrument.listings.map((listing) => ({
      currency: listing.currency,
      instrumentName: instrument.name,
      label: `${instrument.name} · ${listing.symbol} · ${listing.exchange_mic ?? "?"} · ${listing.currency}`,
      listingId: listing.id,
      meta: `${listing.symbol} · ${listing.exchange_mic ?? "?"} · ${listing.currency}`,
    }))),
    [results],
  )

  useEffect(() => {
    if (manual || selected) return
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 3) {
      setResults([])
      setSearchCompleted(false)
      setIsSearching(false)
      return
    }

    let active = true
    setSearchCompleted(false)
    const handle = window.setTimeout(() => {
      setIsSearching(true)
      searchInstrumentsAction(trimmedQuery).then((nextResults) => {
        if (!active) return
        setResults(nextResults)
        setIsSearching(false)
        setSearchCompleted(true)
      })
    }, 300)

    return () => {
      active = false
      window.clearTimeout(handle)
    }
  }, [manual, query, selected])

  function selectListing(option: ListingOption) {
    setSelected({ currency: option.currency, label: option.label, listingId: option.listingId })
    setQuery("")
    setResults([])
    setSearchCompleted(false)
  }

  function clearSelection() {
    setSelected(null)
    setQuery("")
    setResults([])
    setSearchCompleted(false)
  }

  return (
    <Box component="form" action={formAction}>
      {redirectTo ? <input type="hidden" name="redirect_to" value={redirectTo} /> : null}
      {selected ? <input type="hidden" name="listing_id" value={selected.listingId} /> : null}
      {selected ? <input type="hidden" name="currency" value={selected.currency} /> : null}

      <DialogContent sx={dialogContentSx}>
        <Stack spacing={0}>
          {error ? <Message>{error}</Message> : null}

          <Stack spacing={1}>
            <SectionLabel>{translations("addPosition.portfolio")}</SectionLabel>
            <select id="portfolio_id" name="portfolio_id" required className={fieldClassName} defaultValue={defaultPortfolioId ?? portfolios[0]?.id}>
              {portfolios.map((portfolio) => (
                <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>
              ))}
            </select>
          </Stack>

          {!manual ? (
            <Stack spacing={1} sx={dialogSectionSx}>
              <Box sx={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 1 }}>
                <SectionLabel>{translations("addPosition.instrument")}</SectionLabel>
                {selected ? (
                  <Button size="small" onClick={clearSelection} disabled={isPending} sx={ghostButtonSx}>
                    {translations("addPosition.change")}
                  </Button>
                ) : null}
              </Box>

              {selected ? (
                <Box sx={selectedListingSx}>
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 800 }} noWrap>
                      {selected.label}
                    </Typography>
                    <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10, fontWeight: 600 }}>
                      Selected instrument
                    </Typography>
                  </Stack>
                  <AppBadge kind="status" label="Selected" />
                </Box>
              ) : (
                <>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={translations("common.searchPlaceholder")}
                    className={fieldClassName}
                  />
                  {query.trim().length > 0 && query.trim().length < 3 ? (
                    <Typography sx={hintTextSx}>Type at least 3 characters.</Typography>
                  ) : null}
                  {isSearching ? <Typography sx={hintTextSx}>{translations("addPosition.searching")}</Typography> : null}
                  {searchCompleted && listingOptions.length === 0 ? (
                    <Typography sx={hintTextSx}>{translations("common.noMatches")}</Typography>
                  ) : null}
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
                  <Button type="button" onClick={() => setManual(true)} sx={linkButtonSx}>
                    {translations("addPosition.cantFind")}
                  </Button>
                </>
              )}
            </Stack>
          ) : null}

          {manual ? (
            <Stack spacing={1.5} sx={dialogSectionSx}>
              <Box sx={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 1 }}>
                <SectionLabel>{translations("addPosition.newInstrument")}</SectionLabel>
                <Button type="button" onClick={() => setManual(false)} sx={ghostButtonSx}>
                  {translations("addPosition.backToSearch")}
                </Button>
              </Box>
              <Field label={translations("addPosition.name")}>
                <input id="name" name="name" placeholder={translations("addPosition.namePlaceholder")} className={fieldClassName} />
              </Field>
              <Box sx={twoColumnGridSx}>
                <Field label={translations("addPosition.type")}>
                  <select id="asset_type" name="asset_type" className={fieldClassName}>
                    <option value="equity">{translations("addPosition.equity")}</option>
                    <option value="crypto">{translations("addPosition.crypto")}</option>
                    <option value="fund">{translations("addPosition.fund")}</option>
                  </select>
                </Field>
                <Field label={translations("addPosition.symbol")}>
                  <input id="symbol" name="symbol" placeholder={translations("addPosition.symbolPlaceholder")} className={fieldClassName} />
                </Field>
              </Box>
              <Box sx={twoColumnGridSx}>
                <Field label={translations("addPosition.exchange")}>
                  <select id="exchange_mic" name="exchange_mic" className={fieldClassName}>
                    {exchanges.map((exchange) => (
                      <option key={exchange.id} value={exchange.mic}>{exchange.mic} · {exchange.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={translations("addPosition.currency")}>
                  <input id="currency-manual" name="currency" placeholder={translations("addPosition.currencyPlaceholder")} maxLength={3} className={`${fieldClassName} uppercase`} />
                </Field>
              </Box>
            </Stack>
          ) : null}

          <Stack spacing={1.5} sx={dialogSectionSx}>
            <SectionLabel>{translations("addPosition.firstBuy")}</SectionLabel>
            <Box sx={twoColumnGridSx}>
              <Field label={translations("addPosition.quantity")}>
                <input id="quantity" name="quantity" type="number" step="any" min="0" required placeholder={translations("addPosition.quantityPlaceholder")} className={fieldClassName} />
              </Field>
              <Field label={translations("addPosition.price")}>
                <input id="price" name="price" type="number" step="any" min="0" required placeholder={translations("addPosition.pricePlaceholder")} className={fieldClassName} />
              </Field>
            </Box>
            <Box sx={twoColumnGridSx}>
              <Field label={translations("addPosition.brokerFee")}>
                <input id="fee" name="fee" type="number" step="any" min="0" defaultValue="0" className={fieldClassName} />
              </Field>
              <Field label={translations("addPosition.tradeDate")}>
                <input id="effective_at" name="effective_at" type="date" required defaultValue={today} className={fieldClassName} />
              </Field>
            </Box>
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={dialogActionsSx}>
        <Button type="button" onClick={onCancel} disabled={isPending} sx={cancelButtonSx}>
          {translations("common.cancel")}
        </Button>
        <Button type="submit" disabled={isPending || (!selected && !manual)} variant="contained" sx={primaryButtonSx}>
          {isPending ? translations("addPosition.creating") : translations("addPosition.submit")}
        </Button>
      </DialogActions>
    </Box>
  )
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Stack spacing={0.75}>
      <Typography sx={fieldLabelSx}>{label}</Typography>
      {children}
    </Stack>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10, fontWeight: 800, letterSpacing: 0.4, lineHeight: 1.35, textTransform: "uppercase" }}>
      {children}
    </Typography>
  )
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

const fieldClassName =
  "h-[38px] w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-3 text-[13px] font-bold text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-text-faint)] focus:border-[var(--app-accent)]"

const dialogContentSx = {
  bgcolor: "var(--app-surface-raised)",
  maxHeight: "min(68vh, 680px)",
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

const fieldLabelSx = {
  color: "var(--app-text-faint)",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.35,
  lineHeight: 1.35,
}

const hintTextSx = {
  color: "var(--app-text-faint)",
  fontSize: 11,
  fontWeight: 700,
}

const twoColumnGridSx = {
  display: "grid",
  gap: 1.25,
  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
}

const resultListSx = {
  border: "1px solid var(--app-border)",
  borderRadius: 1,
  bgcolor: "var(--app-surface)",
  maxHeight: 184,
  overflowY: "auto",
  p: 0.75,
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

const linkButtonSx = {
  alignSelf: "flex-start",
  color: "var(--app-text-muted)",
  fontSize: 11,
  fontWeight: 800,
  minHeight: 0,
  px: 0,
  py: 0.25,
  textTransform: "none",
  "&:hover": { color: "var(--app-accent)", bgcolor: "transparent" },
}
