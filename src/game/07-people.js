// Six City — people. One of the game's modules; they load in numbered order (src/game/index.js).
import './06-cars.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { __gs, __late, later } from './shared.js';
import { EDGES, NODES, PI, abs, atan2, camera, cos, cv, exp, floor, groundH, hypot, lerp, max, min, rnd, rpick, scene, sin, stage, wrap } from './01-core.js';
import { night } from './02-sky.js';
import { ONE, PO, _e, _q, _v, edgePt, nearestEdge, nodesNear, pushOut, solidAt, walkable } from './04-world.js';
import { garageSpots } from './05-landmarks.js';
later({peds:()=>peds}); // for earlier modules, read when called

/* ============================== pedestrians ============================== */
const NPED=38,NCOP=8;
const SKIN=[0xf1c7a4,0xd9a57e,0xb07a52,0x7c5236,0x5a3a26,0xe8b894],SHIRT=[0xd9d9d9,0x2b2f3a,0x9c2f2f,0x2f5d9c,0x3b7d4f,0xd8b23a,0x7a4a8c,0x1c1c1e,0xc76b3a,0x5f8fa8],PANTS=[0x1d2430,0x2a2a2c,0x3b4a66,0x4a3f33,0x55585e,0x1a1a1a];
const HAIRC=[0x1a1410,0x1a1410,0x3b2618,0x6b4423,0xc9a24a,0x8a2f1e,0xf2f2f2,0xff7eb6,0x6fd6e8,0x9b6bff,0x2e3a8c],JACKET=[0xf4efe6,0x20242c,0xff5a6e,0x36c9c0,0xffc93c,0x7c5cff,0x2f6bff,0xe98ac0],ACCENT=[0xff5c7a,0x3df2d0,0xffe14d,0xb48cff,0xffffff,0xff9a3d],SHOE=[0xffffff,0xffffff,0x1b1b1f,0xff8fb3,0xd8362f,0x38c8c0];
const P_MAX=NPED+1+NCOP,PIMS=[];
function pim(geo,mat,per,shadow){const im=new THREE.InstancedMesh(geo,mat,P_MAX*(per||1));im.count=0;im.n=0;im.frustumCulled=false;im.castShadow=shadow!==false;im.receiveShadow=true;scene.add(im);PIMS.push(im);return im;}
const put=(im,m,col)=>{im.setMatrixAt(im.n,m);if(col)im.setColorAt(im.n,col);im.n++;};
const V2=(x,y)=>new THREE.Vector2(x,y);
const tint=(g,c)=>{const n=g.attributes.position.count,a=new Float32Array(n*3);for(let k=0;k<n;k++)a.set(c,k*3);g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;};
// smooth tapered limb, pivot at the top (y=0), hanging down -y
function limbGeo(r0,r1,len){const pts=[];for(let k=0;k<=5;k++){const a=k/5*PI/2;pts.push(V2(max(1e-4,r1*sin(a)),-len-r1*cos(a)));}
  pts.push(V2(lerp(r1,r0,.5)*1.04,-len*.5));for(let k=0;k<=5;k++){const a=k/5*PI/2;pts.push(V2(max(1e-4,r0*cos(a)),r0*sin(a)));}return new THREE.LatheGeometry(pts,14);}
const TORSO=[[1e-4,.8],[.09,.805],[.15,.85],[.168,.93],[.15,1.0],[.132,1.08],[.142,1.17],[.168,1.28],[.176,1.36],[.165,1.42],[.12,1.462],[.06,1.482],[1e-4,1.486]];
const skinMat=new THREE.MeshStandardMaterial({roughness:.55}),clothMat=new THREE.MeshStandardMaterial({roughness:.8}),hairMat=new THREE.MeshStandardMaterial({roughness:.38}),
  vcMat=new THREE.MeshStandardMaterial({roughness:.5,vertexColors:true}),faceMat=new THREE.MeshStandardMaterial({roughness:.25,vertexColors:true});
