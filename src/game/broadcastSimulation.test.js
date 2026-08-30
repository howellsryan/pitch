import { describe, expect, it } from 'vitest';
import { advanceBroadcastSimulation, createBroadcastSimulation, isOnside, replaceBroadcastLineups, updateBroadcastSimulation } from './broadcastSimulation.js';

const positions = ['GK','RB','CB','CB','LB','CM','CDM','CM','RW','ST','LW'];
const side = prefix => positions.map((position, index) => ({ id:`${prefix}-${index}`, position }));
const create = (possessionTeamId = 'home') => createBroadcastSimulation({
  homeTeamId:'home', awayTeamId:'away', possessionTeamId,
  homeFormation:'4-3-3', awayFormation:'4-3-3', homePlayers:side('h'), awayPlayers:side('a'),
});

describe('broadcast simulation', () => {
  it('starts from a legal, recognisable kickoff shape', () => {
    const sim = create(); const kicker = sim.players.find(player => player.id === sim.kickoffKickerId);
    expect(sim.ball).toMatchObject({ x:50, y:50, ownerId:kicker.id });
    for (const player of sim.players) {
      if (player.id === kicker.id) continue;
      expect(player.teamId === 'home' ? player.y >= 50 : player.y <= 50).toBe(true);
      if (player.teamId === 'away') expect(Math.hypot(player.x - 50, player.y - 50)).toBeGreaterThanOrEqual(9);
    }
  });

  it('moves the kickoff pass through space instead of teleporting the ball', () => {
    const sim = create();
    for (let i = 0; i < 10; i++) advanceBroadcastSimulation(sim, 33);
    expect(sim.ball).toMatchObject({ x:50, y:50 });
    for (let i = 0; i < 20; i++) advanceBroadcastSimulation(sim, 33);
    expect(sim.ball.flight?.kind).toBe('pass');
    const start = { x:sim.ball.x, y:sim.ball.y };
    advanceBroadcastSimulation(sim, 33);
    expect(Math.hypot(sim.ball.x - start.x, sim.ball.y - start.y)).toBeGreaterThan(0);
    expect(Math.hypot(sim.ball.x - start.x, sim.ball.y - start.y)).toBeLessThan(5);
  });

  it('uses the ball and second-last defender as a real offside line', () => {
    const sim = create(); sim.mode = 'live'; sim.ball.ownerId = 'h-5'; sim.ball.y = 40;
    const striker = sim.players.find(player => player.id === 'h-9');
    striker.y = 10; expect(isOnside(sim, striker)).toBe(false);
    striker.y = 30; expect(isOnside(sim, striker)).toBe(true);
  });

  it('never lets a goalkeeper wander out of the sweeper zone', () => {
    const sim = create('away'); sim.mode = 'live'; sim.ball.ownerId = 'a-9';
    const attacker = sim.players.find(player => player.id === 'a-9'); attacker.x = 55; attacker.y = 88;
    for (let i = 0; i < 240; i++) advanceBroadcastSimulation(sim, 33);
    const homeKeeper = sim.players.find(player => player.id === 'h-0');
    expect(homeKeeper.y).toBeGreaterThanOrEqual(88); expect(homeKeeper.y).toBeLessThanOrEqual(95);
  });

  it('keeps both goalkeepers anchored close to their goal line during normal play', () => {
    const sim = create(); sim.mode = 'live'; sim.ball.ownerId = 'h-5'; sim.ball.x = 28; sim.ball.y = 51;
    for (let i = 0; i < 240; i++) advanceBroadcastSimulation(sim, 33);
    const homeKeeper = sim.players.find(player => player.id === 'h-0');
    const awayKeeper = sim.players.find(player => player.id === 'a-0');
    expect(homeKeeper.y).toBeGreaterThanOrEqual(90);
    expect(awayKeeper.y).toBeLessThanOrEqual(10);
  });

  it('brings a scorer onside before creating the chance', () => {
    const sim = create(); sim.mode = 'live'; sim.ball.ownerId = 'h-5'; sim.ball.y = 40;
    const scorer = sim.players.find(player => player.id === 'h-9'); scorer.y = 10;
    updateBroadcastSimulation(sim, { phase:8, possessionTeamId:'home', event:{type:'goal',minute:6,teamId:'home',playerId:scorer.id,playerName:'Nine'} });
    for (let i = 0; i < 5; i++) advanceBroadcastSimulation(sim, 33);
    expect(sim.action).toBe('ATTACKER CHECKS THE RUN');
    let released = false;
    for (let i = 0; i < 100; i++) {
      advanceBroadcastSimulation(sim, 33);
      if (sim.ball.flight?.toId === scorer.id) { expect(isOnside(sim, scorer)).toBe(true); released = true; break; }
    }
    expect(released).toBe(true);
  });

  it('only releases ordinary passes to an onside receiver', () => {
    const sim = create();
    for (let frame = 0; frame < 300; frame++) {
      advanceBroadcastSimulation(sim, 33);
      const flight = sim.ball.flight;
      if (flight?.kind === 'pass' && flight.elapsed <= 33) {
        const receiver = sim.players.find(player => player.id === flight.toId);
        expect(isOnside(sim, receiver)).toBe(true);
      }
    }
  });

  it('animates a turnover instead of teleporting possession', () => {
    const sim = create(); sim.mode = 'live'; sim.nextActionAt = 0; sim.ball.ownerId = 'h-9';
    const start = { x:sim.ball.x, y:sim.ball.y };
    updateBroadcastSimulation(sim, { phase:2, possessionTeamId:'away' });
    advanceBroadcastSimulation(sim, 33);
    expect(sim.ball.flight?.kind).toBe('turnover');
    expect(Math.hypot(sim.ball.x - start.x, sim.ball.y - start.y)).toBeLessThan(5);
  });

  it('builds a goal sequence and gives the restart to the other team', () => {
    const sim = create(); for (let i = 0; i < 35; i++) advanceBroadcastSimulation(sim, 33);
    updateBroadcastSimulation(sim, { phase:2, possessionTeamId:'home', event:{type:'goal',minute:2,teamId:'home',playerId:'h-9',playerName:'Nine'} });
    let sawShot = false; let sawGoal = false; let sawAwayKickoff = false; let shotY = null;
    for (let i = 0; i < 180; i++) {
      advanceBroadcastSimulation(sim, 33);
      if (!sawShot && sim.action === 'SHOT · ON GOAL') { sawShot = true; shotY = sim.ball.y; }
      sawGoal ||= sim.action === 'GOAL';
      sawAwayKickoff ||= sim.mode === 'kickoff' && sim.possessionTeamId === 'away';
    }
    expect(sawShot).toBe(true); expect(sawGoal).toBe(true); expect(sawAwayKickoff).toBe(true);
    expect(shotY).toBeLessThanOrEqual(33);
  });

  it('holds half time, swaps ends, and gives the second kickoff to the other team', () => {
    const sim = create();
    updateBroadcastSimulation(sim, { phase:60, possessionTeamId:'home' });
    expect(sim.mode).toBe('half-time');
    expect(sim.action).toBe('HALF TIME');
    for (let i = 0; i < 65; i++) advanceBroadcastSimulation(sim, 33);
    expect(sim.halftimeCompleted).toBe(true);
    expect(sim.endsSwapped).toBe(true);
    expect(sim.possessionTeamId).toBe('away');
    expect(['kickoff', 'live']).toContain(sim.mode);
  });

  it('derives goal kicks and corners from the preceding shot outcome', () => {
    const wide = create(); const wideCarrier = wide.players.find(player => player.id === 'h-8');
    Object.assign(wideCarrier, { x:16, y:27 }); Object.assign(wide.ball, { ownerId:wideCarrier.id, x:16, y:27 });
    Object.assign(wide, { mode:'live', nextActionAt:0, sequenceSinceRestart:4, outcomeIndex:2 });
    advanceBroadcastSimulation(wide, 33);
    expect(wide.action).toBe('SHOT · WIDE');
    while (wide.ball.flight) advanceBroadcastSimulation(wide, 33);
    expect(wide.restart).toMatchObject({ type:'goal-kick', cause:'SHOT WIDE' });

    const corner = create(); const cornerCarrier = corner.players.find(player => player.id === 'h-9');
    Object.assign(cornerCarrier, { x:50, y:20 }); Object.assign(corner.ball, { ownerId:cornerCarrier.id, x:50, y:20 });
    Object.assign(corner, { mode:'live', nextActionAt:0, sequenceSinceRestart:4, outcomeIndex:1 });
    advanceBroadcastSimulation(corner, 33);
    expect(corner.action).toBe('SHOT BLOCKED · DEFLECTION');
    while (corner.ball.flight) advanceBroadcastSimulation(corner, 33);
    expect(corner.restart).toMatchObject({ type:'corner', cause:'DEFLECTED BEHIND' });
    expect([3, 97]).toContain(corner.restart.spot.x);
    expect([3, 97]).toContain(corner.restart.spot.y);
  });

  it('waits for most players to fill the penalty area before taking a corner', () => {
    const sim = create(); const carrier = sim.players.find(player => player.id === 'h-9');
    Object.assign(carrier, { x:50, y:20 });
    Object.assign(sim.ball, { ownerId:carrier.id, x:50, y:20 });
    Object.assign(sim, { mode:'live', nextActionAt:0, sequenceSinceRestart:4, outcomeIndex:1 });
    advanceBroadcastSimulation(sim, 33);
    while (sim.ball.flight) advanceBroadcastSimulation(sim, 33);
    expect(sim.restart?.type).toBe('corner');
    const startedAt = sim.restart.startedAt; const takerId = sim.restart.takerId; const attackDirection = -1;
    let sawSetup = false; let attackersReady = 0;
    for (let i = 0; i < 400; i++) {
      advanceBroadcastSimulation(sim, 33);
      sawSetup ||= sim.action === 'CORNER · PLAYERS MOVING INTO THE BOX';
      if (sim.action === 'CORNER · CROSS INTO THE BOX') {
        attackersReady = sim.players.filter(player => player.teamId === 'home' && player.position !== 'GK' && player.id !== takerId)
          .filter(player => player.x >= 22 && player.x <= 78 && (attackDirection < 0 ? player.y <= 24 : player.y >= 76)).length;
        break;
      }
    }
    expect(sawSetup).toBe(true);
    expect(sim.clock - startedAt).toBeGreaterThanOrEqual(1200);
    expect(attackersReady).toBeGreaterThanOrEqual(6);
  });

  it('only creates a throw-in from a pressured defensive deflection', () => {
    const pressured = create(); const carrier = pressured.players.find(player => player.id === 'h-8');
    Object.assign(carrier, { x:4, y:45 }); Object.assign(pressured.ball, { ownerId:carrier.id, x:4, y:45 });
    pressured.mode = 'live'; pressured.nextActionAt = 0;
    pressured.players.filter(player => player.teamId === 'away').forEach(player => Object.assign(player, { x:50, y:50 }));
    Object.assign(pressured.players.find(player => player.id === 'a-1'), { x:5, y:45 });
    advanceBroadcastSimulation(pressured, 33);
    expect(pressured.action).toBe('TACKLE · DEFLECTED OUT');
    while (pressured.ball.flight) advanceBroadcastSimulation(pressured, 33);
    expect(pressured.restart).toMatchObject({ type:'throw-in', teamId:'home' });

    const unpressured = create(); const wideCarrier = unpressured.players.find(player => player.id === 'h-8');
    Object.assign(wideCarrier, { x:4, y:45 }); Object.assign(unpressured.ball, { ownerId:wideCarrier.id, x:4, y:45 });
    unpressured.mode = 'live'; unpressured.nextActionAt = 0;
    unpressured.players.filter(player => player.teamId === 'away').forEach(player => Object.assign(player, { x:70, y:70 }));
    advanceBroadcastSimulation(unpressured, 33);
    expect(unpressured.action).not.toContain('DEFLECTED OUT');
  });

  it('shoots when through in the box and never turns back to a defender', () => {
    const sim = create(); const striker = sim.players.find(player => player.id === 'h-9');
    Object.assign(striker, { x:50, y:12 }); Object.assign(sim.ball, { ownerId:striker.id, x:50, y:12 });
    Object.assign(sim, { mode:'live', nextActionAt:0, sequenceSinceRestart:2, outcomeIndex:2 });
    advanceBroadcastSimulation(sim, 33);
    expect(sim.ball.flight?.kind).toBe('save');
    expect(sim.action).toBe('SHOT · SAVED');
  });

  it('keeps current positions when a substitution changes the active lineup', () => {
    const sim = create(); const old = sim.players.find(player => player.id === 'h-9'); old.x = 47; old.y = 39;
    const changed = side('h'); changed[9] = { id:'h-new', position:'ST' };
    replaceBroadcastLineups(sim, { homeFormation:'4-3-3', awayFormation:'4-3-3', homePlayers:changed, awayPlayers:side('a') });
    expect(sim.players.find(player => player.id === 'h-new')).toMatchObject({ x:47, y:39 });
  });

  it('never snaps a player between animation frames', () => {
    const sim = create(); let maximum = 0;
    for (let frame = 0; frame < 300; frame++) {
      if (frame === 120) updateBroadcastSimulation(sim, { phase:5, possessionTeamId:'away' });
      const before = new Map(sim.players.map(player => [player.id, { x:player.x, y:player.y }]));
      advanceBroadcastSimulation(sim, 33);
      for (const player of sim.players) { const old = before.get(player.id); maximum = Math.max(maximum, Math.hypot(player.x - old.x, player.y - old.y)); }
    }
    expect(maximum).toBeLessThan(.5);
  });
});
