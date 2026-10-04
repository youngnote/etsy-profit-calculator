// T1 Web Calculator UI. All math comes from the T0 engine; this file only reads inputs,
// calls the engine, and renders its responses. No network, no storage.
import {
  FEE_CONFIG,
  calculateProfit,
  solveBreakEvenPrice,
  solveTargetMarginPrice,
  formatCurrency,
  formatPercent,
} from './index.js';

const MONEY_FIELDS = [
  'sellingPrice',
  'shippingCharged',
  'productCost',
  'packagingCost',
  'shippingCost',
  'otherCost',
  'buyerSalesTax',
];

const FIELD_LABELS = {
  sellingPrice: 'Selling Price',
  shippingCharged: 'Shipping Charged',
  productCost: 'Product Cost',
  packagingCost: 'Packaging Cost',
  shippingCost: 'Shipping Cost',
  otherCost: 'Other Cost',
  buyerSalesTax: 'Buyer Sales Tax',
  offsiteAdsMode: 'Offsite Ads',
  targetMarginPercent: 'Target Margin',
};

const STATUS_LABELS = {
  strong: 'Strong margin',
  healthy: 'Healthy margin',
  thin: 'Thin margin',
  very_thin: 'Very thin margin',
  loss: 'Loss',
};

const $ = (id) => document.getElementById(id);

// Display formatting only: wraps the engine's formatCurrency with a $ sign.
function money(x) {
  const s = formatCurrency(x);
  if (s === 'N/A') return s;
  return s.startsWith('-') ? `-$${s.slice(1)}` : `$${s}`;
}

/**
 * Converts raw text to the value the engine expects. Blank -> undefined so the engine applies
 * its own defaults (optional fields become 0) or reports a missing required field.
 * Unparseable text -> NaN so the engine reports it as invalid.
 */
function parseNumber(text) {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  if (t === '') return undefined;
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
}

function readForm(form) {
  const inputs = {};
  for (const field of MONEY_FIELDS) {
    inputs[field] = parseNumber(form.elements[field].value);
  }
  inputs.offsiteAdsMode = form.elements.offsiteAdsMode.value;
  const target = parseNumber(form.elements.targetMarginPercent.value);
  return { inputs, target };
}

// Turns an engine error { field, code } into a short, user-facing sentence.
function messageFor(err, rawEmpty) {
  const label = FIELD_LABELS[err.field] || err.field;
  switch (err.code) {
    case 'NOT_A_NUMBER':
      return rawEmpty ? `Enter ${label}.` : `${label} must be a number.`;
    case 'NOT_FINITE':
      return `${label} must be a valid number, like 12.50.`;
    case 'MUST_BE_POSITIVE':
      return `${label} must be greater than $0.`;
    case 'NEGATIVE':
      return `${label} can't be negative.`;
    case 'INVALID_ADS_MODE':
      return 'Choose No, 12% or 15%.';
    case 'OUT_OF_RANGE':
      return 'Target Margin must be at least 0% and less than 100%.';
    case 'TARGET_UNREACHABLE':
      return 'No selling price reaches this margin with these costs and fees. Try a lower target.';
    case 'SOLVER_NOT_CONVERGED':
      return "We couldn't find a price for this goal. Check your inputs and try again.";
    case 'NON_FINITE_RESULT':
      return 'These amounts are too large to calculate. Use smaller values.';
    default:
      return err.message;
  }
}

function clearErrors(form) {
  for (const el of form.querySelectorAll('[data-field]')) {
    el.classList.remove('has-error');
    const msg = $(`${el.dataset.field}-error`);
    if (msg) msg.textContent = '';
    const input = form.elements[el.dataset.field];
    if (input && input.setAttribute) input.removeAttribute('aria-invalid');
  }
  $('form-error').hidden = true;
  $('form-error').textContent = '';
}