const torsoIM=(()=>{const g=new THREE.LatheGeometry(TORSO.map(q=>V2(q[0],q[1])),28).scale(1,1,.68);g.computeVertexNormals();return pim(g,clothMat);})();
const hipsIM=(()=>{const g=new THREE.LatheGeometry(TORSO.filter(q=>q[1]<=1.0).map(q=>V2(q[0]+(q[0]>.01?.006:0),q[1])),28).scale(1,1,.7);g.computeVertexNormals();return pim(g,clothMat);})();
const jacketIM=(()=>{const pr=TORSO.filter(q=>q[1]>1.05&&q[1]<1.45).map(q=>V2(q[0]+.02,q[1]));pr.unshift(V2(.175,1.04));
  const g=new THREE.LatheGeometry(pr,26,.42,2*PI-.84).scale(1,1,.72);g.computeVertexNormals();
  const collar=new THREE.TorusGeometry(.085,.024,8,22).rotateX(PI/2).scale(1,1,.85).translate(0,1.455,-.005);
  const hem=new THREE.TorusGeometry(.172,.016,6,26,2*PI-.9).rotateX(-PI/2).rotateY(PI/2+.45).scale(1,1,.72).translate(0,1.045,0);
  return pim(mergeGeometries([g,collar,hem]),new THREE.MeshStandardMaterial({roughness:.6,side:THREE.DoubleSide}));})();
const beltIM=(()=>{const b=new THREE.TorusGeometry(.158,.02,8,26).rotateX(PI/2).scale(1,1.3,.7).translate(0,.965,0);
  const pouch=new THREE.CapsuleGeometry(.035,.05,4,10).translate(.135,.9,.07),buckle=new THREE.BoxGeometry(.05,.04,.02).translate(0,.965,.112),strap=new THREE.TorusGeometry(.2,.014,6,26).rotateY(PI/2).rotateZ(.75).scale(.95,1,.66).translate(0,1.24,0);
  return pim(mergeGeometries([b,pouch,buckle,strap]),new THREE.MeshStandardMaterial({roughness:.4,metalness:.2}),1,false);})();
const headIM=(()=>{const h=new THREE.SphereGeometry(.15,30,22).scale(.95,1.05,1),p=h.attributes.position;
  for(let k=0;k<p.count;k++){const y=p.getY(k);if(y<0){const f=1-.2*(y/.157)**2;p.setX(k,p.getX(k)*f);p.setZ(k,p.getZ(k)*(1-.1*(y/.157)**2));}}
  h.computeVertexNormals();
  const parts=[h,new THREE.CylinderGeometry(.048,.055,.14,14).translate(0,-.19,-.01),new THREE.SphereGeometry(.014,8,6).translate(0,-.022,.147)];
  for(const sx of[1,-1])parts.push(new THREE.SphereGeometry(.032,10,8).scale(.45,1,.75).translate(sx*.14,-.012,-.005));
  return pim(mergeGeometries(parts),skinMat);})();
function faceGeo(iris){const P=[],add=(g,c)=>P.push(tint(g,c));
  for(const sx of[1,-1]){
    add(new THREE.SphereGeometry(.036,16,12).scale(.82,1.18,.3).translate(sx*.056,0,.1335),[.96,.96,.98]);
    add(new THREE.SphereGeometry(.027,16,12).scale(.9,1.15,.3).translate(sx*.055,-.003,.139),iris);
    add(new THREE.SphereGeometry(.015,12,8).scale(1,1.2,.3).translate(sx*.055,-.004,.1445),[.015,.015,.025]);
    add(new THREE.SphereGeometry(.0085,8,6).scale(1,1,.4).translate(sx*.055+.012,.016,.148),[6,6,6]);
    add(new THREE.SphereGeometry(.004,6,5).scale(1,1,.4).translate(sx*.055-.01,-.018,.148),[4,4,4]);
    add(new THREE.TorusGeometry(.034,.0045,5,12,PI*.8).rotateZ(PI*.1).scale(.85,1.15,.5).translate(sx*.056,.004,.137),[.05,.035,.03]);
    add(new THREE.BoxGeometry(.05,.008,.012).rotateZ(sx*-.14).translate(sx*.057,.066,.125),[.12,.08,.06]);
    add(new THREE.SphereGeometry(.027,12,8).scale(1,.55,.2).translate(sx*.09,-.042,.106),[1,.42,.45]);
  }
  add(new THREE.TorusGeometry(.016,.004,5,10,PI*.7).rotateZ(PI*1.15).scale(1,.7,.6).translate(0,-.058,.131),[.4,.1,.12]);
  return mergeGeometries(P);}
