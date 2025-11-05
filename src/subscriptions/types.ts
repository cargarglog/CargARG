import type { Plan } from '../types';

export type ProviderId = 'GooglePlay' | 'Apple' | 'Paddle' | 'Unknown';

export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'in_grace'
  | 'past_due'
  | 'incomplete'
  | 'trialing';

export interface SubscriptionRecord {
  plan: Plan;
  status: SubscriptionStatus;
  renewalDate?: string; // ISO YYYY-MM-DD
  paymentMethod?: string; // e.g., "Visa **** 4231"
  provider: ProviderId;
  invoiceUrl?: string;
  providerRefId?: string; // subscription_id, purchase token, etc.
  updatedAt?: any; // Firestore timestamp
}

export interface PurchaseResult {
  ok: boolean;
  message?: string;
}

