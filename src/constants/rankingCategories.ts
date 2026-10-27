export type RankingCategoryKey =
  | 'generale'
  | 'stranieri'
  | 'fuori_quadro'
  | 'provvisori'
  | 'u11'
  | 'u13'
  | 'u15'
  | 'u17'
  | 'u19'
  | 'u21'
  | 'master_1'
  | 'master_2'
  | 'master_3'
  | 'master_4'
  | 'master_5'
  | 'master_6'
  | 'master_7'
  | 'para_1_5'
  | 'para_6_10'
  | 'para_11';

export type RankingGroupKey = 'generale' | 'speciali' | 'giovanili' | 'master' | 'paralimpici';

export interface RankingCategoryDef {
  key: RankingCategoryKey;
  label: string;
  shortLabel: string;
  group: RankingGroupKey;
  tipo: number;
  sett: string;
  s: number;
  fq: number;
  g: number;
  v: number;
  p?: number;
  description: string;
  icon: string;
}

export interface RankingGroupDef {
  key: RankingGroupKey;
  label: string;
  shortLabel: string;
  icon: string;
  badge?: string;
  defaultCategoryKey: RankingCategoryKey;
}

export const RANKING_GROUPS: RankingGroupDef[] = [
  {
    key: 'generale',
    label: 'Generale',
    shortLabel: 'Generale',
    icon: 'bi-trophy-fill',
    defaultCategoryKey: 'generale',
  },
  {
    key: 'speciali',
    label: 'Altre Categorie',
    shortLabel: 'Speciali',
    icon: 'bi-globe2',
    badge: 'Stranieri, FQ...',
    defaultCategoryKey: 'stranieri',
  },
  {
    key: 'giovanili',
    label: 'Giovanili',
    shortLabel: 'Giovanili',
    icon: 'bi-backpack-fill',
    badge: 'U11-U21',
    defaultCategoryKey: 'u15',
  },
  {
    key: 'master',
    label: 'Master / Veterani',
    shortLabel: 'Master',
    icon: 'bi-award-fill',
    badge: 'Cat. 1-7',
    defaultCategoryKey: 'master_1',
  },
  {
    key: 'paralimpici',
    label: 'Paralimpici',
    shortLabel: 'Paralimpici',
    icon: 'bi-universal-access-circle',
    badge: 'Cl. 1-11',
    defaultCategoryKey: 'para_1_5',
  },
];