const faceIM=[[.25,.13,.07],[.12,.42,.75],[.14,.5,.32],[.5,.28,.7]].map(c=>pim(faceGeo(c),faceMat,1,false));
const hairIM=(()=>{const S=(r,x,y,z,sx,sy,sz)=>new THREE.SphereGeometry(r,16,12).scale(sx||1,sy||1,sz||1).translate(x,y,z);
  const cap=()=>new THREE.SphereGeometry(.16,26,16,0,2*PI,0,PI*.62).scale(1,1.03,1.02).translate(0,.022,-.022);
  const bob=()=>new THREE.SphereGeometry(.167,26,18,0,2*PI,0,PI*.8).scale(1,1.12,1).translate(0,.0,-.03);
  const bangs=()=>[S(.05,-.07,.088,.105,1,.75,.6),S(.055,0,.098,.118,1.1,.7,.55),S(.05,.07,.088,.105,1,.75,.6),S(.04,-.125,.03,.05,.5,1.3,.8),S(.04,.125,.03,.05,.5,1.3,.8)];
  const tail=limbGeo(.05,.018,.3).rotateX(-.5).translate(0,.05,-.2);
  const G=[
    [cap(),S(.06,-.04,.1,.1,1.2,.6,.6),S(.06,.05,.105,.1,1.2,.6,.6)],
    [bob(),...bangs()],
    [cap(),...bangs(),S(.055,0,.07,-.175),tail],
    [cap(),...bangs(),S(.068,.115,.15,-.03),S(.068,-.115,.15,-.03)],
    [bob(),...bangs(),new THREE.CapsuleGeometry(.12,.3,6,16).scale(1.2,1,.45).translate(0,-.22,-.105)]];
  return G.map(g=>pim(mergeGeometries(g),hairMat));})();
const thighIM=pim(limbGeo(.08,.058,.4),clothMat,2),shinIM=pim(limbGeo(.057,.04,.38),clothMat,2),uarmIM=pim(limbGeo(.053,.044,.26),clothMat,2),farmIM=pim(limbGeo(.044,.034,.25),clothMat,2);
const handIM=pim(new THREE.SphereGeometry(.046,12,10).scale(.75,1.2,1).translate(0,-.03,0),skinMat,2);
const shoeIM=(()=>{const up=tint(new THREE.CapsuleGeometry(.056,.12,5,12).rotateX(PI/2).scale(1,.85,1).translate(0,.062,.045),[1,1,1]),
  toe=tint(new THREE.SphereGeometry(.058,12,8).scale(1,.7,1).translate(0,.05,.11),[1,1,1]),
  sole=tint(new THREE.CapsuleGeometry(.062,.13,4,12).rotateX(PI/2).scale(1.06,.32,1.04).translate(0,.02,.048),[2.6,2.6,2.6]);
  return pim(mergeGeometries([up,toe,sole]).translate(0,-.115,0),vcMat,2);})();

const peds=[];
function mkPed(x,z){const p={x,z,y:groundH(x,z),th:0,phase:rnd()*6,amp:0,lie:0,hp:100,state:'walk',timer:0,vx:0,vz:0,vy:0,walk:1.2+rnd()*.6,tx:x,tz:z,wp:null,prev:null,hidden:false,
  skin:new THREE.Color(rpick(SKIN)),shirt:new THREE.Color(rpick(SHIRT)),pants:new THREE.Color(rpick(PANTS)),hairC:new THREE.Color(rpick(HAIRC)),hair:floor(rnd()*5),face:floor(rnd()*4),
  jacket:rnd()<.6?new THREE.Color(rpick(JACKET)):null,accent:new THREE.Color(rpick(ACCENT)),shoe:new THREE.Color(rpick(SHOE)),sc:.93+rnd()*.11,
  male:rnd()<.5,tone:rnd()<.6?1:0,tint:.8+rnd()*.25,sleeve:rpick([.03,.3,.3,.55,.97,.97]),crop:false,shorts:rnd()<.3?1:0,beard:rnd()<.35,rig:null};
  if(p.tone)p.tint+=.15;if(!p.male){p.crop=rnd()<.35;if(rnd()<.2)p.shorts=2;}
  const r=rnd();p.shin=r<.5?p.pants:r<.75?p.skin:new THREE.Color(rnd()<.5?0xf0f0f0:0x18181c);p.fore=rnd()<.5?p.skin:null;peds.push(p);return p;}
