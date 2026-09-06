import { PLAYABLE_POC_RENDERERS } from './playableMomentsPocScene.js';

const CANDIDATE = PLAYABLE_POC_RENDERERS.three;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture && typeof value.dispose === 'function') value.dispose();
  }
  material.dispose?.();
}

function continuationTargetWorld(moment, target = null) {
  const geometry = moment?.geometry ?? {};
  const passer = geometry.passer ?? { x:0, y:0, z:22 };
  const receiver = geometry.receiver ?? { x:0, y:0, z:12 };
  const normalized = target ?? moment?.continuationAction?.targetZone ?? { x:0, y:.68 };
  const progress = clamp(Number(normalized.y ?? .68), .25, .98);
  return {
    x:clamp(Number(normalized.x ?? 0), -1, 1) * 6.2,
    y:.11,
    z:lerp(passer.z, receiver.z, progress),
  };
}

export async function mountThreePlayableContinuation(canvas, initialMoment) {
  const THREE = await import(/* @vite-ignore */ CANDIDATE.moduleUrl);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08170f);
  scene.fog = new THREE.Fog(0x08170f, 22, 54);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 90);

  scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x142a1d, 2.15));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-7, 13, 12);
  sun.castShadow = true;
  scene.add(sun);

  const materials = {
    grass:new THREE.MeshStandardMaterial({ color:0x176b3a, roughness:.96 }),
    line:new THREE.MeshBasicMaterial({ color:0xe8f1e9, transparent:true, opacity:.8 }),
    passer:new THREE.MeshStandardMaterial({ color:0xd7eef9, roughness:.72 }),
    receiver:new THREE.MeshStandardMaterial({ color:0x65d391, roughness:.72 }),
    defender:new THREE.MeshStandardMaterial({ color:0xf25b4b, roughness:.72 }),
    skin:new THREE.MeshStandardMaterial({ color:0xb98262, roughness:.88 }),
    ball:new THREE.MeshStandardMaterial({ color:0xffffff, roughness:.58 }),
    target:new THREE.MeshBasicMaterial({ color:0x77e7ff, transparent:true, opacity:.26, depthWrite:false }),
    targetRing:new THREE.MeshBasicMaterial({ color:0xc9f8ff, transparent:true, opacity:.88, depthTest:false }),
  };

  function mesh(geometry, material, cast = true) {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = cast;
    item.receiveShadow = !cast;
    return item;
  }

  function makePlayer(material) {
    const root = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(.24, .20, .62, 10), material);
    body.position.y = 1.20;
    root.add(body);
    const head = mesh(new THREE.SphereGeometry(.15, 12, 9), materials.skin);
    head.position.y = 1.65;
    root.add(head);
    for (const side of [-1, 1]) {
      const leg = mesh(new THREE.CylinderGeometry(.065, .075, .70, 8), material);
      leg.position.set(side * .105, .52, 0);
      root.add(leg);
      const arm = mesh(new THREE.CylinderGeometry(.052, .060, .56, 8), materials.skin);
      arm.position.set(side * .31, 1.16, 0);
      arm.rotation.z = side * .08;
      root.add(arm);
    }
    return root;
  }

  const pitch = mesh(new THREE.PlaneGeometry(18, 44), materials.grass, false);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.z = 17;
  pitch.receiveShadow = true;
  scene.add(pitch);

  for (const z of [4, 12, 20, 28, 36]) {
    const stripe = mesh(new THREE.PlaneGeometry(18, .035), materials.line, false);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, .012, z);
    scene.add(stripe);
  }

  const passer = makePlayer(materials.passer);
  const receiver = makePlayer(materials.receiver);
  const interceptor = makePlayer(materials.defender);
  const ball = mesh(new THREE.SphereGeometry(.11, 18, 12), materials.ball);
  const targetDisc = mesh(new THREE.CircleGeometry(.82, 28), materials.target, false);
  targetDisc.rotation.x = -Math.PI / 2;
  const targetRing = mesh(new THREE.TorusGeometry(.82, .045, 8, 28), materials.targetRing, false);
  targetRing.rotation.x = Math.PI / 2;
  targetRing.renderOrder = 5;
  scene.add(passer, receiver, interceptor, ball, targetDisc, targetRing);

  let currentMoment = initialMoment;
  let lastWidth = 0;
  let lastHeight = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function placeMoment(moment) {
    const geometry = moment?.geometry ?? {};
    const passerPose = geometry.passer ?? { x:0, y:0, z:22 };
    const receiverPose = geometry.receiver ?? { x:0, y:0, z:12 };
    const defenderPose = geometry.interceptor ?? { x:1, y:0, z:17 };
    passer.position.set(passerPose.x, passerPose.y, passerPose.z);
    receiver.position.set(receiverPose.x, receiverPose.y, receiverPose.z);
    interceptor.position.set(defenderPose.x, defenderPose.y, defenderPose.z);
    passer.rotation.y = Math.PI;
    receiver.rotation.y = Math.PI;
    interceptor.rotation.y = Math.PI;

    const defaultTarget = continuationTargetWorld(moment);
    targetDisc.position.set(defaultTarget.x, .018, defaultTarget.z);
    targetRing.position.set(defaultTarget.x, .032, defaultTarget.z);

    const startBall = geometry.ball ?? { x:passerPose.x, y:.11, z:passerPose.z - .55 };
    ball.position.set(startBall.x, startBall.y, startBall.z);

    const midpoint = (passerPose.z + receiverPose.z) * .5;
    camera.position.set(0, 8.2, Math.max(30, passerPose.z + 11));
    camera.lookAt(0, .8, midpoint - 2);
  }

  function render({ moment = currentMoment, resolution = null, progress = 0 } = {}) {
    currentMoment = moment ?? currentMoment;
    resize();
    placeMoment(currentMoment);

    const geometry = currentMoment?.geometry ?? {};
    const start = geometry.ball ?? geometry.passer ?? { x:0, y:.11, z:22 };
    const continuation = resolution?.continuation ?? null;
    if (continuation) {
      const authoritativeTarget = continuationTargetWorld(currentMoment, continuation.target);
      const end = continuation.success
        ? authoritativeTarget
        : geometry.interceptor
          ? { x:geometry.interceptor.x, y:.30, z:geometry.interceptor.z }
          : authoritativeTarget;
      const flight = clamp(Number(progress) / .72, 0, 1);
      ball.position.set(
        lerp(Number(start.x ?? 0), Number(end.x ?? 0), flight),
        .11 + Math.sin(Math.PI * flight) * (currentMoment?.continuationType === 'cross' ? 2.2 : .55),
        lerp(Number(start.z ?? 22), Number(end.z ?? 12), flight),
      );
      targetDisc.position.set(authoritativeTarget.x, .018, authoritativeTarget.z);
      targetRing.position.set(authoritativeTarget.x, .032, authoritativeTarget.z);
      targetDisc.visible = progress < .76;
      targetRing.visible = progress < .76;
    } else {
      targetDisc.visible = true;
      targetRing.visible = true;
    }

    renderer.render(scene, camera);
  }

  function continuationIntentFromClientPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    const targetX = clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    const targetY = clamp(1 - ((clientY - rect.top) / rect.height), 0, 1);
    return { targetX, targetY };
  }

  function dispose() {
    scene.traverse(object => object.geometry?.dispose?.());
    for (const material of Object.values(materials)) disposeMaterial(material);
    renderer.dispose();
    renderer.forceContextLoss?.();
  }

  placeMoment(initialMoment);
  render({ moment:initialMoment, progress:0 });

  return {
    render,
    continuationIntentFromClientPoint,
    dispose,
    rendererId:CANDIDATE.id,
  };
}
