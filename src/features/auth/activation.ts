import { supabase } from '@/data/remote/supabase-client';

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function verifyActivationCode(email: string, token: string) {
  const result = await supabase.auth.verifyOtp({ email, token, type: 'signup' });

  if (!result.error && result.data.session) {
    await supabase
      .from('profiles')
      .update({ activated_at: new Date().toISOString() })
      .eq('id', result.data.session.user.id);
  }

  return result;
}

export async function resendActivationCode(email: string) {
  return supabase.auth.resend({ type: 'signup', email });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function isEmailNotConfirmedError(message: string | undefined) {
  return message?.toLowerCase().includes('email not confirmed') ?? false;
}
