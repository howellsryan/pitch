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
  // A compact three-sided ground: all seats and spectators are instanced.
  // Fixed arithmetic gives repeatable variation without touching match RNG.
  box(48,1.05,.25,0,.525,-4.6,boardMat);
  for (const side of [-1, 1]) box(.25,1.05,42,side*24,.525,15,boardMat);
  const rows=12, columns=90;
  for(let row=0;row<rows;row++) box(48,.42,1.05,0,.65+row*.48,-6-row*1.05,standMat);
  const seats=new THREE.InstancedMesh(new THREE.BoxGeometry(.33,.30,.34),seatMat,rows*columns);
  const crowdMaterial=material({color:0xffffff,roughness:1});
  const crowd=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.105,.19,2,5),crowdMaterial,rows*columns);
  const transform=new THREE.Matrix4();
  const colors=[0x263b45,0xb3b9ae,0x706c60,0x334c41,0x9d5551,0x4d657d];
  for(let row=0;row<rows;row++)for(let i=0;i<columns;i++) {
    const id=row*columns+i, aisle=i%18===0;
    const x=-23+i*.52,y=.98+row*.48,z=-6-row*1.05;
    transform.makeTranslation(x,y,z);
    seats.setMatrixAt(id,transform);
    // Aisles remain visibly empty; crowd instances hidden below the ground.
    transform.makeTranslation(x,aisle?-2:y+.31,z+.02);
    crowd.setMatrixAt(id,transform);
    crowd.setColorAt(id,new THREE.Color(colors[(i*7+row*13)%colors.length]));
  }
  root.add(seats,crowd);
  const roofMat=material({color:0x25353e,roughness:.78,metalness:.25});
  const fascia=material({color:0xe3e6dc,roughness:.8});
  const lamp=material({color:0xfaf2d8,emissive:0xffedc7,emissiveIntensity:1.4});
  box(50,.22,12,0,7.8,-11.5,roofMat);
  box(50,.55,.18,0,7.6,-5.6,fascia);
  for(const x of [-22,-11,0,11,22]) {
    box(.16,7,.16,x,3.5,-16.8,roofMat);
    box(2.2,.16,.35,x,7.28,-5.8,lamp);
  }
  // Side wings frame the goal without crowding the aiming surface.
  for(const side of [-1,1]) {
    for(let row=0;row<6;row++) box(1.1,.42,28,side*(25+row*1.1),.65+row*.48,10,standMat);
    box(8,.2,30,side*28,4.5,10,roofMat);
  }
  // Original signage is baked once; no per-frame canvas uploads.
  if(typeof document !== 'undefined') {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=64;
    const context=canvas.getContext('2d');
    if(context) {
      context.fillStyle='#172b2b';context.fillRect(0,0,1024,64);
      context.fillStyle='#e3e6dc';context.font='600 27px sans-serif';context.textAlign='center';
      for(let i=0;i<4;i++)context.fillText('P I T C H',128+i*256,43);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const sign=material({map:texture,roughness:1});
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(42,.88),sign);
      panel.position.set(0,.56,-4.44);root.add(panel);
      owned.push(texture);
    }
  }
  // The penalty arc is the part of a 9.15 m circle outside the penalty area.
  const arc=[];
  const angle=Math.acos(5.5/9.15);
  for(let i=0;i<48;i++)for(const t of [i/48,(i+1)/48]) {
    const theta=-angle+t*angle*2;
    arc.push(Math.sin(theta)*9.15,.014,11+Math.cos(theta)*9.15);
  }
  const arcGeometry=new THREE.BufferGeometry();
  arcGeometry.setAttribute('position',new THREE.Float32BufferAttribute(arc,3));
  const arcMaterial=new THREE.LineBasicMaterial({color:0xe8f1e9});owned.push(arcMaterial);
  root.add(new THREE.LineSegments(arcGeometry,arcMaterial));
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