/* pedestrians walk along the sidewalks of the real street graph */
const _pp={x:0,z:0,tx:0,tz:0};
const sideOff=e=>e.hw+1.7;
function pedPos(p,o){const e=p.e,sab=p.dir>0?p.s:e.L-p.s;edgePt(e,sab,o);const r=sideOff(e)*p.side;o.x+=-o.tz*r;o.z+=o.tx*r;if(p.dir<0){o.tx=-o.tx;o.tz=-o.tz;}return o;}
function pedNext(p){
  const e=p.e,N=NODES[p.dir>0?e.b:e.a];let opts=N.e.map(i=>EDGES[i]).filter(x=>x!==e);if(!opts.length)opts=[e];
  const ne=rpick(opts),nd=ne.a===N.i?1:-1,s0=min(N.trim,ne.L*.5);let best=1,bd=1e9;
  for(const sd of[1,-1]){pedPos({e:ne,dir:nd,s:s0,side:sd},_pp);const d=hypot(_pp.x-p.x,_pp.z-p.z);if(d<bd){bd=d;best=sd;}}
  p.e=ne;p.dir=nd;p.side=rnd()<.75?best:-best;p.s=s0;pedPos(p,_pp);p.tx=_pp.x;p.tz=_pp.z;p.mode='cross';
}
function attachPed(p){
  const r=nearestEdge(p.x,p.z,60);if(!r)return false;
  p.e=r.e;p.dir=rnd()<.5?1:-1;p.s=p.dir>0?r.s:r.e.L-r.s;
  p.side=((p.x-r.x)*-r.tz+(p.z-r.z)*r.tx)>=0?1:-1;
  pedPos(p,_pp);p.tx=_pp.x;p.tz=_pp.z;p.mode='cross';return true;
}
function placePed(p,minD,maxD){
  if(p.copPed)return false;
  const cand=nodesNear(__gs.FX,__gs.FZ,maxD).filter(n=>hypot(n.x-__gs.FX,n.z-__gs.FZ)>=minD&&n.e.length);
  for(let t=0;t<10&&cand.length;t++){
    const n=rpick(cand),e=EDGES[rpick(n.e)];
    p.e=e;p.dir=rnd()<.5?1:-1;p.side=rnd()<.5?1:-1;p.s=rnd()*e.L;pedPos(p,_pp);
    if(!walkable(_pp.x,_pp.z)||solidAt(_pp.x,1,_pp.z))continue;
    p.x=_pp.x;p.z=_pp.z;p.y=0;p.th=atan2(_pp.tx,_pp.tz);p.state='walk';p.mode='walk';p.lie=0;p.hp=100;p.bled=false;p.vx=p.vz=p.vy=0;p.robbed=0;p.fb=1;p.pt=null;p.spinV=0;p.rs=rnd();p.tough=rnd()<(p.male?.28:.1);return true;
  }
  return false;
}
function stepPed(p,dt){
  if(p.copPed){if(!p.hidden)__late.stepCop(p,dt);return;}
  if(p.ins&&__late.stepInPed(p,dt))return;
  if(p.state==='dead'){ // stays where it fell until you're far away
    p.vy-=20*dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;if(p.y>.05)p.th+=(p.spinV||0)*dt; // tumbles while airborneif(pushOut(p.x,p.z,.4)){p.x=PO.x;p.z=PO.z;p.vx*=.3;p.vz*=.3;}
    if(p.y<=0){p.y=0;p.vy=0;const k=exp(-6*dt);p.vx*=k;p.vz*=k;if(!p.bled&&p.lie>1.3){p.bled=true;__late.bloodAt(p.x-sin(p.th)*.7,p.z-cos(p.th)*.7,.7+rnd()*.5);}}
    p.lie=min(PI/2,p.lie+dt*6);p.amp=0;return;}
  if(p.gang&&p.state!=='down'){__late.stepGang(p,dt);return;}
  if(p.actor&&p.state!=='down'){__late.stepActor(p,dt);return;}
  if(p.talking){p.th+=wrap(atan2(__late.player.x-p.x,__late.player.z-p.z)-p.th)*min(1,dt*6);p.amp*=.85;return;}
  if(!p.e&&!attachPed(p))return;
  if(p.state==='down'){
    p.vy-=20*dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;if(p.y>.05)p.th+=(p.spinV||0)*dt;
    if(pushOut(p.x,p.z,.4)){p.x=PO.x;p.z=PO.z;p.vx*=.3;p.vz*=.3;}
    if(p.y<=0){p.y=0;p.vy=0;const k=exp(-5*dt);p.vx*=k;p.vz*=k;}
    p.lie=min(PI/2,p.lie+dt*7);p.amp=0;p.timer-=dt;
    if(p.timer<=0){ // the tough ones get back up swinging
      if(p.tough&&!__late.G.car&&!__late.player.hidden&&__late.ARM.w===0&&p.hp>40&&hypot(__late.player.x-p.x,__late.player.z-p.z)<12){p.state='fight';p.timer=15;p.hitCd=.8;}else{p.state='flee';p.timer=9;}attachPed(p);}
    return;
  }
  if((p.state==='cower'||p.state==='hands'||p.state==='chat'||p.state==='fight')&&stepReact(p,dt))return;
  p.lie=max(0,p.lie-dt*3);
  let sp=p.walk;if(p.state==='flee'){sp=5.4;p.timer-=dt;if(p.timer<=0)p.state='walk';}
  if(p.mode==='cross'){
    const dx=p.tx-p.x,dz=p.tz-p.z,d=hypot(dx,dz);
    if(d<.6)p.mode='walk';else{p.th+=wrap(atan2(dx,dz)-p.th)*min(1,dt*8);p.x+=dx/d*sp*dt;p.z+=dz/d*sp*dt;}
  }else{
    p.s+=sp*dt;const N=NODES[p.dir>0?p.e.b:p.e.a];
    if(p.s>=p.e.L-min(N.trim,p.e.L*.5))pedNext(p);
    else{pedPos(p,_pp);const dx=_pp.x-p.x,dz=_pp.z-p.z,d=hypot(dx,dz);
      if(d>3){p.mode='cross';p.tx=_pp.x;p.tz=_pp.z;}else{p.x=_pp.x;p.z=_pp.z;p.th+=wrap(atan2(_pp.tx,_pp.tz)-p.th)*min(1,dt*8);}}
  }
  if(pushOut(p.x,p.z,.32)){p.x=PO.x;p.z=PO.z;}
  p.y=0;p.phase+=sp*dt*(sp>3?1.9:3.2);p.amp+=((sp>3?.95:.5)-p.amp)*min(1,dt*8);
}

