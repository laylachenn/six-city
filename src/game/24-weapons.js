// Six City — weapons. One of the game's modules; they load in numbered order (src/game/index.js).
import './23-sync.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { __gs, __late, later } from './shared.js';
import { $, PI, TEST, abs, atan2, camera, clamp, cos, floor, groundH, hypot, max, min, rnd, round, scene, sin } from './01-core.js';
import { radialTexture } from './03-textures.js';
import { mat4, solidAt } from './04-world.js';
import { cars } from './06-cars.js';
import { emit, peds } from './07-people.js';
import { G, flash, player } from './08-input.js';
import { WANT, addHeat, crime, heliRay, hitHeli, shotsFired } from './10-police.js';
import { SAVE } from './11-missions.js';
import { CUT } from './12-story.js';
import { PANEL, closePanel } from './13-homes.js';
import { BM } from './16-map.js';
import { AC, master, thud } from './17-audio.js';
import { goHostile, turfShot } from './21-turf.js';
later({ARM:()=>ARM,GUNGEO:()=>GUNGEO,WEAPONS:()=>WEAPONS,WH:()=>WH,_hd:()=>_hd,_hp:()=>_hp,_rd:()=>_rd,alarm:()=>alarm,bang:()=>bang,bloodAt:()=>bloodAt,click:()=>click,closeWheel:()=>closeWheel,dropItem:()=>dropItem,explode:()=>explode,gunMat:()=>gunMat,gunMesh:()=>gunMesh,hurt:()=>hurt,killPed:()=>killPed,openWheel:()=>openWheel,selectWeapon:()=>selectWeapon,spray:()=>spray,startReload:()=>startReload,tracer:()=>tracer,updateGun:()=>updateGun,wheelMove:()=>wheelMove}); // for earlier modules, read when called

/* ============================== weapons ============================== */
// 1 fists · 2 pistol · 3 SMG · 4 shotgun · 5 rifle · 6 sniper. Left mouse fires, right mouse aims over the shoulder
// (the sniper looks through its scope), R reloads, hold Q for the weapon wheel or scroll to cycle. Headshots do 3.5×.
const WEAPONS=[
  {n:'Fists',melee:true,rate:.45},
  {n:'Pistol',dmg:40,rate:.2,mag:12,spread:.01,pellets:1,range:150,reload:1.1,auto:false,kick:.3,vol:.8},
  {n:'SMG',dmg:21,rate:.075,mag:30,spread:.03,pellets:1,range:120,reload:1.6,auto:true,kick:.14,vol:.55},
  {n:'Shotgun',dmg:19,rate:.85,mag:6,spread:.075,pellets:9,range:45,reload:2.2,auto:false,kick:.7,vol:1.15},
  {n:'Rifle',dmg:30,rate:.11,mag:30,spread:.02,pellets:1,range:220,reload:1.9,auto:true,kick:.22,vol:.9},
  {n:'Sniper',dmg:150,rate:1.25,mag:5,spread:.06,aimSpread:.0006,pellets:1,range:450,reload:2.6,auto:false,kick:.9,vol:1.35,scope:true}];
