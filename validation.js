import { OFFSITE_ADS_MODES } from './feeConfig.js';

const OPTIONAL_FIELDS = Object.freeze([
  'shippingCharged',
  'packagingCost',
  'shippingCost',
  'otherCost',
  'buyerSalesTax',
]);

function error(field, code, message) {
  return { field, code, message };
}

function checkNumber(errors, field, value, { strictlyPositive }) {
  if (typeof value !== 'number') {
    errors.push(error(field, 'NOT_A_NUMBER', `${field} must be a number.`));
    return;
  }
  if (!Number.isFinite(value)) {
    errors.push(error(field, 'NOT_FINITE', `${field} must be a finite number.`));
    return;
  }
  if (strictlyPositive && value <= 0) {
    errors.push(error(field, 'MUST_BE_POSITIVE', `${field} must be greater than 0.`));
  } else if (value < 0) {
    errors.push(error(field, 'NEGATIVE', `${field} must not be negative.`));
  }
}

/**
 * Validates raw T0 inputs and fills defaults.
 * Returns { ok: true, value } or { ok: false, errors: [{ field, code, message }] }.
 */
function validateInputs(raw) {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, errors: [error('inputs', 'INVALID_INPUT', 'Inputs must be an object.')] };
  }

  const errors = [];
  checkNumber(errors, 'sellingPrice', raw.sellingPrice, { strictlyPositive: true });
  checkNumber(errors, 'productCost', raw.productCost, { strictlyPositive: false });

  const value = { sellingPrice: raw.sellingPrice, productCost: raw.productCost };
  for (const field of OPTIONAL_FIELDS) {
    const v = raw[field] === undefined ? 0 : raw[field];
    checkNumber(errors, field, v, { strictlyPositive: false });
    value[field] = v;
  }

  const mode = raw.offsiteAdsMode === undefined ? 'none' : raw.offsiteAdsMode;
  if (!OFFSITE_ADS_MODES.includes(mode)) {
    errors.push(error('offsiteAdsMode', 'INVALID_ADS_MODE',
      `offsiteAdsMode must be one of: ${OFFSITE_ADS_MODES.join(', ')}.`));
  }
  value.offsiteAdsMode = mode;

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/** Target margin is a percent in [0, 100). */
function validateTargetMargin(targetMarginPercent) {
  const field = 'targetMarginPercent';
  let err = null;
  if (typeof targetMarginPercent !== 'number') {
    err = error(field, 'NOT_A_NUMBER', `${field} must be a number.`);
  } else if (!Number.isFinite(targetMarginPercent)) {
    err = error(field, 'NOT_FINITE', `${field} must be a finite number.`);
  } else if (targetMarginPercent < 0 || targetMarginPercent >= 100) {
    err = error(field, 'OUT_OF_RANGE', `${field} must be at least 0 and less than 100.`);
  }
  return err ? { ok: false, errors: [err] } : { ok: true, value: targetMarginPercent };
}

export { validateInputs, validateTargetMargin, OPTIONAL_FIELDS };