/* --- how people react: chatting in pairs, cowering, hands up at gunpoint, fighting back --- */
function stepReact(p,dt){
  p.lie=max(0,p.lie-dt*3);p.timer-=dt;const dx=__late.player.x-p.x,dz=__late.player.z-p.z,dp=hypot(dx,dz);
  if(p.state==='cower'){p.amp*=.8;if(p.timer<=0){p.state='flee';p.timer=8;}return true;}
  if(p.state==='hands'){p.amp*=.8;p.th+=wrap(atan2(dx,dz)-p.th)*min(1,dt*6);if(p.timer<=0){p.state='flee';p.timer=9;}return true;}
  if(p.state==='chat'){const q=p.pt;if(!q||q.state!=='chat'||q.pt!==p||q.hidden||p.timer<=0){p.state='walk';p.pt=null;return false;}
    const ex=q.x-p.x,ez=q.z-p.z,d=hypot(ex,ez);p.th+=wrap(atan2(ex,ez)-p.th)*min(1,dt*5);
    if(p.mover&&d>1.3){const sp=p.walk;p.x+=ex/d*sp*dt;p.z+=ez/d*sp*dt;p.phase+=sp*dt*3.2;p.amp+=(.5-p.amp)*min(1,dt*8);}else p.amp*=.85;
    if(pushOut(p.x,p.z,.32)){p.x=PO.x;p.z=PO.z;}p.y=0;return true;}
  // fight: close in, fists up, swing every second or so
  if(__late.G.car||__late.player.hidden||__late.player.state==='dead'||dp>25||p.timer<=0||p.hp<35){p.state='flee';p.timer=8;return false;}
  p.th+=wrap(atan2(dx,dz)-p.th)*min(1,dt*10);p.punchT=max(0,(p.punchT||0)-dt);
  if(dp>1.15){const sp=4.3;p.x+=dx/dp*sp*dt;p.z+=dz/dp*sp*dt;p.phase+=sp*dt*1.9;p.amp+=(.95-p.amp)*min(1,dt*8);}
  else{p.amp*=.8;p.hitCd=(p.hitCd??.6)-dt;if(p.hitCd<=0){p.hitCd=.85+rnd()*.5;p.punchT=.28;if(__late.G.busy)return true;__late.hurt(4+rnd()*5);__late.G.hurtCd=.6;__late.G.shake=max(__late.G.shake,.2);__late.thud(.3);}}
  if(pushOut(p.x,p.z,.32)){p.x=PO.x;p.z=PO.z;}p.y=0;return true;}