/** Shows errors inline next to their field; errors without a matching input go to a form summary. */
function showErrors(form, errors) {
  const seen = new Set();
  const general = [];
  let firstInvalid = null;

  for (const err of errors) {
    const key = `${err.field}:${err.code}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const wrapper = form.querySelector(`[data-field="${err.field}"]`);
    const control = form.elements[err.field];
    const rawEmpty = control && 'value' in control && control.value.trim() === '';
    const text = messageFor(err, rawEmpty);
    if (!wrapper) { general.push(text); continue; }

    wrapper.classList.add('has-error');
    const msg = $(`${err.field}-error`);
    if (msg && !msg.textContent) msg.textContent = text;
    if (control instanceof HTMLInputElement) {
      control.setAttribute('aria-invalid', 'true');
      if (!firstInvalid) firstInvalid = control;
    }
  }

  if (general.length) {
    $('form-error').textContent = general.join(' ');
    $('form-error').hidden = false;
  }
  return { count: seen.size, firstInvalid };
}

function setText(id, text) {
  $(id).textContent = text;
}

function renderProfit(calc) {
  const fields = ['netProfit', 'marginPercent', 'revenue', 'productCosts', 'transactionFee',
    'paymentProcessingFee', 'listingFee', 'offsiteAdsFee', 'totalFees'];
  const status = $('out-status');
  const headline = $('out-netProfit');

  if (!calc.ok) {
    for (const f of fields) setText(`out-${f}`, '—');
    status.hidden = true;
    headline.className = 'metric-value';
    $('profit-unavailable').hidden = false;
    return;
  }

  const r = calc.result;
  $('profit-unavailable').hidden = true;
  setText('out-netProfit', money(r.netProfit));
  setText('out-marginPercent', formatPercent(r.marginPercent));
  for (const f of fields.slice(2)) setText(`out-${f}`, money(r[f]));
  headline.className = `metric-value ${r.status === 'loss' ? 'is-loss' : ''}`;

  status.textContent = STATUS_LABELS[r.status] || r.status;
  status.className = `status status-${r.status}`;
  status.hidden = false;
}

function renderPrice(valueId, noteId, solved, defaultNote) {
  if (solved === null) {
    setText(valueId, '—');
    setText(noteId, defaultNote);
    return;
  }
  if (!solved.ok) {
    setText(valueId, '—');
    setText(noteId, messageFor(solved.errors[0], false));
    return;
  }
  setText(valueId, money(solved.displaySellingPrice));
  setText(noteId, solved.atMinimumPrice
    ? 'Your shipping charged already covers costs and fees, so any price works.'
    : defaultNote);
}

function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearErrors(form);

  const { inputs, target } = readForm(form);
  const { sellingPrice, ...baseInputs } = inputs;

  const calc = calculateProfit(inputs);
  const breakEven = solveBreakEvenPrice(baseInputs);
  const targetPrice = target === undefined ? null : solveTargetMarginPrice(baseInputs, target);

  // Unreachable-target and solver issues are shown on the price card, not as input errors.
  const inputErrors = [
    ...(calc.ok ? [] : calc.errors),
    ...(breakEven.ok ? [] : breakEven.errors),
    ...(targetPrice && !targetPrice.ok
      ? targetPrice.errors.filter((e) => e.code !== 'TARGET_UNREACHABLE' && e.field !== 'solver')
      : []),
  ];
  const { count, firstInvalid } = showErrors(form, inputErrors);

  $('results-empty').hidden = true;
  $('results-body').hidden = false;
  renderProfit(calc);
  renderPrice('out-breakEven', 'out-breakEven-note', breakEven,
    'Lowest price with no loss, keeping your other inputs the same.');
  renderPrice('out-target', 'out-target-note', targetPrice,
    'Enter a Target Margin to see this price.');
  if (targetPrice && targetPrice.ok) {
    setText('out-target-note', `Lowest price that reaches a ${formatPercent(target, 1)} margin.`);
  }

  const live = $('live-status');
  if (count > 0) {
    live.textContent = `${count === 1 ? 'One input needs' : `${count} inputs need`} attention. ${
      [...form.querySelectorAll('.error, .form-error')].map((e) => e.textContent).filter(Boolean).join(' ')}`;
    if (firstInvalid) firstInvalid.focus();
  } else {
    const r = calc.result;
    live.textContent = `Estimated profit ${money(r.netProfit)}, margin ${formatPercent(r.marginPercent)}, ${
      STATUS_LABELS[r.status]}. Break-even price ${breakEven.ok ? money(breakEven.displaySellingPrice) : 'unavailable'}.${
      targetPrice ? ` Target margin price ${targetPrice.ok ? money(targetPrice.displaySellingPrice) : 'unavailable'}.` : ''}`;
  }
}

function fillConfigLabels() {
  const pct = (rate) => formatPercent(rate * 100, rate * 100 % 1 === 0 ? 0 : 1);
  const labels = {
    offsiteAdsCap: money(FEE_CONFIG.offsiteAdsCap),
    transactionLabel: `${pct(FEE_CONFIG.transactionRate)} of revenue`,
    paymentLabel: `${pct(FEE_CONFIG.paymentProcessingRate)} of revenue + tax, plus ${money(FEE_CONFIG.paymentProcessingFixedFee)}`,
  };
  for (const el of document.querySelectorAll('[data-config]')) {
    el.textContent = labels[el.dataset.config] ?? '';
  }
}

fillConfigLabels();
$('calc-form').addEventListener('submit', onSubmit);