const ARM={w:0,ammo:WEAPONS.map(w=>w.mag||0),cd:0,reload:0,fire:false,trigger:false,aim:false,faceT:0,flash:0,copCd:2,combo:0,comboT:0,own:WEAPONS.map((w,i)=>i<2)};
// you start with fists and a pistol; the rest are bought at Bullet Barn (older saves with story progress keep the SMG and shotgun they had)
if(TEST)ARM.own.fill(true);else{if(!Array.isArray(SAVE.guns))SAVE.guns=SAVE.done.length?[0,1,2,3]:[0,1];for(const i of SAVE.guns)if(i>=0&&i<ARM.own.length)ARM.own[i]=true;}
const gunMat=new THREE.MeshStandardMaterial({color:0x1b1d20,metalness:.75,roughness:.35});
const gbox=(w,h,d,x,y,z)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);
const GUNGEO=[null, // forward is +z, grip at the origin
  mergeGeometries([gbox(.034,.07,.19,0,.035,.07),gbox(.03,.1,.045,0,-.025,-.005)]),
  mergeGeometries([gbox(.045,.08,.34,0,.04,.1),gbox(.012,.012,.1,0,.04,.31),gbox(.03,.14,.04,0,-.05,.1),gbox(.032,.09,.045,0,-.02,-.02),gbox(.03,.05,.15,0,.03,-.13)]),
  mergeGeometries([gbox(.05,.075,.4,0,.04,.15),gbox(.028,.028,.36,0,.0,.24),gbox(.042,.1,.2,0,-.01,-.12),gbox(.04,.04,.12,0,.0,.12)]),
  // rifle: receiver, barrel, curved-ish magazine, grip, stock, carry rail
  mergeGeometries([gbox(.05,.085,.42,0,.04,.12),gbox(.02,.02,.2,0,.05,.42),gbox(.034,.16,.06,0,-.06,.16),gbox(.032,.1,.045,0,-.025,-.02),gbox(.04,.08,.24,0,.025,-.2),gbox(.02,.02,.24,0,.095,.12)]),
  // sniper: long barrel, scope on top, bolt, grip, long stock
  mergeGeometries([gbox(.05,.08,.46,0,.04,.12),gbox(.022,.022,.4,0,.05,.55),gbox(.045,.045,.3,0,.12,.12),gbox(.06,.06,.04,0,.12,.28),gbox(.06,.06,.04,0,.12,-.03),gbox(.032,.1,.045,0,-.025,-.02),gbox(.045,.1,.3,0,.02,-.25),gbox(.03,.08,.05,0,-.04,.14)])];
const GUNLEN=[0,.2,.36,.43,.53,.76];
const gunMesh=new THREE.Mesh(GUNGEO[1],gunMat);gunMesh.rotation.order='YXZ';gunMesh.castShadow=true;gunMesh.visible=false;scene.add(gunMesh);
const mflash=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTexture([[0,'rgba(255,246,214,1)'],[.3,'rgba(255,196,96,.85)'],[1,'rgba(255,120,40,0)']]),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
mflash.scale.setScalar(.55);mflash.visible=false;scene.add(mflash);
const mlight=new THREE.PointLight(0xffc070,0,16,2);scene.add(mlight);
const TRC=[];for(let k=0;k<20;k++){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));
  const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffe2a0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));l.frustumCulled=false;l.visible=false;scene.add(l);TRC.push({l,life:0});}
