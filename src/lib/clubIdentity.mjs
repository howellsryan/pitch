/*
 * Bespoke club identity layer.
 *
 * These are original, simplified SVG interpretations of real club identities:
 * badge family/silhouette, club colours, stripe/quarter treatments and a small
 * symbolic cue. They intentionally do NOT embed, trace or hot-link official
 * badge artwork. The result is recognisable and club-specific without making
 * the game dependent on licensed logo files.
 */

const PROFILE = {
  // Premier League 2026/27
  arsenal: { shape:'shield', secondary:'#FFFFFF', accent:'#0F2C59', pattern:'half', motif:'cannon' },
  'aston villa': { shape:'shield', secondary:'#95BFE5', accent:'#FEE505', motif:'lion' },
  bournemouth: { shape:'shield', secondary:'#000000', pattern:'stripes', motif:'ball' },
  brentford: { shape:'roundel', secondary:'#FFFFFF', accent:'#111111', motif:'bee' },
  'brighton & hove albion': { shape:'roundel', secondary:'#FFFFFF', motif:'seagull' },
  chelsea: { shape:'roundel', secondary:'#FFFFFF', accent:'#DBA111', motif:'lion' },
  'coventry city': { shape:'shield', secondary:'#FFFFFF', accent:'#1B2F5B', motif:'elephant' },
  'crystal palace': { shape:'shield', secondary:'#C4122E', accent:'#FFFFFF', pattern:'stripes', motif:'eagle' },
  everton: { shape:'shield', secondary:'#FFFFFF', motif:'tower' },
  fulham: { shape:'shield', secondary:'#FFFFFF', accent:'#CC0000', motif:'ffc' },
  'hull city': { shape:'shield', secondary:'#111111', pattern:'stripes', motif:'tiger' },
  'ipswich town': { shape:'shield', secondary:'#FFFFFF', accent:'#E21A2D', motif:'horse' },
  'leeds united': { shape:'shield', secondary:'#FFFFFF', accent:'#FFCD00', motif:'rose' },
  liverpool: { shape:'shield', secondary:'#FFFFFF', accent:'#00B2A9', motif:'bird' },
  'manchester city': { shape:'roundel', secondary:'#FFFFFF', accent:'#6CABDD', motif:'ship' },
  'manchester united': { shape:'roundel', secondary:'#FBE122', accent:'#111111', motif:'devil' },
  'newcastle united': { shape:'shield', secondary:'#FFFFFF', accent:'#41B6E6', pattern:'stripes', motif:'castle' },
  'nottm forest': { shape:'wordmark', secondary:'#FFFFFF', motif:'tree' },
  'nottingham forest': { shape:'wordmark', secondary:'#FFFFFF', motif:'tree' },
  sunderland: { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'bridge' },
  'tottenham hotspur': { shape:'wordmark', secondary:'#FFFFFF', accent:'#132257', motif:'cockerel' },

  // Championship / EFL identities used by the 2026/27 data set
  southampton: { shape:'shield', secondary:'#FFFFFF', accent:'#111111', pattern:'stripes', motif:'tree' },
  'norwich city': { shape:'shield', secondary:'#FFF200', accent:'#009A44', motif:'canary' },
  'middlesbrough fc': { shape:'shield', secondary:'#FFFFFF', motif:'lion' },
  middlesbrough: { shape:'shield', secondary:'#FFFFFF', motif:'lion' },
  'west bromwich albion': { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'bird' },
  'derby county': { shape:'wordmark', secondary:'#FFFFFF', accent:'#111111', motif:'ram' },
  'birmingham city': { shape:'roundel', secondary:'#FFFFFF', accent:'#E11B22', motif:'ball' },
  'bristol city': { shape:'roundel', secondary:'#FFFFFF', motif:'robin' },
  'cardiff city': { shape:'shield', secondary:'#FFFFFF', accent:'#D71920', motif:'dragon' },
  millwall: { shape:'roundel', secondary:'#FFFFFF', motif:'lion' },
  'preston north end': { shape:'shield', secondary:'#FFFFFF', accent:'#001B45', motif:'lamb' },
  'queens park rangers': { shape:'roundel', secondary:'#FFFFFF', motif:'qpr' },
  'stoke city': { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'sc' },
  watford: { shape:'shield', secondary:'#FFD100', accent:'#111111', motif:'stag' },
  'blackburn rovers': { shape:'roundel', secondary:'#FFFFFF', accent:'#009EE0', pattern:'quarters', motif:'rose' },
  'wolverhampton wanderers': { shape:'hex', secondary:'#FDB913', accent:'#111111', motif:'wolf' },
  burnley: { shape:'shield', secondary:'#6C1D45', accent:'#99D6EA', motif:'castle' },
  'west ham united': { shape:'shield', secondary:'#7A263A', accent:'#1BB1E7', motif:'hammers' },
  'lincoln city': { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'imp' },
  'bolton wanderers': { shape:'wordmark', secondary:'#FFFFFF', accent:'#C8102E', motif:'bwfc' },
  'charlton athletic': { shape:'roundel', secondary:'#FFFFFF', motif:'sword' },
  portsmouth: { shape:'roundel', secondary:'#1D4A9A', accent:'#FFFFFF', motif:'star-moon' },
  wrexham: { shape:'shield', secondary:'#FFFFFF', motif:'dragon' },
  'sheffield united': { shape:'roundel', secondary:'#FFFFFF', accent:'#111111', motif:'blades' },
  'swansea city': { shape:'wordmark', secondary:'#FFFFFF', accent:'#111111', motif:'swan' },
  'leicester city': { shape:'roundel', secondary:'#FFFFFF', accent:'#FDBE11', motif:'fox' },
  'oxford united': { shape:'shield', secondary:'#F9E100', accent:'#0D1B5E', motif:'ox' },
  'sheffield wednesday': { shape:'shield', secondary:'#FFFFFF', motif:'owl' },
  'luton town': { shape:'shield', secondary:'#FFFFFF', accent:'#F78F1E', motif:'ltfc' },
  barnsley: { shape:'shield', secondary:'#FFFFFF', motif:'miners' },
  blackpool: { shape:'shield', secondary:'#FFFFFF', motif:'tower' },
  'bradford city': { shape:'roundel', secondary:'#FDB913', accent:'#7A263A', motif:'boar' },
  'burton albion': { shape:'shield', secondary:'#F9E000', accent:'#111111', motif:'brewer' },
  'cambridge united': { shape:'shield', secondary:'#FDB913', accent:'#111111', motif:'cu' },
  'doncaster rovers': { shape:'roundel', secondary:'#FFFFFF', motif:'viking' },
  'exeter city': { shape:'shield', secondary:'#111111', pattern:'half', motif:'lion' },
  'fleetwood town': { shape:'roundel', secondary:'#FFFFFF', motif:'anchor' },
  'huddersfield town': { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'terrier' },
  'leyton orient': { shape:'roundel', secondary:'#FFFFFF', motif:'dragon' },
  'mansfield town': { shape:'shield', secondary:'#F5D000', accent:'#1E4E91', motif:'stag' },
  'northampton town': { shape:'shield', secondary:'#FFFFFF', motif:'tower' },
  'peterborough united': { shape:'roundel', secondary:'#FFFFFF', motif:'castle' },
  'plymouth argyle': { shape:'shield', secondary:'#FFFFFF', motif:'ship' },
  'port vale': { shape:'shield', secondary:'#FFFFFF', accent:'#111111', motif:'pvfc' },
  reading: { shape:'roundel', secondary:'#FFFFFF', pattern:'hoops', motif:'crown' },
  'rotherham united': { shape:'roundel', secondary:'#FFFFFF', motif:'mill' },
  stevenage: { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'ball' },
  'stockport county': { shape:'shield', secondary:'#FFFFFF', motif:'castle' },
  'wigan athletic': { shape:'roundel', secondary:'#FFFFFF', motif:'tree' },
  'wycombe wanderers': { shape:'roundel', secondary:'#FFFFFF', motif:'swan' },
  'afc wimbledon': { shape:'shield', secondary:'#F5D000', accent:'#164194', motif:'eagle' },
  accrington: { shape:'roundel', secondary:'#FFFFFF', motif:'asfc' },
  'accrington stanley': { shape:'roundel', secondary:'#FFFFFF', motif:'asfc' },
  barrow: { shape:'shield', secondary:'#FFFFFF', motif:'submarine' },
  barnet: { shape:'shield', secondary:'#F5A623', accent:'#111111', pattern:'half', motif:'bee' },
  bromley: { shape:'roundel', secondary:'#FFFFFF', motif:'brfc' },
  cheltenham: { shape:'shield', secondary:'#FFFFFF', motif:'robin' },
  'chesterfield fc': { shape:'shield', secondary:'#FFFFFF', motif:'spire' },
  chesterfield: { shape:'shield', secondary:'#FFFFFF', motif:'spire' },
  colchester: { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'eagle' },
  'colchester united': { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'eagle' },
  'crewe alexandra': { shape:'roundel', secondary:'#FFFFFF', motif:'rail' },
  'crawley town': { shape:'roundel', secondary:'#FFFFFF', motif:'ball' },
  gillingham: { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'horse' },
  'grimsby town': { shape:'shield', secondary:'#111111', pattern:'stripes', motif:'fish' },
  'harrogate town': { shape:'roundel', secondary:'#F6C900', accent:'#111111', motif:'htafc' },
  'milton keynes dons': { shape:'roundel', secondary:'#FFFFFF', accent:'#111111', motif:'mk' },
  'newport county': { shape:'roundel', secondary:'#FDB913', accent:'#111111', motif:'bridge' },
  'notts county': { shape:'shield', secondary:'#111111', pattern:'stripes', motif:'magpie' },
  'oldham athletic': { shape:'shield', secondary:'#FFFFFF', motif:'owl' },
  'salford city': { shape:'shield', secondary:'#111111', motif:'lion' },
  'shrewsbury town': { shape:'roundel', secondary:'#F5B335', accent:'#174B8C', motif:'lion' },
  'swindon town': { shape:'shield', secondary:'#FFFFFF', motif:'rail' },
  'tranmere rovers': { shape:'shield', secondary:'#FFFFFF', motif:'trfc' },
  walsall: { shape:'roundel', secondary:'#FFFFFF', motif:'swift' },

  // LaLiga
  'deportivo alaves': { shape:'roundel', secondary:'#FFFFFF', pattern:'stripes', motif:'da' },
  'athletic club': { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'ac' },
  'atletico madrid': { shape:'shield', secondary:'#FFFFFF', pattern:'stripes', motif:'star' },
  barcelona: { shape:'shield', secondary:'#A50044', accent:'#004D98', pattern:'quarters', motif:'cross' },
  'celta vigo': { shape:'pointed', secondary:'#8AC3EE', accent:'#C8102E', motif:'cross' },
  'deportivo la coruna': { shape:'roundel', secondary:'#FFFFFF', accent:'#7B2D26', pattern:'diagonal', motif:'crown' },
  elche: { shape:'shield', secondary:'#FFFFFF', accent:'#00843D', pattern:'hoops', motif:'ecf' },
  espanyol: { shape:'roundel', secondary:'#FFFFFF', pattern:'stripes', motif:'crown' },
  getafe: { shape:'roundel', secondary:'#FFFFFF', accent:'#C8102E', motif:'ball' },
  levante: { shape:'shield', secondary:'#B51F36', accent:'#1A3F8F', pattern:'stripes', motif:'bat' },
  malaga: { shape:'shield', secondary:'#FFFFFF', pattern:'diagonal', motif:'mcf' },
  osasuna: { shape:'roundel', secondary:'#0A2D5E', accent:'#F0C419', motif:'crown' },
  'racing santander': { shape:'roundel', secondary:'#FFFFFF', accent:'#00843D', motif:'crown' },
  'rayo vallecano': { shape:'shield', secondary:'#FFFFFF', accent:'#D71920', pattern:'diagonal', motif:'bolt' },
  'real betis': { shape:'diamond', secondary:'#FFFFFF', accent:'#00843D', pattern:'stripes', motif:'crown' },
  'real madrid': { shape:'roundel', secondary:'#FFFFFF', accent:'#F4B400', motif:'crown' },
  'real sociedad': { shape:'roundel', secondary:'#FFFFFF', pattern:'stripes', motif:'crown' },
  sevilla: { shape:'shield', secondary:'#FFFFFF', accent:'#D71920', pattern:'stripes', motif:'sfc' },
  valencia: { shape:'shield', secondary:'#FFFFFF', accent:'#F58220', pattern:'stripes', motif:'bat' },
  villarreal: { shape:'roundel', secondary:'#F8E34B', accent:'#0050A4', motif:'crown' },

  // Bundesliga
  'borussia dortmund': { shape:'roundel', secondary:'#FDE100', accent:'#111111', motif:'bvb' },
  'vfb stuttgart': { shape:'shield', secondary:'#FFFFFF', accent:'#E32219', pattern:'hoops', motif:'vfb' },
  'bayern munich': { shape:'roundel', secondary:'#FFFFFF', accent:'#0066B2', pattern:'diamonds', motif:'fcb' },
  'bayern münchen': { shape:'roundel', secondary:'#FFFFFF', accent:'#0066B2', pattern:'diamonds', motif:'fcb' },
  'bayer leverkusen': { shape:'shield', secondary:'#111111', accent:'#E32219', motif:'lion' },
  'eintracht frankfurt': { shape:'roundel', secondary:'#FFFFFF', accent:'#111111', motif:'eagle' },
  'borussia monchengladbach': { shape:'diamond', secondary:'#FFFFFF', accent:'#111111', motif:'b' },
  'borussia mönchengladbach': { shape:'diamond', secondary:'#FFFFFF', accent:'#111111', motif:'b' },
  'rb leipzig': { shape:'shield', secondary:'#FFFFFF', accent:'#D50032', motif:'bulls' },
  'werder bremen': { shape:'diamond', secondary:'#FFFFFF', accent:'#008C5A', motif:'w' },
  'mainz 05': { shape:'roundel', secondary:'#FFFFFF', motif:'m05' },
  '1. fsv mainz 05': { shape:'roundel', secondary:'#FFFFFF', motif:'m05' },
  'fc augsburg': { shape:'shield', secondary:'#FFFFFF', accent:'#2F7D32', motif:'tree' },
  'sc freiburg': { shape:'oval', secondary:'#FFFFFF', accent:'#111111', motif:'bird' },
  'tsg hoffenheim': { shape:'shield', secondary:'#FFFFFF', motif:'tsg' },
  'union berlin': { shape:'wordmark', secondary:'#FFFFFF', accent:'#F8D20A', motif:'union' },
  '1. fc union berlin': { shape:'wordmark', secondary:'#FFFFFF', accent:'#F8D20A', motif:'union' },
  'hamburger sv': { shape:'shield', secondary:'#FFFFFF', accent:'#0065A8', pattern:'diamond', motif:'hsv' },
  'schalke 04': { shape:'roundel', secondary:'#FFFFFF', motif:'s04' },
  'fc schalke 04': { shape:'roundel', secondary:'#FFFFFF', motif:'s04' },
  'sv elversberg': { shape:'shield', secondary:'#FFFFFF', accent:'#111111', motif:'sve' },
  'sc paderborn 07': { shape:'roundel', secondary:'#FFFFFF', motif:'scp' },
  '1. fc koln': { shape:'roundel', secondary:'#FFFFFF', accent:'#111111', motif:'goat' },
  '1. fc köln': { shape:'roundel', secondary:'#FFFFFF', accent:'#111111', motif:'goat' },

  // Serie A
  'inter milan': { shape:'roundel', secondary:'#111111', accent:'#FFFFFF', motif:'im' },
  internazionale: { shape:'roundel', secondary:'#111111', accent:'#FFFFFF', motif:'im' },
  'ac milan': { shape:'oval', secondary:'#111111', accent:'#FFFFFF', pattern:'stripes', motif:'acm' },
  juventus: { shape:'wordmark', secondary:'#FFFFFF', accent:'#111111', motif:'j' },
  napoli: { shape:'roundel', secondary:'#FFFFFF', motif:'n' },
  roma: { shape:'shield', secondary:'#F0BC42', accent:'#8E1F2D', pattern:'half', motif:'wolf' },
  lazio: { shape:'shield', secondary:'#FFFFFF', accent:'#87CEEB', motif:'eagle' },
  atalanta: { shape:'oval', secondary:'#111111', accent:'#FFFFFF', motif:'head' },
  bologna: { shape:'oval', secondary:'#1D2D5C', accent:'#B51E35', pattern:'stripes', motif:'bfc' },
  fiorentina: { shape:'diamond', secondary:'#FFFFFF', accent:'#5B2C83', motif:'fleur' },
  torino: { shape:'shield', secondary:'#FFFFFF', accent:'#7A263A', motif:'bull' },
  genoa: { shape:'shield', secondary:'#C8102E', accent:'#1E3A8A', pattern:'quarters', motif:'griffin' },
  parma: { shape:'shield', secondary:'#FFFFFF', accent:'#F3D10B', pattern:'cross', motif:'parma' },
  udinese: { shape:'roundel', secondary:'#FFFFFF', accent:'#111111', motif:'u' },
  lecce: { shape:'shield', secondary:'#F7D117', accent:'#C81D25', motif:'wolf' },
  cagliari: { shape:'shield', secondary:'#1A3C78', accent:'#C61C2B', pattern:'quarters', motif:'cross' },
  como: { shape:'roundel', secondary:'#FFFFFF', motif:'c' },
  pisa: { shape:'shield', secondary:'#111111', accent:'#2E73B7', pattern:'stripes', motif:'tower' },
  sassuolo: { shape:'shield', secondary:'#111111', accent:'#2FA84F', pattern:'stripes', motif:'ball' },
  verona: { shape:'oval', secondary:'#F4D20A', accent:'#1C3F7C', motif:'ladder' },
  'hellas verona': { shape:'oval', secondary:'#F4D20A', accent:'#1C3F7C', motif:'ladder' },
  cremonese: { shape:'shield', secondary:'#D8D8D8', accent:'#D71920', pattern:'stripes', motif:'usc' },

  // Ligue 1
  psg: { shape:'roundel', secondary:'#FFFFFF', accent:'#E30613', motif:'tower' },
  'paris saint-germain': { shape:'roundel', secondary:'#FFFFFF', accent:'#E30613', motif:'tower' },
  marseille: { shape:'wordmark', secondary:'#FFFFFF', accent:'#2FA9DF', motif:'om' },
  lyon: { shape:'shield', secondary:'#FFFFFF', accent:'#D71920', pattern:'stripes', motif:'lion' },
  'olympique lyonnais': { shape:'shield', secondary:'#FFFFFF', accent:'#D71920', pattern:'stripes', motif:'lion' },
  monaco: { shape:'shield', secondary:'#FFFFFF', pattern:'diagonal', motif:'crown' },
  lille: { shape:'shield', secondary:'#FFFFFF', accent:'#D71920', motif:'dog' },
  lens: { shape:'shield', secondary:'#F5D000', accent:'#C8102E', pattern:'stripes', motif:'rcl' },
  rennes: { shape:'shield', secondary:'#111111', accent:'#D71920', motif:'ermine' },
  nice: { shape:'shield', secondary:'#111111', accent:'#D71920', pattern:'stripes', motif:'eagle' },
  strasbourg: { shape:'roundel', secondary:'#FFFFFF', accent:'#1475C9', motif:'stork' },
  nantes: { shape:'shield', secondary:'#F8D800', accent:'#158447', motif:'canary' },
  toulouse: { shape:'roundel', secondary:'#FFFFFF', accent:'#6D2C91', motif:'tfc' },
  auxerre: { shape:'shield', secondary:'#FFFFFF', motif:'cross' },
  brest: { shape:'shield', secondary:'#FFFFFF', accent:'#D71920', motif:'sb29' },
  lorient: { shape:'shield', secondary:'#111111', accent:'#F58220', motif:'fish' },
  metz: { shape:'shield', secondary:'#FFFFFF', accent:'#7A263A', motif:'dragon' },
  'le havre': { shape:'shield', secondary:'#7BC5E8', accent:'#1D315C', pattern:'half', motif:'hac' },
  'paris fc': { shape:'shield', secondary:'#FFFFFF', accent:'#79C8EE', motif:'tower' },
  angers: { shape:'shield', secondary:'#111111', accent:'#FFFFFF', pattern:'stripes', motif:'sco' },

  // Eredivisie
  ajax: { shape:'oval', secondary:'#FFFFFF', accent:'#D2122E', pattern:'stripes', motif:'head' },
  az: { shape:'wordmark', secondary:'#111111', accent:'#D71920', motif:'az' },
  'az alkmaar': { shape:'wordmark', secondary:'#111111', accent:'#D71920', motif:'az' },
  excelsior: { shape:'roundel', secondary:'#FFFFFF', accent:'#111111', motif:'e' },
  'fc groningen': { shape:'roundel', secondary:'#FFFFFF', accent:'#1B8F4A', motif:'g' },
  twente: { shape:'shield', secondary:'#FFFFFF', accent:'#D71920', motif:'horse' },
  'fc utrecht': { shape:'shield', secondary:'#FFFFFF', accent:'#D71920', pattern:'diagonal', motif:'u' },
  feyenoord: { shape:'roundel', secondary:'#FFFFFF', accent:'#111111', pattern:'half', motif:'f' },
  'fortuna sittard': { shape:'roundel', secondary:'#F6DF00', accent:'#1F7D3A', motif:'fs' },
  'go ahead eagles': { shape:'shield', secondary:'#F2D316', accent:'#D71920', motif:'eagle' },
  heracles: { shape:'shield', secondary:'#FFFFFF', accent:'#111111', pattern:'stripes', motif:'h' },
  nec: { shape:'shield', secondary:'#D71920', accent:'#1F7D3A', pattern:'half', motif:'ne' },
  nac: { shape:'shield', secondary:'#F2D316', accent:'#111111', motif:'nac' },
  'pec zwolle': { shape:'shield', secondary:'#FFFFFF', accent:'#2D69B3', pattern:'checkers', motif:'pec' },
  psv: { shape:'oval', secondary:'#FFFFFF', accent:'#D71920', pattern:'stripes', motif:'psv' },
  heerenveen: { shape:'shield', secondary:'#FFFFFF', accent:'#2D69B3', pattern:'stripes', motif:'heart' },
  'sc heerenveen': { shape:'shield', secondary:'#FFFFFF', accent:'#2D69B3', pattern:'stripes', motif:'heart' },
  'sparta rotterdam': { shape:'roundel', secondary:'#FFFFFF', accent:'#D71920', pattern:'stripes', motif:'soldier' },
  telstar: { shape:'shield', secondary:'#FFFFFF', accent:'#1D4D7D', motif:'star' },
  volendam: { shape:'shield', secondary:'#F58220', accent:'#111111', pattern:'diagonal', motif:'fcv' },
  'fc volendam': { shape:'shield', secondary:'#F58220', accent:'#111111', pattern:'diagonal', motif:'fcv' },
};

