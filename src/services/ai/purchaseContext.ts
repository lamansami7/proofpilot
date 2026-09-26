import type { Purchase } from '../../types/purchase';
import type { ClaimType, PurchaseContext } from './AIService';
/** Only saved fields. Document names are metadata, not extracted contents or verified policies. */
export function contextFor(p: Purchase): PurchaseContext {
  return { productName: p.name, merchant: p.merchant, purchaseDate: p.purchaseDate ?? undefined, price: p.price ?? undefined,
    returnDeadline: p.returnDeadline ?? undefined, warrantyEnd: p.warrantyEnd ?? undefined, warrantyProvider: p.warrantyProvider ?? undefined,
    modelNumber: p.model ?? undefined, documents: p.documents.filter(d => d.kind !== 'claim').map(d => d.name) };
}
export function claimTemplate(p: Purchase, type: ClaimType, issue: string): string {
  return `Subject: ${type === 'return' ? 'Return request' : 'Warranty assistance request'} — ${p.name}\n\nHello ${type === 'warranty' ? p.warrantyProvider ?? '[warranty provider]' : p.merchant},\n\nI am contacting you about ${p.name}${p.purchaseDate ? `, purchased on ${p.purchaseDate}` : ' (purchase date: [add date])'}${p.price !== null ? ` for USD ${p.price.toFixed(2)}` : ''}.\n\n${issue.trim() || '[Describe your reason or the problem accurately.]'}\n\n${p.serial ? `Serial number: ${p.serial}\n\n` : ''}Please let me know whether this is eligible for ${type === 'return' ? 'a return' : 'warranty service'} and which documents and next steps you require.\n\nThank you,\n[Your name]\n\nDRAFT — review facts and applicable terms before sending. Nothing has been submitted.`;
}
