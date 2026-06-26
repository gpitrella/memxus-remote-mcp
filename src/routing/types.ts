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

export type VerifiedSkill = {
  id: string;
  name: string;
  description: string;
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

export type RoutedSkill = VerifiedSkill & {
  score: number;
  reason: string;
};

export type SkillRoutingResult = {
  profile: ProjectProfile;
  intent: Intent;
  activeSkills: RoutedSkill[];
  requiresApproval: true;
};