const SHAPES = ['shield','roundel','oval','diamond','hex'];

function key(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bfootball club\b/g, '')
    .replace(/\bfc\b$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hash(value) {
  let h = 2166136261;
  for (const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function initials(team) {
  const explicit = String(team?.shortName ?? '').replace(/[^A-Za-z0-9]/g, '');
  if (explicit) return explicit.slice(0, 4).toUpperCase();
  const words = String(team?.name ?? 'Club').split(/\s+/).filter(Boolean);
  return words.slice(0, 4).map((w) => w[0]).join('').toUpperCase();
}

function validHex(value) {
  const v = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : null;
}

function luminance(hex) {
  const v = validHex(hex) ?? '#555555';
  const rgb = [1,3,5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((c) => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}

function textOn(hex) {
  return luminance(hex) > .45 ? '#111111' : '#FFFFFF';
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function clubBadgeProfile(team = {}) {
  const normalized = key(team.name);
  const id = key(String(team.id ?? '').replaceAll('_', ' '));
  const found = PROFILE[normalized] ?? PROFILE[id];
  const primary = validHex(team.primaryColor) ?? validHex(team.colour) ?? '#4B5563';
  if (found) return { ...found, primary };

  // Every club still receives a deterministic bespoke crest rather than the
  // old coloured-heart fallback. Unknown/extra clubs get their own silhouette
  // and monogram based on stable club data; curated profiles above are used
  // wherever the real badge has a distinctive family/motif worth preserving.
  const h = hash(team.id ?? team.name ?? 'club');
  return {
    shape: SHAPES[h % SHAPES.length],
    primary,
    secondary: '#FFFFFF',
    accent: textOn(primary),
    pattern: ['none','half','stripes','diagonal','quarters'][h % 5],
    motif: 'monogram',
  };
}

function outerShape(shape, fill, stroke) {
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="2"`;
  if (shape === 'roundel') return `<circle cx="50" cy="50" r="44" ${common}/><circle cx="50" cy="50" r="34" fill="none" stroke="${stroke}" stroke-width="2" opacity=".9"/>`;
  if (shape === 'oval') return `<ellipse cx="50" cy="50" rx="40" ry="45" ${common}/>`;
  if (shape === 'diamond') return `<path d="M50 5 91 50 50 95 9 50Z" ${common}/>`;
  if (shape === 'hex') return `<path d="M25 8h50l20 42-20 42H25L5 50Z" ${common}/>`;
  if (shape === 'wordmark') return `<path d="M14 18h72v64L50 94 14 82Z" ${common}/>`;
  if (shape === 'pointed') return `<path d="M12 12h76L82 72 50 95 18 72Z" ${common}/>`;
  return `<path d="M11 10 50 3l39 7v39c0 24-15 38-39 47C26 87 11 73 11 49Z" ${common}/>`;
}

function clipShape(shape) {
  if (shape === 'roundel') return '<circle cx="50" cy="50" r="42"/>';
  if (shape === 'oval') return '<ellipse cx="50" cy="50" rx="38" ry="43"/>';
  if (shape === 'diamond') return '<path d="M50 7 89 50 50 93 11 50Z"/>';
  if (shape === 'hex') return '<path d="M26 10h48l18 40-18 40H26L8 50Z"/>';
  if (shape === 'wordmark') return '<path d="M16 20h68v60L50 91 16 80Z"/>';
  if (shape === 'pointed') return '<path d="M14 14h72l-6 57-30 21-30-21Z"/>';
  return '<path d="M13 12 50 5l37 7v37c0 22-14 35-37 44-23-9-37-22-37-44Z"/>';
}

function patternMarkup(pattern, secondary, accent) {
  if (pattern === 'half') return `<rect x="50" y="0" width="50" height="100" fill="${secondary}" opacity=".95"/>`;
  if (pattern === 'stripes') return [12,32,52,72].map((x) => `<rect x="${x}" y="0" width="10" height="100" fill="${secondary}" opacity=".96"/>`).join('');
  if (pattern === 'hoops') return [18,42,66].map((y) => `<rect x="0" y="${y}" width="100" height="10" fill="${secondary}" opacity=".96"/>`).join('');
  if (pattern === 'quarters') return `<rect x="50" width="50" height="50" fill="${secondary}"/><rect y="50" width="50" height="50" fill="${secondary}"/>`;
  if (pattern === 'diagonal') return `<path d="M-10 82 70-5h25L10 100h-20Z" fill="${secondary}" opacity=".96"/>`;
  if (pattern === 'cross') return `<rect x="43" width="14" height="100" fill="${secondary}"/><rect y="43" width="100" height="14" fill="${secondary}"/>`;
  if (pattern === 'checkers') return Array.from({length:16},(_,i)=>{const x=(i%4)*25,y=Math.floor(i/4)*25;return (i+Math.floor(i/4))%2?`<rect x="${x}" y="${y}" width="25" height="25" fill="${secondary}"/>`:''}).join('');
  if (pattern === 'diamonds' || pattern === 'diamond') return `<path d="M50 12 69 31 50 50 31 31Z M31 50 50 69 31 88 12 69Z M69 50 88 69 69 88 50 69Z" fill="${secondary}" opacity=".9"/>`;
  return accent ? `<circle cx="50" cy="50" r="31" fill="none" stroke="${accent}" stroke-width="1.5" opacity=".12"/>` : '';
}

function line(path, color, width = 4, extra = '') {
  return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
}

function motifMarkup(motif, color, accent, text) {
  const c = color;
  const a = accent || color;
  const mono = esc(text.slice(0, 4));
  const label = (value, size=24, y=58) => `<text x="50" y="${y}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${size}" font-weight="900" letter-spacing="-.8" fill="${c}">${esc(value)}</text>`;

  const named = {
    cannon: line('M25 58h38M59 50l15 8-15 8M31 58a8 8 0 1 0 16 0', c, 5),
    lion: `${line('M39 69c-8-14-6-30 7-39 6-4 15-4 20 1-8 1-11 5-8 11 7 10 4 22-7 30', c, 5)}${line('M57 31l8-7M49 31l-3-8M42 58l-10 8M58 57l9 9', c, 4)}`,
    bee: `${line('M35 48c0-12 7-20 15-20s15 8 15 20-7 23-15 23-15-11-15-23Z', c, 4)}${line('M37 43h26M36 53h28M41 31 34 22M59 31l7-9', c, 3)}${line('M35 47c-12-6-18-2-18 6 0 9 10 12 18 6M65 47c12-6 18-2 18 6 0 9-10 12-18 6', c, 3)}`,
    seagull: line('M20 58c12-17 24-19 31-7 10-13 20-11 29 5-12-7-22-5-29 5-11-8-20-9-31-3', c, 4),
    eagle: `${line('M50 28v39M49 43 28 32M51 43l21-11M47 52 23 63M53 52l24 11M50 67l-9 11M50 67l9 11', c, 4)}${line('M42 31c4-7 12-7 16 0', c, 3)}`,
    tower: `${line('M34 72V38h32v34M30 38h40M38 38v-9h8v9M54 38v-9h8v9M44 72V58h12v14', c, 4)}`,
    tiger: `${line('M33 35c7-8 27-8 34 0l-3 33-14 10-14-10Z', c, 4)}${line('M40 40l8 10-7 10M60 40l-8 10 7 10M45 67h10', c, 3)}`,
    horse: `${line('M32 72c5-20 9-36 26-43l11 9-8 8 5 26M42 55h17M40 72h30', c, 4)}`,
    rose: `${line('M50 29c9-10 18 2 10 9 13-2 14 13 4 15 7 11-8 18-14 10-6 8-19 2-14-8-12-5-15-18-4-18-7-11 2-20 11-12-1-13 13-18 16-6Z', c, 3)}<circle cx="50" cy="52" r="7" fill="none" stroke="${c}" stroke-width="3"/>`,
    bird: `${line('M33 69c4-18 10-34 28-41l-4 13 11 4-12 7 5 19M35 58l-13 5 13 6M44 72h18', c, 4)}`,
    ship: `${line('M25 61h50l-9 14H34Z M34 55h31M39 55V37h22v18M50 37V25M50 27l13 7H50', c, 3.5)}`,
    devil: `${line('M36 69c-4-18 2-33 14-33s18 15 14 33M39 35l-8-10M61 35l8-10M42 53h16M50 53v17M43 70h14', c, 4)}`,
    castle: `${line('M28 72V38h44v34M28 39h44M33 39V29h9v10M58 39V29h9v10M44 72V57h12v15', c, 4)}`,
    tree: `${line('M50 71V49M50 63 36 76M50 63l14 13', c, 4)}${line('M30 49c0-10 8-16 15-14 1-10 16-12 19-3 9-2 14 8 11 16-6 10-36 11-45 1Z', c, 3.5)}`,
    cockerel: `${line('M50 69V42M50 43c-10-10-5-22 7-23-1 7 5 10 12 7-2 9-8 14-19 16M42 69h16', c, 3.5)}<circle cx="50" cy="77" r="8" fill="none" stroke="${c}" stroke-width="3"/>`,
    fox: `${line('M31 37 42 28l8 8 8-8 11 9-5 30-14 10-14-10Z M40 49l10 7 10-7M46 64h8', c, 3.5)}`,
    ram: `${line('M39 39c-15-12-23 11-8 18 7 3 12-3 12-11M61 39c15-12 23 11 8 18-7 3-12-3-12-11M42 42c1-11 15-11 16 0v26H42Z', c, 3.5)}`,
    swan: `${line('M64 29c-20 3-19 18-12 24 9 9 4 18-9 17-10-1-15-8-17-17 8 9 14 8 20 4-9-10-5-24 8-28', c, 4)}`,
    owl: `${line('M32 37 42 28l8 8 8-8 10 9-3 31-15 10-15-10Z', c, 3.5)}<circle cx="43" cy="48" r="5" fill="none" stroke="${c}" stroke-width="3"/><circle cx="57" cy="48" r="5" fill="none" stroke="${c}" stroke-width="3"/>${line('M47 59h6', c, 3)}`,
    stag: `${line('M40 70V46c0-8 20-8 20 0v24M40 42 28 31M40 38 35 25M60 42l12-11M60 38l5-13M40 55h20', c, 3.5)}`,
    dragon: `${line('M31 67c7-22 15-38 34-38l-8 10 13 7-15 6 10 17M38 55 24 48M39 60 26 68M46 69h21', c, 3.5)}`,
    bull: `${line('M34 43c-9-12-16-4-12 6 4 8 12 6 16 2M66 43c9-12 16-4 12 6-4 8-12 6-16 2M38 41c2-8 22-8 24 0l-3 27-9 8-9-8Z', c, 3.5)}`,
    wolf: `${line('M31 34 42 25l8 11 8-11 11 9-5 34-14 9-14-9Z M39 44l9 11-8 9M61 44 52 55l8 9M46 69h8', c, 3.5)}`,
    canary: `${line('M37 66c-6-17 2-31 17-31 8 0 14 5 17 12l-10 4c0 11-7 18-18 18M43 69l-4 8M52 68l3 9', c, 3.5)}`,
    crown: `${line('M28 42 39 57l11-21 11 21 11-15-5 29H33Z M34 72h32', c, 3.5)}`,
    cross: `${line('M50 25v50M31 44h38', c, 7)}`,
    star: `<path d="m50 25 7 15 17 2-12 12 3 17-15-8-15 8 3-17-12-12 17-2Z" fill="none" stroke="${c}" stroke-width="3.5" stroke-linejoin="round"/>`,
    anchor: `${line('M50 26v42M40 36h20M31 56c0 13 8 21 19 21s19-8 19-21M25 56h12M63 56h12', c, 3.5)}`,
    ball: `<circle cx="50" cy="53" r="23" fill="none" stroke="${c}" stroke-width="3.5"/><path d="m50 40 9 7-3 11H44l-3-11Z M28 48l12 4M72 48l-12 4M37 71l7-13M63 71l-7-13" fill="none" stroke="${c}" stroke-width="3"/>`,
    heart: `<path d="M50 72C31 60 27 49 31 41c5-10 15-8 19 1 4-9 14-11 19-1 4 8 0 19-19 31Z" fill="none" stroke="${c}" stroke-width="3.5"/>`,
    bat: `${line('M24 48c8-11 17-13 26-5 9-8 18-6 26 5l-9-2 3 11-10-4-10 9-10-9-10 4 3-11Z', c, 3.5)}`,
    fleur: `${line('M50 27c-12 9-10 18 0 22 10-4 12-13 0-22ZM50 48c-12-7-22-1-18 9 3 7 11 7 18 2M50 48c12-7 22-1 18 9-3 7-11 7-18 2M50 48v28M40 70h20', c, 3)}`,
    hammers: `${line('M32 31 66 70M40 27l-12 10 11 11M68 31 34 70M60 27l12 10-11 11', c, 4)}`,
    blades: `${line('M32 30c8 14 15 26 28 39M68 30C60 44 53 56 40 69M31 30l8 2M69 30l-8 2', c, 4)}`,
    bridge: `${line('M23 67h54M29 67V48h42v19M35 48c0-17 30-17 30 0M50 48v19', c, 3.5)}`,
    bolt: `<path d="M57 24 34 55h15l-7 23 25-34H52Z" fill="${c}"/>`,
    goat: `${line('M35 66c0-17 5-29 18-31 7-1 13 3 15 9M42 37 32 27M58 36l8-11M50 55v18M38 73h24', c, 3.5)}`,
    bulls: `${line('M23 55c9-16 20-20 32-10M77 55c-9-16-20-20-32-10M31 51l-10-10M69 51l10-10', c, 4)}<circle cx="50" cy="58" r="8" fill="none" stroke="${c}" stroke-width="3"/>`,
    dog: `${line('M35 66V42l10-12 10 8 10-8v36M39 49h22M43 66v-8h14v8', c, 3.5)}`,
    fish: `${line('M28 52c12-16 30-17 43 0-13 17-31 16-43 0ZM28 52l-12-10v20ZM59 48h.01', c, 3.5)}`,
    stork: `${line('M54 26c-9 8-11 18-5 27l-8 21M49 53l12 21M51 34l14 4M41 74h10M55 74h12', c, 3.5)}`,
    soldier: `${line('M37 71c1-19 4-33 13-42 9 9 12 23 13 42M35 43h30M43 29h14M40 57h20', c, 3.5)}`,
    head: `${line('M36 68c2-24 10-40 26-40l-7 12 10 5-11 5 7 18M41 53h14M45 61h9', c, 3.5)}`,
    imp: `${line('M35 68c-5-20 0-34 15-34s20 14 15 34M40 36l-8-10M60 36l8-10M43 50h14M50 50v16', c, 3.5)}`,
    robin: `${line('M35 67c-4-17 4-31 19-31 9 0 15 6 17 14l-10 2c-1 10-8 16-18 16M42 68l-4 8M53 67l4 9', c, 3.5)}`,
    lamb: `${line('M36 66c-5-19 2-32 14-32s19 13 14 32M40 42l-9-7M60 42l9-7M42 58h16M44 67v9M56 67v9', c, 3.5)}`,
    sword: `${line('M50 25v43M42 39h16M44 68h12M47 72h6', c, 4)}`,
    ox: `${line('M34 42c-10-12-17-3-11 7 4 7 11 4 16 0M66 42c10-12 17-3 11 7-4 7-11 4-16 0M39 40c3-9 19-9 22 0l-4 27-7 8-7-8Z', c, 3.5)}`,
    boar: `${line('M31 54c8-17 27-23 39-9l-5 22-20 7-14-9ZM35 52l-9-6M61 49h.01', c, 3.5)}`,
    brewer: `${line('M38 29h24v11c0 11-4 20-12 28-8-8-12-17-12-28ZM38 43h24M45 68v9M55 68v9', c, 3.5)}`,
    viking: `${line('M35 67V43c0-10 30-10 30 0v24M38 40 29 28M62 40l9-12M42 52h16M43 67v9M57 67v9', c, 3.5)}`,
    terrier: `${line('M35 67V43l9-12 6 7 6-7 9 12v24M40 47h20M44 58h12', c, 3.5)}`,
    mill: `${line('M39 70V45h22v25M32 45h36M50 45V27M50 36l-15-9M50 36l15-9M50 36l-15 9M50 36l15 9', c, 3.5)}`,
    magpie: `${line('M36 67c-3-18 4-31 18-31 8 0 14 5 17 12l-10 3c0 10-7 17-18 17M42 68l-4 8M54 67l5 9', c, 3.5)}`,
    swift: `${line('M22 56c13-15 24-18 32-5 8-12 17-9 24 4-10-5-19-3-25 5-10-7-19-9-31-4', c, 4)}`,
    griffin: `${line('M34 69c2-21 9-35 26-39l-4 11 12 4-11 7 8 17M38 57l-13 7M44 69h22', c, 3.5)}`,
    ladder: `${line('M37 29v42M63 29v42M37 39h26M37 50h26M37 61h26', c, 4)}`,
    erase: '',
  };

  if (named[motif]) return named[motif];
  if (motif === 'star-moon') return `<path d="M57 31a19 19 0 1 0 0 38 16 16 0 1 1 0-38Z" fill="none" stroke="${c}" stroke-width="3.5"/><path d="m66 44 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="${c}"/>`;
  if (motif === 'elephant') return `${line('M30 65V45c0-9 8-15 20-15s20 6 20 15v20M70 47c9 0 11 11 2 16M37 65v10M62 65v10M42 48h.01', c, 4)}`;
  if (motif === 'ffc') return label('FFC', 23, 60);
  if (motif === 'qpr') return label('QPR', 20, 59);
  if (motif === 'sc') return label('SC', 27, 60);
  if (motif === 'bwfc') return label('BW', 24, 59);
  if (motif === 'sfc') return label('SFC', 22, 59);
  if (motif === 'vfb') return label('VfB', 22, 59);
  if (motif === 'fcb') return label('FCB', 21, 59);
  if (motif === 'bvb') return label('BVB', 22, 58) + label('09', 11, 71);
  if (motif === 'm05') return label('05', 28, 61);
  if (motif === 'hsv') return `<path d="M50 27 72 50 50 73 28 50Z" fill="${c}"/>`;
  if (motif === 's04') return label('S04', 22, 59);
  if (motif === 'scp') return label('SCP', 20, 59);
  if (motif === 'sve') return label('SVE', 20, 59);
  if (motif === 'union') return label('UNION', 14, 58);
  if (motif === 'im') return label('IM', 26, 60);
  if (motif === 'acm') return label('ACM', 19, 59);
  if (motif === 'j') return label('J', 42, 66);
  if (motif === 'n') return label('N', 36, 64);
  if (motif === 'bfc') return label('BFC', 20, 59);
  if (motif === 'u') return label('U', 34, 63);
  if (motif === 'usc') return label('USC', 19, 59);
  if (motif === 'om') return label('OM', 28, 60) + `<path d="M50 22l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="${a}"/>`;
  if (motif === 'rcl') return label('RCL', 20, 59);
  if (motif === 'tfc') return label('TFC', 20, 59);
  if (motif === 'sb29') return label('29', 26, 61);
  if (motif === 'hac') return label('HAC', 20, 59);
  if (motif === 'sco') return label('SCO', 20, 59);
  if (motif === 'az') return label('AZ', 30, 61);
  if (motif === 'e') return label('E', 35, 64);
  if (motif === 'g') return label('G', 34, 64);
  if (motif === 'u') return label('U', 34, 64);
  if (motif === 'f') return label('F', 34, 64);
  if (motif === 'fs') return label('FS', 27, 61);
  if (motif === 'h') return label('H', 34, 64);
  if (motif === 'ne') return label('NEC', 20, 59);
  if (motif === 'nac') return label('NAC', 19, 59);
  if (motif === 'pec') return label('PEC', 19, 59);
  if (motif === 'psv') return label('PSV', 19, 59);
  if (motif === 'fcv') return label('FCV', 19, 59);
  if (motif === 'da') return label('DA', 27, 61);
  if (motif === 'ac') return label('AC', 27, 61);
  if (motif === 'ecf') return label('ECF', 20, 59);
  if (motif === 'mcf') return label('MCF', 19, 59);
  if (motif === 'parma') return label('P', 34, 64);
  if (motif === 'c') return label('C', 34, 64);
  if (motif === 'b') return label('B', 34, 64);
  if (motif === 'w') return label('W', 32, 64);
  if (motif === 'ltfc') return label('LT', 24, 59);
  if (motif === 'pvfc') return label('PV', 24, 59);
  if (motif === 'trfc') return label('TR', 24, 59);
  if (motif === 'asfc') return label('AS', 24, 59);
  if (motif === 'brfc') return label('BR', 24, 59);
  if (motif === 'htafc') return label('HT', 24, 59);
  if (motif === 'mk') return label('MK', 25, 60);
  if (motif === 'cu') return label('CU', 25, 60);
  return label(mono || 'FC', mono.length >= 4 ? 18 : mono.length === 3 ? 22 : 28, 61);
}

export function clubCrestSvg(team = {}, { size = 32, label = '', className = '' } = {}) {
  const p = clubBadgeProfile(team);
  const primary = p.primary;
  const secondary = validHex(p.secondary) ?? '#FFFFFF';
  const accent = validHex(p.accent) ?? textOn(primary);
  const motifColor = p.motif === 'monogram' ? textOn(primary) : accent;
  const clipId = `crest-${hash(`${team.id ?? team.name}-${p.shape}-${size}`)}`;
  const title = label ? `<title>${esc(label)}</title>` : '';
  const aria = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  const cls = className ? ` class="${esc(className)}"` : '';
  const shapeStroke = p.shape === 'roundel' && luminance(primary) < .08 ? '#D7DCE3' : '#171B20';

  return `<svg${cls} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${Number(size) || 32}" height="${Number(size) || 32}" ${aria}>${title}<defs><clipPath id="${clipId}">${clipShape(p.shape)}</clipPath></defs>${outerShape(p.shape, primary, shapeStroke)}<g clip-path="url(#${clipId})">${patternMarkup(p.pattern, secondary, accent)}</g><g>${motifMarkup(p.motif, motifColor, accent, initials(team))}</g></svg>`;
}

export const CURATED_BADGE_PROFILE_COUNT = Object.keys(PROFILE).length;
