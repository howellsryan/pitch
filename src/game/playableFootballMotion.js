// Presentation only. Metres, Y up; replay is a pure sample, never an integrator.
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => v(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = a => Math.hypot(a.x, a.y, a.z);
const unit = a => mul(a, 1 / Math.max(1e-8, length(a)));
const mix = (a, b, t) => add(a, mul(sub(b, a), t));
const smooth = t => { const x = clamp(t); return x * x * (3 - 2 * x); };
const phase = (t, a, b) => smooth((t - a) / (b - a));

// Analytic two-bone IK. A pole controls the anatomical bend plane. Reach is
// clamped, not stretched, so a bad target cannot elongate a player's limbs.
export function solveFootballLimb(start, target, upper, lower, pole, floor = null) {
  const delta = sub(target, start);
  const axis = length(delta) < 1e-8 ? v(0, -1, 0) : unit(delta);
  const d = clamp(length(delta), Math.abs(upper - lower) + 1e-5, upper + lower - 1e-5);
  let bend = sub(pole, mul(axis, dot(pole, axis)));
  if (length(bend) < 1e-6) {
    const fallback = Math.abs(axis.x) < .8 ? v(1, 0, 0) : v(0, 0, 1);
    bend = sub(fallback, mul(axis, dot(fallback, axis)));
  }
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const center = add(start, mul(axis, along));
  let bendDirection = unit(bend);
  if (floor != null && center.y + bendDirection.y * height < floor && height > 1e-7) {
    // Rotate within the bend plane only as far as ground clearance requires.
    // Switching to a different pole outright produces a visible elbow snap.
    const vertical = sub(v(0,1,0), mul(axis,axis.y));
    const verticalLength = length(vertical);
    if (verticalLength > 1e-6) {
      const up = unit(vertical);
      const required = clamp((floor-center.y)/(height*verticalLength), -1, 1);
      const lateral = unit(sub(bendDirection,mul(up,dot(bendDirection,up))));
      bendDirection = add(mul(up,required),mul(lateral,Math.sqrt(1-required*required)));
    }
  }
  return { joint:add(center, mul(bendDirection, height)), end:add(start, mul(axis, d)) };
}

function curve(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) return mix(keys[i - 1][1], keys[i][1], phase(t, keys[i - 1][0], keys[i][0]));
  }
  return keys.at(-1)[1];
}

function skeleton(pelvis, { forward = -1, roll = 0, lean = 0, twist = 0 } = {}) {
  const up = v(Math.sin(roll), Math.cos(roll), lean);
  const across = v(Math.cos(roll), -Math.sin(roll), twist);
  const j = { pelvis };
  j.spine = add(pelvis, mul(up, .21));
  j.chest = add(pelvis, mul(up, .46));
  j.neck = add(pelvis, mul(up, .62));
  j.head = add(pelvis, mul(up, .76));
  j.crown = add(pelvis, mul(up, .91));
  j.facing = v(0, 0, forward);
  for (const [name, side] of [['left', -1], ['right', 1]]) {
    j[name + 'Hip'] = add(pelvis, mul(across, side * .115));
    j[name + 'Shoulder'] = add(j.chest, mul(across, side * .235));
  }
  return j;
}

function leg(j, side, foot, forward = -1, pole = null, softReach = false) {
  if (softReach) {
    const hip = j[side + 'Hip'], offset = sub(foot, hip), reach = length(offset);
    if (reach > .70) foot = add(hip, mul(offset, (.70 + .12 * (1 - Math.exp(-(reach - .70) / .12))) / reach));
  }
  const solved = solveFootballLimb(j[side + 'Hip'], foot, .42, .42, pole ?? v(0, 0, forward), .065);
  j[side + 'Knee'] = solved.joint;
  j[side + 'Ankle'] = solved.end;
  j[side + 'Toe'] = add(solved.end, v(0, -.015, forward * .16));
}

function arm(j, side, hand, pole) {
  hand = { ...hand, y:Math.max(.09,hand.y) };
  const shoulder = j[side + 'Shoulder'];
  const offset = sub(hand, shoulder);
  const reach = length(offset);
  // Soft extension avoids the square-root velocity spike at a straight elbow.
  // The small residual reach is covered by the palm, never by bone stretching.
  if (reach > .48) hand = add(shoulder, mul(offset, (.48 + .085 * (1 - Math.exp(-(reach - .48) / .085))) / reach));
  const solved = solveFootballLimb(shoulder, hand, .30, .28, pole, .06);
  j[side + 'Elbow'] = solved.joint;
  j[side + 'Wrist'] = solved.end;
}

