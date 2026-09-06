// Generated ground, regulation markings and net. No external visual assets.
export function framePlayableCamera(camera, world, aspect) {
  if (!world) return;
  camera.aspect = aspect;
  camera.fov = 43;
  // Fit goal width horizontally on portrait screens and retain the striker's
  // feet vertically. Camera is fixed during input/reveal so aiming cannot drift.
  const distance = Math.max(world.distance + 6.4, 5.0 / (Math.tan(43 * Math.PI / 360) * aspect));
  camera.position.set(world.shooter.x * .22 + .65, 3.9, distance);
  camera.lookAt(0, .95, Math.max(1, world.distance * .27));
  camera.updateProjectionMatrix();
}

export function createPlayableFootballStage(THREE, parent, world, materials) {
  const root = new THREE.Group();
  parent.add(root);
  const owned = [];
  function material(options) { const m = new THREE.MeshStandardMaterial(options); owned.push(m); return m; }
  const turfA = material({ color:0x397345, roughness:1 });
  const turfB = material({ color:0x427e4c, roughness:1 });
  const boardMat = material({ color:0x233840, roughness:.9 });
  const standMat = material({ color:0x455961, roughness:.95 });
  const seatMat = material({ color:0x75878b, roughness:.8 });
  function box(w,h,d,x,y,z,mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    mesh.position.set(x,y,z); mesh.receiveShadow=true;
    root.add(mesh); return mesh;
  }
  const length = Math.max(42,world.distance+18);
  for(let z=-8; z<length; z+=3) box(48,.06,3,0,-.035,z+1.5,(Math.round((z+8)/3)%2) ? turfA : turfB);
  const line = (w,d,x,z) => box(w,.008,d,x,.005,z,materials.line);
  line(44,.10,0,0);
  for(const [width,depth] of [[18.32,5.5],[40.32,16.5]]) {
    line(width,.10,0,depth);
    line(.10,depth,-width/2,depth/2); line(.10,depth,width/2,depth/2);
  }
  const spot = new THREE.Mesh(new THREE.CircleGeometry(.10,16),materials.line);
  spot.rotation.x=-Math.PI/2; spot.position.set(0,.012,11);root.add(spot);
  // Box edges and goal tubes provide depth cues at ball/foot scale.
  function tube(a,b,r=.055) {
    const from=new THREE.Vector3(...a), to=new THREE.Vector3(...b);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,from.distanceTo(to),12),materials.goal);
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());
    mesh.castShadow=true;root.add(mesh);
  }
  const half=world.goalWidth/2,h=world.goalHeight,depth=1.8;
  for(const side of [-1,1]) {
    tube([side*half,0,0],[side*half,h,0]);
    tube([side*half,h,0],[side*half,h*.88,-depth],.026);
    tube([side*half,h*.88,-depth],[side*half,0,-depth],.026);
    tube([side*half,0,-depth],[side*half,0,0],.026);
  }
  tube([-half,h,0],[half,h,0]);
  const netPositions=[];
  const segment=(a,b)=>netPositions.push(...a,...b);
  for(let x=-half; x<=half+.001; x+=.18) {
    segment([x,0,-depth],[x,h*.88,-depth]);
    segment([x,h*.88,-depth],[x,h,0]);
  }
  for(let y=0;y<=h*.88;y+=.18) {
    segment([-half,y,-depth],[half,y,-depth]);
    for(const side of [-1,1]) segment([side*half,y,0],[side*half,y,-depth]);
  }
  for(let z=-depth;z<=0;z+=.18) {
    const height=h*(1+.12*z/depth);
    segment([-half,height,z],[half,height,z]);
    for(const side of [-1,1])segment([side*half,0,z],[side*half,height,z]);
  }
  const netGeometry=new THREE.BufferGeometry();
  netGeometry.setAttribute('position',new THREE.Float32BufferAttribute(netPositions,3));
  const netMaterial=new THREE.LineBasicMaterial({color:0xe3e5dc,transparent:true,opacity:.48});
  owned.push(netMaterial);root.add(new THREE.LineSegments(netGeometry,netMaterial));
  // Restrained stadium backdrop, bounded instances instead of crowd meshes.
  box(48,1.05,.25,0,.525,-4.6,boardMat);
  for(let row=0;row<5;row++) box(48,.42,1.2,0,.65+row*.48,-6-row*1.2,standMat);
  const seats=new THREE.InstancedMesh(new THREE.BoxGeometry(.33,.30,.34),seatMat,5*90);
  const transform=new THREE.Matrix4();
  for(let row=0;row<5;row++)for(let i=0;i<90;i++) {
    transform.makeTranslation(-23+i*.52,.98+row*.48,-6-row*1.2);
    seats.setMatrixAt(row*90+i,transform);
  }
  root.add(seats);
  const original=Float32Array.from(netPositions);
  return {
    root,
    update(frame) {
      const attribute=netGeometry.attributes.position;
      const pulse=frame.outcome==='goal' ? Math.sin(Math.min(1,Math.max(0,(frame.progress-.82)/.18))*Math.PI)*.22 : 0;
      for(let i=0;i<attribute.count;i++) {
        const x=original[i*3], y=original[i*3+1], z=original[i*3+2];
        const falloff=Math.exp(-((x-frame.ball.x)**2+(y-frame.ball.y)**2)*1.4);
        attribute.array[i*3+2]=z-pulse*falloff;
      }
      attribute.needsUpdate=true;
    },
    dispose() { root.traverse(o=>o.geometry?.dispose());owned.forEach(m=>m.dispose());parent.remove(root); },
  };
}
