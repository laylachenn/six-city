// Six City — bikes. One of the game's modules; they load in numbered order (src/game/index.js).
import './19-harbour.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { __gs, __late, later } from './shared.js';
import { C3, MAP, PI, TEST, abs, atan2, camera, clamp, cos, groundH, hypot, max, min, rpick, scene, sign, sin, wrap } from './01-core.js';
import { GB, ONE, _e, _m, _q, _s, _v, nearestEdge, pushOut, solidAt, walkable } from './04-world.js';
import { curbSpot } from './05-landmarks.js';
import { SLOTS, carStatic, cars, drive } from './06-cars.js';
import { G, flash, player } from './08-input.js';
import { SAVE } from './11-missions.js';
import { thud } from './17-audio.js';
import { boxGB, fq, offWater } from './19-harbour.js';
later({BIKES:()=>BIKES,boardBike:()=>boardBike,leaveBike:()=>leaveBike,mkBike:()=>mkBike,nearBike:()=>nearBike}); // for earlier modules, read when called

/* ============================== two wheels: motorcycles and share bikes ==============================
   Motorcycles park at the kerb among the cars; share bikes wait at the city's real bike-share docks (MAP.bikeDocks,
   from OpenStreetMap: every docking station, its name and size). F to get on. They use the car handling with a lean
   into turns; you stay visible, seated (and pedalling on a bike), and a hard crash throws you off. */
const BKT=[
  {name:'Sport Bike',moto:1,L:2.1,W:.8,wb:1.42,wr:.31,seat:.98,accel:17,maxSpeed:62,grip:8,tire:1.8},
  {name:'Cruiser',moto:1,L:2.35,W:.9,wb:1.6,wr:.33,seat:.74,accel:11,maxSpeed:46,grip:7,tire:2},
  {name:'City Bike',pedal:1,L:1.8,W:.7,wb:1.08,wr:.34,seat:1.0,accel:3.8,maxSpeed:8.5,grip:8.5,tire:.75}];
for(const T of BKT){T.offs=[-T.L*.3,0,T.L*.3];T.roofH=1.43;}
const MOTOCOL=[0xd8203a,0x111317,0x1f5fd0,0xf2b705,0xe8e8e8,0x2a9d5c,0xff6a13];
function tubeGB(gb,a,b,r,col){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],L=hypot(dx,dy,dz)||1,ux=dx/L,uy=dy/L,uz=dz/L;
  let px=-uz,py=0,pz=ux;if(hypot(px,pz)<.1){px=1;py=0;pz=0;}let pl=hypot(px,py,pz);px/=pl;py/=pl;pz/=pl; // a side vector, then the other one
  const qx=uy*pz-uz*py,qy=uz*px-ux*pz,qz=ux*py-uy*px,c=[[px,py,pz],[qx,qy,qz],[-px,-py,-pz],[-qx,-qy,-qz]];
  for(let i=0;i<4;i++){const n=c[i],m=c[(i+1)%4],o1=[n[0]*r,n[1]*r,n[2]*r],o2=[m[0]*r,m[1]*r,m[2]*r];
    fq(gb,[a[0]+o1[0],a[1]+o1[1],a[2]+o1[2]],[b[0]+o1[0],b[1]+o1[1],b[2]+o1[2]],[b[0]+o2[0],b[1]+o2[1],b[2]+o2[2]],[a[0]+o2[0],a[1]+o2[1],a[2]+o2[2]],[n[0]+m[0],n[1]+m[1],n[2]+m[2]],col);}}
