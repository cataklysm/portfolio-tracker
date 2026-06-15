export {
  computeGermanSecuritiesTax,
  type GermanSecuritiesParams,
  type ExemptionOrderEntry,
  type RealizedSecuritySale,
  type GermanSecuritiesInput,
  type GermanSecuritiesResult,
  type PerSaleTaxResult,
  type YearTaxSummary,
  type TaxWithholdingStatus,
} from './domain/german-securities.js';
export {
  computeGermanCryptoTax,
  type GermanCryptoParams,
  type CryptoDisposalLot,
  type GermanCryptoInput,
  type GermanCryptoResult,
  type PerDisposalResult,
  type CryptoYearSummary,
} from './domain/german-crypto.js';
export {
  TaxEstimateService,
  type TaxEstimateDeps,
  type TaxEstimate,
  type SecuritiesEstimate,
  type CryptoEstimate,
  type UnsupportedEstimate,
} from './application/tax-estimate-service.js';
export { registerTaxEstimateRoutes, type TaxEstimateRouteDeps } from './http/tax-estimate-routes.js';
