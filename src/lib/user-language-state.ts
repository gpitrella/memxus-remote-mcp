import type { SupportedLanguage } from './i18n.js';
import { supabase } from './supabase.js';

type UserLanguageStateRow = {
  user_id: string;
  last_detected_language: SupportedLanguage;
  lang_streak: number;
};

export async function getUserLanguageState(
  userId: string,
): Promise<{ lastDetected?: SupportedLanguage; streak: number }> {
  const { data, error } = await supabase
    .from('user_language_state')
    .select('last_detected_language,lang_streak')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { streak: 0 };
  }

  return {
    lastDetected:
      data.last_detected_language === 'en' ||
      data.last_detected_language === 'es' ||
      data.last_detected_language === 'pt'
        ? (data.last_detected_language as SupportedLanguage)
        : undefined,
    streak: Number(data.lang_streak ?? 0) || 0,
  };
}

export async function updateDetectedLanguage(
  userId: string,
  language: SupportedLanguage,
): Promise<void> {
  const current = await getUserLanguageState(userId);
  const nextStreak = current.lastDetected === language ? current.streak + 1 : 1;

  const row: UserLanguageStateRow & { lang_updated_at: string; updated_at: string } = {
    user_id: userId,
    last_detected_language: language,
    lang_streak: nextStreak,
    lang_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('user_language_state').upsert(row, {
    onConflict: 'user_id',
  });
  if (error) {
    console.warn('[user-language-state] updateDetectedLanguage:', error.message);
  }
}
