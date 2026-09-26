import { isValidIsoDate, isoDate } from './date';
export type PurchaseFields = { name: string; merchant: string; price: string; purchaseDate: string; returnDeadline: string; warrantyEnd: string };
export function validatePurchaseFields(form: PurchaseFields, now = new Date()): Partial<Record<keyof PurchaseFields, string>> {
  const errors: Partial<Record<keyof PurchaseFields, string>> = {};
  if (!form.name.trim()) errors.name = 'Enter the product name.';
  if (!form.merchant.trim()) errors.merchant = 'Enter the merchant.';
  if (!/^\d+(\.\d{1,2})?$/.test(form.price.trim()) || !Number.isFinite(Number(form.price)) || Number(form.price) > 9999999999.99) errors.price = 'Enter a price from 0 to 9,999,999,999.99 (up to two decimal places).';
  if (!isValidIsoDate(form.purchaseDate)) errors.purchaseDate = 'Enter a real date in YYYY-MM-DD format.';
  else if (form.purchaseDate > isoDate(now)) errors.purchaseDate = 'Purchase date cannot be in the future.';
  for (const key of ['returnDeadline', 'warrantyEnd'] as const) {
    if (form[key] && !isValidIsoDate(form[key])) errors[key] = 'Enter a real date in YYYY-MM-DD format, or leave blank.';
    else if (form[key] && isValidIsoDate(form.purchaseDate) && form[key] < form.purchaseDate) errors[key] = 'Must be on or after the purchase date.';
  }
  return errors;
}
