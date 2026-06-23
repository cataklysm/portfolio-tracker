"use client"

import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import type { ReactNode } from "react"

const muiTheme = createTheme({
  cssVariables: true,
  palette: {
    mode: "dark",
    primary: {
      main: "#6f8dff",
    },
    success: {
      main: "#55d69a",
    },
    warning: {
      main: "#efb83e",
    },
    error: {
      main: "#ff6f76",
    },
    background: {
      default: "#07111e",
      paper: "#0d1b2a",
    },
    text: {
      primary: "#edf4ff",
      secondary: "#93a4b9",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 700,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderColor: "var(--app-border)",
          backgroundImage: "none",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: "var(--app-divider)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--app-surface-inset)",
        },
        notchedOutline: {
          borderColor: "var(--app-border)",
        },
      },
    },
  },
})

export function MuiThemeProvider({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>
    </AppRouterCacheProvider>
  )
}
