import { calculateProfit } from './calculateProfit.js';
import { validateInputs, validateTargetMargin } from './validation.js';
import { ceilCurrency } from './rounding.js';

const SOLVER_LIMITS = Object.freeze({
  minPrice: 0.01,
  // Doubles cannot represent cents beyond ~1e15, and near the margin asymptote float rounding
  // can make an unreachable target look met at absurd prices, so the search stops here.
  maxPrice: 1e15,
  maxExpansions: 200,
  maxIterations: 500,
  relativeTolerance: 1e-12,
});

// Display price refinement: the bisection bracket [lo, hi] can be wider than a cent at large
// prices and can sit just above an exact whole-cent solution, so the display price is searched
// over whole cents with calculateProfit.
const DISPLAY_LIMITS = Object.freeze({
  // Above this, doubles no longer step reliably by one cent, so the plain ceiling is kept.
  maxRefinedPrice: 1e13,
  maxCentSteps: 3,
  // Target margins above 0% only: absorbs IEEE noise (e.g. 89.99999999999999 for an exact 90%
  // margin).
  marginTolerancePercent: 1e-12,
  // Break-even (0% target) only, in dollars: absorbs IEEE noise such as -7.1e-15 at an exact
  // whole-cent break-even, while real sub-cent losses (e.g. -$0.00026) are still rejected.
  breakEvenNetProfitTolerance: 1e-9,
});

function failure(field, code, message) {
  return { ok: false, errors: [{ field, code, message }] };
}

function displayPriceMeets(evaluation, targetMarginPercent) {
  if (!evaluation.ok) return false;
  if (targetMarginPercent === 0) return evaluation.result.netProfit >= -DISPLAY_LIMITS.breakEvenNetProfitTolerance;
  return evaluation.result.marginPercent >= targetMarginPercent - DISPLAY_LIMITS.marginTolerancePercent;
}

/** Lowest whole-cent price meeting the target, given lo (misses) and hi (meets) from bisection. */
function lowestDisplayPrice(lo, hi, evaluate, targetMarginPercent) {
  const ceiled = ceilCurrency(hi);
  if (!(ceiled < DISPLAY_LIMITS.maxRefinedPrice)) return ceiled;
  const minCents = Math.round(SOLVER_LIMITS.minPrice * 100);
  const meetsAt = (cents) => cents >= minCents && displayPriceMeets(evaluate(cents / 100), targetMarginPercent);

  let hiCents = Math.round(Number(`${ceiled}e2`));
  for (let i = 0; i < DISPLAY_LIMITS.maxCentSteps && !meetsAt(hiCents); i++) hiCents++;
  if (!meetsAt(hiCents)) return ceiled;

  // Find a cent that misses (expanding down from lo), then bisect over whole cents.
  let loCents = Math.min(Math.floor(lo * 100), hiCents - 1);
  for (let step = 1; meetsAt(loCents); step *= 2) loCents = Math.max(minCents - 1, loCents - step);
  while (hiCents - loCents > 1) {
    const mid = Math.floor((loCents + hiCents) / 2);
    if (meetsAt(mid)) hiCents = mid; else loCents = mid;
  }
  return hiCents / 100;
}

function success(price, evaluation, iterations, atMinimumPrice, displaySellingPrice) {
  return {
    ok: true,
    sellingPrice: price,
    displaySellingPrice,
    iterations,
    atMinimumPrice,
    result: evaluation.result,
  };
}

/**
 * Finds the smallest sellingPrice whose margin is >= targetMarginPercent, holding all other
 * inputs fixed. Every evaluation goes through calculateProfit. Margin is monotonically
 * non-decreasing in sellingPrice under the T0 formula (fixed fees are positive and the ads
 * cap only lowers fees), so bisection is safe.
 */
function solveSellingPrice(baseInputs, targetMarginPercent) {
  const targetCheck = validateTargetMargin(targetMarginPercent);
  if (!targetCheck.ok) return targetCheck;

  // Validate every non-price field using a placeholder price.
  const baseCheck = validateInputs({ ...baseInputs, sellingPrice: 1 });
  if (!baseCheck.ok) return baseCheck;
  const b = baseCheck.value;

  const evaluate = (price) => calculateProfit({ ...baseInputs, sellingPrice: price });
  const meets = (r) => r.result.marginPercent >= targetMarginPercent;

  const low = evaluate(SOLVER_LIMITS.minPrice);
  if (!low.ok) return low;
  if (meets(low)) return success(SOLVER_LIMITS.minPrice, low, 0, true, SOLVER_LIMITS.minPrice);

  // Expand the upper bound by doubling until the target is met, capped at maxPrice.
  let lo = SOLVER_LIMITS.minPrice;
  let hi = Math.max(1, b.productCost + b.packagingCost + b.shippingCost + b.otherCost);
  let hiEval = null;
  for (let i = 0; i <= SOLVER_LIMITS.maxExpansions; i++) {
    hi = Math.min(hi, SOLVER_LIMITS.maxPrice);
    const r = evaluate(hi);
    if (!r.ok) break;
    if (meets(r)) { hiEval = r; break; }
    if (hi === SOLVER_LIMITS.maxPrice) break;
    lo = hi;
    hi *= 2;
  }
  if (!hiEval) {
    return failure('targetMarginPercent', 'TARGET_UNREACHABLE',
      `No finite selling price reaches a ${targetMarginPercent}% margin with these inputs.`);
  }

  // Bisect with invariant: lo misses the target, hi meets it.
  let iterations = 0;
  while (hi - lo > SOLVER_LIMITS.relativeTolerance * hi) {
    if (iterations >= SOLVER_LIMITS.maxIterations) {
      return failure('solver', 'SOLVER_NOT_CONVERGED', 'Solver exceeded its maximum iteration count.');
    }
    const mid = lo + (hi - lo) / 2;
    if (mid <= lo || mid >= hi) break; // floating-point resolution exhausted
    const r = evaluate(mid);
    if (!r.ok) return r;
    if (meets(r)) { hi = mid; hiEval = r; } else { lo = mid; }
    iterations++;
  }

  return success(hi, hiEval, iterations, false, lowestDisplayPrice(lo, hi, evaluate, targetMarginPercent));
}

/** Smallest sellingPrice with netProfit >= 0. baseInputs excludes sellingPrice. */
function solveBreakEvenPrice(baseInputs) {
  return solveSellingPrice(baseInputs, 0);
}

/** Smallest sellingPrice with margin >= targetMarginPercent (0 <= target < 100). */
function solveTargetMarginPrice(baseInputs, targetMarginPercent) {
  return solveSellingPrice(baseInputs, targetMarginPercent);
}

export { solveBreakEvenPrice, solveTargetMarginPrice, SOLVER_LIMITS, DISPLAY_LIMITS };
