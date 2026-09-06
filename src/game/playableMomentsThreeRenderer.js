import { PLAYABLE_POC_RENDERERS, samplePlayablePocMotion, sceneWorldFromMoment } from './playableMomentsPocScene.js';

import { createPlayableFootballer } from './playableFootballer.js';
import { sampleFootballStance } from './playableFootballMotion.js';
import { createPlayableFootballStage, framePlayableCamera } from './playableFootballStage.js';

const CANDIDATE = PLAYABLE_POC_RENDERERS.three;
const MAX_SET_PIECE_WALL_PLAYERS = 5;

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture && typeof value.dispose === 'function') value.dispose();
  }
  material.dispose?.();
}

export async function mountThreePlayablePoc(canvas, initialMoment, options = {}) {
  const loadStarted = window.performance.now();
  const THREE = await import(/* @vite-ignore */ CANDIDATE.moduleUrl);
  const moduleReady = window.performance.now();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:options.quality?.antialias ?? true, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.quality?.maxPixelRatio ?? 1.5));
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = options.quality?.shadows ?? true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x718d96);
  scene.fog = new THREE.Fog(0x718d96, 38, 95);
  const camera = new THREE.PerspectiveCamera(46, 1, .1, 80);
  const raycaster = new THREE.Raycaster();
  const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  const hemi = new THREE.HemisphereLight(0xd9edff, 0x455139, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffedce, 2.5);
  sun.position.set(-6, 12, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left:-13, right:13, top:22, bottom:-12, far:55 });
  sun.shadow.normalBias = .025;
  sun.shadow.bias = -.00015;
  sun.target.position.set(0,0,7);
  scene.add(sun.target);
  scene.add(sun);

  const materials = {
    grass:new THREE.MeshStandardMaterial({ color:0x176b3a, roughness:.96 }),
    line:new THREE.MeshStandardMaterial({ color:0xe8f1e9, roughness:.75 }),
    goal:new THREE.MeshStandardMaterial({ color:0xf2f5f3, roughness:.55 }),
    home:new THREE.MeshStandardMaterial({ color:0xd7eef9, roughness:.72 }),
    away:new THREE.MeshStandardMaterial({ color:0xf25b4b, roughness:.72 }),
    skinHome:new THREE.MeshStandardMaterial({ color:0xb98262, roughness:.88 }),
    skinAway:new THREE.MeshStandardMaterial({ color:0x8f5e43, roughness:.88 }),
    skinKeeper:new THREE.MeshStandardMaterial({ color:0xc58e69, roughness:.88 }),
    shorts:new THREE.MeshStandardMaterial({ color:0x152033, roughness:.8 }),
    awayShorts:new THREE.MeshStandardMaterial({ color:0xf1eee9, roughness:.78 }),
    keeper:new THREE.MeshStandardMaterial({ color:0xf7c948, roughness:.72 }),
    keeperShorts:new THREE.MeshStandardMaterial({ color:0x1a2943, roughness:.78 }),
    hair:new THREE.MeshStandardMaterial({ color:0x241914, roughness:.92 }),
    boots:new THREE.MeshStandardMaterial({ color:0x101315, roughness:.62 }),
    gloves:new THREE.MeshStandardMaterial({ color:0xf4f6f7, roughness:.55 }),
    eyes:new THREE.MeshStandardMaterial({ color:0x1a1715, roughness:.8 }),
    ball:new THREE.MeshStandardMaterial({ color:0xffffff, roughness:.6 }),
    cue:new THREE.MeshBasicMaterial({ color:0x77e7ff, transparent:true, opacity:.88, depthTest:false }),
    cueCore:new THREE.MeshBasicMaterial({ color:0xd8f9ff, transparent:true, opacity:.82, depthTest:false }),
    special:new THREE.MeshBasicMaterial({ color:0xffd86b, transparent:true, opacity:.72, depthTest:false }),
  };

  const roots = new THREE.Group();
  scene.add(roots);

  function mesh(geometry, material, cast = true) {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = cast;
    item.receiveShadow = !cast;
    return item;
  }

  function makeHumanoid(kitMaterial, skinMaterial, { keeper = false, shortsMaterial = materials.shorts } = {}) {
    return createPlayableFootballer(THREE, {
      shirt:kitMaterial, shorts:shortsMaterial, skin:skinMaterial,
      boots:materials.boots, gloves:keeper ? materials.gloves : null,
      hair:materials.hair, number:keeper ? 1 : kitMaterial === materials.home ? 9 : 4,
    });
  }

  const shooter = makeHumanoid(materials.home, materials.skinHome);
  const keeper = makeHumanoid(materials.keeper, materials.skinKeeper, { keeper:true, shortsMaterial:materials.keeperShorts });
  const defender = makeHumanoid(materials.away, materials.skinAway, { shortsMaterial:materials.awayShorts });
  const wallModels = Array.from({ length:MAX_SET_PIECE_WALL_PLAYERS }, () => (
    makeHumanoid(materials.away, materials.skinAway, { shortsMaterial:materials.awayShorts })
  ));
  roots.add(shooter.root, keeper.root, defender.root, ...wallModels.map(model => model.root));

  for (const model of wallModels) {
    model.root.visible = false;
  }

  const ball = mesh(new THREE.SphereGeometry(.11, 20, 14), materials.ball);
  const panelMaterial = new THREE.MeshStandardMaterial({ color:0x182b34, roughness:.65 });
  materials.ballPanels = panelMaterial;
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const panelDirections = new Map();
  for (let i = 0; i < ico.attributes.position.count; i++) {
    const normal = new THREE.Vector3().fromBufferAttribute(ico.attributes.position, i).normalize();
    panelDirections.set(normal.toArray().map(n => n.toFixed(3)).join(','), normal);
  }
  for (const normal of panelDirections.values()) {
    const patch = new THREE.CircleGeometry(.032, 5);
    for (let i = 0; i < patch.attributes.position.count; i++) {
      const vertex = new THREE.Vector3().fromBufferAttribute(patch.attributes.position, i);
      vertex.z = .11; vertex.normalize().multiplyScalar(.111);
      patch.attributes.position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    patch.computeVertexNormals();
    const panel = mesh(patch, panelMaterial, false);
    panel.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), normal);
    ball.add(panel);
  }
  ico.dispose();
  roots.add(ball);

  const worldRoot = new THREE.Group();
  roots.add(worldRoot);

  const goalkeeperCue = new THREE.Group();
  const cueRing = mesh(new THREE.TorusGeometry(.28, .045, 8, 24), materials.cue, false);
  cueRing.renderOrder = 10;
  const cueCore = mesh(new THREE.CircleGeometry(.075, 20), materials.cueCore, false);
  cueCore.renderOrder = 11;
  goalkeeperCue.add(cueRing, cueCore);
  goalkeeperCue.visible = false;
  worldRoot.add(goalkeeperCue);

  function specialMarker() {
    const marker = mesh(new THREE.TorusGeometry(.34, .040, 8, 28), materials.special, false);
    marker.scale.x = 1.45;
    marker.renderOrder = 9;
    marker.visible = false;
    worldRoot.add(marker);
    return marker;
  }

  const specialLeft = specialMarker();
  const specialRight = specialMarker();

  let currentWorld = null;
  let stage = null;

  function rebuildWorld(moment) {
    const world = sceneWorldFromMoment(moment);
    if (currentWorld && JSON.stringify(currentWorld) === JSON.stringify(world)) return world;
    currentWorld = world;
    stage?.dispose();
    stage = createPlayableFootballStage(THREE, worldRoot, world, materials);
    return world;
  }

  function updateGoalCues(moment, resolution) {
    const world = currentWorld ?? sceneWorldFromMoment(moment);
    const cue = moment?.syntheticTarget;
    goalkeeperCue.visible = Boolean(moment?.mode === 'goalkeeper' && cue && !resolution);
    if (goalkeeperCue.visible) {
      goalkeeperCue.position.set(Number(cue.x ?? 0) * world.goalWidth / 2, Number(cue.y ?? .5) * world.goalHeight, -.10);
    }

    const showSpecial = Boolean(moment?.route === 'synthetic_penalty_harness' && moment?.mode === 'attack' && !resolution);
    specialLeft.visible = showSpecial;
    specialRight.visible = showSpecial;
    if (showSpecial) {
      specialLeft.position.set(-.79 * world.goalWidth / 2, .82 * world.goalHeight, -.11);
      specialRight.position.set(.79 * world.goalWidth / 2, .82 * world.goalHeight, -.11);
    }
  }

  function applyHuman(model, pose, kind) {
    model.pose(pose.joints ?? sampleFootballStance(pose, 0, kind === 'defender' ? pose.lunge : 0));
  }

  function updateAuthoritativeDefenders(moment, resolution, progress, frame) {
    const wallMembers = Array.isArray(moment?.geometry?.wall?.members) ? moment.geometry.wall.members : [];
    const hasWall = wallMembers.length > 0;
    const hasExplicitDefender = moment?.geometry && Object.prototype.hasOwnProperty.call(moment.geometry, 'defender')
      ? moment.geometry.defender != null
      : true;
    defender.root.visible = !hasWall && hasExplicitDefender;
    if (defender.root.visible) applyHuman(defender, frame.defender, 'defender');

    const shot = resolution?.shot ?? resolution ?? null;
    const blockerId = shot?.presentation?.blockerId ?? null;
    const blocked = shot?.finish === 'blocked';
    const wallFlight = Math.max(0, Math.min(1, (Number(progress) - .27) / .38));
    const wallJump = Math.sin(wallFlight * Math.PI) * .18;
    const blockPulse = Math.sin(Math.max(0, Math.min(1, (Number(progress) - .37) / .30)) * Math.PI);

    for (let index = 0; index < wallModels.length; index += 1) {
      const model = wallModels[index];
      const member = wallMembers[index] ?? null;
      model.root.visible = Boolean(member);
      if (!member) continue;
      const isBlocker = blocked && blockerId === member.id;
      applyHuman(model, {
        x:Number(member.x ?? 0),
        y:wallJump + (isBlocker ? blockPulse * .04 : 0),
        z:Number(member.z ?? 0),
        lunge:isBlocker ? blockPulse * .30 : 0,
      }, 'defender');
    }
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, options.quality?.maxPixelRatio ?? 1.5);
    const targetWidth = Math.floor(width * pixelRatio);
    const targetHeight = Math.floor(height * pixelRatio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) renderer.setSize(width, height, false);
    camera.aspect = width / height;
    framePlayableCamera(camera, currentWorld, width / height);
  }

  function goalIntentFromClientPoint(clientX, clientY) {
    const world = currentWorld;
    if (!world) return null;
    resize();
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const pointer = new THREE.Vector2(
      ((Number(clientX) - rect.left) / rect.width) * 2 - 1,
      -(((Number(clientY) - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.setFromCamera(pointer, camera);
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(goalPlane, point)) return null;
    return {
      x:Math.max(-1.25, Math.min(1.25, point.x / Math.max(.01, world.goalWidth / 2))),
      y:Math.max(-.2, Math.min(1.2, point.y / Math.max(.01, world.goalHeight))),
    };
  }

  function render({ moment = initialMoment, resolution = null, progress = 0 } = {}) {
    rebuildWorld(moment);
    updateGoalCues(moment, resolution);
    const frame = samplePlayablePocMotion(moment, resolution, progress);
    applyHuman(shooter, frame.shooter, 'shooter');
    applyHuman(keeper, frame.keeper, 'keeper');
    updateAuthoritativeDefenders(moment, resolution, progress, frame);
    ball.position.set(frame.ball.x, Math.max(.11, frame.ball.y), frame.ball.z);
    stage.update(frame);
    ball.rotation.x = Number(frame.ball.spinX ?? 0);
    ball.rotation.z = Number(frame.ball.spinZ ?? 0);
    resize();
    renderer.render(scene, camera);
  }

  rebuildWorld(initialMoment);
  render({ moment:initialMoment, progress:0 });
  const readyAt = window.performance.now();

  return {
    candidate:CANDIDATE,
    loadMs:moduleReady - loadStarted,
    initMs:readyAt - moduleReady,
    readyMs:readyAt - loadStarted,
    render,
    resize,
    goalIntentFromClientPoint,
    dispose() {
      stage?.dispose();
      [shooter, keeper, defender, ...wallModels].forEach(model => model.dispose());
      scene.traverse(object => object.geometry?.dispose?.());
      Object.values(materials).forEach(disposeMaterial);
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
