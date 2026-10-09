import { FOOTBALL_PITCH } from '../../modules/matchFootball.js';

const { width:W, length:L }=FOOTBALL_PITCH;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

function pitchTexture() {
  const canvas=document.createElement('canvas');
  const resolution=9,pad=7;
  canvas.width=(W+pad*2)*resolution;canvas.height=(L+pad*2)*resolution;
  const ctx=canvas.getContext('2d');
  ctx.scale(resolution,resolution);ctx.translate(pad,pad);
  ctx.fillStyle='#101b18';ctx.fillRect(-pad,-pad,W+pad*2,L+pad*2);
  for(let row=-5;row<L+5;row+=1.1) {
    for(const x of [-4.8,-3.5,W+3.5,W+4.8]) {
      const shade=Math.floor((row*17+x*23)%5);
      ctx.fillStyle=['#40574c','#728268','#516663','#34483f','#788b75'][Math.abs(shade)];
      ctx.fillRect(x,row,.65,.5);
    }
  }
  for(let y=0;y<L;y+=10.5) {
    ctx.fillStyle=Math.round(y/10.5)%2 ? '#205c43' : '#24654a';
    ctx.fillRect(0,y,W,10.5);
  }
  // Fine mowing texture is baked once instead of redrawn every frame.
  for(let x=0;x<W;x+=.55) { ctx.fillStyle='rgba(15,48,32,.05)';ctx.fillRect(x,0,.14,L); }
  const light=ctx.createLinearGradient(0,0,W,L);light.addColorStop(0,'rgba(155,202,138,.10)');light.addColorStop(1,'rgba(0,12,6,.18)');
  ctx.fillStyle=light;ctx.fillRect(0,0,W,L);
  ctx.strokeStyle='rgba(232,244,222,.73)';ctx.lineWidth=.13;
  ctx.strokeRect(0,0,W,L);ctx.beginPath();ctx.moveTo(0,L/2);ctx.lineTo(W,L/2);ctx.stroke();
  ctx.beginPath();ctx.arc(W/2,L/2,9.15,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='rgba(245,248,230,.88)';ctx.beginPath();ctx.arc(W/2,L/2,.16,0,Math.PI*2);ctx.fill();
  for(const top of [true,false]) {
    const y=top ? 0 : L,sign=top ? 1 : -1;
    ctx.strokeRect((W-40.32)/2,top ? 0 : L-16.5,40.32,16.5);
    ctx.strokeRect((W-18.32)/2,top ? 0 : L-5.5,18.32,5.5);
    ctx.beginPath();ctx.arc(W/2,y+sign*11,.16,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(W/2,y+sign*11,9.15,top ? .64 : Math.PI+.64,top ? Math.PI-.64 : Math.PI*2-.64);ctx.stroke();
    ctx.fillStyle='rgba(155,169,161,.17)';ctx.fillRect((W-7.32)/2,top ? -2.1 : L,7.32,2.1);
    ctx.strokeStyle='rgba(237,242,232,.85)';ctx.lineWidth=.2;ctx.strokeRect((W-7.32)/2,top ? -2.1 : L,7.32,2.1);
    ctx.strokeStyle='rgba(204,219,207,.3)';ctx.lineWidth=.055;
    for(let x=(W-7.32)/2;x<(W+7.32)/2;x+=.4) {ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-sign*2.1);ctx.stroke();}
    ctx.strokeStyle='rgba(232,244,222,.73)';ctx.lineWidth=.13;
    for(const x of [0,W]) {ctx.beginPath();ctx.arc(x,y,1,top ? (x===0?0:Math.PI/2) : (x===0?Math.PI*1.5:Math.PI),top ? (x===0?Math.PI/2:Math.PI) : (x===0?Math.PI*2:Math.PI*1.5));ctx.stroke();}
  }
  return {canvas,pad};
}

function drawPlayer(ctx,p,kit,scale,reducedMotion,cameraRotation) {
  ctx.save();ctx.translate(p.x,p.y);
  const radius=clamp(7/scale,.65,1.15);
  ctx.fillStyle='rgba(0,10,5,.32)';ctx.beginPath();ctx.ellipse(.35,.5,radius*1.1,radius*.54,0,0,Math.PI*2);ctx.fill();
  if(p.owner||p.receiving) {
    ctx.strokeStyle=p.owner ? 'rgba(255,240,171,.75)' : 'rgba(218,238,223,.28)';ctx.lineWidth=.12;
    ctx.beginPath();ctx.ellipse(0,.25,radius*1.38,radius*.9,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.save();ctx.rotate(p.facing);
  if(p.pose==='dive'||p.pose==='fall') {ctx.rotate(.9);ctx.scale(1.28,.68);}
  const gait=reducedMotion ? 0 : Math.sin(p.stride)*Math.min(.32,p.speed*.045);
  ctx.fillStyle='#18231d';
  ctx.fillRect(-radius*.48,radius*.34+gait,radius*.36,radius*.55);
  ctx.fillRect(radius*.12,radius*.34-gait,radius*.36,radius*.55);
  ctx.fillStyle=kit.color;ctx.strokeStyle='rgba(0,0,0,.38)';ctx.lineWidth=.09;
  ctx.beginPath();ctx.ellipse(0,0,radius*.8,radius*.64,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=kit.color;ctx.beginPath();ctx.ellipse(-radius*.88,.03-gait*.4,radius*.28,radius*.45,-.2,0,Math.PI*2);ctx.ellipse(radius*.88,.03+gait*.4,radius*.28,radius*.45,.2,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#c5a081';ctx.beginPath();ctx.arc(0,-radius*.63,radius*.34,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#30271e';ctx.beginPath();ctx.arc(0,-radius*.68,radius*.3,Math.PI,0);ctx.fill();
  ctx.restore();
  // Number identity stays upright and legible as the body turns.
  ctx.rotate(-cameraRotation);
  ctx.font=`700 ${clamp(8/scale,.65,1.3)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=kit.numberColor;
  ctx.fillText(String(p.shirt),0,.13);
  ctx.restore();
}

/** One Canvas2D draw per rAF; cached turf, no marker DOM/layout on hot path. */
export function createFootballRenderer(canvas) {
  const ctx=canvas.getContext('2d',{alpha:false});
  const texture=pitchTexture();
  let width=1,height=1,dpr=1,lastAt=0,lastFrame=null;
  let camera={x:34,y:52.5,scale:1,initial:true};
  let options={view:'broadcast',reducedMotion:false,kits:{home:{color:'#eceee8',numberColor:'#172a20'},away:{color:'#d8bf42',numberColor:'#172a20'}}};
  function resize() {
    const rect=canvas.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
    dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    camera.initial=true;
    if(lastFrame)draw(lastFrame,window.performance.now());
  }
  const observer=new window.ResizeObserver(resize);observer.observe(canvas);resize();
  function draw(frame,now=window.performance.now()) {
    lastFrame=frame;
    if(!frame||width<2||height<2)return;
    const dt=clamp((now-lastAt)/1000,0,.06);lastAt=now;
    const landscape=width>height*1.25;
    const base=Math.min((width-24)/(landscape?L:W),(height-24)/(landscape?W:L));
    const overview=options.view==='tactical'||options.reducedMotion||['kickoff','restart','half-time','goal'].includes(frame.mode);
    const targetScale=base*(overview?1:landscape?1.45:1.30);
    const halfX=(landscape?height:width)/targetScale/2;
    const halfY=(landscape?width:height)/targetScale/2;
    const targetX=overview?34:clamp(frame.ball.x,Math.min(34,halfX),Math.max(34,W-halfX));
    const targetY=overview?52.5:clamp(frame.ball.y,Math.min(52.5,halfY),Math.max(52.5,L-halfY));
    const blend=1-Math.exp(-dt*4.8);
    if(camera.initial||options.reducedMotion) {camera={x:targetX,y:targetY,scale:targetScale,initial:false};}
    else {camera.x+=(targetX-camera.x)*blend;camera.y+=(targetY-camera.y)*blend;camera.scale+=(targetScale-camera.scale)*blend;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0e1b16';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.translate(width/2,height/2);if(landscape)ctx.rotate(-Math.PI/2);
    ctx.scale(camera.scale,camera.scale);ctx.translate(-camera.x,-camera.y);
    ctx.drawImage(texture.canvas,-texture.pad,-texture.pad,W+texture.pad*2,L+texture.pad*2);
    const order=[...frame.markers].sort((a,b)=>a.y-b.y);
    for(const p of order) {
      const kit=p.position==='GK' ? {color:p.team==='home'?'#69b6c4':'#cf87af',numberColor:'#15221d'} : options.kits[p.team];
      drawPlayer(ctx,p,kit,camera.scale,options.reducedMotion,landscape?-Math.PI/2:0);
    }
    const ball=frame.ball;
    if(!ball.hidden) {
      const radius=clamp(2.2/camera.scale,.17,.35);
      ctx.fillStyle='rgba(0,10,4,.45)';ctx.beginPath();ctx.ellipse(ball.x+.18,ball.y+.22,radius*1.5,radius*.75,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#f9faf2';ctx.strokeStyle='#26342a';ctx.lineWidth=.055;ctx.beginPath();ctx.arc(ball.x,ball.y-ball.z*.65,radius*(1+ball.z*.025),0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#2b3b2c';ctx.beginPath();ctx.arc(ball.x+.025,ball.y-ball.z*.65,radius*.33,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
    // A small locator shows the complete shape while the broadcast follows play.
    if(!overview)drawLocator(frame,landscape);
  }
  function drawLocator(frame,landscape) {
    const miniW=landscape?88:48,miniH=landscape?57:74,x=width-miniW-12,y=12;
    ctx.save();ctx.fillStyle='rgba(6,21,15,.73)';ctx.fillRect(x-5,y-5,miniW+10,miniH+10);ctx.strokeStyle='rgba(209,229,213,.35)';ctx.lineWidth=.6;ctx.strokeRect(x,y,miniW,miniH);
    const location=p=>landscape?{x:x+p.y/L*miniW,y:y+(W-p.x)/W*miniH}:{x:x+p.x/W*miniW,y:y+p.y/L*miniH};
    for(const p of frame.markers){const at=location(p);ctx.fillStyle=options.kits[p.team].color;ctx.beginPath();ctx.arc(at.x,at.y,1.25,0,Math.PI*2);ctx.fill();}
    const at=location(frame.ball);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(at.x,at.y,1.5,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  return {draw,setOptions(next){if(next.view&&next.view!==options.view)camera.initial=true;options={...options,...next};if(lastFrame)draw(lastFrame,window.performance.now());},destroy(){observer.disconnect();},resize};
}
