/**
 * Presentation-only goalkeeper read cue.
 *
 * Keeper key moments need enough information to make a football decision: the
 * shooter's body/approach should suggest a likely lane before the keeper dives.
 * This deliberately exposes only a coarse, slightly noisy read from the already
 * persisted deterministic shot packet. It never exposes the final trajectory,
 * save verdict or outcome packet and it is not consumed by the resolver.
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stableNoise(packet, salt) {
  const source = `${packet?.version ?? 0}|${packet?.actor ?? 0}|${packet?.target ?? 0}|${packet?.shooter ?? 0}|${salt}`;
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
}

export function goalkeeperReadCue(packet, { setPieceKind = null } = {}) {
  if (!packet || !Number.isFinite(Number(packet.shot)) || !Number.isFinite(Number(packet.finish))) return null;

  // `shot` / `finish` are used only to describe the attacker's visible setup.
  // The real trajectory still adds technique/timing/pressure error later and
  // the keeper's own input still resolves against that final trajectory.
  const horizontal = (Number(packet.shot) - .5) * (setPieceKind === 'penalty' ? 1.25 : 1.05);
  const verticalBase = setPieceKind === 'penalty' ? .50 : .46;
  const verticalRange = setPieceKind === 'penalty' ? .42 : .36;
  const vertical = verticalBase + (Number(packet.finish) - .5) * verticalRange;
  return {
    x:clamp(horizontal + stableNoise(packet, 'x') * .10, -.82, .82),
    y:clamp(vertical + stableNoise(packet, 'y') * .07, .18, .84),
    confidence:setPieceKind === 'penalty' ? .72 : .62,
    kind:'shooter_read',
  };
}

export function decorateGoalkeeperMomentWithRead(moment, packet) {
  if (!moment || moment.mode !== 'goalkeeper' || !packet) return moment;
  const cue = goalkeeperReadCue(packet, { setPieceKind:moment.setPiece?.kind ?? null });
  if (!cue) return moment;
  // The existing Three renderer already understands `syntheticTarget` as a
  // non-authoritative pre-shot visual cue. Reuse that rendering contract rather
  // than adding another renderer-owned decision path.
  return { ...moment, syntheticTarget:cue, goalkeeperRead:cue };
}
