export const selectedRowGradient = "linear-gradient(90deg, var(--app-selection-strong) 0%, var(--app-selection) 18%, transparent 52%, transparent 100%)"
export const selectedRowHoverGradient = "linear-gradient(90deg, color-mix(in srgb, var(--app-accent) 24%, transparent) 0%, var(--app-selection-strong) 20%, color-mix(in srgb, var(--app-surface-hover) 42%, transparent) 54%, transparent 100%)"

export function selectableRowSx(selected: boolean) {
  return {
    background: selected ? selectedRowGradient : "transparent",
    transition: "background 120ms ease",
    "&:hover": {
      background: selected ? selectedRowHoverGradient : "var(--app-surface-hover)",
    },
    "& > .MuiTableCell-root:first-of-type, & > td:first-of-type": {
      boxShadow: selected ? "inset 3px 0 0 var(--app-accent)" : "none",
    },
  }
}
