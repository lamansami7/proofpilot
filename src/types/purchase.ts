import type { ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';

export type FeatherIconName = ComponentProps<typeof Feather>['name'];

export type ProtectionStatus = 'protected' | 'attention' | 'unprotected';
export type DeadlineType = 'return' | 'warranty' | 'rebate' | 'custom';
export type DeadlineStatus = 'overdue' | 'today' | 'urgent' | 'upcoming' | 'later';

export type PurchaseDeadline = {
  id: string;
  type: DeadlineType;
  date: string;
  title: string;
};

export type PurchaseDocument = {
  id: string;
  name: string;
  kind: 'receipt' | 'warranty' | 'other';
  mimeType: string | null;
};

export type Purchase = {
  id: number;
  name: string;
  merchant: string;
  price: number | null;
  purchaseDate: string | null;
  category: string;
  icon: FeatherIconName;
  tint: string;
  protectionStatus: ProtectionStatus;
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
};