function bikeGeo(i){const gb=new GB(),P=C3(1,1,1),D=C3(.07,.07,.08),S=C3(.72,.72,.74),Lt=C3(3,3,2.6),T=BKT[i],f=T.wb/2,r=T.wr;
  if(i===0){ // sport bike: full fairing, tank, raised tail, clip-ons
    fq(gb,[-.22,.55,.25],[.22,.55,.25],[.18,1.08,.62],[-.18,1.08,.62],[0,.3,1],P);fq(gb,[-.22,.55,.25],[-.18,1.08,.62],[-.2,1.02,.15],[-.24,.5,0],[-1,0,0],P);fq(gb,[.22,.55,.25],[.18,1.08,.62],[.2,1.02,.15],[.24,.5,0],[1,0,0],P);
    boxGB(gb,0,.82,.12,.42,.24,.42,P);fq(gb,[-.14,.9,-.25],[.14,.9,-.25],[.08,1.06,-.82],[-.08,1.06,-.82],[0,1,0],P);fq(gb,[-.14,.9,-.25],[-.08,1.06,-.82],[-.08,.86,-.82],[-.14,.8,-.25],[-1,0,0],P);fq(gb,[.14,.9,-.25],[.08,1.06,-.82],[.08,.86,-.82],[.14,.8,-.25],[1,0,0],P);
    boxGB(gb,0,.35,0,.34,.42,.55,D);boxGB(gb,0,.92,-.3,.3,.07,.45,D);fq(gb,[-.15,1.08,.62],[.15,1.08,.62],[.1,1.2,.48],[-.1,1.2,.48],[0,.6,1],C3(.15,.2,.25));
    for(const s of[-1,1]){tubeGB(gb,[s*.09,r,f],[s*.09,1.0,f-.18],.03,S);tubeGB(gb,[s*.06,r,-f],[s*.06,.5,-.05],.035,D);}
    boxGB(gb,0,.98,.5,.62,.04,.05,D);tubeGB(gb,[.18,.38,-.15],[.2,.62,-.78],.06,S);boxGB(gb,0,.86,.64,.16,.1,.05,Lt);}
  else if(i===1){ // cruiser: low seat, teardrop tank, raked fork, wide bars, lots of chrome
    boxGB(gb,0,.62,.15,.36,.24,.6,P);fq(gb,[-.18,.86,.45],[.18,.86,.45],[.12,.8,-.1],[-.12,.8,-.1],[0,1,0],P);
    boxGB(gb,0,.3,-.05,.38,.4,.6,S);boxGB(gb,0,.62,-.42,.34,.1,.5,C3(.2,.12,.08));boxGB(gb,0,.6,-.82,.32,.12,.3,P);
    for(const s of[-1,1]){tubeGB(gb,[s*.1,r,f],[s*.1,1.0,f-.42],.032,S);tubeGB(gb,[s*.07,r,-f],[s*.07,.45,-.1],.035,S);tubeGB(gb,[s*.2,.32,.05],[s*.21,.36,-.95],.045,S);}
    tubeGB(gb,[-.45,1.06,f-.48],[.45,1.06,f-.48],.02,S);tubeGB(gb,[0,.98,f-.4],[0,1.06,f-.48],.03,S);boxGB(gb,0,.82,f-.3,.18,.16,.12,Lt);}
  else{ // city bike: step-through frame, basket, fenders, upright bars
    tubeGB(gb,[0,.36,-.1],[0,.96,-.22],.03,P);tubeGB(gb,[0,.38,-.08],[0,.9,f-.2],.035,P);tubeGB(gb,[0,.62,-.16],[0,.88,f-.22],.03,P);
    for(const s of[-1,1]){tubeGB(gb,[s*.05,r,-f],[0,.36,-.1],.018,P);tubeGB(gb,[s*.05,r,-f],[0,.92,-.2],.016,P);tubeGB(gb,[s*.05,r,f],[0,.92,f-.18],.02,P);}
    tubeGB(gb,[0,.92,f-.2],[0,1.1,f-.26],.022,D);tubeGB(gb,[-.3,1.12,f-.32],[.3,1.12,f-.32],.016,D);boxGB(gb,0,.98,-.24,.16,.06,.26,D);tubeGB(gb,[0,.36,-.1],[0,.96,-.22],.01,D);
    boxGB(gb,0,.9,f+.06,.3,.17,.24,C3(.42,.44,.46));for(const z of[-f,f])fq(gb,[-.05,r+.36,z-.28],[.05,r+.36,z-.28],[.05,r+.36,z+.28],[-.05,r+.36,z+.28],[0,1,0],P);
    boxGB(gb,0,.9,f+.24,.1,.08,.04,Lt);}
  return gb.geo();}
const bikeMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.4,metalness:.25,side:THREE.DoubleSide});
const BKIM=BKT.map((T,i)=>{const m=new THREE.InstancedMesh(bikeGeo(i),bikeMat,90);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.setColorAt(0,new THREE.Color());m.count=0;m.castShadow=true;m.frustumCulled=false;scene.add(m);return m;});
// wheels: a unit tyre (axis along x) and a rim with spokes, scaled to each wheel
const tyreGeo=new THREE.TorusGeometry(.92,.1,6,22).rotateY(PI/2);
const rimGeo=(()=>{const parts=[new THREE.TorusGeometry(.8,.035,4,22).rotateY(PI/2)];for(let k=0;k<8;k++){const b=new THREE.BoxGeometry(.02,1.6,.02);b.rotateX(k/8*PI);parts.push(b);}parts.push(new THREE.CylinderGeometry(.12,.12,.12,8).rotateZ(PI/2));return mergeGeometries(parts);})();
const WTY=new THREE.InstancedMesh(tyreGeo,new THREE.MeshStandardMaterial({color:0x151517,roughness:.9}),540),WRM=new THREE.InstancedMesh(rimGeo,new THREE.MeshStandardMaterial({color:0xb9bcc2,metalness:.7,roughness:.35}),540);
for(const m of[WTY,WRM]){m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.count=0;m.frustumCulled=false;m.castShadow=true;scene.add(m);}

// --- the docks: a payment kiosk and a rack along the kerb at every real station; bikes are racked only near you
const DOCKS=(MAP.bikeDocks||[]).map(d=>{let x=d.x,z=d.z;if(!walkable(x,z)||solidAt(x,1,z)){const s=curbSpot(x,z,'walk');if(s){x=s.x;z=s.z;}}
  const r=nearestEdge(x,z,40),th=r?atan2(r.tx,r.tz):0;return{x,z,th,n:d.n,c:d.c,bikes:[],near:false,seed:hashCode(d.n+x)};});
{const kio=new THREE.InstancedMesh(new THREE.BoxGeometry(.55,1.75,.4),new THREE.MeshStandardMaterial({color:0x2f8f4e,roughness:.5}),max(1,DOCKS.length)),
   rack=new THREE.InstancedMesh(new THREE.BoxGeometry(.18,.32,1),new THREE.MeshStandardMaterial({color:0x4a4f55,metalness:.5,roughness:.5}),max(1,DOCKS.length));
  DOCKS.forEach((d,i)=>{const len=min(12,d.c*.55),fx=sin(d.th),fz=cos(d.th);d.len=len;d.kx=d.x-fx*(len/2+.6);d.kz=d.z-fz*(len/2+.6);
    _m.makeRotationY(d.th);_m.setPosition(d.kx,.87,d.kz);kio.setMatrixAt(i,_m);_m.makeRotationY(d.th);_m.scale(_v.set(1,1,len));_m.setPosition(d.x,.16,d.z);rack.setMatrixAt(i,_m);});
  for(const m of[kio,rack]){m.count=DOCKS.length;m.receiveShadow=true;scene.add(m);}}
// many real docks sit in the parking lane: keep parked cars out of them
for(const d of DOCKS){const fx=sin(d.th),fz=cos(d.th);for(const s of SLOTS){const dx=s.x-d.x,dz=s.z-d.z;if(abs(dx)>12||abs(dz)>12)continue;const a=dx*fx+dz*fz,b=-dx*fz+dz*fx;if(abs(a)<d.len/2+3.5&&abs(b)<3)s.blocked=true;}}
function hashCode(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h;}

const BIKES=[];
function mkBike(ti,x,z,th,mode,col){const T=BKT[ti];const b={bike:true,T,ti:-1,bt:ti,x,z,y:groundH(x,z),th,vx:0,vz:0,w:0,steer:0,spin:0,roll:mode==='parked'?.12:0,pitch:0,speed:0,thr:0,slip:0,hp:T.pedal?60:100,mode,
  color:new THREE.Color(col??(T.pedal?0x2f8f4e:rpick(MOTOCOL))),fallen:0};BIKES.push(b);return b;}
function rmBike(b){const k=BIKES.indexOf(b);if(k>=0)BIKES.splice(k,1);}
function nearBike(r=2.4){let best=null,bd=r;for(const b of BIKES){if(b===G.car)continue;const d=hypot(b.x-player.x,b.z-player.z);if(d<bd){bd=d;best=b;}}return best&&{b:best,d:bd};}
function boardBike(b){
  if(b.mode==='docked'){if(G.cash>=3){G.cash-=3;flash('CITY BIKE · $3',1.6);}else flash('CITY BIKE — THE DOCK LETS YOU OFF THIS TIME',1.8);
    if(b.dock){b.dock.bikes=b.dock.bikes.filter(q=>q!==b);b.dock=null;}SAVE.stats.rides=(SAVE.stats.rides||0)+1;}
  b.mode='player';b.fallen=0;b.spawned=false;G.car=b;player.hidden=false;player.ride=b;player.amp=0;__late.click();}
