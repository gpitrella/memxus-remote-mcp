export interface MemoryRow {
  id: string;
  user_id: string;
  content: string;
  memory_type: 'general' | 'preference' | 'fact' | 'instruction' | 'conversation';
  importance: number;
  tags: string[];
  collection: string | null;
  thread_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  similarity?: number;
  /** Present when the memory belongs to a workforce workspace (spec §6 echo). */
  workforce_workspace_id?: string | null;
}
