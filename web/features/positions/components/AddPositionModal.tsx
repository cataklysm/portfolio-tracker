"use client"

import { useState } from "react"
import { Box, Dialog, DialogTitle, Stack, Typography } from "@mui/material"
import { useTranslations } from "@/lib/i18n"
import type { ExchangeView, Portfolio } from "@/lib/types"
import { AddPositionForm } from "./AddPositionForm"

interface AddPositionModalProperties {
  portfolios: Portfolio[]
  exchanges: ExchangeView[]
  selectedPortfolioId?: string
  className?: string
  label?: string
}

export function AddPositionModal({ portfolios, exchanges, selectedPortfolioId, className, label }: AddPositionModalProperties) {
  const translations = useTranslations()
  const [open, setOpen] = useState(false)
  const redirectTo = selectedPortfolioId ? `/dashboard?portfolio=${selectedPortfolioId}` : "/dashboard"

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label ?? translations("nav.addPosition")}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" slotProps={dialogPaperSlotProps}>
        <Box>
          <DialogTitle sx={dialogTitleSx}>
            <Stack spacing={0.25}>
              <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>
                {translations("addPosition.title")}
              </Typography>
            </Stack>
          </DialogTitle>
          <AddPositionForm
            portfolios={portfolios}
            exchanges={exchanges}
            defaultPortfolioId={selectedPortfolioId}
            redirectTo={redirectTo}
            onCancel={() => setOpen(false)}
          />
        </Box>
      </Dialog>
    </>
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
      maxWidth: 640,
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
