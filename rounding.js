// Display-only rounding. Never feed these values back into calculations.

// At or beyond this magnitude doubles cannot represent cents, so values are returned as-is.
const MAX_CENT_PRECISE = 1e15;

// Round half away from zero via decimal-string shifting to avoid binary artifacts (1.005 -> 1.01).
function roundHalfAwayFromZero(x, decimals) {
  if (!Number.isFinite(x)) return NaN;
  const abs = Math.abs(x);
  if (abs >= MAX_CENT_PRECISE) return x;
  const shifted = Math.round(Number(`${abs}e${decimals}`));
  const rounded = Number(`${shifted}e-${decimals}`);
  return x < 0 && rounded !== 0 ? -rounded : rounded;
}

function roundCurrency(x) {
  return roundHalfAwayFromZero(x, 2);
}

// Round up to the next cent; used for solver prices so the shown price still meets the target.
function ceilCurrency(x) {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) >= MAX_CENT_PRECISE) return x;
  const cents = Number(`${x}e2`);
  // Tolerate float noise just above a whole cent (e.g. 12.650000000000002).
  const nearest = Math.round(cents);
  const c = Math.abs(cents - nearest) < 1e-7 ? nearest : Math.ceil(cents);
  return Number(`${c}e-2`);
}

function roundPercent(x, decimals = 1) {
  return roundHalfAwayFromZero(x, decimals);
}

function formatCurrency(x) {
  const r = roundCurrency(x);
  return Number.isFinite(r) ? r.toFixed(2) : 'N/A';
}

function formatPercent(x, decimals = 1) {
  const r = roundPercent(x, decimals);
  return Number.isFinite(r) ? `${r.toFixed(decimals)}%` : 'N/A';
}

/** Rounded copy of a calculateProfit result for display. */
function toDisplay(result) {
  return {
    currency: result.currency,
    revenue: roundCurrency(result.revenue),
    productCosts: roundCurrency(result.productCosts),
    transactionFee: roundCurrency(result.transactionFee),
    paymentProcessingFee: roundCurrency(result.paymentProcessingFee),
    listingFee: roundCurrency(result.listingFee),
    offsiteAdsFee: roundCurrency(result.offsiteAdsFee),
    totalFees: roundCurrency(result.totalFees),
    netProfit: roundCurrency(result.netProfit),
    marginPercent: roundPercent(result.marginPercent),
    status: result.status,
  };
}

export { roundCurrency, ceilCurrency, roundPercent, formatCurrency, formatPercent, toDisplay };
