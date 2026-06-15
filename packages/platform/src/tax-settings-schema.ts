/**
 * Country-aware tax settings are described by a JSON schema, not hardcoded forms.
 * A tax rule carries a `userTaxSettingsSchema` and a `portfolioTaxSettingsSchema`;
 * the frontend renders the settings form from the schema, and the backend
 * validates saved values against the same schema. This module is the single,
 * shared definition of that schema shape (decision: schemas live once in
 * `@portfolio/platform`, never duplicated per service).
 *
 * The schema only describes how to render and validate fields. It is NOT a tax
 * formula or a rule engine — tax calculation lives in code, referenced by a
 * rule's `calculationEngineKey`.
 */

/** The kinds of input a settings field can render to. */
export type TaxSettingsFieldType =
  | 'checkbox' // boolean
  | 'select' // one of `options`
  | 'date' // YYYY-MM-DD
  | 'number' // plain number
  | 'money' // non-negative amount, paired with a currency
  | 'currency' // 3-letter ISO currency code
  | 'array'; // a repeating group of `itemFields`

/** A single value option for a `select` field. */
export interface TaxSettingsSelectOption {
  value: string;
  label: string;
}

/**
 * A visibility condition on a sibling field's value. A field is shown (and
 * validated) only when every one of its `visibleWhen` conditions is satisfied —
 * e.g. show `churchTaxRate` only when `churchTaxEnabled` equals `true`.
 */
export interface TaxSettingsCondition {
  /** Sibling field key within the same object/array-item scope. */
  field: string;
  equals: string | number | boolean;
}

/** One field in a tax settings schema: its metadata, type, and validation. */
export interface TaxSettingsField {
  key: string;
  label: string;
  type: TaxSettingsFieldType;
  description?: string;
  helpText?: string;
  required?: boolean;
  /** Default applied by the frontend when no value has been saved yet. */
  default?: unknown;
  /** Render order, ascending. */
  order: number;
  /** Show/validate only when all conditions on sibling values hold. */
  visibleWhen?: TaxSettingsCondition[];
  /** `select` only: the allowed options. */
  options?: TaxSettingsSelectOption[];
  /** `number`/`money` bounds (inclusive) and step. */
  min?: number;
  max?: number;
  step?: number;
  /**
   * `money` only: where the amount's currency comes from — either a sibling
   * field key (`currencyField`) or a fixed code (`currency`).
   */
  currencyField?: string;
  currency?: string;
  /** `array` only: the schema of each item's fields. */
  itemFields?: TaxSettingsField[];
}

/** A complete, versioned settings schema (user-level or portfolio-level). */
export interface TaxSettingsSchema {
  /** Stable identifier of this schema shape (e.g. `de_user_tax_settings`). */
  schemaKey: string;
  /** Bumped when the field set changes in a non-additive way. */
  version: number;
  fields: TaxSettingsField[];
}

/** A single validation failure, addressed by a dotted path (e.g. `exemptionOrderHistory.0.amount`). */
export interface TaxSettingsValidationError {
  path: string;
  message: string;
}

export type TaxSettingsValidationResult =
  | { ok: true }
  | { ok: false; errors: TaxSettingsValidationError[] };

type Values = Record<string, unknown>;

/**
 * Validates saved settings values against a schema. Pure and dependency-free so
 * both the backend (on write) and the frontend (before submit) can share it.
 * Fields hidden by their `visibleWhen` conditions are skipped entirely — neither
 * required nor type-checked — because they do not apply in that configuration.
 */
export function validateTaxSettings(
  schema: TaxSettingsSchema,
  values: unknown,
): TaxSettingsValidationResult {
  const errors: TaxSettingsValidationError[] = [];
  if (!isRecord(values)) {
    return { ok: false, errors: [{ path: '', message: 'settings must be an object' }] };
  }
  validateFields(schema.fields, values, '', errors);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateFields(
  fields: TaxSettingsField[],
  scope: Values,
  prefix: string,
  errors: TaxSettingsValidationError[],
): void {
  for (const field of fields) {
    if (!isVisible(field, scope)) continue;
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    const value = scope[field.key];

    if (value === undefined || value === null || value === '') {
      if (field.required) errors.push({ path, message: 'is required' });
      continue;
    }
    validateValue(field, value, path, errors);
  }
}

function validateValue(
  field: TaxSettingsField,
  value: unknown,
  path: string,
  errors: TaxSettingsValidationError[],
): void {
  switch (field.type) {
    case 'checkbox':
      if (typeof value !== 'boolean') errors.push({ path, message: 'must be true or false' });
      return;
    case 'select':
      if (!(field.options ?? []).some((o) => o.value === value)) {
        errors.push({ path, message: 'is not an allowed option' });
      }
      return;
    case 'date':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        errors.push({ path, message: 'must be a YYYY-MM-DD date' });
      }
      return;
    case 'currency':
      if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
        errors.push({ path, message: 'must be a 3-letter currency code' });
      }
      return;
    case 'number':
    case 'money': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) {
        errors.push({ path, message: 'must be a number' });
        return;
      }
      if (field.type === 'money' && n < 0) errors.push({ path, message: 'must not be negative' });
      if (field.min !== undefined && n < field.min) errors.push({ path, message: `must be ≥ ${field.min}` });
      if (field.max !== undefined && n > field.max) errors.push({ path, message: `must be ≤ ${field.max}` });
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push({ path, message: 'must be a list' });
        return;
      }
      value.forEach((item, i) => {
        if (!isRecord(item)) {
          errors.push({ path: `${path}.${i}`, message: 'must be an object' });
          return;
        }
        validateFields(field.itemFields ?? [], item, `${path}.${i}`, errors);
      });
      return;
    }
  }
}

/** True when every `visibleWhen` condition holds against the surrounding scope. */
function isVisible(field: TaxSettingsField, scope: Values): boolean {
  if (!field.visibleWhen || field.visibleWhen.length === 0) return true;
  return field.visibleWhen.every((c) => scope[c.field] === c.equals);
}

function isRecord(value: unknown): value is Values {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
