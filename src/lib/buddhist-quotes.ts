// Verbatim excerpts checked against SuttaCentral's bilara-data published texts.
// Bhikkhu Sujato's translations are released under CC0 (public-domain dedication).
export const BUDDHIST_QUOTES = [
  { text: 'For never is hatred laid to rest by hate, it’s laid to rest by love: this is an ancient teaching.', reference: 'Dhammapada 5', url: 'https://suttacentral.net/dhp1-20/en/sujato#dhp5:1' },
  { text: 'If with pure intent you speak or act, happiness follows you like a shadow that never leaves.', reference: 'Dhammapada 2, excerpt', url: 'https://suttacentral.net/dhp1-20/en/sujato#dhp2:3' },
  { text: 'Not to do any evil; to embrace the good; to purify one’s mind: this is the instruction of the Buddhas.', reference: 'Dhammapada 183', url: 'https://suttacentral.net/dhp179-196/en/sujato#dhp183:1' },
  { text: 'Happy, the arising of Buddhas! Happy, the teaching of Dhamma! Happy is the harmony of the Saṅgha, and the striving of the harmonious is happy.', reference: 'Dhammapada 194', url: 'https://suttacentral.net/dhp179-196/en/sujato#dhp194:1' },
  { text: 'Patient acceptance is the ultimate fervor.', reference: 'Dhammapada 184, excerpt', url: 'https://suttacentral.net/dhp179-196/en/sujato#dhp184:1' },
  { text: 'May they be happy and safe! May all beings be happy!', reference: 'Discourse on Love (Mettā Sutta), Sutta Nipāta 1.8, §3', url: 'https://suttacentral.net/snp1.8/en/sujato#snp1.8:3.3' },
  { text: 'Let none deceive another, nor look down on anyone anywhere.', reference: 'Mettā Sutta, Sutta Nipāta 1.8, §6, excerpt', url: 'https://suttacentral.net/snp1.8/en/sujato#snp1.8:6.1' },
  { text: 'With love for the whole world, unfold a boundless heart: above, below, all round, unconstricted, without enmity or foe.', reference: 'Mettā Sutta, Sutta Nipāta 1.8, §8', url: 'https://suttacentral.net/snp1.8/en/sujato#snp1.8:8.1' },
  { text: 'They rejoice and celebrate, seeing their own pure deeds.', reference: 'Dhammapada 16, excerpt', url: 'https://suttacentral.net/dhp1-20/en/sujato#dhp16:3' },
  { text: 'Even as a mother would protect with her life her child, her only child, so too for all creatures unfold a boundless heart.', reference: 'Mettā Sutta, Sutta Nipāta 1.8, §7', url: 'https://suttacentral.net/snp1.8/en/sujato#snp1.8:7.1' },
] as const;
export const QUOTE_TRANSLATOR = 'Bhikkhu Sujato';
export const QUOTE_LICENSE_URL = 'https://github.com/suttacentral/bilara-data/blob/published/README.md';
export const QUOTE_SOURCE_FILES = [
  'https://raw.githubusercontent.com/suttacentral/bilara-data/published/translation/en/sujato/sutta/kn/dhp/dhp1-20_translation-en-sujato.json',
  'https://raw.githubusercontent.com/suttacentral/bilara-data/published/translation/en/sujato/sutta/kn/dhp/dhp179-196_translation-en-sujato.json',
  'https://raw.githubusercontent.com/suttacentral/bilara-data/published/translation/en/sujato/sutta/kn/snp/vagga1/snp1.8_translation-en-sujato.json',
];
export function milestoneQuote(level: number) { return BUDDHIST_QUOTES[Math.max(0, Math.floor(level / 5) - 1) % BUDDHIST_QUOTES.length]!; }
