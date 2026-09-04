import { deriveAggregate, DEFAULT_WEIGHTS, clamp } from './rating.mjs';

export const CURRENT_SEASON_REFERENCE_DATE = '2026-09-01';

export const TRANSFERMARKT_COMPETITION_TO_LEAGUE = Object.freeze({
  GB1: 'prem',
  GB2: 'championship',
  GB3: 'league_one',
  GB4: 'league_two',
  L1: 'bundesliga',
  ES1: 'la_liga',
  IT1: 'serie_a',
  FR1: 'ligue_1',
  NL1: 'eredivisie',
});

export function normalizePersonName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactName(value) {
  return normalizePersonName(value).replace(/ /g, '');
}

export function calculateAge(dateOfBirth, referenceDate = CURRENT_SEASON_REFERENCE_DATE) {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const ref = new Date(`${referenceDate}T00:00:00Z`);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(ref.getTime())) return null;
  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = ref.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && ref.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

export function mapTransfermarktPosition(subPosition, broadPosition = '') {
  const exact = {
    'Goalkeeper': 'GK',
    'Centre-Back': 'CB',
    'Left-Back': 'LB',
    'Right-Back': 'RB',
    'Defensive Midfield': 'CDM',
    'Central Midfield': 'CM',
    'Attacking Midfield': 'CAM',
    'Left Midfield': 'LM',
    'Right Midfield': 'RM',
    'Left Winger': 'LW',
    'Right Winger': 'RW',
    'Centre-Forward': 'ST',
    'Second Striker': 'CF',
  };
  if (exact[subPosition]) return exact[subPosition];
  const broad = String(broadPosition).toLowerCase();
  if (broad.includes('goal')) return 'GK';
  if (broad.includes('defender')) return 'CB';
  if (broad.includes('midfield')) return 'CM';
  if (broad.includes('attack')) return 'ST';
  return 'CM';
}

export function overallOfPitchRow(player) {
  if (!player) return 0;
  return String(player.position).toUpperCase() === 'GK'
    ? Number(player.goalkeeping ?? player.gk ?? 0)
    : Math.max(Number(player.attack ?? 0), Number(player.midfield ?? 0), Number(player.defence ?? 0));
}

function shiftAggregatesToOverall(values, overall) {
  const current = Math.max(values.attack, values.midfield, values.defence);
  const delta = Number(overall) - current;
  return {
    attack: clamp(values.attack + delta, 10, 99),
    midfield: clamp(values.midfield + delta, 10, 99),
    defence: clamp(values.defence + delta, 10, 99),
  };
}

export function aggregatesFromEa(position, overall, attrs, weights = DEFAULT_WEIGHTS, existing = null) {
  const pos = String(position || '').toUpperCase();
  const rating = clamp(Number(overall), 1, 99);
  if (pos === 'GK') {
    return {
      attack: clamp(Number(existing?.attack ?? 10), 10, 40),
      midfield: clamp(Number(existing?.midfield ?? 11), 10, 40),
      defence: clamp(Number(existing?.defence ?? 13), 10, 45),
      goalkeeping: rating,
    };
  }
  const complete = attrs && ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical']
    .every((key) => Number.isFinite(Number(attrs[key])));
  if (!complete) return aggregatesFromOverall(pos, rating, existing);
  const raw = {
    attack: deriveAggregate('attack', pos, attrs, weights),
    midfield: deriveAggregate('midfield', pos, attrs, weights),
    defence: deriveAggregate('defence', pos, attrs, weights),
  };
  const shifted = shiftAggregatesToOverall(raw, rating);
  return { ...shifted, goalkeeping: 10 };
}

export function aggregatesFromOverall(position, overall, existing = null) {
  const pos = String(position || '').toUpperCase();
  const rating = clamp(Number(overall), 1, 99);
  if (pos === 'GK') {
    return {
      attack: clamp(Number(existing?.attack ?? 10), 10, 40),
      midfield: clamp(Number(existing?.midfield ?? 11), 10, 40),
      defence: clamp(Number(existing?.defence ?? 13), 10, 45),
      goalkeeping: rating,
    };
  }
  if (existing) {
    const oldOverall = Math.max(Number(existing.attack || 10), Number(existing.midfield || 10), Number(existing.defence || 10));
    if (oldOverall > 0) {
      return {
        attack: clamp(Number(existing.attack || 10) + rating - oldOverall, 10, 99),
        midfield: clamp(Number(existing.midfield || 10) + rating - oldOverall, 10, 99),
        defence: clamp(Number(existing.defence || 10) + rating - oldOverall, 10, 99),
        goalkeeping: 10,
      };
    }
  }
  if (['CB', 'LB', 'RB'].includes(pos)) {
    return { attack: clamp(rating - 18, 10, 99), midfield: clamp(rating - 10, 10, 99), defence: rating, goalkeeping: 10 };
  }
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(pos)) {
    return { attack: clamp(rating - 7, 10, 99), midfield: rating, defence: clamp(rating - 12, 10, 99), goalkeeping: 10 };
  }
  return { attack: rating, midfield: clamp(rating - 8, 10, 99), defence: clamp(rating - 30, 10, 99), goalkeeping: 10 };
}

export function eaNameAliases(player) {
  const aliases = new Set();
  const names = [
    player?.commonName,
    [player?.firstName, player?.lastName].filter(Boolean).join(' '),
    player?.fullName,
    player?.name,
  ];
  for (const name of names) {
    const normalized = normalizePersonName(name);
    if (normalized) aliases.add(normalized);
  }
  return [...aliases];
}

export function attrsFromEa(player) {
  const value = (key) => Number(player?.stats?.[key]?.value ?? player?.stats?.[key]);
  const attrs = {
    pace: value('pac'),
    shooting: value('sho'),
    passing: value('pas'),
    dribbling: value('dri'),
    defending: value('def'),
    physical: value('phy'),
  };
  return Object.values(attrs).every(Number.isFinite) ? attrs : null;
}

export function normalizePlayerIdPart(value) {
  return normalizePersonName(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'player';
}

export function mintPlayerId(teamId, playerName, usedIds) {
  const tokens = normalizePersonName(playerName).split(' ').filter(Boolean);
  const surname = tokens[tokens.length - 1] || 'player';
  const prefix = `${normalizePlayerIdPart(teamId)}_${normalizePlayerIdPart(surname)}`;
  let candidate = prefix;
  let suffix = 2;
  while (usedIds.has(candidate)) candidate = `${prefix}${suffix++}`;
  usedIds.add(candidate);
  return candidate;
}

export function roundedMillions(value) {
  return Math.max(0.1, Math.round(Number(value) * 10) / 10);
}
