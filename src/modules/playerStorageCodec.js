/** Physical player-row codecs. Never change published dictionaries/tags: new
 * codecs need a new version/decoder. Logical V2 exports contain canonical players.
 * Unknown fields stay verbatim; references are shared only within one row.
 */
const PLAYER_STORAGE_WORDS_V1 = Object.freeze(["CAM", "CB", "CDM", "CF", "CM", "GK", "LB", "LM", "LW", "RB", "RM", "RW", "ST", "academyEvidence", "activeAgreementId", "activeLoanAgreement", "age", "appearanceShare", "appearances", "appeared", "assists", "attack", "attributeProfile", "averageRating", "cleanSheets", "contractExpiry", "contractTeamId", "defence", "defending", "deliveryScore", "developmentAppearances", "developmentBoostedKey", "developmentMinutes", "developmentProgress", "developmentSettledKey", "dribbling", "earlyReturn", "endAcademyEvidence", "endGameweek", "endReason", "endSeason", "endStats", "fitness", "form", "gameweek", "generated", "generatedLeague", "generatedSeason", "goalkeeping", "goals", "growthPoints", "growthProfile", "history", "id", "inSquad", "individualMorale", "injured", "injuryGWsLeft", "injuryGWsTotal", "injuryName", "injuryRecoverySettledKey", "injuryType", "isWonderkid", "isYouth", "key", "lastEvaluatedKey", "lastMatchRating", "lastPlayedWeekKey", "lastRating", "lastSettledKey", "lastWeekKey", "lifecycleTransitionKeys", "lifecycleVersion", "loanOriginalTeamId", "loanRecallable", "loanSeason", "loanedFrom", "loanedTo", "matchReadiness", "medicallyAvailable", "midfield", "minuteShare", "minutes", "name", "nationality", "onLoan", "pace", "passing", "peakAge", "personalStateAppearances", "personalStateMinutes", "personalStateSettledKey", "physical", "playerStatus", "playingTimeAgreement", "position", "positionConversion", "positionSuitability", "potentialKnowledge", "potentialRating", "ratingApps", "ratingTotal", "reason", "redCards", "registeredTeamId", "registrationSpells", "rehabilitation", "rehabilitationMinutes", "reinjuryRisk", "releaseClause", "role", "scope", "season", "seasonMajorInjuries", "severity", "sharpness", "shooting", "signedThisSeason", "sourceInjuryName", "sourceInjuryType", "sourceInjuryWeeks", "squadRole", "squadRoleSource", "squadRoleTeamId", "startAcademyEvidence", "startGameweek", "startSeason", "startStats", "starts", "status", "suspended", "suspensionGWsLeft", "teamId", "traits", "transferListed", "value", "version", "wage", "weeks", "yellowCards", "youthTeamId"]);
// V2 stores field order as one Latin1 string, removing a numeric array entry
// per field. Codes 1..254 are dictionary keys; 255 escapes an unknown key.
const PLAYER_STORAGE_WORDS_V2 = Object.freeze(["id","contractTeamId","registeredTeamId","minutes","appearances","ratingApps","ratingTotal","starts","averageRating","assists","season","goals","cleanSheets","peakAge","status","endGameweek","endSeason","reason","startAcademyEvidence","startGameweek","startSeason","startStats","lastPlayedWeekKey","lastRating","lastWeekKey","version","name","teamId","activeAgreementId","activeLoanAgreement","age","attack","attributeProfile","defence","defending","developmentAppearances","developmentMinutes","developmentProgress","developmentSettledKey","dribbling","fitness","form","goalkeeping","growthPoints","growthProfile","individualMorale","injured","inSquad","isYouth","lastMatchRating","lifecycleTransitionKeys","lifecycleVersion","loanedFrom","loanedTo","loanOriginalTeamId","loanRecallable","midfield","onLoan","pace","passing","personalStateAppearances","personalStateMinutes","personalStateSettledKey","physical","playerStatus","playingTimeAgreement","position","positionConversion","positionSuitability","potentialKnowledge","potentialRating","redCards","registrationSpells","rehabilitation","rehabilitationMinutes","seasonMajorInjuries","sharpness","shooting","signedThisSeason","squadRole","squadRoleSource","squadRoleTeamId","suspended","suspensionGWsLeft","traits","transferListed","value","wage","yellowCards","youthTeamId","contractExpiry","developmentBoostedKey","injuryGWsLeft","injuryGWsTotal","injuryName","injuryType","isWonderkid","academyEvidence","endAcademyEvidence","endReason","endStats","injuryRecoverySettledKey","earlyReturn","lastSettledKey","matchReadiness","medicallyAvailable","reinjuryRisk","severity","sourceInjuryName","sourceInjuryType","sourceInjuryWeeks","CB","ST","releaseClause","loanSeason","GK","CM","generated","generatedLeague","generatedSeason","RB","CAM","CDM","LM","RM","LB","CF","RW","LW","nationality","appeared","key","gameweek","weeks","appearanceShare","deliveryScore","history","lastEvaluatedKey","minuteShare","role","scope","facilityRecoveryMultiplier"]);
const PLAYER_STORAGE_KEYS_V2 = new Map(PLAYER_STORAGE_WORDS_V2.map((key, index) => [key, index]));

