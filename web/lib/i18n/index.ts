import { en } from "./en"

/**
 * Dependency-free i18n. The app ships English only for now, but all UI copy is
 * routed through a translator keyed off the {@link en} catalog, so adding a
 * language later is: provide another catalog of the same shape, pick one per
 * request, and pass it to {@link createTranslator}.
 *
 * Usage — server components: `const t = getTranslations()`.
 *         client components: `const t = useTranslations()`.
 * Both return the same `t(key, vars?)` function; keys are typed dot-paths and
 * `{name}` placeholders are filled from `vars`.
 */
export type Messages = typeof en

/** The active catalog. Swap to a per-locale lookup when more languages land. */
export const messages: Messages = en

/** Dot-paths to every string leaf in the catalog (e.g. `"summary.totalValue"`). */
export type MessageKey = Leaves<Messages>

type Leaves<T> = {
  [K in keyof T]: T[K] extends string ? `${K & string}` : `${K & string}.${Leaves<T[K]>}`
}[keyof T]

export type TranslateVars = Record<string, string | number>
export type TFunction = (key: MessageKey, vars?: TranslateVars) => string

function resolve(dict: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
      dict,
    )
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  )
}

/** Builds a translator over a catalog. Falls back to the raw key if missing. */
export function createTranslator(dict: Messages = messages): TFunction {
  return (key, vars) => {
    const raw = resolve(dict, key)
    return typeof raw === "string" ? interpolate(raw, vars) : key
  }
}

/** Translator for server components. */
export function getTranslations(): TFunction {
  return createTranslator(messages)
}

/** Translator for client components. */
export function useTranslations(): TFunction {
  return createTranslator(messages)
}