function leaveBike(){const b=G.car;if(hypot(b.vx,b.vz)>4){flash('Slow down to get off',1.2);return;}
  const fx=sin(b.th),fz=cos(b.th);let x=b.x+fz*.8,z=b.z-fx*.8;if(!walkable(x,z)||pushOut(x,z,.3)){x=b.x-fz*.8;z=b.z+fx*.8;}
  player.x=x;player.z=z;player.y=groundH(x,z);player.vy=0;player.th=b.th;player.ride=null;player.roll=0;b.mode='free';G.car=null;}
function throwOff(b,imp){const fx=sin(b.th),fz=cos(b.th),x=b.x+fx*1.4,z=b.z+fz*1.4,ok=walkable(x,z)&&!solidAt(x,1,z);
  G.car=null;player.ride=null;player.roll=0;b.mode='free';b.fallen=1;player.x=ok?x:b.x;player.z=ok?z:b.z;player.y=groundH(player.x,player.z)+.3;player.vy=4;player.th=b.th;
  __late.hurt(min(45,imp*2.4));G.hurtCd=.8;G.shake=.6;thud(.6);flash('THROWN OFF',1.4);}
// after the shared car handling: lean into the turn, the rider sits on the seat, and a big hit throws you off
function bikeAfter(c,dt){const T=c.T,sp=hypot(c.vx,c.vz),yaw=c.lth===undefined?0:wrap(c.th-c.lth)/max(dt,1e-3);c.lth=c.th;
  c.roll+=(clamp(-Math.atan(sp*yaw/9.8),-.75,.75)-c.roll)*min(1,dt*8);c.pitch*=.5;
  if(c===G.car){if((c.lastImp||0)>(T.pedal?6:9)){const i=c.lastImp;c.lastImp=0;throwOff(c,i);return;}c.lastImp=0;
    player.x=c.x;player.z=c.z;player.y=c.y+T.seat-.9*player.sc;player.th=c.th;player.roll=c.roll;player.amp=0;}}
function stepBikes(dt){
  if(!(G.car&&G.car.bike)&&(player.ride||player.roll)){player.ride=null;player.roll=0;}
  // rack bikes at the docks around you, take back the ones nobody rode
  if(G.frame%30===0){for(const d of DOCKS){const dd=abs(d.x-__gs.FX)+abs(d.z-__gs.FZ);
    if(!d.near&&dd<170){d.near=true;const n=2+((d.seed>>>3)%max(1,min(7,d.c/4|0))),fx=sin(d.th),fz=cos(d.th);
      for(let k=0;k<n;k++){const o=-d.len/2+.6+k*.75;if(o>d.len/2)break;const bth=d.th+PI/2+((d.seed>>k)&1?PI:0),b=mkBike(2,d.x+fx*o-sin(bth)*.7,d.z+fz*o-cos(bth)*.7,bth,'docked');b.dock=d;d.bikes.push(b);}}
    else if(d.near&&dd>240){d.near=false;for(const b of d.bikes)rmBike(b);d.bikes=[];}}}
  for(let i=BIKES.length-1;i>=0;i--){const b=BIKES[i];if(b===G.car)continue;
    if(b.spawned&&!b.dock&&hypot(b.x-__gs.FX,b.z-__gs.FZ)>240){rmBike(b);continue;}
    if(b.mode==='free'){drive(b,0,0,true,dt);carStatic(b);bikeAfter(b,dt);if(hypot(b.vx,b.vz)<.15){b.vx=b.vz=b.w=0;b.mode='parked';if(!b.fallen)b.roll=b.T.pedal?.1:.14;}}
    if(b.fallen)b.roll+=((b.roll>=0?1.35:-1.35)-b.roll)*min(1,dt*6);
    // a car (yours) knocks parked and docked bikes over
    const c=G.car;if(c&&!c.bike&&!c.boat&&b.mode!=='free'){const dx=b.x-c.x,dz=b.z-c.z,fx=sin(c.th),fz=cos(c.th),lf=dx*fx+dz*fz,ll=-dx*fz+dz*fx;
      if(abs(lf)<c.T.L/2+.4&&abs(ll)<c.T.W/2+.4&&hypot(c.vx,c.vz)>1.5){b.mode='free';b.fallen=1;b.vx=c.vx*.7+(-fz*sign(ll||1))*2;b.vz=c.vz*.7+(fx*sign(ll||1))*2;if(b.dock){b.dock.bikes=b.dock.bikes.filter(q=>q!==b);b.dock=null;b.spawned=true;}thud(.25);}}}}
