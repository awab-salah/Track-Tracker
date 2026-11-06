/**
 * Shared domain types used across multiple contexts and services.
 * Keeping them here prevents circular imports between context files.
 */

export interface CompanyProfile {
  id: string;
  name: string;
  email: string;
  joinCode: string;
  logoUrl: string | null;
  subscriptionActive: boolean;
  /** ISO 8601 timestamp when the subscription expires. null/undefined = no expiry set. */
  subscriptionExpiresAt?: string;
  /** The subscription plan ID (e.g., 'plan-10', 'plan-25', 'promo-track1'). */
  subscriptionPlanId?: string;
}