let trI=0;
function tracer(a,b){const t=TRC[trI=(trI+1)%TRC.length],p=t.l.geometry.attributes.position;p.setXYZ(0,a.x,a.y,a.z);p.setXYZ(1,b.x,b.y,b.z);p.needsUpdate=true;t.life=.06;t.l.visible=true;t.l.material.opacity=.95;}
// blood: pools on the ground + a red spray
const BLOOD_N=60,bloodMesh=new THREE.InstancedMesh(new THREE.CircleGeometry(1,16).rotateX(-PI/2),new THREE.MeshStandardMaterial({color:0x2a0303,roughness:.55,metalness:0,envMapIntensity:.25,transparent:true,opacity:.96,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-14}),BLOOD_N);
bloodMesh.count=0;bloodMesh.frustumCulled=false;bloodMesh.renderOrder=55;scene.add(bloodMesh);let bloodI=0;
function bloodAt(x,z,r){bloodMesh.setMatrixAt(bloodI%BLOOD_N,mat4(x,.03+(bloodI%9)*.002,z,rnd()*6,r,1,r*(.7+rnd()*.5)));bloodI++;bloodMesh.count=min(BLOOD_N,bloodI);bloodMesh.instanceMatrix.needsUpdate=true;}
const BN=120,bPos=new Float32Array(BN*3),bV=new Float32Array(BN*3),bL=new Float32Array(BN),bA=new Float32Array(BN),bS=new Float32Array(BN);let bI=0;
const bGeo=new THREE.BufferGeometry();bGeo.setAttribute('position',new THREE.BufferAttribute(bPos,3));bGeo.setAttribute('aA',new THREE.BufferAttribute(bA,1));bGeo.setAttribute('aS',new THREE.BufferAttribute(bS,1));
{const pts=new THREE.Points(bGeo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,
  vertexShader:`attribute float aA;attribute float aS;varying float vA;void main(){vA=aA;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aS*900./-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`varying float vA;void main(){float a=smoothstep(.5,.12,length(gl_PointCoord-.5))*vA;if(a<.01)discard;gl_FragColor=vec4(.38,.02,.03,a);}`}));pts.frustumCulled=false;scene.add(pts);}
function spray(x,y,z,dx,dz,n){for(let k=0;k<n;k++){const i=bI=(bI+1)%BN;bPos[i*3]=x;bPos[i*3+1]=y;bPos[i*3+2]=z;bV[i*3]=dx*(1+rnd()*2)+(rnd()-.5)*1.4;bV[i*3+1]=rnd()*2.2;bV[i*3+2]=dz*(1+rnd()*2)+(rnd()-.5)*1.4;bL[i]=.5+rnd()*.4;bS[i]=.05+rnd()*.06;}}
function stepBlood(dt){for(let i=0;i<BN;i++){if(bL[i]<=0){bA[i]=0;continue;}bL[i]-=dt;bV[i*3+1]-=9.8*dt;for(let a=0;a<3;a++)bPos[i*3+a]+=bV[i*3+a]*dt;if(bPos[i*3+1]<.02){bPos[i*3+1]=.02;bV[i*3]*=.5;bV[i*3+2]*=.5;}bA[i]=min(1,bL[i]*2.5);}
  bGeo.attributes.position.needsUpdate=true;bGeo.attributes.aA.needsUpdate=true;bGeo.attributes.aS.needsUpdate=true;}
function bang(v){ // gunshot: a sharp noise crack with a short low thump
  if(!AC)return;const n=AC.sampleRate*.35|0,b=AC.createBuffer(1,n,AC.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<n;i++){const t=i/n;d[i]=(rnd()*2-1)*Math.pow(1-t,6)*1.2+sin(i/AC.sampleRate*2*PI*(90-60*t))*Math.pow(1-t,4)*.8;}
  const s=AC.createBufferSource(),g=AC.createGain(),f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=3800;g.gain.value=v;s.buffer=b;s.connect(f);f.connect(g);g.connect(master);s.start();}
function click(){if(!AC)return;const o=AC.createOscillator(),g=AC.createGain();o.type='square';o.frequency.value=1800;g.gain.setValueAtTime(.08,AC.currentTime);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.05);o.connect(g);g.connect(master);o.start();o.stop(AC.currentTime+.06);}

// nearest thing along a ray: a person, a car, a wall or the ground
function rayHit(o,d,maxT){
  let best={t:maxT,k:'none'};
  if(d.y<-1e-4){const t=-o.y/d.y;if(t>0&&t<best.t)best={t,k:'ground'};}
  for(let t=.4;t<best.t;t+=1.1){if(solidAt(o.x+d.x*t,o.y+d.y*t,o.z+d.z*t)){let a=max(0,t-1.1),b=t;
    for(let i=0;i<6;i++){const m=(a+b)/2;if(solidAt(o.x+d.x*m,o.y+d.y*m,o.z+d.z*m))b=m;else a=m;}best={t:b,k:'wall'};break;}}
  const ah=d.x*d.x+d.z*d.z;
  for(let k=1;k<peds.length;k++){const p=peds[k];if(p.hidden||ah<1e-8)continue;
    const lying=p.lie>.8,lo=p.y+(lying?0:0),hi=p.y+(lying?.45:1.85),r=lying?.55:.38,wx=o.x-p.x,wz=o.z-p.z;
    const t=-(wx*d.x+wz*d.z)/ah;if(t<0||t>best.t)continue;
    const ex=wx+d.x*t,ez=wz+d.z*t,y=o.y+d.y*t;if(ex*ex+ez*ez>r*r||y<lo||y>hi)continue;best={t,k:'ped',p,head:!lying&&y>p.y+1.5*(p.sc||1)};}
  for(const c of cars){if(c===G.car)continue;const dx0=o.x-c.x,dz0=o.z-c.z;if(dx0*dx0+dz0*dz0>(best.t+14)**2)continue;
    const cs=cos(c.th),sn=sin(c.th),hw=c.T.W/2,hl=c.T.L/2,H=c.T.roofH||1.5;
    const lx=-dx0*cs+dz0*sn,lz=dx0*sn+dz0*cs,ldx=-d.x*cs+d.z*sn,ldz=d.x*sn+d.z*cs;
    let t0=0,t1=best.t;
    for(const [p0,dd,lo,hi] of [[lx,ldx,-hw,hw],[o.y-c.y,d.y,0,H],[lz,ldz,-hl,hl]]){
      if(abs(dd)<1e-8){if(p0<lo||p0>hi){t0=1e9;break;}continue;}let a=(lo-p0)/dd,b=(hi-p0)/dd;if(a>b){const q=a;a=b;b=q;}t0=max(t0,a);t1=min(t1,b);if(t0>t1)break;}
    if(t0<=t1&&t0>0&&t0<best.t)best={t:t0,k:'car',c};}
  return best;}
function alarm(x,z,r){for(let k=1;k<peds.length;k++){const p=peds[k];if(p.hidden||p.state==='dead'||p.state==='down'||p.talking||p.state==='fight')continue;const d=hypot(p.x-x,p.z-z);
  if(d<r){if(d<14&&rnd()<.45&&!p.copPed){p.state='cower';p.timer=3+rnd()*4;}else{p.state='flee';p.timer=9+rnd()*5;}p.pt=null;}}
}
function killPed(p,dx,dz){const was=p.state==='dead';p.state='dead';p.hp=0;p.vx=dx*2.6;p.vz=dz*2.6;p.vy=1.4;p.bled=false;p.talking=false;p.pt=null;
  if(!was){p.fb=(dx*sin(p.th)+dz*cos(p.th))>0?-1:1;p.spinV=(rnd()-.5)*3;} // hit from behind falls on its face, from the front on its back
  if(p.copPed){WANT.hostile=true;addHeat(1.6);if(!was&&p.cop){if(p.cop.swat||rnd()<.6)dropVest(p.x,p.z,p.cop.swat?100:50);if(p.cop.swat&&!ARM.own[4]&&rnd()<.2)dropItem('gun',p.x+.8,p.z,4);}}
  else if(p.gang){if(!was&&rnd()<.7)dropItem('cash',p.x+.5,p.z+.3,20+floor(rnd()*110));}
  else{addHeat(1.15);if(!was&&!p.ins&&!p.actor){if(rnd()<.55)dropItem('cash',p.x+.5,p.z+.3,5+floor(rnd()*75));else if(rnd()<.15)dropItem('health',p.x+.5,p.z,25);}}}
function hitPed(p,dmg,d,at,head){
  spray(at.x,at.y,at.z,d.x*1.5,d.z*1.5,head?12:6);
  if(p.state==='dead'){p.vx+=d.x*.6;p.vz+=d.z*.6;return;}
  if(head)dmg*=3.5;hitMark(head);
  p.hp=(p.hp??100)-dmg;if(PANEL&&p.talking)closePanel();
  if(p.hp<=0){killPed(p,d.x,d.z);return;}
  if(p.copPed){WANT.hostile=true;addHeat(.5);return;}
  if(p.gang){if(p.gang.crew!=='you')goHostile();return;}
  p.state='flee';p.timer=12;addHeat(.45);p.x+=d.x*.15;p.z+=d.z*.15;}
function hitCar(c,dmg,at){
  for(let i=0;i<3;i++)emit(at.x,at.y,at.z,(rnd()-.5)*3,rnd()*2,(rnd()-.5)*3,.08,.25,1.6,.9);
  if(c.boom)return;c.hp-=dmg*.32;
  if(c.mode==='police'||c.rb){WANT.hostile=true;addHeat(.35);}else if(c.mode==='traffic'&&!c.T.tram)c.flee=17;
  if(c.hp<=0)explode(c);}
function explode(c){
  if(hypot(c.x-__gs.FX,c.z-__gs.FZ)<200)__late.feedEvt('boom');
  c.boom=true;c.hp=0;c.color.setRGB(.05,.05,.05);c.flee=0;if(c.mode==='traffic'||c.mode==='police'){c.mode='free';c.spawned=true;}
  for(let i=0;i<40;i++)emit(c.x+(rnd()-.5)*2,1+rnd(),c.z+(rnd()-.5)*2,(rnd()-.5)*8,2+rnd()*6,(rnd()-.5)*8,.9+rnd(),1.4+rnd(),i<16?2.4:.12,.85);
  thud(1);bang(1.4);G.shake=max(G.shake,hypot(c.x-__gs.FX,c.z-__gs.FZ)<40?.9:.3);crime(1,c.x,c.z,{loud:1});
  for(let k=1;k<peds.length;k++){const p=peds[k];if(p.hidden||p.state==='dead')continue;const dx=p.x-c.x,dz=p.z-c.z,d=hypot(dx,dz);if(d<7){killPed(p,dx/(d||1),dz/(d||1));p.vy=4;}else if(d<40){p.state='flee';p.timer=12;}}
  {const d=hypot(__gs.FX-c.x,__gs.FZ-c.z);if(d<8){if(G.car){G.car.hp-=(8-d)*8;}else{hurt((8-d)*11);G.hurtCd=1;}}}
  for(const o of cars)if(o!==c&&!o.boom&&hypot(o.x-c.x,o.z-c.z)<6){o.hp-=45;if(o.hp<=0&&o!==G.car)setTimeout(()=>explode(o),250+rnd()*400);}
  alarm(c.x,c.z,60);}
function punch(){ // three-hit combo: jab, cross, then a heavy hook that knocks people flat
  ARM.combo=ARM.comboT>0?(ARM.combo+1)%3:0;ARM.comboT=.8;const heavy=ARM.combo===2;
  ARM.cd=heavy?.6:.32;player.punchT=heavy?.38:.26;player.punchK=ARM.combo;let best=null,bd=heavy?1.8:1.6;
  for(let k=1;k<peds.length;k++){const p=peds[k];if(p.hidden||p.state==='dead')continue;const dx=p.x-player.x,dz=p.z-player.z,d=hypot(dx,dz);
    if(d<bd&&(dx*sin(player.th)+dz*cos(player.th))/(d||1)>.4){bd=d;best=p;}}
  if(!best)return;const dx=(best.x-player.x)/(bd||1),dz=(best.z-player.z)/(bd||1);
  thud(heavy?.6:.35);best.hp=(best.hp??100)-[20,24,50][ARM.combo];if(PANEL&&best.talking)closePanel();hitMark(false);
  if(heavy)G.shake=max(G.shake,.18);
  if(best.hp<=0){killPed(best,dx,dz);if(heavy){best.vx=dx*6;best.vz=dz*6;best.vy=2.6;}}
  else if(heavy||best.state==='down'){best.state='down';best.fb=(dx*sin(best.th)+dz*cos(best.th))>0?-1:1;best.timer=heavy?4:3;const k=heavy?6:3;best.vx=dx*k;best.vz=dz*k;best.vy=heavy?2.4:1.5;if(best.copPed)WANT.hostile=true;addHeat(best.copPed?.5:.3);}
  else if(!best.copPed&&!best.ins&&!best.actor&&best.tough){if(best.state!=='fight'){best.state='fight';best.timer=18;best.hitCd=.7;best.pt=null;}best.x+=dx*.25;best.z+=dz*.25;addHeat(.2);}
  else{best.state='flee';best.timer=8;best.x+=dx*.25;best.z+=dz*.25;if(best.copPed)WANT.hostile=true;addHeat(best.copPed?.4:.2);}
  alarm(player.x,player.z,15);}
const _ro=new THREE.Vector3(),_rd=new THREE.Vector3(),_rp=new THREE.Vector3(),_hp=new THREE.Vector3(),_mz=new THREE.Vector3(),_hd=new THREE.Vector3();
function muzzlePos(out){
  const W=ARM.w,fx=sin(gunMesh.rotation.y)*cos(gunMesh.rotation.x),fy=-sin(gunMesh.rotation.x),fz=cos(gunMesh.rotation.y)*cos(gunMesh.rotation.x);
  return out.copy(gunMesh.position).add(_hd.set(fx,fy,fz).multiplyScalar(GUNLEN[W]+.04)).add(_hd.set(0,.04,0));}
function startReload(){const W=WEAPONS[ARM.w];if(!W.mag||ARM.reload>0||ARM.ammo[ARM.w]>=W.mag)return;ARM.reload=W.reload;click();}
function fireWeapon(){
  const W=WEAPONS[ARM.w];
  if(W.melee){punch();return;}
  if(ARM.reload>0)return;
  if(ARM.ammo[ARM.w]<=0){click();startReload();ARM.cd=.25;return;}
  ARM.ammo[ARM.w]--;turfShot();ARM.cd=W.rate;ARM.faceT=1.4;player.th=__gs.camYaw;updateGun();
  camera.getWorldDirection(_rd);
  _ro.copy(camera.position).addScaledVector(_rd,__gs.camDist*.92);
  muzzlePos(_mz);
  const sp=ARM.aim&&W.aimSpread!=null?W.aimSpread*(G.focusSpeed>4?20:1):W.spread*(ARM.aim?.55:1)*(G.focusSpeed>4?1.8:1);
  for(let k=0;k<W.pellets;k++){
    _rp.set(_rd.x+(rnd()-.5)*2*sp,_rd.y+(rnd()-.5)*2*sp,_rd.z+(rnd()-.5)*2*sp).normalize();
    const h=rayHit(_ro,_rp,W.range),ht=heliRay(_ro,_rp,h.t);
    if(ht>0){_hp.copy(_ro).addScaledVector(_rp,ht);tracer(_mz,_hp);hitHeli(W.dmg,_hp);continue;}
    _hp.copy(_ro).addScaledVector(_rp,h.t);
    tracer(_mz,_hp);
    if(h.k==='ped')hitPed(h.p,W.dmg,_rp,_hp,h.head);
    else if(h.k==='car')hitCar(h.c,W.dmg,_hp);
    else if(h.k!=='none')for(let i=0;i<2;i++)emit(_hp.x,_hp.y,_hp.z,(rnd()-.5)*1.6,rnd()*1.6,(rnd()-.5)*1.6,.14,.55,.75,.55);
  }
  ARM.flash=.05;mflash.position.copy(_mz);mflash.material.rotation=rnd()*6;mlight.position.copy(_mz);
  __gs.camPitch=clamp(__gs.camPitch-W.kick*.035,-1.45,1.2);__gs.camYaw+=(rnd()-.5)*W.kick*.02;G.shake=max(G.shake,W.kick*.18);
  bang(W.vol);alarm(player.x,player.z,50);shotsFired();
  if(ARM.ammo[ARM.w]===0)startReload();}
function selectWeapon(i){if(i===ARM.w||G.car||i<0||i>=WEAPONS.length)return;if(!ARM.own[i]){flash('BUY IT AT BULLET BARN',1.4);return;}ARM.w=i;ARM.reload=0;ARM.cd=.25;gunMesh.geometry=GUNGEO[i]||GUNGEO[1];flash(WEAPONS[i].n.toUpperCase(),1);}
// gun in the right hand, pointing where the camera looks while aiming / shooting, lowered otherwise
function updateGun(){
  const show=ARM.w>0&&!G.car&&!player.hidden&&player.state!=='dead';gunMesh.visible=show;if(!show)return;
  const up=ARM.aim||ARM.faceT>0,pitch=up?__gs.camPitch*.9-.2:.9;
  const hand=player.rig&&player.handR&&player.rig.root.visible;
  if(hand){player.rig.root.updateMatrixWorld(true);player.handR.getWorldPosition(gunMesh.position);}
  else{const fx=sin(player.th),fz=cos(player.th);gunMesh.position.set(player.x+fx*.35-fz*.22,player.y+(up?1.4:1),player.z+fz*.35+fx*.22);}
  gunMesh.rotation.set(pitch,player.th,0);}
function stepCombat(dt){
  const W=WEAPONS[ARM.w];
  ARM.cd-=dt;ARM.faceT=max(0,ARM.faceT-dt);ARM.comboT-=dt;stepPicks(dt);
  if(ARM.reload>0){ARM.reload-=dt;if(ARM.reload<=0){ARM.reload=0;ARM.ammo[ARM.w]=W.mag;click();}}
  const can=!G.car&&!G.busy&&!G.uiOpen&&!BM.open&&!player.hidden&&!WH.open;
  if(can&&(ARM.trigger||(ARM.fire&&W.auto))&&ARM.cd<=0){fireWeapon();ARM.trigger=false;}
  if(!ARM.fire)ARM.trigger=false;
  ARM.flash-=dt;mflash.visible=ARM.flash>0;mlight.intensity=ARM.flash>0?30:0;
  for(const t of TRC)if(t.life>0){t.life-=dt;t.l.material.opacity=max(0,t.life/.06)*.95;if(t.life<=0)t.l.visible=false;}
  stepBlood(dt);
  updateGun();}

// armour soaks up 70% of every hit until it runs out
function hurt(d){const a=min(G.armor||0,d*.7);G.armor=(G.armor||0)-a;G.hp-=d-a;}
const hitEl=$('hitm');let hitT=0;
function hitMark(head){hitEl.className=head?'head':'';hitEl.style.opacity=1;clearTimeout(hitT);hitT=setTimeout(()=>hitEl.style.opacity=0,head?220:120);if(head&&AC)click();}
// pickups: vests from downed officers, cash and first-aid kits from people, now and then a gun from a tactical unit
const vestGeo=mergeGeometries([gbox(.46,.56,.14,0,0,0),gbox(.12,.14,.12,-.15,.33,0),gbox(.12,.14,.12,.15,.33,0)]);
const DROPM={vest:new THREE.MeshStandardMaterial({color:0x26364f,emissive:0x2f7bff,emissiveIntensity:.55,roughness:.6}),
  cash:new THREE.MeshStandardMaterial({color:0x3f9a4d,emissive:0x2fbf5a,emissiveIntensity:.5,roughness:.7}),
  health:new THREE.MeshStandardMaterial({color:0xf4f4f4,emissive:0xff4040,emissiveIntensity:.3,roughness:.5}),
  gun:new THREE.MeshStandardMaterial({color:0xd4af37,emissive:0xffc040,emissiveIntensity:.5,metalness:.8,roughness:.3})};
const DROPG={vest:vestGeo,cash:mergeGeometries([gbox(.34,.07,.17,0,0,0),gbox(.34,.07,.17,.03,.075,.02),gbox(.34,.07,.17,-.02,.15,-.01)]),
  health:mergeGeometries([gbox(.42,.3,.24,0,0,0),gbox(.26,.07,.02,0,0,.13),gbox(.07,.26,.02,0,0,.13)])};
const DROPS=[];
function dropItem(kind,x,z,amt){if(DROPS.length>=14){const o=DROPS.shift();scene.remove(o.m);}
  const m=new THREE.Mesh(kind==='gun'?GUNGEO[amt]:DROPG[kind],DROPM[kind]);if(kind==='gun')m.scale.setScalar(2.2);m.position.set(x,groundH(x,z)+.7,z);scene.add(m);DROPS.push({kind,m,x,z,amt,t:60});}
const dropVest=(x,z,amt)=>dropItem('vest',x,z,amt);
function takeDrop(o){
  if(o.kind==='vest'){if((G.armor||0)>=100)return false;G.armor=min(100,(G.armor||0)+o.amt);flash('+ ARMOUR',1.2);}
  else if(o.kind==='cash'){G.cash+=o.amt;flash('+$'+o.amt,1);}
  else if(o.kind==='health'){if(G.hp>=100)return false;G.hp=min(100,G.hp+o.amt);flash('+ HEALTH',1.2);}
  else if(o.kind==='gun'){if(!ARM.own[o.amt]){ARM.own[o.amt]=true;SAVE.guns=ARM.own.map((v,k)=>v?k:-1).filter(k=>k>=0);flash(WEAPONS[o.amt].n.toUpperCase()+' PICKED UP',1.6);}else{G.cash+=300;flash('+$300',1);}}
  click();return true;}
function stepPicks(dt){for(let i=DROPS.length-1;i>=0;i--){const o=DROPS[i];o.t-=dt;o.m.rotation.y+=dt*2;o.m.position.y=groundH(o.x,o.z)+.7+sin(G.sigT*3+i)*.08;
  if(!G.car&&!player.hidden&&hypot(player.x-o.x,player.z-o.z)<1.4&&takeDrop(o))o.t=0;
  if(o.t<=0){scene.remove(o.m);DROPS.splice(i,1);}}}
// weapon wheel: hold Q, flick the mouse toward a weapon, let go. The world slows down while it's open.
const WH={open:false,x:0,y:0,sel:0},whEl=$('wwheel'),whS=WEAPONS.map((w,i)=>{const e=document.createElement('div');e.className='s';
  const a=i/WEAPONS.length*2*PI;e.style.transform=`translate(${sin(a)*128}px,${-cos(a)*128}px)`;e.dataset.a=a;whEl.appendChild(e);return e;});
function openWheel(){if(WH.open||G.car||G.busy||CUT||PANEL)return;WH.open=true;WH.x=WH.y=0;WH.sel=ARM.w;ARM.fire=ARM.trigger=false;
  whS.forEach((e,i)=>{const W=WEAPONS[i];e.innerHTML=W.n+(!ARM.own[i]?'<small>Bullet Barn</small>':W.mag?`<small>${ARM.ammo[i]} / ${W.mag}</small>`:'<small>combo</small>');e.style.opacity=ARM.own[i]?'':'.3';});drawWheel();whEl.style.display='block';}
function wheelMove(dx,dy){WH.x=clamp(WH.x+dx,-80,80);WH.y=clamp(WH.y+dy,-80,80);if(hypot(WH.x,WH.y)>25){let a=atan2(WH.x,-WH.y);if(a<0)a+=2*PI;WH.sel=round(a/(2*PI)*WEAPONS.length)%WEAPONS.length;drawWheel();}}
function drawWheel(){whS.forEach((e,i)=>e.className='s'+(i===WH.sel?' on':'')+(i===ARM.w?' cur':''));}
function closeWheel(pick){if(!WH.open)return;WH.open=false;whEl.style.display='none';if(pick)selectWeapon(WH.sel);}

export { ARM, WEAPONS, WH, click, fireWeapon, selectWeapon, stepCombat };
