import { clubBadgeProfile as baseProfile, clubCrestSvg as baseCrestSvg } from './clubIdentity.mjs';

/*
 * Identity aliases and the handful of bespoke badges whose dataset names do
 * not line up with the long-form name used by the main profile catalogue.
 * Keep these references visually faithful to the current club identity, while
 * remaining original simplified vectors rather than copies of official art.
 */

const ALIASES = {
  brighton: 'Brighton & Hove Albion',
  "borussia m'gladbach": 'Borussia Monchengladbach',
  'nac breda': 'NAC',
};

const CUSTOM = {
  morecambe: { shape: 'shield', motif: 'shrimp', reference: 'red shield, white shrimp, white name bar' },
  'sutton united': { shape: 'shield', motif: 'heraldic', reference: 'gold/navy heraldic shield with central pale stripe' },
  'bristol rovers': { shape: 'shield', motif: 'pirate', reference: 'blue/white quartered shield with pirate' },
  rochdale: { shape: 'roundel', motif: 'bull-shield', reference: 'blue roundel, white centre, heraldic shield and bull' },
  'york city': { shape: 'shield', motif: 'lions', reference: 'red/white shield with blue lions' },
  'sc paderborn': { shape: 'roundel', motif: 'paderborn-07', reference: 'blue/white circle, black centre bar and 07' },
  troyes: { shape: 'shield', motif: 'estac-10', reference: 'blue shield, gold outline, ESTAC and number 10' },
  'le mans': { shape: 'shield', motif: 'horse', reference: 'red shield, black name bar and gold horse head' },
  'paris fc': { shape: 'shield', motif: 'eiffel', reference: 'navy/blue shield, white-blue Eiffel tower and ball' },
};

export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bfootball club\b/g, '')
    .replace(/\bfc\b$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rawKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value) : fallback;
}

function contrast(hexColor) {
  const h = hex(hexColor, '#4A5568').slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#FFFFFF';
}

