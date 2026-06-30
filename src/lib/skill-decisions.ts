import { supabase } from './supabase.js';

export type SkillDecisionAction = 'used_in_chat' | 'installed' | 'skipped';

const SKIP_TTL_DAYS = 30;

export async function getSkippedSkillIds(
  userId: string,
  collection: string,
): Promise<Set<string>> {
  const since = new Date();
  since.setDate(since.getDate() - SKIP_TTL_DAYS);

  const { data, error } = await supabase
    .from('skill_decisions')
    .select('skill_id')
    .eq('user_id', userId)
    .eq('collection', collection)
    .eq('action', 'skipped')
    .gte('decided_at', since.toISOString());

  if (error) {
    console.warn('[skill-decisions] getSkippedSkillIds:', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.skill_id as string));
}

export async function recordSkillDecision(input: {
  userId: string;
  collection: string;
  skillId: string;
  action: SkillDecisionAction;
  chatSessionId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('skill_decisions').upsert(
    {
      user_id: input.userId,
      collection: input.collection,
      skill_id: input.skillId,
      action: input.action,
      chat_session_id: input.chatSessionId ?? null,
      decided_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,collection,skill_id' },
  );
  if (error) {
    console.warn('[skill-decisions] recordSkillDecision:', error.message);
  }
}

export async function resetSkillDecision(input: {
  userId: string;
  collection: string;
  skillId: string;
}): Promise<boolean> {
  const { error, count } = await supabase
    .from('skill_decisions')
    .delete({ count: 'exact' })
    .eq('user_id', input.userId)
    .eq('collection', input.collection)
    .eq('skill_id', input.skillId)
    .eq('action', 'skipped');

  if (error) {
    console.warn('[skill-decisions] resetSkillDecision:', error.message);
    return false;
  }
  return (count ?? 0) > 0;
}
