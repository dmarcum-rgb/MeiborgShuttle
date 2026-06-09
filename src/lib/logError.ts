import { supabase } from './supabase';

export async function logError(
  source: string,
  message: string,
  context: Record<string, unknown> = {},
  reporterName?: string
) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('system_errors').insert({
      error_type: 'auto',
      source,
      message: String(message).slice(0, 1000),
      context,
      reporter_id: session?.user?.id ?? null,
      reporter_name: reporterName ?? session?.user?.email ?? null,
    });
  } catch {
    // Never throw from error logger
  }
}

export async function reportError(
  source: string,
  message: string,
  reporterName: string,
  context: Record<string, unknown> = {}
) {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from('system_errors').insert({
    error_type: 'manual',
    source,
    message: String(message).slice(0, 1000),
    context,
    reporter_id: session?.user?.id ?? null,
    reporter_name: reporterName,
  });
  return { error };
}
