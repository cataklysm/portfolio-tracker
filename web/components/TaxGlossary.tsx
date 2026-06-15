interface Term {
  term: string
  body: string
}

// Plain-language explanations for the tax terms used across the tax UI. General
// information only — deliberately not tax advice (see the footer). Several of
// these are also surfaced inline as schema `helpText` on the settings forms.
const TERMS: Term[] = [
  {
    term: "Tax residence",
    body: "The country whose tax rules apply to you. You set it explicitly — it is never guessed from your locale, currency, or broker. It selects which rules and labels are shown.",
  },
  {
    term: "Tax settings schema vs saved settings",
    body: "The schema describes which settings to show for your residence and how to validate them; your saved settings are the actual values you entered (e.g. church tax on/off). The schema renders the form; your values feed the estimate.",
  },
  {
    term: "Automatic tax withholding",
    body: "Whether your broker deducts capital gains tax for you automatically (common for German brokers). When off — for example at many foreign brokers — tax is only estimated and shown as not withheld.",
  },
  {
    term: "Exemption order (Freistellungsauftrag)",
    body: "A per-portfolio allowance you instruct your broker to apply, with the date it takes effect. The amount already used is derived from your transactions, not entered. You only configure the amount here; there is no global “already used” figure.",
  },
  {
    term: "Stock loss pot",
    body: "Accumulated realized losses from shares that can offset future share gains. It stores the gross loss amount, not a tax figure.",
  },
  {
    term: "General capital loss pot",
    body: "Accumulated losses from other capital income (e.g. funds, certificates) that offset other capital gains, kept separate from the stock loss pot. Not populated in this version — equities only.",
  },
  {
    term: "Paid tax",
    body: "Tax your broker actually withheld, recorded in the tax ledger (the “recorded broker tax” section). A zero balance means nothing was recorded — never that nothing is owed.",
  },
  {
    term: "Expected tax correction",
    body: "When a later loss reduces a gain that was already taxed in the same year, this is the refund the calculation expects. It is an estimate; no cash is moved automatically.",
  },
  {
    term: "Booked tax refund",
    body: "An actual refund or correction your broker posted (or you recorded). The “outstanding correction” is the expected correction minus what has actually been booked.",
  },
  {
    term: "German crypto taxable gain",
    body: "Gain from selling crypto held one year or less is a tax-relevant private disposal you must declare. Gains on crypto held longer than a year are tax-free.",
  },
  {
    term: "Why German crypto is not treated like stocks",
    body: "Crypto is a private disposal (§23 EStG), not capital-gains-tax income. There is no automatic withholding and no capital gains tax computed here, and the one-year holding period makes long-held gains tax-free.",
  },
  {
    term: "Why crypto does not use the exemption order",
    body: "The saver’s allowance / exemption order applies to capital income (shares, funds, interest), not to private-disposal crypto gains.",
  },
  {
    term: "Why a loss pot is not a tax amount",
    body: "A loss pot holds the gross loss (for example €93.30), not the tax you would save on it. Tax is only calculated when a gain is later offset.",
  },
]

/** A collapsible glossary of the tax terms used in the reports tax sections. */
export function TaxGlossary() {
  return (
    <details className="app-panel overflow-hidden rounded-xl">
      <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-[var(--app-text)] marker:hidden">
        Understanding these tax terms
        <span className="ml-2 text-[10px] font-normal text-[var(--app-text-faint)]">(general information, not tax advice)</span>
      </summary>
      <dl className="divide-y divide-[var(--app-border)] border-t border-[var(--app-border)]">
        {TERMS.map((t) => (
          <div key={t.term} className="px-4 py-2.5">
            <dt className="text-[11px] font-semibold text-[var(--app-text)]">{t.term}</dt>
            <dd className="mt-0.5 text-[11px] leading-4 text-[var(--app-text-muted)]">{t.body}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-[var(--app-border)] px-4 py-2 text-[10px] leading-4 text-[var(--app-text-faint)]">
        These explanations are general information, not tax advice. All tax figures shown in the app are estimates and depend
        on your personal circumstances and filing.
      </p>
    </details>
  )
}
