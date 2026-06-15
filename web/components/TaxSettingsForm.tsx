"use client"
import type { TaxSettingsField, TaxSettingsSchema } from "@/lib/types"

type Values = Record<string, unknown>

const FIELD =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-1.5 text-[12px] text-[var(--app-text)] outline-none focus:ring-1 focus:ring-[var(--app-accent)]"
const LABEL = "mb-1 block text-[10px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]"

/**
 * Renders a tax settings form purely from its JSON schema (no hardcoded
 * per-country controls). Conditional fields appear only when their `visibleWhen`
 * conditions hold; `array` fields render an add/remove list of item rows. The
 * component is controlled: it reads `value` and reports edits through `onChange`.
 */
export function TaxSettingsForm({
  schema,
  value,
  onChange,
}: {
  schema: TaxSettingsSchema
  value: Values
  onChange: (next: Values) => void
}) {
  return <div className="space-y-3">{renderFields(schema.fields, value, onChange)}</div>
}

/** Initial values for a schema, applying each field's default (for new settings). */
export function taxSettingsDefaults(schema: TaxSettingsSchema, existing?: Values): Values {
  const out: Values = { ...existing }
  for (const field of schema.fields) {
    if (out[field.key] === undefined && field.default !== undefined) out[field.key] = field.default
  }
  return out
}

function renderFields(fields: TaxSettingsField[], scope: Values, setScope: (next: Values) => void) {
  return [...fields]
    .sort((a, b) => a.order - b.order)
    .filter((field) => isVisible(field, scope))
    .map((field) => (
      <FieldRow
        key={field.key}
        field={field}
        value={scope[field.key]}
        onChange={(v) => setScope({ ...scope, [field.key]: v })}
      />
    ))
}

function FieldRow({ field, value, onChange }: { field: TaxSettingsField; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === "array") return <ArrayField field={field} value={value} onChange={onChange} />
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-[12px] text-[var(--app-text)]">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-[var(--app-border)] bg-[var(--app-surface-raised)]"
        />
        <span>{field.label}</span>
        {field.helpText ? <Help text={field.helpText} /> : null}
      </label>
    )
  }
  return (
    <label className="block">
      <span className={LABEL}>
        {field.label}
        {field.required ? " *" : ""}
      </span>
      <Control field={field} value={value} onChange={onChange} />
      {field.helpText ? <p className="mt-1 text-[10px] leading-4 text-[var(--app-text-faint)]">{field.helpText}</p> : null}
    </label>
  )
}

function Control({ field, value, onChange }: { field: TaxSettingsField; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case "select":
      return (
        <select className={FIELD} value={asString(value)} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>
            Select…
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case "date":
      return <input type="date" className={FIELD} value={asString(value)} onChange={(e) => onChange(e.target.value || undefined)} />
    case "currency":
      return (
        <input
          type="text"
          maxLength={3}
          className={`${FIELD} uppercase`}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      )
    case "number":
    case "money":
      return (
        <input
          type="number"
          step={field.step ?? "any"}
          min={field.min}
          max={field.max}
          className={FIELD}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      )
    default:
      return null
  }
}

function ArrayField({ field, value, onChange }: { field: TaxSettingsField; value: unknown; onChange: (v: unknown) => void }) {
  const items = Array.isArray(value) ? (value as Values[]) : []
  const itemFields = field.itemFields ?? []

  const update = (index: number, next: Values) => onChange(items.map((item, i) => (i === index ? next : item)))
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index))
  const add = () => {
    const seed: Values = {}
    for (const f of itemFields) if (f.default !== undefined) seed[f.key] = f.default
    onChange([...items, seed])
  }

  return (
    <div>
      <span className={LABEL}>{field.label}</span>
      {field.helpText ? <p className="mb-2 text-[10px] leading-4 text-[var(--app-text-faint)]">{field.helpText}</p> : null}
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-[11px] text-[var(--app-text-faint)]">None configured.</p> : null}
        {items.map((item, index) => (
          <div key={index} className="rounded-lg border border-[var(--app-border)] p-2.5">
            <div className="grid grid-cols-2 gap-2">{renderFields(itemFields, item, (next) => update(index, next))}</div>
            <button
              type="button"
              onClick={() => remove(index)}
              className="mt-2 text-[10px] font-medium text-[var(--app-text-faint)] transition hover:text-[var(--app-negative)]"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 rounded-md border border-[var(--app-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
      >
        + Add
      </button>
    </div>
  )
}

function Help({ text }: { text: string }) {
  return (
    <span className="cursor-help text-[var(--app-text-faint)]" title={text}>
      ⓘ
    </span>
  )
}

function isVisible(field: TaxSettingsField, scope: Values): boolean {
  if (!field.visibleWhen || field.visibleWhen.length === 0) return true
  return field.visibleWhen.every((c) => scope[c.field] === c.equals)
}

function asString(value: unknown): string {
  return value == null ? "" : String(value)
}
