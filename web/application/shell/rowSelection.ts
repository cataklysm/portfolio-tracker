export const selectedRowGradient = "linear-gradient(90deg, color-mix(in srgb, var(--app-accent) 26%, transparent) 0%, color-mix(in srgb, var(--app-accent) 10%, transparent) 16%, transparent 46%, transparent 100%)"
export const selectedRowHoverGradient = "linear-gradient(90deg, color-mix(in srgb, var(--app-accent) 30%, transparent) 0%, color-mix(in srgb, var(--app-accent) 13%, transparent) 18%, color-mix(in srgb, var(--app-surface-hover) 32%, transparent) 50%, transparent 100%)"

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