function syncBikes(){const cnt=[0,0,0];let wn=0;const cx=camera.position.x,cz=camera.position.z;
  for(const b of BIKES){if(abs(b.x-cx)>260||abs(b.z-cz)>260)continue;const T=b.T,k=cnt[b.bt];if(k>=90)continue;cnt[b.bt]++;
    _e.set(b.pitch,b.th,b.roll,'YXZ');_m.compose(_v.set(b.x,b.y,b.z),_q.setFromEuler(_e),ONE);BKIM[b.bt].setMatrixAt(k,_m);BKIM[b.bt].setColorAt(k,b.color);
    for(const w of[1,-1]){if(wn>=540)break;const st=w>0?b.steer*.6:0;__late._e2.set(-b.spin,st,0,'YXZ');__late._m2.compose(_v.set(0,T.wr,w*T.wb/2),_q.setFromEuler(__late._e2),_s.set(T.tire*T.wr,T.wr,T.wr));__late._m3.multiplyMatrices(_m,__late._m2);
      WTY.setMatrixAt(wn,__late._m3);__late._m2.compose(_v.set(0,T.wr,w*T.wb/2),_q.setFromEuler(__late._e2),_s.set(T.wr,T.wr,T.wr));__late._m3.multiplyMatrices(_m,__late._m2);WRM.setMatrixAt(wn,__late._m3);wn++;}}
  BKIM.forEach((m,i)=>{m.count=cnt[i];m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;});
  for(const m of[WTY,WRM]){m.count=wn;m.instanceMatrix.needsUpdate=true;}}
if(TEST){window.__bikes=()=>({n:BIKES.length,docks:DOCKS.length,near:DOCKS.filter(d=>d.near).length,me:G.car&&G.car.bike?{n:G.car.T.name,x:G.car.x|0,z:G.car.z|0,v:+hypot(G.car.vx,G.car.vz).toFixed(1),roll:+G.car.roll.toFixed(2)}:null,
    kinds:BIKES.reduce((a,b)=>(a[b.T.name]=(a[b.T.name]||0)+1,a),{}),motoSlots:SLOTS.filter(s=>s.moto).length,motoNear:SLOTS.filter(s=>s.moto&&abs(s.x-__gs.FX)+abs(s.z-__gs.FZ)<170).map(s=>[abs(s.x-__gs.FX)+abs(s.z-__gs.FZ)|0,!!s.car,s.car?.bike]).slice(0,8),cars:cars.length,hp:G.hp|0,ride:!!player.ride,cash:G.cash,nb:(()=>{const q=nearBike(9);return q&&{d:+q.d.toFixed(2),n:q.b.T.name,m:q.b.mode};})(),pl:[player.x|0,player.z|0],car:!!G.car,uiOpen:G.uiOpen,busy:G.busy});
  window.__bikeGo=kind=>{const b=BIKES.filter(q=>q.T.name===kind&&q!==G.car).sort((a,c)=>hypot(a.x-__gs.FX,a.z-__gs.FZ)-hypot(c.x-__gs.FX,c.z-__gs.FZ))[0];if(!b)return null;offWater();if(G.car)G.car=null;player.x=b.x+.5;player.z=b.z;boardBike(b);return b.T.name;};
  window.__motoSlot=()=>{const L=SLOTS.filter(q=>q.moto).sort((a,b)=>hypot(a.x-__gs.FX,a.z-__gs.FZ)-hypot(b.x-__gs.FX,b.z-__gs.FZ));return L[0]&&[L[0].x,L[0].z];};
  window.__stand=kind=>{const b=BIKES.filter(q=>q.T.name===kind&&q!==G.car).sort((a,c)=>hypot(a.x-__gs.FX,a.z-__gs.FZ)-hypot(c.x-__gs.FX,c.z-__gs.FZ))[0];if(!b)return null;player.x=b.x+cos(b.th)*1.1;player.z=b.z-sin(b.th)*1.1;__gs.FX=player.x;__gs.FZ=player.z;__gs.camYaw=b.th+PI/2;return [b.x|0,b.z|0];};
  window.__dockNear=()=>{const d=DOCKS.slice().sort((a,b)=>hypot(a.x-__gs.FX,a.z-__gs.FZ)-hypot(b.x-__gs.FX,b.z-__gs.FZ))[0];return d&&{n:d.n,x:d.x,z:d.z,th:d.th,bikes:d.bikes.length};};}

export { bikeAfter, nearBike, stepBikes, syncBikes };
