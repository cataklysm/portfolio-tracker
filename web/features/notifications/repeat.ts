/**
 * Alert repeat behaviour as a single form value, mapped to the two backend
 * fields. "once" → fire once then disable; "recurring" → fire on every change;
 * a number → "remind me later" cooldown in minutes (5..1440).
 */
export interface RepeatChoice {
  notifyOnce: boolean
  remindAfterMinutes: number | null
}

export const REPEAT_OPTIONS: { value: string; label: string }[] = [
  { value: "once", label: "Only once, then disable" },
  { value: "5", label: "Remind me again after 5 minutes" },
  { value: "15", label: "Remind me again after 15 minutes" },
  { value: "30", label: "Remind me again after 30 minutes" },
  { value: "60", label: "Remind me again after 1 hour" },
  { value: "240", label: "Remind me again after 4 hours" },
  { value: "720", label: "Remind me again after 12 hours" },
  { value: "1440", label: "Remind me again after 24 hours" },
  { value: "recurring", label: "Every time the condition triggers" },
]

/** Parses the `repeat` form field into the backend fields; defaults to one-shot. */
export function parseRepeat(raw: FormDataEntryValue | null): RepeatChoice {
  const value = typeof raw === "string" ? raw : "once"
  if (value === "recurring") return { notifyOnce: false, remindAfterMinutes: null }
  const minutes = Number(value)
  if (Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440) {
    return { notifyOnce: false, remindAfterMinutes: minutes }
  }
  return { notifyOnce: true, remindAfterMinutes: null }
}

/** A compact human label for a rule's repeat behaviour. */
export function repeatLabel(rule: { notify_once: boolean; remind_after_minutes: number | null }): string {
  if (rule.notify_once) return "Only once"
  if (rule.remind_after_minutes === null) return "Recurring"
  const m = rule.remind_after_minutes
  return m % 60 === 0 ? `After ${m / 60}h` : `After ${m}m`
}
