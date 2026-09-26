import type { ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';

export type FeatherIconName = ComponentProps<typeof Feather>['name'];

export type ProtectionStatus = 'protected' | 'attention' | 'unprotected';
export type DeadlineType = 'return' | 'warranty' | 'rebate' | 'custom';
export type DeadlineStatus = 'overdue' | 'today' | 'urgent' | 'upcoming' | 'later';
export type DocumentKind = 'receipt' | 'warranty' | 'manual' | 'claim' | 'other';

export type PurchaseDeadline = {
  id: string;
  type: DeadlineType;
  date: string;
  title: string;
  completed?: boolean;
};

export type PurchaseDocument = {
  id: string;
  name: string;
  kind: DocumentKind;
  mimeType: string | null;
  /** Local file location from the picker, when one was captured. Not guaranteed to survive app cache clears. */
  uri?: string | null;
  /** Inline text content for documents ProofPilot itself creates (e.g. claim drafts). */
  content?: string | null;
  addedAt?: string | null;
};

export type Purchase = {
  id: number | string;
  name: string;
  merchant: string;
  price: number | null;
  purchaseDate: string | null;
  category: string;
  icon: FeatherIconName;
  tint: string;
  protectionStatus: ProtectionStatus;
  /** User pins stay local to the record and float the purchase to the top of lists. */
  pinned?: boolean;
  warrantyEnd: string | null;
  warrantyProvider: string | null;
  returnDeadline: string | null;
  serial: string | null;
  model: string | null;
  hasReceipt: boolean;
  hasWarrantyInfo: boolean;
  notes: string | null;
  documents: PurchaseDocument[];
  deadlines: PurchaseDeadline[];
};

export type ActionNeeded = {
  id: string;
  kind: 'deadline' | 'missing_receipt' | 'missing_warranty';
  purchase: Purchase;
  title: string;
  description: string;
  actionLabel: string;
  date?: string;
  /** Present for deadline actions so lists can prioritize and sort accurately. */
  deadlineType?: DeadlineType;
  /** Whole days until the deadline (negative when past). */
  days?: number;
};
