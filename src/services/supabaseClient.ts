import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const requiredEnvKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;

const placeholderValues = new Set([
  'https://your-project-ref.supabase.co',
  'your_supabase_url',
  'your_supabase_anon_key',
  'your_supabase_anon_or_publishable_key',
]);

const getEnvValue = (key: (typeof requiredEnvKeys)[number]) => {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

export const isDemoMode = String(import.meta.env.VITE_DEMO_MODE ?? '').toLowerCase() === 'true';

const supabaseUrl = getEnvValue('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvValue('VITE_SUPABASE_ANON_KEY');

const missingKeys = requiredEnvKeys.filter((key) => !getEnvValue(key));
const placeholderKeys = requiredEnvKeys.filter((key) => placeholderValues.has(getEnvValue(key)));
const invalidUrl =
  supabaseUrl && !placeholderValues.has(supabaseUrl) && !/^https?:\/\//.test(supabaseUrl)
    ? 'VITE_SUPABASE_URL must be a full Supabase project URL, for example https://your-project-ref.supabase.co.'
    : null;

const buildConfigErrorMessage = () => {
  if (isDemoMode) return null;

  if (missingKeys.length) {
    return `Supabase configuration is missing. Add ${missingKeys.join(' and ')} to .env.local before starting the app. See .env.example for the required keys.`;
  }

  if (placeholderKeys.length) {
    return `Supabase configuration still contains placeholder values for ${placeholderKeys.join(' and ')}. Replace them in .env.local with this project's Supabase URL and anon key.`;
  }

  return invalidUrl;
};

const configErrorMessage = buildConfigErrorMessage();

export const supabaseConfigError = configErrorMessage ? new Error(configErrorMessage) : null;

export const isSupabaseConfigured = !supabaseConfigError;

let supabaseClient: SupabaseClient | null = null;

export const getSupabaseClient = () => {
  if (isDemoMode) throw new Error('Supabase is disabled while VITE_DEMO_MODE=true.');
  if (supabaseConfigError) throw supabaseConfigError;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase configuration is missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local before starting the app.',
    );
  }
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseClient;
};
