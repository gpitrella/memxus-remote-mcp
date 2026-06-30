export type ProjectProfile = {
  domain: string;
  stack: string[];
  confidence: number;
  framework?: string | null;
  language?: string | null;
  db?: string | null;
  cms?: string | null;
  infra?: string | null;
  testing?: string | null;
  evidence?: string[];
};

export type SkillSuggestion = {
  id: string;
  name: string;
  reason: string;
  source: 'official' | 'community';
  install_command: string;
  source_url: string;
};

export type SuggestSkillsResult = {
  stack_detected: ProjectProfile;
  suggestions: SkillSuggestion[];
  skills: RoutedSkill[];
  requires_approval: true;
  presentation_hint: string;
  discovery_degraded: boolean;
  intent: Intent;
};

export type Intent = {
  action: string;
  target: string;
  confidence: number;
};

export type DiscoveredSkill = {
  id: string;
  name: string;
  description: string;
  owner: string;
  repo: string;
  skillId: string;
  sourceUrl: string;
  installCommand: string;
  official: boolean;
};

/** @deprecated Use DiscoveredSkill */
export type VerifiedSkill = DiscoveredSkill & {
  instructions: string;
  verified: boolean;
  appliesTo: {
    domains: string[];
    intents: string[];
    keywords: string[];
  };
  priority: number;
  excludes?: string[];
};

export type RoutedSkill = DiscoveredSkill & {
  score: number;
  reason: string;
};

export type SkillRoutingResult = {
  profile: ProjectProfile;
  intent: Intent;
  activeSkills: RoutedSkill[];
  requiresApproval: true;
  discoveryDegraded?: boolean;
};