export function encodeStoredPlayer(player) {
  const seen = new WeakMap();
  const pack = value => {
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) return value;
    const keys = Object.keys(value);
    // Normal history/trait arrays are dense. Avoid storing and decoding one
    // redundant index per element; sparse/custom-property arrays keep tag 1.
    const dense = array && keys.length === value.length && keys.every((key, index) => key === String(index));
    const packed = dense ? [3] : array ? [1, value.length] : [prototype === null ? 6 : 5, '', null];
    seen.set(value, packed);
    if (dense) {
      for (let index=0; index<value.length; index++) packed.push(pack(value[index]));
    } else for (const key of keys) {
      if (array) {
        const numeric = Number(key);
        packed.push(String(numeric) === key && numeric >= 0 ? numeric : key, pack(value[key]));
      } else {
        const code = PLAYER_STORAGE_KEYS_V2.get(key);
        packed[1] += String.fromCharCode(code == null ? 255 : code + 1);
        if (code == null) (packed[2] ??= []).push(key);
        packed.push(pack(value[key]));
      }
    }
    return packed;
  };
  return { id:player.id, teamId:player.teamId, __pitchPlayerStorage:2, payload:pack(player) };
}

export function decodeStoredPlayer(row) {
  if (!row || !Object.hasOwn(row, '__pitchPlayerStorage')) return row;
  if (![1,2].includes(row.__pitchPlayerStorage)) throw new Error('This career uses a newer player storage format. Update Pitch before continuing.');
  const rootTags = row.__pitchPlayerStorage === 1 ? [0,2] : [5,6];
  if (!Array.isArray(row.payload) || !rootTags.includes(row.payload[0])) throw new Error('Invalid stored player data. Restore a file backup.');
  const seen = new WeakMap();
  const unpack = packed => {
    if (!Array.isArray(packed)) return packed;
    const previous = seen.get(packed);
    if (previous) return previous;
    const tag = packed[0];
    if (tag === 3) {
      const value = new Array(packed.length - 1);
      seen.set(packed, value);
      for (let index=1; index<packed.length; index++) value[index-1] = unpack(packed[index]);
      return value;
    }
    if (tag === 5 || tag === 6) {
      const codes = packed[1], unknown = packed[2];
      if (typeof codes !== 'string' || (unknown !== null && !Array.isArray(unknown)) || packed.length !== codes.length + 3) throw new Error('Invalid stored player data. Restore a file backup.');
      const value = tag === 6 ? Object.create(null) : {};
      seen.set(packed, value);
      let escaped = 0;
      for (let index=0; index<codes.length; index++) {
        const code = codes.charCodeAt(index);
        const key = code === 255 ? unknown?.[escaped++] : PLAYER_STORAGE_WORDS_V2[code - 1];
        if (typeof key !== 'string') throw new Error('Invalid stored player field. Update Pitch or restore a file backup.');
        const child = unpack(packed[index+3]);
        if (key === '__proto__') Object.defineProperty(value, key, { value:child, enumerable:true, writable:true, configurable:true });
        else value[key] = child;
      }
      if (escaped !== (unknown?.length ?? 0)) throw new Error('Invalid stored player data. Restore a file backup.');
      return value;
    }
    const offset = tag === 1 ? 2 : 1;
    if ((tag !== 0 && tag !== 1 && tag !== 2) || (packed.length - offset) % 2 !== 0
      || tag === 1 && (!Number.isSafeInteger(packed[1]) || packed[1] < 0 || packed[1] > 4294967295)) {
      throw new Error('Invalid stored player data. Restore a file backup.');
    }
    const value = tag === 1 ? new Array(packed[1]) : tag === 2 ? Object.create(null) : {};
    seen.set(packed, value);
    for (let index=offset; index<packed.length; index+=2) {
      const code = packed[index];
      const key = tag === 1 ? String(code) : typeof code === 'number' ? PLAYER_STORAGE_WORDS_V1[code] : code;
      if (typeof key !== 'string') throw new Error('Invalid stored player field. Update Pitch or restore a file backup.');
      const child = unpack(packed[index+1]);
      if (key === '__proto__') Object.defineProperty(value, key, { value:child, enumerable:true, writable:true, configurable:true });
      else value[key] = child;
    }
    return value;
  };
  const player = unpack(row.payload);
  if (player?.id !== row.id || player?.teamId !== row.teamId) throw new Error('Stored player index fields do not match. Restore a file backup.');
  return player;
}
