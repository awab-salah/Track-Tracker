/**
 * Reusable Supabase auth service.
 * All authentication logic lives here — never duplicated across pages.
 *
 * Company and driver rows are created by a database trigger on auth.users
 * (handle_new_user), so no client-side DB writes are needed after signUp.
 * This makes signup atomic and works correctly even when email confirmation
 * is enabled in the Supabase project settings.
 */
import { supabase, isSupabaseConfigured } from './supabase';
import { fetchCompanyByJoinCode } from '@/services';

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** Maps Supabase English error messages → Arabic user-facing messages. */
export function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials'))
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  if (m.includes('user already registered') || m.includes('already registered'))
    return 'يوجد حساب بهذا البريد الإلكتروني بالفعل';
  if (m.includes('password should be') || m.includes('password is too short'))
    return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  if (m.includes('email not confirmed'))
    return 'يرجى تأكيد البريد الإلكتروني أولاً';
  if (m.includes('too many requests') || m.includes('rate limit'))
    return 'محاولات كثيرة، يرجى الانتظار قليلاً والمحاولة مرة أخرى';
  if (m.includes('network') || m.includes('fetch'))
    return 'خطأ في الاتصال بالشبكة، يرجى التحقق من اتصالك بالإنترنت';
  if (m.includes('database error') || m.includes('unexpected_failure') || m.includes('saving new user'))
    return 'حدث خطأ في قاعدة البيانات، يرجى المحاولة مرة أخرى';
  return msg;
}

// ── Company Auth ───────────────────────────────────────────────────────────────

/**
 * Register a new company account.
 *
 * The companies row is created atomically by the handle_new_user trigger in the
 * database — no separate INSERT is needed here. If the trigger fails the auth
 * signUp itself fails, so there are never orphaned auth accounts.
 *
 * If Supabase email confirmation is enabled the returned session will be null.
 * We surface a friendly "check your email" message in that case.
 */
export async function companySignUp(
  email: string,
  password: string,
  companyName: string
): Promise<{ error?: string; emailConfirmationRequired?: boolean }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };

  const joinCode = generateJoinCode();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role: 'company', companyName, joinCode },
    },
  });

  if (error) return { error: translateAuthError(error.message) };
  if (!data.user) return { error: 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى' };

  // If session is null the project requires email confirmation.
  if (!data.session) {
    return { emailConfirmationRequired: true };
  }

  return {};
}

/**
 * Sign in an existing company account.
 */
export async function companySignIn(
  email: string,
  password: string
): Promise<{ error?: string }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translateAuthError(error.message) };

  // Reject driver accounts trying to log in through the company portal
  const role = data.user?.user_metadata?.role as string | undefined;
  if (role && role !== 'company') {
    await supabase.auth.signOut();
    return { error: 'هذا الحساب خاص بسائق، يرجى استخدام صفحة تسجيل الدخول للسائق' };
  }

  return {};
}

// ── Driver Auth ────────────────────────────────────────────────────────────────

/**
 * Register a new driver account.
 *
 * Validates the join code first (via the validate_join_code RPC so no
 * over-permissive table SELECT is required). The drivers row is then created
 * atomically by the handle_new_user trigger.
 *
 * If Supabase email confirmation is enabled the returned session will be null.
 * We surface a friendly "check your email" message in that case.
 */
export async function driverSignUp(
  email: string,
  password: string,
  fullName: string,
  vehicleNumber: string,
  joinCode: string
): Promise<{ error?: string; emailConfirmationRequired?: boolean }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };

  // 1. Validate join code before creating any auth user
  const company = await fetchCompanyByJoinCode(joinCode);
  if (!company) {
    return { error: 'رمز الانضمام غير صحيح أو غير موجود' };
  }

  // 2. Create Supabase auth user — the handle_new_user DB trigger will
  //    atomically insert the drivers row using this metadata.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'driver',
        fullName,
        vehicleNumber,
        companyId: company.id,
        companyName: company.name,
      },
    },
  });

  if (error) return { error: translateAuthError(error.message) };
  if (!data.user) return { error: 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى' };

  // If session is null the project requires email confirmation.
  if (!data.session) {
    return { emailConfirmationRequired: true };
  }

  return {};
}

/**
 * Sign in an existing driver account.
 */
export async function driverSignIn(
  email: string,
  password: string
): Promise<{ error?: string }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translateAuthError(error.message) };

  // Verify this account belongs to a driver, not a company owner
  const role = data.user?.user_metadata?.role as string | undefined;
  if (role && role !== 'driver') {
    await supabase.auth.signOut();
    return { error: 'هذا الحساب خاص بصاحب شركة، يرجى استخدام صفحة تسجيل الشركة' };
  }

  return {};
}

// ── Shared ─────────────────────────────────────────────────────────────────────

/** Sign out the currently logged-in user (company or driver). */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Send a password-reset email.
 * Works for both company and driver accounts.
 */
export async function sendPasswordReset(email: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) return { error: translateAuthError(error.message) };
  return {};
}
