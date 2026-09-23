export type ReceiptExtraction = {
  merchant: string | null; product_name: string | null; purchase_date: string | null;
  price: number | null; currency: string | null; category: string | null;
  serial_number: string | null; model_number: string | null; sku: string | null;
  receipt_number: string | null; possible_return_window: { start_date: string | null; end_date: string | null; confidence: number } | null;
  possible_warranty: { provider: string | null; start_date: string | null; end_date: string | null; confidence: number } | null;
  confidence: number;
};
export type PurchaseContext = { productName: string; purchaseDate?: string; warrantyEnd?: string; warrantyProvider?: string; serialNumber?: string; documents?: string[]; serviceHistory?: string[] };
export interface AIService {
  extractReceipt(imageUri: string): Promise<ReceiptExtraction>;
  analyzeWarranty(documentText: string): Promise<unknown>;
  analyzeReturnPolicy(documentText: string): Promise<unknown>;
  answerPurchaseQuestion(question: string, context: PurchaseContext): Promise<string>;
  generateClaim(context: PurchaseContext, issue: string): Promise<string>;
  summarizeDocument(documentText: string): Promise<string>;
}
/** Vendor adapters belong on a trusted server. This client implementation fails closed until configured. */
export class UnavailableAIService implements AIService {
  private unavailable(): never { throw new Error('AI service is not configured.'); }
  async extractReceipt(_imageUri: string): Promise<ReceiptExtraction> { return this.unavailable(); }
  async analyzeWarranty(_text: string): Promise<unknown> { return this.unavailable(); }
  async analyzeReturnPolicy(_text: string): Promise<unknown> { return this.unavailable(); }
  async answerPurchaseQuestion(_q: string, _c: PurchaseContext): Promise<string> { return this.unavailable(); }
  async generateClaim(_c: PurchaseContext, _i: string): Promise<string> { return this.unavailable(); }
  async summarizeDocument(_text: string): Promise<string> { return this.unavailable(); }
}
export function validateReceiptExtraction(value: unknown): ReceiptExtraction {
  if (!value || typeof value !== 'object') throw new Error('Invalid receipt extraction');
  const v = value as Record<string, any>;
  const nullable = (x: unknown) => typeof x === 'string' ? x : null;
  const numeric = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : null;
  const confidence = typeof v.confidence === 'number' && v.confidence >= 0 && v.confidence <= 1 ? v.confidence : 0;
  return { merchant: nullable(v.merchant), product_name: nullable(v.product_name), purchase_date: nullable(v.purchase_date), price: numeric(v.price), currency: nullable(v.currency), category: nullable(v.category), serial_number: nullable(v.serial_number), model_number: nullable(v.model_number), sku: nullable(v.sku), receipt_number: nullable(v.receipt_number), possible_return_window: v.possible_return_window && typeof v.possible_return_window === 'object' ? { start_date: nullable(v.possible_return_window.start_date), end_date: nullable(v.possible_return_window.end_date), confidence: Math.min(1, Math.max(0, Number(v.possible_return_window.confidence) || 0)) } : null, possible_warranty: v.possible_warranty && typeof v.possible_warranty === 'object' ? { provider: nullable(v.possible_warranty.provider), start_date: nullable(v.possible_warranty.start_date), end_date: nullable(v.possible_warranty.end_date), confidence: Math.min(1, Math.max(0, Number(v.possible_warranty.confidence) || 0)) } : null, confidence };
}
