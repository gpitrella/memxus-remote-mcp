export type SupportedLanguage = 'en' | 'es' | 'pt';

type TranslationKey =
  | 'skillsHeader'
  | 'useInChat'
  | 'install'
  | 'skip'
  | 'viewDocs'
  | 'installNotAvailable'
  | 'communitySkillNotice'
  | 'suggestedSkills'
  | 'approvalNeeded'
  | 'noSkillsAvailable'
  | 'officialSourceUnavailable'
  | 'skillLoaded'
  | 'skipRecorded'
  | 'installConfirmed'
  | 'installCommandReady'
  | 'collectionsSelect'
  | 'collectionsShowMore'
  | 'collectionsHeader'
  | 'collectionsShowMoreHint';

const DICTIONARY: Record<SupportedLanguage, Record<TranslationKey, string>> = {
  en: {
    skillsHeader: 'Suggested Skills',
    useInChat: 'Use in chat',
    install: 'Install',
    skip: 'Skip',
    viewDocs: 'View docs',
    installNotAvailable: 'Install is not available on this client.',
    communitySkillNotice: 'Community skills are shown as guidance only until they are verified.',
    suggestedSkills: 'Suggested Skills',
    approvalNeeded: 'Choose one: use, install, or skip.',
    noSkillsAvailable: 'No matching skills were found.',
    officialSourceUnavailable: 'Official skill source is unavailable right now.',
    skillLoaded: 'Skill loaded into this chat.',
    skipRecorded: 'Skill skipped for this collection.',
    installConfirmed: 'Install confirmed.',
    installCommandReady: 'Run the install command in your terminal and then confirm it here.',
    collectionsSelect: 'Select',
    collectionsShowMore: 'See more',
    collectionsHeader: 'COLLECTIONS',
    collectionsShowMoreHint: 'Reply with a collection slug or "all" to list every collection.',
  },
  es: {
    skillsHeader: 'Skills sugeridas',
    useInChat: 'Usar en chat',
    install: 'Instalar',
    skip: 'Omitir',
    viewDocs: 'Ver docs',
    installNotAvailable: 'La instalación no está disponible en este cliente.',
    communitySkillNotice: 'Las skills de comunidad se muestran solo como guía hasta que estén verificadas.',
    suggestedSkills: 'Skills sugeridas',
    approvalNeeded: 'Elegí una opción: usar, instalar u omitir.',
    noSkillsAvailable: 'No se encontraron skills compatibles.',
    officialSourceUnavailable: 'La fuente oficial de la skill no está disponible ahora.',
    skillLoaded: 'Skill cargada en este chat.',
    skipRecorded: 'Skill omitida para esta coleccion.',
    installConfirmed: 'Instalación confirmada.',
    installCommandReady: 'Ejecutá el comando de instalación en tu terminal y luego confirmalo acá.',
    collectionsSelect: 'Seleccionar',
    collectionsShowMore: 'Ver más',
    collectionsHeader: 'COLECCIONES',
    collectionsShowMoreHint: 'Respondé con un slug de colección o "all" para ver todas.',
  },
  pt: {
    skillsHeader: 'Skills sugeridas',
    useInChat: 'Usar no chat',
    install: 'Instalar',
    skip: 'Ignorar',
    viewDocs: 'Ver docs',
    installNotAvailable: 'A instalacao nao esta disponivel neste cliente.',
    communitySkillNotice: 'Skills da comunidade sao exibidas apenas como orientacao ate serem verificadas.',
    suggestedSkills: 'Skills sugeridas',
    approvalNeeded: 'Escolha uma opcao: usar, instalar ou ignorar.',
    noSkillsAvailable: 'Nenhuma skill compativel foi encontrada.',
    officialSourceUnavailable: 'A fonte oficial da skill nao esta disponivel agora.',
    skillLoaded: 'Skill carregada neste chat.',
    skipRecorded: 'Skill ignorada para esta colecao.',
    installConfirmed: 'Instalacao confirmada.',
    installCommandReady: 'Execute o comando de instalacao no terminal e depois confirme aqui.',
    collectionsSelect: 'Selecionar',
    collectionsShowMore: 'Ver mais',
    collectionsHeader: 'COLECOES',
    collectionsShowMoreHint: 'Responda com um slug de colecao ou "all" para ver todas.',
  },
};

const SPANISH_MARKERS = [' el ', ' la ', ' que ', ' para ', ' usar ', ' instalar ', ' omitir '];
const PORTUGUESE_MARKERS = [' nao ', ' voce ', ' usar ', ' instalar ', ' ignorar ', ' projeto '];

function normalizeText(value: string | undefined | null): string {
  return ` ${(value ?? '').trim().toLowerCase()} `;
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === 'en' || value === 'es' || value === 'pt';
}

export function normalizeLanguageTag(value?: string | null): SupportedLanguage | null {
  if (!value) return null;
  const prefix = value.trim().toLowerCase().slice(0, 2);
  return isSupportedLanguage(prefix) ? prefix : null;
}

export function detectLanguage(input: {
  explicit?: string | null;
  text?: string | null;
  acceptLanguage?: string | null;
  locale?: string | null;
  lastDetected?: SupportedLanguage | null;
}): SupportedLanguage {
  const explicit = normalizeLanguageTag(input.explicit);
  if (explicit) return explicit;

  const sample = normalizeText(input.text);
  if (sample) {
    if (SPANISH_MARKERS.some((token) => sample.includes(token))) return 'es';
    if (PORTUGUESE_MARKERS.some((token) => sample.includes(token))) return 'pt';
  }

  const fromAccept = normalizeLanguageTag(input.acceptLanguage);
  if (fromAccept) return fromAccept;

  const fromLocale = normalizeLanguageTag(input.locale);
  if (fromLocale) return fromLocale;

  return input.lastDetected ?? 'en';
}

export function t(lang: SupportedLanguage, key: TranslationKey): string {
  return DICTIONARY[lang][key];
}
