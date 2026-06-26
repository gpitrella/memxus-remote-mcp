export type ProjectProfile = {
  domain: string;
  stack: string[];
  confidence: number;
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