export function sampleFootballStrike(world, progress, contactType = null) {
  const t = clamp(progress);
  const contact = world.contact ?? world.ball;
  const header = contactType?.includes('header');
  const approach = phase(t, 0, .31);
  const drive = Math.sin(phase(t, .28, .64) * Math.PI);
  const settle = phase(t, .62, .92);
  const origin = v(contact.x - .12, .84 - drive * .025, contact.z + 1.65 - approach * 1.17 - settle * .12);
  if (header) {
    const meet = phase(t, .24, .43) * (1 - phase(t, .43, .68));
    origin.y += (contact.y - .76 - origin.y) * meet;
    origin.z -= .44 * meet;
  }
  const j = skeleton(origin, { lean:-drive * .23, twist:drive * .10 });
  const plant = v(contact.x - .25, .09, contact.z + .12);
  const approachFoot = side => curve(t, side === 'left' ? [
    [0, v(origin.x - .115, .09, contact.z + 1.5)],
    [.09, v(contact.x - .25, .09, contact.z + 1.5)],
    [.16, v(contact.x - .25, .23, contact.z + .82)],
    [.23, v(contact.x - .25, .09, contact.z + .52)],
    [.28, v(contact.x - .25, .18, contact.z + .32)],
    [.33, plant],
  ] : [
    [0, v(contact.x, .09, contact.z + 1.98)],
    [.06, v(contact.x, .22, contact.z + 1.58)],
    [.13, v(contact.x, .09, contact.z + .91)],
    [.22, v(contact.x, .09, contact.z + .91)],
    [.30, v(contact.x, .40, contact.z + .99)],
  ]);
  const kick = curve(t, [
    [.30, v(contact.x, .40, contact.z + .99)],
    [.36, v(contact.x, Math.max(.24, contact.y * .55), contact.z + .66)],
    [.43, v(contact.x, Math.max(.09, contact.y + .015), contact.z + .16)],
    [.54, v(contact.x + .07, Math.max(.52, contact.y), contact.z - .16)],
    [.72, v(contact.x + .10, .09, contact.z - .02)],
    [1, v(contact.x + .10, .09, contact.z - .02)],
  ]);
  const support = t < .33 ? approachFoot('left') : mix(plant, v(plant.x, .09, plant.z - .06), settle);
  leg(j, 'left', support);
  leg(j, 'right', header ? v(contact.x + .12, .09, contact.z + .38) : t < .30 ? approachFoot('right') : kick);
  const swing = Math.sin(t / .31 * Math.PI * 4) * (1 - approach);
  arm(j, 'left', add(j.leftShoulder, v(-.07 - drive * .30, -.44 + drive * .18, -.16 - swing * .18)), v(-.25, -.3, .8));
  arm(j, 'right', add(j.rightShoulder, v(.07 + drive * .12, -.43, -.16 + swing * .18 + drive * .25)), v(.25, -.3, .8));
  return j;
}

export function sampleFootballKeeper(world, progress, contact, intervention, saved, ball) {
  const t = clamp(progress);
  const dx = contact.x - world.keeper.x;
  const side = Math.sign(dx) || 1;
  const wide = clamp(Math.abs(dx) / 1.4);
  const launch = phase(t, .46, .70);
  const landing = phase(t, .74, .93);
  const set = Math.sin(phase(t, .28, .46) * Math.PI);
  const reachPelvis = v(contact.x - side * (.18 + wide * .83), Math.max(.30, contact.y - .27), contact.z - .10);
  const rest = v(world.keeper.x, .81 - set * .12, world.keeper.z);
  const pelvis = mix(rest, reachPelvis, launch);
  pelvis.y += Math.sin(launch * Math.PI) * .16;
  const staysUpright = intervention === 'catch' && wide < .65 && contact.y > .75;
  pelvis.y = pelvis.y * (1 - landing) + (staysUpright ? .82 : .28) * landing;
  const roll = side * wide * launch * (1.06 + landing * .22);
  const j = skeleton(pelvis, { forward:1, roll, lean:.08 });
  for (const [name, sign] of [['left', -1], ['right', 1]]) {
    const planted = v(world.keeper.x + sign * .29, .09, world.keeper.z + .04);
    const airborne = add(j[name + 'Hip'], v(-side * .43 + sign * .13, -.42, -.12 + sign * .10));
    airborne.y = Math.max(.09, airborne.y);
    leg(j, name, mix(planted, airborne, launch), 1, v(sign * .3, 0, 1), launch > .02);
    const readyHand = add(j[name + 'Shoulder'], v(sign * .18, -.32, .22));
    let targetHand = add(contact, v(sign * .065, 0, 0));
    // Committed catches stay attached to hands throughout the settling pose.
    if (saved && (intervention === 'catch' || intervention === 'smother') && t > .70) targetHand = add(ball, v(sign * .065, 0, 0));
    else if (t > .76) targetHand = mix(targetHand, add(j[name + 'Shoulder'], v(sign * .14, -.22, .32)), landing);
    const hand = mix(readyHand, targetHand, launch);
    hand.z += Math.sin(launch * Math.PI) * .38;
    arm(j, name, hand, v(sign, -1, -1));
  }
  return j;
}

export function sampleFootballStance(position, progress = 0, lunge = 0) {
  const j = skeleton(v(position.x, .88 + Number(position.y ?? 0) - lunge * .10, position.z), { lean:-lunge * .25 });
  const stride = Math.sin(progress * Math.PI * 4) * .25;
  for (const [name, side] of [['left', -1], ['right', 1]]) {
    leg(j, name, v(position.x + side * .16, .09 + Number(position.y ?? 0), position.z + side * stride));
    arm(j, name, add(j[name + 'Shoulder'], v(side * .09, -.48, -side * stride)), v(side, 0, -1));
  }
  return j;
}
