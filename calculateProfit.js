import { FEE_CONFIG, offsiteAdsRateFor, marginStatus } from './feeConfig.js';
import { validateInputs } from './validation.js';

/**
 * Pure T0 profit calculation (PROJECT_RULES.md §5). No early rounding.
 * Returns { ok: true, result } or { ok: false, errors }.
 */
function calculateProfit(inputs, config = FEE_CONFIG) {
  const validated = validateInputs(inputs);
  if (!validated.ok) return validated;
  const v = validated.value;

  const revenue = v.sellingPrice + v.shippingCharged;
  const productCosts = v.productCost + v.packagingCost + v.shippingCost + v.otherCost;
  const transactionFee = revenue * config.transactionRate;
  const paymentProcessingFee =
    (revenue + v.buyerSalesTax) * config.paymentProcessingRate + config.paymentProcessingFixedFee;
  const listingFee = config.listingFee;
  const adsRate = offsiteAdsRateFor(v.offsiteAdsMode, config);
  const offsiteAdsFee = adsRate === 0 ? 0 : Math.min(revenue * adsRate, config.offsiteAdsCap);
  const totalFees = transactionFee + paymentProcessingFee + listingFee + offsiteAdsFee;
  const netProfit = revenue - productCosts - totalFees;
  const marginPercent = (netProfit / revenue) * 100;

  const result = {
    currency: config.currency,
    revenue,
    productCosts,
    transactionFee,
    paymentProcessingFee,
    listingFee,
    offsiteAdsFee,
    totalFees,
    netProfit,
    marginPercent,
  };

  for (const [field, n] of Object.entries(result)) {
    if (typeof n === 'number' && !Number.isFinite(n)) {
      return {
        ok: false,
        errors: [{ field, code: 'NON_FINITE_RESULT', message: `${field} overflowed to a non-finite value.` }],
      };
    }
  }

  result.status = marginStatus(marginPercent);
  return { ok: true, result };
}

export { calculateProfit };