const calmPed=p=>p&&!p.hidden&&!p.copPed&&!p.actor&&!p.gang&&!p.ins&&!p.talking&&!p.giverKey&&p.state==='walk'&&p.mode==='walk';
const CROWD={t:0};
function stepCrowd(dt){
  // now and then two people on the sidewalk stop for a chat
  CROWD.t-=dt;if(CROWD.t<=0&&(!__gs.IN||__gs.IN.real)){CROWD.t=.6;let n=0;for(let k=1;k<peds.length;k++)if(peds[k].state==='chat')n++;
    const p=peds[1+floor(rnd()*(peds.length-1))];
    if(n<12&&calmPed(p)&&hypot(p.x-__gs.FX,p.z-__gs.FZ)<70){let q=null,bd=7;for(let k=1;k<peds.length;k++){const o=peds[k];if(o===p||!calmPed(o))continue;const d=hypot(o.x-p.x,o.z-p.z);if(d<bd){bd=d;q=o;}}
      if(q){const T=6+rnd()*9;Object.assign(p,{state:'chat',pt:q,timer:T,mover:false});Object.assign(q,{state:'chat',pt:p,timer:T,mover:true});}}}
  // aiming a gun at someone puts their hands up; keep aiming and they hand over their wallet
  if(!__late.ARM.aim||__late.ARM.w===0||__late.G.car||__late.G.busy||__late.G.menuCam||(__gs.IN&&!__gs.IN.real))return;
  camera.getWorldDirection(__late._rd);let best=null,bd=22;
  for(let k=1;k<peds.length;k++){const p=peds[k];if(p.hidden||p.copPed||p.actor||p.ins||p.state==='dead'||p.state==='down')continue;
    const dx=p.x-camera.position.x,dz=p.z-camera.position.z,dy=p.y+1.2-camera.position.y,dd=hypot(dx,dy,dz)||1;if((dx*__late._rd.x+dy*__late._rd.y+dz*__late._rd.z)/dd<.985)continue;
    const dp=hypot(p.x-__late.player.x,p.z-__late.player.z);if(dp<bd){bd=dp;best=p;}}
  if(!best)return;
  if(best.state!=='hands'){if(best.state==='chat'&&best.pt)best.pt.timer=0;best.state='hands';best.aimT=0;best.pt=null;}
  best.timer=1.4;best.aimT=(best.aimT||0)+dt;
  if(!best.robbed&&bd<10){if(best.aimT>1.5){best.robbed=1;const v=20+floor(rnd()*160);__late.dropItem('cash',best.x+sin(best.th)*.7,best.z+cos(best.th)*.7,v);
      __late.flash('THEY DROPPED THEIR WALLET',1.4);__late.addHeat(.6);__late.SAVE.stats.mugged=(__late.SAVE.stats.mugged||0)+1;}
    else __late.G.lifeHint='Keep aiming to rob them';}}
