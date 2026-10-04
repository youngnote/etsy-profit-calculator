// Single source of truth for Etsy US fee parameters (PROJECT_RULES.md §3).
const FEE_CONFIG = Object.freeze({
  transactionRate: 0.065,
  paymentProcessingRate: 0.03,
  paymentProcessingFixedFee: 0.25,
  listingFee: 0.20,
  offsiteAdsLowRate: 0.12,
  offsiteAdsHighRate: 0.15,
  offsiteAdsCap: 100.00,
  currency: 'USD',
});

const OFFSITE_ADS_MODES = Object.freeze(['none', 'low_12', 'high_15']);

function offsiteAdsRateFor(mode, config = FEE_CONFIG) {
  switch (mode) {
    case 'none': return 0;
    case 'low_12': return config.offsiteAdsLowRate;
    case 'high_15': return config.offsiteAdsHighRate;
    default: return undefined;
  }
}

// Margin status thresholds (PROJECT_RULES.md §6), in percent.
function marginStatus(marginPercent) {
  if (marginPercent >= 30) return 'strong';
  if (marginPercent >= 20) return 'healthy';
  if (marginPercent >= 10) return 'thin';
  if (marginPercent >= 0) return 'very_thin';
  return 'loss';
}

export { FEE_CONFIG, OFFSITE_ADS_MODES, offsiteAdsRateFor, marginStatus };