export const RANKING_CATEGORIES: RankingCategoryDef[] = [
  // 1. Generale
  {
    key: 'generale',
    label: 'Classifica Generale',
    shortLabel: 'Generale',
    group: 'generale',
    tipo: 1,
    sett: '0',
    s: 0,
    fq: 0,
    g: 0,
    v: 0,
    description: 'Classifica unica atleti tesserati FITeT',
    icon: 'bi-trophy-fill',
  },

  // 2. Altre categorie (Speciali)
  {
    key: 'stranieri',
    label: 'Stranieri',
    shortLabel: 'Stranieri',
    group: 'speciali',
    tipo: 0,
    sett: '0',
    s: 1,
    fq: 0,
    g: 0,
    v: 0,
    description: 'Classifica atleti con cittadinanza straniera tesserati in Italia',
    icon: 'bi-globe2',
  },
  {
    key: 'fuori_quadro',
    label: 'Fuori Quadro (FQ)',
    shortLabel: 'Fuori Quadro',
    group: 'speciali',
    tipo: 0,
    sett: '0',
    s: 0,
    fq: 1,
    g: 0,
    v: 0,
    description: 'Atleti momentaneamente fuori quadro per attività o punteggio',
    icon: 'bi-slash-circle',
  },
  {
    key: 'provvisori',
    label: 'Provvisori',
    shortLabel: 'Provvisori',
    group: 'speciali',
    tipo: 9,
    sett: '0',
    s: 0,
    fq: 1,
    g: 0,
    v: 0,
    description: 'Atleti con posizione o punteggio provvisorio FITeT',
    icon: 'bi-hourglass-split',
  },

  // 3. Giovanili (G=1)
  {
    key: 'u11',
    label: 'Under 11 (Giovanissimi)',
    shortLabel: 'U11',
    group: 'giovanili',
    tipo: 0,
    sett: 'G',
    s: 0,
    fq: 0,
    g: 1,
    v: 0,
    description: 'Settore giovanile Under 11',
    icon: 'bi-person-badge',
  },
  {
    key: 'u13',
    label: 'Under 13 (Ragazzi)',
    shortLabel: 'U13',
    group: 'giovanili',
    tipo: 0,
    sett: 'R',
    s: 0,
    fq: 0,
    g: 1,
    v: 0,
    description: 'Settore giovanile Under 13',
    icon: 'bi-person-badge',
  },
  {
    key: 'u15',
    label: 'Under 15 (Allievi)',
    shortLabel: 'U15',
    group: 'giovanili',
    tipo: 0,
    sett: 'D',
    s: 0,
    fq: 0,
    g: 1,
    v: 0,
    description: 'Settore giovanile Under 15',
    icon: 'bi-person-badge',
  },
  {
    key: 'u17',
    label: 'Under 17 (Cadetti)',
    shortLabel: 'U17',
    group: 'giovanili',
    tipo: 0,
    sett: 'A',
    s: 0,
    fq: 0,
    g: 1,
    v: 0,
    description: 'Settore giovanile Under 17',
    icon: 'bi-person-badge',
  },
  {
    key: 'u19',
    label: 'Under 19 (Juniores)',
    shortLabel: 'U19',
    group: 'giovanili',
    tipo: 0,
    sett: 'J',
    s: 0,
    fq: 0,
    g: 1,
    v: 0,
    description: 'Settore giovanile Under 19',
    icon: 'bi-person-badge',
  },
  {
    key: 'u21',
    label: 'Under 21',
    shortLabel: 'U21',
    group: 'giovanili',
    tipo: 0,
    sett: 'U',
    s: 0,
    fq: 0,
    g: 1,
    v: 0,
    description: 'Settore giovanile Under 21',
    icon: 'bi-person-badge',
  },

  // 4. Master (V=1)
  {
    key: 'master_1',
    label: 'Master Categoria 1 (40-49 anni)',
    shortLabel: 'Cat. 1 (40-49)',
    group: 'master',
    tipo: 0,
    sett: '1',
    s: 0,
    fq: 0,
    g: 0,
    v: 1,
    description: 'Veterani Master 40-49 anni',
    icon: 'bi-award',
  },
  {
    key: 'master_2',
    label: 'Master Categoria 2 (50-59 anni)',
    shortLabel: 'Cat. 2 (50-59)',
    group: 'master',
    tipo: 0,
    sett: '2',
    s: 0,
    fq: 0,
    g: 0,
    v: 1,
    description: 'Veterani Master 50-59 anni',
    icon: 'bi-award',
  },
  {
    key: 'master_3',
    label: 'Master Categoria 3 (60-64 anni)',
    shortLabel: 'Cat. 3 (60-64)',
    group: 'master',
    tipo: 0,
    sett: '3',
    s: 0,
    fq: 0,
    g: 0,
    v: 1,
    description: 'Veterani Master 60-64 anni',
    icon: 'bi-award',
  },
  {
    key: 'master_4',
    label: 'Master Categoria 4 (65-69 anni)',
    shortLabel: 'Cat. 4 (65-69)',
    group: 'master',
    tipo: 0,
    sett: '4',
    s: 0,
    fq: 0,
    g: 0,
    v: 1,
    description: 'Veterani Master 65-69 anni',
    icon: 'bi-award',
  },
  {
    key: 'master_5',
    label: 'Master Categoria 5 (70-74 anni)',
    shortLabel: 'Cat. 5 (70-74)',
    group: 'master',
    tipo: 0,
    sett: '5',
    s: 0,
    fq: 0,
    g: 0,
    v: 1,
    description: 'Veterani Master 70-74 anni',
    icon: 'bi-award',
  },
  {
    key: 'master_6',
    label: 'Master Categoria 6 (75-79 anni)',
    shortLabel: 'Cat. 6 (75-79)',
    group: 'master',
    tipo: 0,
    sett: '6',
    s: 0,
    fq: 0,
    g: 0,
    v: 1,
    description: 'Veterani Master 75-79 anni',
    icon: 'bi-award',
  },
  {
    key: 'master_7',
    label: 'Master Categoria 7 (80+ anni)',
    shortLabel: 'Cat. 7 (80+)',
    group: 'master',
    tipo: 0,
    sett: '7',
    s: 0,
    fq: 0,
    g: 0,
    v: 1,
    description: 'Veterani Master oltre 80 anni',
    icon: 'bi-award',
  },

  // 5. Paralimpici (TIPO=2)
  {
    key: 'para_1_5',
    label: 'Paralimpica Classe 1-5 (Carrozzina)',
    shortLabel: 'Classe 1-5 (Carrozzina)',
    group: 'paralimpici',
    tipo: 2,
    p: 1,
    sett: '0',
    s: 0,
    fq: 0,
    g: 0,
    v: 0,
    description: 'Atleti paralimpici in carrozzina (Classi 1-5)',
    icon: 'bi-universal-access',
  },
  {
    key: 'para_6_10',
    label: 'Paralimpica Classe 6-10 (In piedi)',
    shortLabel: 'Classe 6-10 (In piedi)',
    group: 'paralimpici',
    tipo: 2,
    p: 6,
    sett: '0',
    s: 0,
    fq: 0,
    g: 0,
    v: 0,
    description: 'Atleti paralimpici deambulanti (Classi 6-10)',
    icon: 'bi-universal-access',
  },
  {
    key: 'para_11',
    label: 'Paralimpica Classe 11 (DIR)',
    shortLabel: 'Classe 11 (DIR)',
    group: 'paralimpici',
    tipo: 2,
    p: 11,
    sett: '0',
    s: 0,
    fq: 0,
    g: 0,
    v: 0,
    description: 'Atleti con disabilità intellettivo-relazionale (Classe 11)',
    icon: 'bi-universal-access',
  },
];

export function getRankingCategoryByKey(key?: string): RankingCategoryDef {
  if (!key) return RANKING_CATEGORIES[0];
  const found = RANKING_CATEGORIES.find((c) => c.key === key);
  return found || RANKING_CATEGORIES[0];
}

export function getRankingCategoriesByGroup(group: RankingGroupKey): RankingCategoryDef[] {
  return RANKING_CATEGORIES.filter((c) => c.group === group);
}