// poses that replace the walk cycle: arms[0] is the left side, arms[1] the right
function pedPose(p){
  if(p.isPlayer&&p.ride&&__late.G.car===p.ride){const b=p.ride; // on a bike: seated, hands on the bars; pedalling on a city bike
    if(b.T.pedal){const a=b.spin*.5;return{legs:[{hip:-1.05+sin(a)*.38,knee:1.2+cos(a)*.45},{hip:-1.05-sin(a)*.38,knee:1.2-cos(a)*.45}],arms:[{sw:-1.0,el:-.3,spl:.2},{sw:-1.0,el:-.3,spl:-.2}]};}
    return{legs:[{hip:-1.3,knee:1.75},{hip:-1.3,knee:1.75}],arms:[{sw:-1.15,el:-.4,spl:.3},{sw:-1.15,el:-.4,spl:-.3}]};}
  if(p.isPlayer||p.hidden)return null;
  if(p.lie>.35){const r=p.rs??.5;return{legs:[{hip:-.3*r,knee:.2+r*.6},{hip:.2-.3*r,knee:.7-r*.5}],arms:[{sw:-.3-r*.9,el:-.2-r*.7,spl:1.05+r*.5},{sw:-1.2+r*.9,el:-.7+r*.4,spl:-(1+(1-r)*.6)}]};} // limp, splayed on the ground
  if(p.gang&&p.gang.hostile)return{arms:[{sw:-1.4,el:-.45,spl:-.3},{sw:-1.5,el:-.05,spl:.05}]}; // both hands on the gun
  if(p.copPed)return null;
  const st=p.state,t=__late.G.sigT+(p.rs||0)*9;
  if(st==='cower')return{crouch:1,arms:[{sw:-2.4,el:-2.1,spl:.55},{sw:-2.4,el:-2.1,spl:-.55}]};
  if(st==='hands')return{arms:[{sw:-2.75,el:-.45,spl:.3},{sw:-2.75,el:-.45,spl:-.3}]};
  if(st==='fight'){const hit=p.punchT>0;return{arms:[{sw:-1.15,el:-1.9,spl:.25},{sw:hit?-1.55:-1.1,el:hit?-.15:-1.95,spl:-.2}]};}
  if(st==='chat')return{arms:[{sw:.05,el:-.25,spl:.12},{sw:-.55+sin(t*2.6)*.3,el:-1.25+sin(t*3.7)*.25,spl:-.25}]};
  if(__late.WANT.pend&&__late.WANT.pend.p===p)return{arms:[{sw:.05,el:-.25,spl:.12},{sw:-.5,el:-2.55,spl:-.95}]}; // on the phone to the police
  return null;}
const _mb=new THREE.Matrix4(),_ml=new THREE.Matrix4(),_mt=new THREE.Matrix4(),_mh=new THREE.Matrix4(),_mU=new THREE.Matrix4(),_mL=new THREE.Matrix4(),_mF=new THREE.Matrix4(),_q2=new THREE.Quaternion(),_v2=new THREE.Vector3(),_e3=new THREE.Euler();
const seg=(par,ox,oy,oz,rx,rz,out)=>{_ml.compose(_v.set(ox,oy,oz),_q2.setFromEuler(_e3.set(rx,0,rz,'ZXY')),ONE);out.multiplyMatrices(par,_ml);};
function syncPeds(){
  if(__late.useRigs){__late.poseRigs();return;}
  for(const im of PIMS)im.n=0;
  for(const p of peds){
    if(p.hidden)continue;
    const PZ=pedPose(p),cr=PZ&&PZ.crouch?1:0;
    const A=p.amp,s=sin(p.phase),c=cos(p.phase),run=A>.8?1:0,bob=abs(c)*.035*A,idle=sin(p.phase*.0+__late.G.sigT*1.6+p.sc*40)*.006*(1-A);
    _e.set(-p.lie*(p.fb||1),p.th,p.roll||0,'YXZ');_mb.compose(_v.set(p.x,p.y+p.lie*.1-cr*.48,p.z),_q.setFromEuler(_e),_v2.setScalar(p.sc));
    _ml.makeTranslation(0,bob,0);_mh.multiplyMatrices(_mb,_ml);                       // hips
    _ml.compose(_v.set(0,.9+bob+idle,0),_q2.setFromEuler(_e3.set(A*(.07+run*.12)+cr*.45,s*A*.12,0,'YXZ')),ONE);_mt.multiplyMatrices(_mb,_ml);
    _ml.makeTranslation(0,-.9,0);_mt.multiply(_ml);                                    // upper body (leans + twists)
    put(torsoIM,_mt,p.shirt);put(hipsIM,_mt,p.pants);if(p.jacket)put(jacketIM,_mt,p.jacket);put(beltIM,_mt,p.accent);
    _ml.compose(_v.set(0,1.675,.005),_q2.setFromEuler(_e3.set(-A*(.05+run*.1),-s*A*.1,0,'YXZ')),_v2.setScalar(1.16));_mF.multiplyMatrices(_mt,_ml);
    put(headIM,_mF,p.skin);put(faceIM[p.face],_mF);put(hairIM[p.hair],_mF,p.hairC);
    const sleeve=p.jacket||p.shirt,fore=p.fore||sleeve;
    for(const sg of[1,-1]){
      let sp=s*sg,cp=c*sg,hip=sp*A*.72-run*.12,knee=max(0,-cp)*A*(1.2+run*.5)+.05;
      if(cr){hip=-1.35;knee=2.25;}else if(PZ&&PZ.legs){const L=PZ.legs[sg>0?0:1];hip=L.hip;knee=L.knee;}
      seg(_mh,sg*.088,.9,0,hip,0,_mU);put(thighIM,_mU,p.pants);
      seg(_mU,0,-.4,0,knee,0,_mL);put(shinIM,_mL,p.shin);
      seg(_mL,0,-.38,0,-(hip+knee)*.8,0,_mF);put(shoeIM,_mF,p.shoe);
      let sw=-sp*A*(.65+run*.3),el=-(.16+A*.45+run*.7+max(0,-sw)*.4),spl=sg*(.1-run*.04);if(PZ){const a=PZ.arms[sg>0?0:1];sw=a.sw;el=a.el;spl=a.spl;}
      seg(_mt,sg*.2,1.405,0,sw,spl,_mU);put(uarmIM,_mU,sleeve);
      seg(_mU,0,-.26,0,el,0,_mL);put(farmIM,_mL,fore);
      seg(_mL,0,-.25,0,0,0,_mF);put(handIM,_mF,p.skin);
    }
  }
  for(const im of PIMS){im.count=im.n;im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;}
}

