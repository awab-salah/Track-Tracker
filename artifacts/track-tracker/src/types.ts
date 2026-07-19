/**
 * Shared domain types used across multiple contexts and services.
 * Keeping them here prevents circular imports between context files.
 */

export interface CompanyProfile {
  name: string;
  email: string;
  joinCode: string;
  logoUrl: string | null;
}
