import { PLAYABLE_POC_RENDERERS, samplePlayablePocMotion, sceneWorldFromMoment } from './playableMomentsPocScene.js';

const CANDIDATE = PLAYABLE_POC_RENDERERS.three;

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture && typeof value.dispose === 'function') value.dispose();
  }
  material.dispose?.();
}

export async function mountThreePlayablePoc(canvas, initialMoment) {
  const loadStarted = window.performance.now();
  const THREE = await import(/* @vite-ignore */ CANDIDATE.moduleUrl);
  const moduleReady = window.performance.now();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08170f);
  scene.fog = new THREE.Fog(0x08170f, 18, 42);
  const camera = new THREE.PerspectiveCamera(46, 1, .1, 80);

  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x142a1d, 2.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-6, 12, 10);
  sun.castShadow = true;
  scene.add(sun);

  const materials = {
    grass:new THREE.MeshStandardMaterial({ color:0x176b3a, roughness:.96 }),
    line:new THREE.MeshStandardMaterial({ color:0xe8f1e9, roughness:.75 }),
    goal:new THREE.MeshStandardMaterial({ color:0xf2f5f3, roughness:.55 }),
    home:new THREE.MeshStandardMaterial({ color:0xd7eef9, roughness:.72 }),
    away:new THREE.MeshStandardMaterial({ color:0xf25b4b, roughness:.72 }),
    skin:new THREE.MeshStandardMaterial({ color:0xb98262, roughness:.88 }),
    shorts:new THREE.MeshStandardMaterial({ color:0x152033, roughness:.8 }),
    keeper:new THREE.MeshStandardMaterial({ color:0xf7c948, roughness:.72 }),
    ball:new THREE.MeshStandardMaterial({ color:0xffffff, roughness:.6 }),
  };

  const roots = new THREE.Group();
  scene.add(roots);

  function mesh(geometry, material, cast = true) {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = cast;
    item.receiveShadow = !cast;
    return item;
  }

  function makeHumanoid(kitMaterial) {
    const root = new THREE.Group();
    const torso = mesh(new THREE.BoxGeometry(.64, .92, .34), kitMaterial);
    torso.position.y = 1.48;
    root.add(torso);
    const shorts = mesh(new THREE.BoxGeometry(.58, .34, .35), materials.shorts);
    shorts.position.y = .96;
    root.add(shorts);
    const head = mesh(new THREE.SphereGeometry(.24, 12, 10), materials.skin);
    head.position.y = 2.18;
    root.add(head);

    function leg(x) {
      const hip = new THREE.Group();
      hip.position.set(x, .86, 0);
      const upper = mesh(new THREE.BoxGeometry(.20, .66, .22), materials.skin);
      upper.position.y = -.32;
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -.64;
      hip.add(knee);
      const lower = mesh(new THREE.BoxGeometry(.18, .62, .20), materials.skin);
      lower.position.y = -.30;
      knee.add(lower);
      const boot = mesh(new THREE.BoxGeometry(.22, .16, .40), materials.shorts);
      boot.position.set(0, -.59, -.10);
      knee.add(boot);
      root.add(hip);
      return { hip, knee };
    }

    function arm(x) {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, 1.78, 0);
      const upper = mesh(new THREE.BoxGeometry(.18, .58, .18), materials.skin);
      upper.position.y = -.27;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -.54;
      shoulder.add(elbow);
      const lower = mesh(new THREE.BoxGeometry(.16, .52, .16), materials.skin);
      lower.position.y = -.24;
      elbow.add(lower);
      root.add(shoulder);
      return { shoulder, elbow };
    }

    const leftLeg = leg(-.20);
    const rightLeg = leg(.20);
    const leftArm = arm(-.43);
    const rightArm = arm(.43);
    return { root, torso, leftLeg, rightLeg, leftArm, rightArm };
  }

  const shooter = makeHumanoid(materials.home);
  const keeper = makeHumanoid(materials.keeper);
  const defender = makeHumanoid(materials.away);
  roots.add(shooter.root, keeper.root, defender.root);
  shooter.root.rotation.y = Math.PI;
  defender.root.rotation.y = Math.PI;
  keeper.root.rotation.y = 0;

  const ball = mesh(new THREE.SphereGeometry(.11, 16, 12), materials.ball);
  roots.add(ball);

  const worldRoot = new THREE.Group();
  roots.add(worldRoot);

  let currentWorld = null;
  let pitch = null;
  let goalLine = null;
  let goalGroup = null;

  function disposeWorldObject(object) {
    if (!object) return;
    object.traverse?.(child => child.geometry?.dispose?.());
    object.geometry?.dispose?.();
    worldRoot.remove(object);
  }

  function rebuildWorld(moment) {
    const world = sceneWorldFromMoment(moment);
    if (currentWorld && JSON.stringify(currentWorld) === JSON.stringify(world)) return world;
    currentWorld = world;
    disposeWorldObject(pitch);
    disposeWorldObject(goalLine);
    disposeWorldObject(goalGroup);
    pitch = null;
    goalLine = null;
    goalGroup = null;

    const pitchLength = Math.max(24, world.distance + 14);
    pitch = mesh(new THREE.PlaneGeometry(18, pitchLength), materials.grass, false);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.z = pitchLength / 2 - 4;
    pitch.receiveShadow = true;
    worldRoot.add(pitch);

    goalLine = mesh(new THREE.BoxGeometry(world.goalWidth + 4, .018, .045), materials.line, false);
    goalLine.position.set(0, .012, 0);
    worldRoot.add(goalLine);

    goalGroup = new THREE.Group();
    const post = new THREE.BoxGeometry(.105, world.goalHeight, .105);
    const bar = new THREE.BoxGeometry(world.goalWidth + .105, .105, .105);
    const left = mesh(post, materials.goal); left.position.set(-world.goalWidth / 2, world.goalHeight / 2, 0);
    const right = mesh(post.clone(), materials.goal); right.position.set(world.goalWidth / 2, world.goalHeight / 2, 0);
    const crossbar = mesh(bar, materials.goal); crossbar.position.set(0, world.goalHeight, 0);
    goalGroup.add(left, right, crossbar);
    worldRoot.add(goalGroup);

    camera.position.set(0, 4.3, world.distance + 10.5);
    camera.lookAt(0, 1.05, Math.max(1, world.distance * .18));
    return world;
  }

  function applyHuman(model, pose, kind) {
    model.root.position.set(pose.x, pose.y, pose.z);
    model.root.rotation.x = kind === 'shooter' ? pose.lean : 0;
    model.root.rotation.z = kind === 'keeper' ? -pose.roll : 0;
    if (kind === 'shooter') {
      model.rightLeg.hip.rotation.x = -pose.kick;
      model.rightLeg.knee.rotation.x = pose.kick * .58;
      model.leftLeg.hip.rotation.x = pose.plant;
      model.leftArm.shoulder.rotation.z = -.18 - pose.arms;
      model.rightArm.shoulder.rotation.z = .18 + pose.arms;
    } else if (kind === 'keeper') {
      model.leftArm.shoulder.rotation.z = -.25 - pose.arms;
      model.rightArm.shoulder.rotation.z = .25 + pose.arms;
      model.leftLeg.hip.rotation.z = pose.roll * .24;
      model.rightLeg.hip.rotation.z = pose.roll * .24;
    } else {
      model.root.rotation.z = pose.lunge * .22;
      model.leftLeg.hip.rotation.x = -pose.lunge * .35;
      model.rightLeg.hip.rotation.x = pose.lunge * .24;
    }
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const targetWidth = Math.floor(width * pixelRatio);
    const targetHeight = Math.floor(height * pixelRatio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render({ moment = initialMoment, resolution = null, progress = 0 } = {}) {
    rebuildWorld(moment);
    const frame = samplePlayablePocMotion(moment, resolution, progress);
    applyHuman(shooter, frame.shooter, 'shooter');
    applyHuman(keeper, frame.keeper, 'keeper');
    applyHuman(defender, frame.defender, 'defender');
    ball.position.set(frame.ball.x, frame.ball.y, frame.ball.z);
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
    dispose() {
      scene.traverse(object => object.geometry?.dispose?.());
      Object.values(materials).forEach(disposeMaterial);
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
