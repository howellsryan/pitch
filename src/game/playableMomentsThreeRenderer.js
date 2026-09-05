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
  const raycaster = new THREE.Raycaster();
  const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

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
    const root = new THREE.Group();

    // Proportions are deliberately close to an ~1.84 m adult rather than the
    // original POC's ~2.4 m block figure. Every primitive remains generated in
    // code so the Phase 1 asset/provenance boundary stays unchanged.
    const torso = mesh(new THREE.CylinderGeometry(.265, .205, .52, 12), kitMaterial);
    torso.position.y = 1.34;
    torso.scale.z = .66;
    root.add(torso);

    const shorts = mesh(new THREE.CylinderGeometry(.21, .235, .22, 10), shortsMaterial);
    shorts.position.y = 1.00;
    shorts.scale.z = .72;
    root.add(shorts);

    const neck = mesh(new THREE.CylinderGeometry(.07, .075, .10, 8), skinMaterial);
    neck.position.y = 1.63;
    root.add(neck);

    const head = mesh(new THREE.SphereGeometry(.15, 16, 12), skinMaterial);
    head.position.y = 1.78;
    head.scale.set(.92, 1.06, .96);
    root.add(head);

    const hair = mesh(new THREE.SphereGeometry(.153, 14, 8, 0, Math.PI * 2, 0, Math.PI * .52), materials.hair);
    hair.position.y = 1.80;
    hair.scale.set(.93, 1.02, .97);
    root.add(hair);

    const leftEye = mesh(new THREE.SphereGeometry(.014, 6, 4), materials.eyes, false);
    const rightEye = mesh(new THREE.SphereGeometry(.014, 6, 4), materials.eyes, false);
    leftEye.position.set(-.045, 1.80, .142);
    rightEye.position.set(.045, 1.80, .142);
    root.add(leftEye, rightEye);

    const nose = mesh(new THREE.SphereGeometry(.022, 6, 4), skinMaterial, false);
    nose.position.set(0, 1.765, .151);
    nose.scale.set(.75, 1, 1.15);
    root.add(nose);

    function leg(x) {
      const hip = new THREE.Group();
      hip.position.set(x, .92, 0);

      const thigh = mesh(new THREE.CylinderGeometry(.078, .095, .40, 9), skinMaterial);
      thigh.position.y = -.20;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -.40;
      hip.add(knee);

      const kneeCap = mesh(new THREE.SphereGeometry(.082, 9, 7), skinMaterial);
      kneeCap.scale.y = .76;
      knee.add(kneeCap);

      const sock = mesh(new THREE.CylinderGeometry(.055, .068, .36, 9), kitMaterial);
      sock.position.y = -.19;
      knee.add(sock);

      const ankle = mesh(new THREE.CylinderGeometry(.047, .052, .12, 8), skinMaterial);
      ankle.position.y = -.42;
      knee.add(ankle);

      const boot = mesh(new THREE.BoxGeometry(.15, .09, .29), materials.boots);
      boot.position.set(0, -.49, -.055);
      boot.rotation.x = -.04;
      knee.add(boot);

      root.add(hip);
      return { hip, knee };
    }

    function arm(x) {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, 1.49, 0);

      const sleeve = mesh(new THREE.CylinderGeometry(.082, .075, .17, 9), kitMaterial);
      sleeve.position.y = -.075;
      shoulder.add(sleeve);

      const upper = mesh(new THREE.CylinderGeometry(.062, .070, .22, 9), skinMaterial);
      upper.position.y = -.25;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -.36;
      shoulder.add(elbow);

      const elbowJoint = mesh(new THREE.SphereGeometry(.066, 8, 6), skinMaterial);
      elbowJoint.scale.y = .78;
      elbow.add(elbowJoint);

      const lower = mesh(new THREE.CylinderGeometry(.052, .062, .31, 8), skinMaterial);
      lower.position.y = -.16;
      elbow.add(lower);

      const handMaterial = keeper ? materials.gloves : skinMaterial;
      const hand = mesh(new THREE.SphereGeometry(keeper ? .072 : .060, 8, 6), handMaterial);
      hand.position.y = -.33;
      hand.scale.set(keeper ? 1.18 : .9, 1, .72);
      elbow.add(hand);

      root.add(shoulder);
      return { shoulder, elbow };
    }

    const leftLeg = leg(-.115);
    const rightLeg = leg(.115);
    const leftArm = arm(-.30);
    const rightArm = arm(.30);
    return { root, torso, head, leftLeg, rightLeg, leftArm, rightArm, keeper };
  }

  const shooter = makeHumanoid(materials.home, materials.skinHome);
  const keeper = makeHumanoid(materials.keeper, materials.skinKeeper, { keeper:true, shortsMaterial:materials.keeperShorts });
  const defender = makeHumanoid(materials.away, materials.skinAway, { shortsMaterial:materials.awayShorts });
  roots.add(shooter.root, keeper.root, defender.root);
  shooter.root.rotation.y = Math.PI;
  defender.root.rotation.y = Math.PI;
  keeper.root.rotation.y = 0;

  const ball = mesh(new THREE.SphereGeometry(.11, 20, 14), materials.ball);
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
    const post = new THREE.CylinderGeometry(.052, .052, world.goalHeight, 10);
    const bar = new THREE.CylinderGeometry(.052, .052, world.goalWidth + .105, 10);
    const left = mesh(post, materials.goal);
    left.position.set(-world.goalWidth / 2, world.goalHeight / 2, 0);
    const right = mesh(post.clone(), materials.goal);
    right.position.set(world.goalWidth / 2, world.goalHeight / 2, 0);
    const crossbar = mesh(bar, materials.goal);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, world.goalHeight, 0);
    goalGroup.add(left, right, crossbar);
    worldRoot.add(goalGroup);

    camera.position.set(0, 3.65, world.distance + 10.5);
    camera.lookAt(0, 1.05, Math.max(1, world.distance * .18));
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
    model.root.position.set(pose.x, pose.y, pose.z);
    model.root.rotation.x = kind === 'shooter' ? pose.lean : 0;
    model.root.rotation.z = kind === 'keeper' ? -pose.roll : 0;

    // Reset a natural base stance before applying the frame pose so repeated
    // moments cannot accumulate rotations from the previous animation.
    model.torso.rotation.set(0, 0, 0);
    model.head.rotation.set(0, 0, 0);
    model.leftLeg.hip.rotation.set(0, 0, -.035);
    model.rightLeg.hip.rotation.set(0, 0, .035);
    model.leftLeg.knee.rotation.set(.05, 0, 0);
    model.rightLeg.knee.rotation.set(.05, 0, 0);
    model.leftArm.shoulder.rotation.set(.03, 0, -.12);
    model.rightArm.shoulder.rotation.set(.03, 0, .12);
    model.leftArm.elbow.rotation.set(0, 0, -.06);
    model.rightArm.elbow.rotation.set(0, 0, .06);

    if (kind === 'shooter') {
      const plantBend = Number(pose.plantBend ?? 0);
      model.rightLeg.hip.rotation.x = -pose.kick;
      model.rightLeg.knee.rotation.x = .08 + Math.max(0, pose.kick) * .64 + Number(pose.backswing ?? 0) * .16;
      model.leftLeg.hip.rotation.x = pose.plant;
      model.leftLeg.knee.rotation.x = .05 + plantBend;
      model.leftArm.shoulder.rotation.z = -.14 - pose.arms;
      model.rightArm.shoulder.rotation.z = .14 + pose.arms;
      model.leftArm.shoulder.rotation.x = -.08 - Number(pose.followThrough ?? 0) * .10;
      model.rightArm.shoulder.rotation.x = .06 + Number(pose.followThrough ?? 0) * .08;
      model.torso.rotation.z = pose.arms * .08;
      model.torso.rotation.y = Number(pose.torsoTwist ?? 0);
      model.head.rotation.x = Number(pose.headDip ?? 0);
    } else if (kind === 'keeper') {
      const crouch = Number(pose.crouch ?? 0);
      const landing = Number(pose.landing ?? 0);
      const push = Number(pose.push ?? 0);
      const side = Math.sign(Number(pose.roll ?? 0)) || 1;
      model.leftArm.shoulder.rotation.z = -.48 - pose.arms * .62;
      model.rightArm.shoulder.rotation.z = .48 + pose.arms * .62;
      model.leftArm.shoulder.rotation.x = -.10 - pose.dive * .24;
      model.rightArm.shoulder.rotation.x = -.10 - pose.dive * .24;
      model.leftArm.elbow.rotation.z = -.14 - pose.dive * .08;
      model.rightArm.elbow.rotation.z = .14 + pose.dive * .08;
      model.leftLeg.hip.rotation.z = -.12 + pose.roll * .20;
      model.rightLeg.hip.rotation.z = .12 + pose.roll * .20;
      model.leftLeg.hip.rotation.x = crouch * .16 + (side > 0 ? push * .10 : 0);
      model.rightLeg.hip.rotation.x = crouch * .16 + (side < 0 ? push * .10 : 0);
      model.leftLeg.knee.rotation.x = .15 + crouch * .48 + landing * .14;
      model.rightLeg.knee.rotation.x = .15 + crouch * .48 + landing * .14;
      model.torso.rotation.x = -.08 - crouch * .12 + landing * .08;
      model.head.rotation.x = crouch * .04;
    } else {
      model.root.rotation.z = pose.lunge * .20;
      model.leftLeg.hip.rotation.x = -pose.lunge * .34;
      model.rightLeg.hip.rotation.x = pose.lunge * .22;
      model.leftArm.shoulder.rotation.z = -.20 - pose.lunge * .18;
      model.rightArm.shoulder.rotation.z = .20 + pose.lunge * .18;
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
    applyHuman(defender, frame.defender, 'defender');
    ball.position.set(frame.ball.x, frame.ball.y, frame.ball.z);
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
      scene.traverse(object => object.geometry?.dispose?.());
      Object.values(materials).forEach(disposeMaterial);
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
