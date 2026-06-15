import type { ChangeLogWriter, NewBookingChange } from './ports.js';

/**
 * Appends a change record, swallowing any failure. The audit log is important
 * but secondary: a logging error must never roll back or block the financial
 * write the user requested. (Strict same-transaction durability is a hardening
 * follow-up; see backend-roadmap.md Phase A-2.)
 */
export async function safeRecord(
  writer: ChangeLogWriter | undefined,
  change: NewBookingChange,
): Promise<void> {
  if (!writer) return;
  try {
    await writer.record(change);
  } catch {
    /* intentionally ignored — see doc comment */
  }
}