/* ============================== particles & markers ============================== */
const PN=160,pPos=new Float32Array(PN*3),pA=new Float32Array(PN),pS=new Float32Array(PN),pC=new Float32Array(PN),pV=new Float32Array(PN*3),pL=new Float32Array(PN),pM=new Float32Array(PN),pB=new Float32Array(PN);
const pGeo=new THREE.BufferGeometry();pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));pGeo.setAttribute('aA',new THREE.BufferAttribute(pA,1));pGeo.setAttribute('aS',new THREE.BufferAttribute(pS,1));pGeo.setAttribute('aC',new THREE.BufferAttribute(pC,1));
const pMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uL:{value:1}},
  vertexShader:`attribute float aA;attribute float aS;attribute float aC;varying float vA;varying float vC;void main(){vA=aA;vC=aC;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aS*900./-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform float uL;varying float vA;varying float vC;void main(){float a=smoothstep(.5,.05,length(gl_PointCoord-.5))*vA;if(a<.01)discard;gl_FragColor=vec4(vec3(vC*uL),a);}`});
{const pts=new THREE.Points(pGeo,pMat);pts.frustumCulled=false;scene.add(pts);}
let pI=0;
function emit(x,y,z,vx,vy,vz,size,life,gray,alpha){const k=pI;pI=(pI+1)%PN;pPos[k*3]=x;pPos[k*3+1]=y;pPos[k*3+2]=z;pV[k*3]=vx;pV[k*3+1]=vy;pV[k*3+2]=vz;pS[k]=size;pL[k]=pM[k]=life;pC[k]=gray;pB[k]=alpha;}
function stepParticles(dt){for(let k=0;k<PN;k++){if(pL[k]<=0){pA[k]=0;continue;}pL[k]-=dt;pPos[k*3]+=pV[k*3]*dt;pPos[k*3+1]+=pV[k*3+1]*dt;pPos[k*3+2]+=pV[k*3+2]*dt;pS[k]+=dt*.9;pA[k]=max(0,pL[k]/pM[k])*pB[k];}
  for(const n of['position','aA','aS','aC'])pGeo.attributes[n].needsUpdate=true;pMat.uniforms.uL.value=.25+.75*(1-night);}
function beacon(color,r,h){const c=cv(4,64),g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,64);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(1,'rgba(255,255,255,.9)');g.fillStyle=gr;g.fillRect(0,0,4,64);
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24,1,true).translate(0,h/2,0),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
  m.visible=false;scene.add(m);return m;}
const jobBeacon=beacon(0xffd23f,3.2,45);
const GARAGES=garageSpots();
for(const[x,z]of GARAGES){const b=beacon(0x45ff7a,3,10);b.position.set(x,0,z);b.visible=true;}

await stage(.82,'Almost there');
export { GARAGES, NCOP, NPED, PIMS, attachPed, beacon, calmPed, emit, jobBeacon, mkPed, pedPose, peds, placePed, stepCrowd, stepParticles, stepPed, syncPeds, tint };
