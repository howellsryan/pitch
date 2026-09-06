// Original, generated football kit/skin geometry. One skin, shared skeleton
// contract, no asset downloads, manual editor or frame-dependent animation.
export function createPlayableFootballer(THREE, { shirt, shorts, skin, socks = shirt, boots, gloves, hair, number = 9 }) {
  const root = new THREE.Group();
  const positions = [], indices = [], weights = [], skinIndices = [], groups = [];
  const bones = [], bindings = [];
  const palette = [shirt, shorts, skin, socks, boots, gloves ?? skin, hair];
  const vec = p => new THREE.Vector3(p.x, p.y, p.z);
  const point = (x, y, z = 0) => ({ x, y, z });
  function bone(name, start, end) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(vec(start));
    root.add(b);
    const index = bones.length;
    bones.push(b);
    bindings.push({ bone:b, name, rest:vec(end).sub(vec(start)).normalize() });
    return index;
  }
  const pelvis = bone('pelvis', point(0, .9), point(0, 1.11));
  const spine = bone('spine', point(0, 1.11), point(0, 1.36));
  const chest = bone('chest', point(0, 1.36), point(0, 1.52));
  const head = bone('head', point(0, 1.66), point(0, 1.81));

  // Lofted elliptical cross-sections give shoulders, ribcage, waist, thighs,
  // calves and jaw their own silhouettes. Adjacent rings share normals.
  function loft(cx, rings, boneWeights, materialAt, segments = 16) {
    rings = [...rings].sort((a, b) => a[0] - b[0]);
    const first = positions.length / 3;
    for (let r = 0; r < rings.length; r++) {
      const [y, rx, rz, cz = 0] = rings[r];
      const [a, b = a, weight = 0] = boneWeights(y);
      for (let k = 0; k < segments; k++) {
        const theta = k / segments * Math.PI * 2;
        positions.push(cx + rx * Math.cos(theta), y, cz + rz * Math.sin(theta));
        skinIndices.push(a, b, 0, 0);
        weights.push(1 - weight, weight, 0, 0);
      }
      if (!r) continue;
      const start = indices.length;
      for (let k = 0; k < segments; k++) {
        const a = first + (r - 1) * segments + k;
        const b = first + (r - 1) * segments + (k + 1) % segments;
        const c = first + r * segments + k;
        const d = first + r * segments + (k + 1) % segments;
        indices.push(a, c, b, b, c, d);
      }
      groups.push({ start, count:indices.length - start, material:materialAt((y + rings[r - 1][0]) / 2) });
    }
  }
  const blend = (y, pivot, range, a, b) => [a, b, Math.max(0, Math.min(1, (pivot + range - y) / (2 * range)))];
  loft(0, [[.82,.12,.105],[.9,.19,.13],[1,.18,.125],[1.06,.165,.115],[1.15,.18,.12],[1.28,.225,.14],[1.38,.245,.13],[1.44,.22,.12],[1.49,.12,.09],[1.52,.065,.065]],
    y => y < 1.2 ? blend(y,1.10,.10,spine,pelvis) : blend(y,1.30,.10,chest,spine), y => y < 1.025 ? 1 : 0);
  loft(0, [[1.48,.06,.06],[1.56,.063,.062],[1.59,.08,.07]], () => [head], () => 2);
  // Adult head (~1:7.5 height); jaw, cheek and cranium rather than a sphere.
  loft(0, [[1.53,.035,.05],[1.55,.068,.07],[1.59,.091,.085],[1.65,.102,.095],[1.72,.104,.091],[1.77,.084,.077],[1.80,.045,.048],[1.815,.001,.001]], () => [head], y => y > 1.745 ? 6 : 2, 20);

  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    const hip = bone(side + 'Hip', point(sign * .115,.9), point(sign * .115,.48));
    const knee = bone(side + 'Knee', point(sign * .115,.48), point(sign * .115,.06));
    loft(sign * .115, [[.90,.08,.10],[.84,.105,.115],[.73,.103,.103],[.64,.087,.09],[.54,.063,.07],[.48,.06,.061],[.43,.067,.07],[.35,.071,.075],[.25,.057,.061],[.14,.037,.043],[.06,.036,.039]],
      y => blend(y,.48,.065,hip,knee), y => y > .72 ? 1 : y > .44 ? 2 : 3);
    const shoulder = bone(side + 'Shoulder', point(sign * .235,1.36), point(sign * .235,1.06));
    const elbow = bone(side + 'Elbow', point(sign * .235,1.06), point(sign * .235,.78));
    loft(sign * .235, [[1.40,.055,.065],[1.36,.076,.075],[1.28,.072,.07],[1.20,.063,.065],[1.12,.046,.052],[1.06,.043,.045],[1,.05,.054],[.91,.045,.046],[.83,.032,.036],[.78,.03,.032]],
      y => blend(y,1.06,.055,shoulder,elbow), y => y > 1.19 ? 0 : 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Merge adjacent material groups to avoid a draw call per ring.
  const byMaterial = palette.map(() => []);
  for (const g of groups) byMaterial[g.material].push(...indices.slice(g.start, g.start + g.count));
  const ordered = [];
  byMaterial.forEach((list, material) => {
    if (list.length) geometry.addGroup(ordered.length, list.length, material);
    ordered.push(...list);
  });
  geometry.setIndex(ordered);
  const body = new THREE.SkinnedMesh(geometry, palette);
  body.castShadow = true;
  body.receiveShadow = true;
  body.frustumCulled = false;
  root.add(body);
  root.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(bones));

  const attachments = [];
  function detail(geometry, material, joint, offset, scale = null) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    if (scale) mesh.scale.set(...scale);
    root.add(mesh);
    attachments.push({ mesh, joint, offset });
    return mesh;
  }
  for (const side of ['left', 'right']) {
    detail(new THREE.SphereGeometry(1, 12, 8), boots, side + 'Ankle', point(0,-.025,.07), [.064,.055,.145]);
    detail(new THREE.SphereGeometry(1, 10, 8), gloves ?? skin, side + 'Wrist', point(0,-.015,.018), [gloves ? .065 : .045,.077,.032]);
  }
  // Deliberately restrained facial relief: no oversized dot eyes/toy hands.
  detail(new THREE.SphereGeometry(1, 8, 6), skin, 'head', point(0,-.015,.094), [.018,.027,.025]);
  for (const sign of [-1,1]) detail(new THREE.SphereGeometry(1,8,6), skin, 'head', point(sign*.103,0,0), [.018,.03,.022]);

  // Small generated kit number. Canvas is optional for headless mesh inspection.
  let numberTexture = null;
  let numberMaterial = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = shirt.color.getHSL({}).l > .55 ? '#17242b' : '#f6f4e9';
      context.font = 'bold 94px sans-serif'; context.textAlign = 'center';
      context.fillText(String(number),64,102);
      numberTexture = new THREE.CanvasTexture(canvas);
      numberTexture.colorSpace = THREE.SRGBColorSpace;
      numberMaterial = new THREE.MeshStandardMaterial({ map:numberTexture, transparent:true, roughness:1, depthWrite:false });
      const label = detail(new THREE.PlaneGeometry(.23,.25), numberMaterial, 'chest', point(0,-.09,-.148));
      label.userData.back = true;
    }
  }
  const nextJoint = { pelvis:'spine', spine:'chest', chest:'neck', head:'crown' };
  for (const side of ['left','right']) Object.assign(nextJoint, { [side+'Hip']:side+'Knee', [side+'Knee']:side+'Ankle', [side+'Shoulder']:side+'Elbow', [side+'Elbow']:side+'Wrist' });
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0,1,0);
  function pose(joints) {
    for (const binding of bindings) {
      const start = joints[binding.name], end = joints[nextJoint[binding.name]];
      binding.bone.position.copy(vec(start));
      direction.copy(vec(end)).sub(vec(start)).normalize();
      binding.bone.quaternion.setFromUnitVectors(binding.rest, direction);
    }
    const forward = joints.facing.z;
    for (const a of attachments) {
      a.mesh.position.copy(vec(joints[a.joint]));
      const offset = vec(a.offset); offset.z *= forward;
      if (a.joint === 'head' || a.joint === 'chest') {
        direction.copy(vec(joints.crown)).sub(vec(joints.pelvis)).normalize();
        a.mesh.quaternion.setFromUnitVectors(up, direction);
        offset.applyQuaternion(a.mesh.quaternion);
      } else a.mesh.quaternion.identity();
      a.mesh.position.add(offset);
      if (a.mesh.userData.back) a.mesh.rotateY(forward > 0 ? Math.PI : 0);
    }
    root.updateMatrixWorld(true);
    body.skeleton.update();
  }
  return { root, body, pose, dispose() { body.skeleton.dispose(); numberTexture?.dispose(); numberMaterial?.dispose(); } };
}
