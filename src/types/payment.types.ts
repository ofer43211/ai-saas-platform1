export enum SubscriptionPlan {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  PAST_DUE = 'past_due',
  TRIALING = 'trialing',
  INCOMPLETE = 'incomplete',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export interface PlanConfig {
  id: SubscriptionPlan;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  apiCallLimit: number;
  tokenLimit: number;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  userId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentIntentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubscriptionDTO {
  userId: string;
  plan: SubscriptionPlan;
  paymentMethodId: string;
  billingInterval: 'monthly' | 'yearly';
}

export interface UpdateSubscriptionDTO {
  plan?: SubscriptionPlan;
  cancelAtPeriodEnd?: boolean;
}

export interface UsageRecord {
  userId: string;
  apiCalls: number;
  tokensUsed: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  createdAt: Date;
}
