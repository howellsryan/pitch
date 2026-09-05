import { PLAYABLE_POC_RENDERERS, samplePlayablePocMotion, sceneWorldFromMoment } from './playableMomentsPocScene.js';

const CANDIDATE = PLAYABLE_POC_RENDERERS.playcanvas;
const RAD_TO_DEG = 180 / Math.PI;

export async function mountPlayCanvasPlayablePoc(canvas, initialMoment) {
  const loadStarted = window.performance.now();
  const pc = await import(/* @vite-ignore */ CANDIDATE.moduleUrl);
  const moduleReady = window.performance.now();
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions:{ antialias:true, alpha:false, powerPreference:'high-performance' },
  });
  app.setCanvasResolution(pc.RESOLUTION_AUTO);

  function colour(hex) {
    return new pc.Color(
      ((hex >> 16) & 255) / 255,
      ((hex >> 8) & 255) / 255,
      (hex & 255) / 255,
    );
  }

  function material(hex) {
    const result = new pc.StandardMaterial();
    result.diffuse = colour(hex);
    result.gloss = 18;
    result.update();
    return result;
  }

  const materials = {
    grass:material(0x176b3a),
    line:material(0xe8f1e9),
    goal:material(0xf2f5f3),
    home:material(0xd7eef9),
    away:material(0xf25b4b),
    skin:material(0xb98262),
    shorts:material(0x152033),
    keeper:material(0xf7c948),
    ball:material(0xffffff),
  };

  const camera = new pc.Entity('poc-camera');
  camera.addComponent('camera', { clearColor:colour(0x08170f), fov:46, nearClip:.1, farClip:80 });
  app.root.addChild(camera);

  const light = new pc.Entity('poc-light');
  light.addComponent('light', { type:'directional', color:colour(0xffffff), intensity:2.2, castShadows:true });
  light.setEulerAngles(48, 30, 0);
  app.root.addChild(light);

  const fill = new pc.Entity('poc-fill');
  fill.addComponent('light', { type:'omni', color:colour(0x9fc8ff), intensity:.55, range:28 });
  fill.setPosition(0, 7, 8);
  app.root.addChild(fill);

  function primitive(name, type, mat, scale, position = null) {
    const entity = new pc.Entity(name);
    entity.addComponent('render', { type, castShadows:true, receiveShadows:true });
    if (entity.render?.meshInstances?.[0]) entity.render.meshInstances[0].material = mat;
    entity.setLocalScale(scale.x, scale.y, scale.z);
    if (position) entity.setLocalPosition(position.x, position.y, position.z);
    return entity;
  }

  function makeHumanoid(name, kitMaterial) {
    const root = new pc.Entity(name);
    const torso = primitive(`${name}-torso`, 'box', kitMaterial, { x:.64, y:.92, z:.34 }, { x:0, y:1.48, z:0 });
    root.addChild(torso);
    const shorts = primitive(`${name}-shorts`, 'box', materials.shorts, { x:.58, y:.34, z:.35 }, { x:0, y:.96, z:0 });
    root.addChild(shorts);
    const head = primitive(`${name}-head`, 'sphere', materials.skin, { x:.48, y:.48, z:.48 }, { x:0, y:2.18, z:0 });
    root.addChild(head);

    function leg(label, x) {
      const hip = new pc.Entity(`${name}-${label}-hip`);
      hip.setLocalPosition(x, .86, 0);
      root.addChild(hip);
      const upper = primitive(`${name}-${label}-upper-leg`, 'box', materials.skin, { x:.20, y:.66, z:.22 }, { x:0, y:-.32, z:0 });
      hip.addChild(upper);
      const knee = new pc.Entity(`${name}-${label}-knee`);
      knee.setLocalPosition(0, -.64, 0);
      hip.addChild(knee);
      const lower = primitive(`${name}-${label}-lower-leg`, 'box', materials.skin, { x:.18, y:.62, z:.20 }, { x:0, y:-.30, z:0 });
      knee.addChild(lower);
      const boot = primitive(`${name}-${label}-boot`, 'box', materials.shorts, { x:.22, y:.16, z:.40 }, { x:0, y:-.59, z:-.10 });
      knee.addChild(boot);
      return { hip, knee };
    }

    function arm(label, x) {
      const shoulder = new pc.Entity(`${name}-${label}-shoulder`);
      shoulder.setLocalPosition(x, 1.78, 0);
      root.addChild(shoulder);
      const upper = primitive(`${name}-${label}-upper-arm`, 'box', materials.skin, { x:.18, y:.58, z:.18 }, { x:0, y:-.27, z:0 });
      shoulder.addChild(upper);
      const elbow = new pc.Entity(`${name}-${label}-elbow`);
      elbow.setLocalPosition(0, -.54, 0);
      shoulder.addChild(elbow);
      const lower = primitive(`${name}-${label}-lower-arm`, 'box', materials.skin, { x:.16, y:.52, z:.16 }, { x:0, y:-.24, z:0 });
      elbow.addChild(lower);
      return { shoulder, elbow };
    }

    return {
      root,
      torso,
      leftLeg:leg('left', -.20),
      rightLeg:leg('right', .20),
      leftArm:arm('left', -.43),
      rightArm:arm('right', .43),
    };
  }

  const shooter = makeHumanoid('poc-shooter', materials.home);
  const keeper = makeHumanoid('poc-keeper', materials.keeper);
  const defender = makeHumanoid('poc-defender', materials.away);
  shooter.root.setLocalEulerAngles(0, 180, 0);
  defender.root.setLocalEulerAngles(0, 180, 0);
  app.root.addChild(shooter.root);
  app.root.addChild(keeper.root);
  app.root.addChild(defender.root);

  const ball = primitive('poc-ball', 'sphere', materials.ball, { x:.22, y:.22, z:.22 });
  app.root.addChild(ball);

  let worldRoot = null;
  let worldSignature = '';

  function rebuildWorld(moment) {
    const world = sceneWorldFromMoment(moment);
    const signature = JSON.stringify(world);
    if (worldRoot && signature === worldSignature) return world;
    worldSignature = signature;
    worldRoot?.destroy();
    worldRoot = new pc.Entity('poc-world');
    app.root.addChild(worldRoot);

    const pitchLength = Math.max(24, world.distance + 14);
    const pitch = primitive('poc-pitch', 'box', materials.grass, { x:18, y:.04, z:pitchLength }, { x:0, y:-.03, z:pitchLength / 2 - 4 });
    worldRoot.addChild(pitch);
    const goalLine = primitive('poc-goal-line', 'box', materials.line, { x:world.goalWidth + 4, y:.018, z:.045 }, { x:0, y:.012, z:0 });
    worldRoot.addChild(goalLine);
    const left = primitive('poc-left-post', 'box', materials.goal, { x:.105, y:world.goalHeight, z:.105 }, { x:-world.goalWidth / 2, y:world.goalHeight / 2, z:0 });
    const right = primitive('poc-right-post', 'box', materials.goal, { x:.105, y:world.goalHeight, z:.105 }, { x:world.goalWidth / 2, y:world.goalHeight / 2, z:0 });
    const bar = primitive('poc-crossbar', 'box', materials.goal, { x:world.goalWidth + .105, y:.105, z:.105 }, { x:0, y:world.goalHeight, z:0 });
    worldRoot.addChild(left);
    worldRoot.addChild(right);
    worldRoot.addChild(bar);

    camera.setPosition(0, 4.3, world.distance + 10.5);
    camera.lookAt(new pc.Vec3(0, 1.05, Math.max(1, world.distance * .18)));
    return world;
  }

  function applyHuman(model, pose, kind) {
    model.root.setPosition(pose.x, pose.y, pose.z);
    if (kind === 'shooter') {
      model.root.setEulerAngles(pose.lean * RAD_TO_DEG, 180, 0);
      model.rightLeg.hip.setLocalEulerAngles(-pose.kick * RAD_TO_DEG, 0, 0);
      model.rightLeg.knee.setLocalEulerAngles(pose.kick * .58 * RAD_TO_DEG, 0, 0);
      model.leftLeg.hip.setLocalEulerAngles(pose.plant * RAD_TO_DEG, 0, 0);
      model.leftArm.shoulder.setLocalEulerAngles(0, 0, (-.18 - pose.arms) * RAD_TO_DEG);
      model.rightArm.shoulder.setLocalEulerAngles(0, 0, (.18 + pose.arms) * RAD_TO_DEG);
    } else if (kind === 'keeper') {
      model.root.setEulerAngles(0, 0, -pose.roll * RAD_TO_DEG);
      model.leftArm.shoulder.setLocalEulerAngles(0, 0, (-.25 - pose.arms) * RAD_TO_DEG);
      model.rightArm.shoulder.setLocalEulerAngles(0, 0, (.25 + pose.arms) * RAD_TO_DEG);
      model.leftLeg.hip.setLocalEulerAngles(0, 0, pose.roll * .24 * RAD_TO_DEG);
      model.rightLeg.hip.setLocalEulerAngles(0, 0, pose.roll * .24 * RAD_TO_DEG);
    } else {
      model.root.setEulerAngles(0, 180, pose.lunge * .22 * RAD_TO_DEG);
      model.leftLeg.hip.setLocalEulerAngles(-pose.lunge * .35 * RAD_TO_DEG, 0, 0);
      model.rightLeg.hip.setLocalEulerAngles(pose.lunge * .24 * RAD_TO_DEG, 0, 0);
    }
  }

  function resize() {
    app.resizeCanvas?.(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
  }

  function render({ moment = initialMoment, resolution = null, progress = 0 } = {}) {
    rebuildWorld(moment);
    const frame = samplePlayablePocMotion(moment, resolution, progress);
    applyHuman(shooter, frame.shooter, 'shooter');
    applyHuman(keeper, frame.keeper, 'keeper');
    applyHuman(defender, frame.defender, 'defender');
    ball.setPosition(frame.ball.x, frame.ball.y, frame.ball.z);
    resize();
  }

  rebuildWorld(initialMoment);
  app.start();
  render({ moment:initialMoment, progress:0 });
  const readyAt = window.performance.now();

  return {
    candidate:CANDIDATE,
    loadMs:moduleReady - loadStarted,
    initMs:readyAt - moduleReady,
    readyMs:readyAt - loadStarted,
    render,
    resize,
    dispose() {
      app.destroy();
      Object.values(materials).forEach(item => item.destroy?.());
    },
  };
}
