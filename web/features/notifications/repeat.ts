/**
 * Alert repeat behaviour as a single form value, mapped to the backend rule
 * fields. "once" means fire once then disable; "recurring" means fire again
 * whenever the condition is reached again.
 */
export interface RepeatChoice {
  notifyOnce: boolean
}

export const REPEAT_OPTIONS: { value: string; label: string }[] = [
  { value: "once", label: "Only once, then disable" },
  { value: "recurring", label: "Every time the condition triggers" },
]

/** Parses the `repeat` form field into the backend fields; defaults to one-shot. */
export function parseRepeat(raw: FormDataEntryValue | null): RepeatChoice {
  const value = typeof raw === "string" ? raw : "once"
  if (value === "recurring") return { notifyOnce: false }
  return { notifyOnce: true }
}

/** A compact human label for a rule's repeat behaviour. */
export function repeatLabel(rule: { notify_once: boolean }): string {
  return rule.notify_once ? "Only once" : "Recurring"
}