function customSvg(team, spec, { size = 32, label = '' } = {}) {
  const name = String(team?.name ?? 'Club');
  const primary = hex(team?.primaryColor, '#22559A');
  const title = label ? `<title>${esc(label)}</title>` : '';
  const aria = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  const common = `xmlns="http://www.w3.org/2000/svg" width="${Number(size) || 32}" height="${Number(size) || 32}" viewBox="0 0 100 100" ${aria}`;

  if (spec.motif === 'shrimp') {
    return `<svg ${common}>${title}<path d="M12 10h76v42c0 23-14 36-38 44C26 88 12 75 12 52Z" fill="#B7192A" stroke="#8C713C" stroke-width="3"/><path d="M15 12h70v20H15Z" fill="#FFFFFF"/><text x="50" y="26" text-anchor="middle" font-family="Arial Black,Arial" font-size="12" font-weight="900" fill="#111111">MORECAMBE</text><path d="M28 55c9-16 30-22 45-8 7 7 4 20-8 25-13 6-29 0-30-10 0-7 7-10 14-8 8 2 9 10 3 13-5 2-11-1-10-6" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><path d="M27 53 18 46M27 56 16 56M29 60 19 66M68 48l9-8M69 51l11-3" fill="none" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round"/></svg>`;
  }

  if (spec.motif === 'heraldic') {
    return `<svg ${common}>${title}<path d="M13 12 50 5l37 7v38c0 22-14 35-37 43-23-8-37-21-37-43Z" fill="#F5C242" stroke="#18263F" stroke-width="3"/><path d="M18 18h24v59c-10-7-17-17-18-31Z" fill="#151F35"/><path d="M58 18h24l-6 29c-2 13-8 23-18 30Z" fill="#151F35"/><path d="M43 17h14v63H43Z" fill="#F7F4E9"/><circle cx="32" cy="48" r="7" fill="#2E63A8" stroke="#F5C242" stroke-width="2"/><circle cx="68" cy="48" r="7" fill="#C83232" stroke="#F5C242" stroke-width="2"/><path d="M50 25v43M46 33h8M46 46h8M46 59h8" stroke="#D4A930" stroke-width="2.3"/><path d="M43 10c4-8 12-8 17 0-4-1-7 1-9 5-2-4-5-6-8-5Z" fill="#4E9B3E" stroke="#18263F" stroke-width="1.5"/></svg>`;
  }

  if (spec.motif === 'pirate') {
    return `<svg ${common}>${title}<path d="M11 10 50 4l39 6v40c0 23-15 36-39 45-24-9-39-22-39-45Z" fill="#FFFFFF" stroke="#153B77" stroke-width="3"/><path d="M13 12h37v38H13ZM50 50h37v35c-8 4-20 8-37 10Z" fill="#1E5AA8"/><path d="M50 12h37v38H50ZM13 50h37v45c-17-3-29-7-37-12Z" fill="#FFFFFF"/><path d="M34 68c5-15 15-25 28-27l-4 7 10 4-9 6 5 16H40Z" fill="#121820"/><path d="M35 43c7-10 23-12 31-2-8-2-18 0-25 6Z" fill="#D5A62D"/><path d="M32 78 68 39" stroke="#D5A62D" stroke-width="4" stroke-linecap="round"/></svg>`;
  }

  if (spec.motif === 'bull-shield') {
    return `<svg ${common}>${title}<circle cx="50" cy="50" r="45" fill="#1761A0" stroke="#FFFFFF" stroke-width="2"/><circle cx="50" cy="50" r="34" fill="#FFFFFF"/><path d="M31 38 50 31l19 7v21c0 10-7 17-19 22-12-5-19-12-19-22Z" fill="#1761A0" stroke="#A9ADB3" stroke-width="2"/><path d="M37 45h26v20H37Z" fill="#E7ECEF"/><path d="M40 56c4-8 17-9 22-1-3 7-17 10-22 1Z" fill="#171717"/><path d="M40 53 34 49M62 53l6-4" stroke="#171717" stroke-width="2.5"/><text x="50" y="17" text-anchor="middle" font-family="Arial Black,Arial" font-size="8" fill="#FFFFFF">ROCHDALE</text><text x="50" y="92" text-anchor="middle" font-family="Arial Black,Arial" font-size="8" fill="#FFFFFF">AFC</text></svg>`;
  }

  if (spec.motif === 'lions') {
    const lion = (x, y) => `<path d="M${x} ${y}c5-5 11-3 12 2l-4 3 4 3c-3 6-10 6-14 1l3-3-4-2Z" fill="#153E78"/>`;
    return `<svg ${common}>${title}<path d="M13 9h74l-6 61-31 24-31-24Z" fill="#FFFFFF" stroke="#153E78" stroke-width="3"/><path d="M14 10h25L24 48H14ZM86 10H61l15 38h10ZM19 70l18-22v38ZM81 70 63 48v38Z" fill="#E52336"/>${lion(44,27)}${lion(34,47)}${lion(52,62)}<path d="M41 12h18l-9 11Z" fill="#E52336"/></svg>`;
  }

  if (spec.motif === 'paderborn-07') {
    return `<svg ${common}>${title}<circle cx="50" cy="50" r="44" fill="#FFFFFF" stroke="#1C68B3" stroke-width="4"/><path d="M8 56h84v30H8Z" fill="#1C68B3" clip-path="circle(44px at 50px 50px)"/><path d="M10 47h80v10H10Z" fill="#111111"/><text x="50" y="37" text-anchor="middle" font-family="Arial Black,Arial" font-size="14" font-weight="900" fill="#111111">SC</text><text x="50" y="54" text-anchor="middle" font-family="Arial Black,Arial" font-size="11" font-weight="900" fill="#FFFFFF">PADERBORN</text><text x="50" y="78" text-anchor="middle" font-family="Arial Black,Arial" font-size="22" font-weight="900" fill="#FFFFFF">07</text></svg>`;
  }

  if (spec.motif === 'estac-10') {
    return `<svg ${common}>${title}<path d="M13 9h74l-5 59C79 80 67 89 50 95 33 89 21 80 18 68Z" fill="#1483C5" stroke="#C8A63A" stroke-width="4"/><path d="M19 17h62" stroke="#FFFFFF" stroke-width="2"/><text x="50" y="45" text-anchor="middle" font-family="Arial Black,Arial" font-size="20" font-weight="900" fill="#FFFFFF">ESTAC</text><text x="50" y="59" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="700" letter-spacing="3" fill="#D7B34E">TROYES</text><circle cx="50" cy="76" r="11" fill="none" stroke="#FFFFFF" stroke-width="2"/><text x="50" y="81" text-anchor="middle" font-family="Arial Black,Arial" font-size="14" fill="#FFFFFF">10</text></svg>`;
  }

  if (spec.motif === 'horse') {
    return `<svg ${common}>${title}<path d="M12 9h76v56C84 80 70 90 50 95 30 90 16 80 12 65Z" fill="#C71F2D" stroke="#151116" stroke-width="4"/><path d="M12 10h76v22H12Z" fill="#151116"/><text x="50" y="26" text-anchor="middle" font-family="Arial Black,Arial" font-size="13" font-weight="900" fill="#FFFFFF">LE MANS <tspan fill="#E8BC32">FC</tspan></text><path d="M31 75c5-25 14-36 32-37l14 12-12 6 5 20H57l-5-14-8 14Z" fill="none" stroke="#E8BC32" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M61 42 47 50 36 46" fill="none" stroke="#E8BC32" stroke-width="3"/></svg>`;
  }

  if (spec.motif === 'eiffel') {
    return `<svg ${common}>${title}<path d="M13 11h74l-5 60C79 82 68 90 50 95 32 90 21 82 18 71Z" fill="#10183D" stroke="#149AD3" stroke-width="4"/><path d="M17 28h66" stroke="#FFFFFF" stroke-width="2"/><text x="50" y="24" text-anchor="middle" font-family="Arial Black,Arial" font-size="13" font-weight="900" fill="#FFFFFF">PARIS FC</text><path d="M50 34c-2 17-8 32-20 46M50 34c2 17 8 32 20 46M38 62h24M33 75h34" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/><path d="M50 34c4 17 7 30 11 40" fill="none" stroke="#13A4D8" stroke-width="4"/><circle cx="50" cy="82" r="8" fill="#FFFFFF" stroke="#D5303A" stroke-width="2"/><path d="m50 77 4 3-2 5h-4l-2-5Z" fill="#10183D"/></svg>`;
  }

  const fg = contrast(primary);
  return `<svg ${common}>${title}<path d="M12 10 50 4l38 6v40c0 22-14 35-38 44-24-9-38-22-38-44Z" fill="${primary}" stroke="#171B20" stroke-width="3"/><text x="50" y="59" text-anchor="middle" font-family="Arial Black,Arial" font-size="22" font-weight="900" fill="${fg}">${esc(name.slice(0,3).toUpperCase())}</text></svg>`;
}

function aliasTeam(team, alias) {
  return { ...team, name: alias, shortName: team.shortName };
}

export function resolvedClubBadgeProfile(team = {}) {
  const raw = rawKey(team.name);
  const custom = CUSTOM[raw];
  if (custom) return { ...custom, primary: hex(team.primaryColor, '#4B5563') };
  const alias = ALIASES[raw];
  return baseProfile(alias ? aliasTeam(team, alias) : team);
}

export function resolvedClubCrestSvg(team = {}, options = {}) {
  const raw = rawKey(team.name);
  const custom = CUSTOM[raw];
  if (custom) return customSvg(team, custom, options);
  const alias = ALIASES[raw];
  return baseCrestSvg(alias ? aliasTeam(team, alias) : team, options);
}

export const CUSTOM_BADGE_PROFILE_COUNT = Object.keys(CUSTOM).length;
export const BADGE_NAME_ALIAS_COUNT = Object.keys(ALIASES).length;
