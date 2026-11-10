// Single price contract for QA Sparks reward cards and server-side checkout.
// Bangkok promotion: 11 Nov 2026 through 15 Jan 2027, 23:59:59.999.
export const TYPING_RELIEF_REGULAR_PRICE = 150;
export const TYPING_RELIEF_PROMO_PRICE = 45;
export const TYPING_RELIEF_PROMO_PERCENT = 70;
export const TYPING_RELIEF_PROMO_START_AT = "2026-11-11T00:00:00+07:00";
export const TYPING_RELIEF_PROMO_END_EXCLUSIVE = "2027-01-16T00:00:00+07:00";
const start = Date.parse(TYPING_RELIEF_PROMO_START_AT);
const end = Date.parse(TYPING_RELIEF_PROMO_END_EXCLUSIVE);
export function getTypingReliefPricing(at = Date.now()) {
  const time = at instanceof Date ? at.getTime() : Number(at);
  // Invalid clocks never create a discount.
  const promoActive = Number.isFinite(time) && time >= start && time < end;
  return {
    price: promoActive ? TYPING_RELIEF_PROMO_PRICE : TYPING_RELIEF_REGULAR_PRICE,
    regularPrice: TYPING_RELIEF_REGULAR_PRICE,
    discountPercent: promoActive ? TYPING_RELIEF_PROMO_PERCENT : 0,
    promoActive,
    endExclusive: TYPING_RELIEF_PROMO_END_EXCLUSIVE,
  };
}
