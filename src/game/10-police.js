// Six City — police. One of the game's modules; they load in numbered order (src/game/index.js).
import './09-characters.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { __gs, __late, later } from './shared.js';
import { $, CURB, EDGES, NODES, PI, PLAY, abs, atan2, clamp, cos, exp, floor, groundH, hypot, max, min, rnd, round, rpick, scene, sign, sin, sqrt, wrap } from './01-core.js';
import { night } from './02-sky.js';
import { PO, _lp, edgePt, nearestEdge, nodesNear, pushOut, solidAt, walkable } from './04-world.js';
import { SPOTS, START, placeName } from './05-landmarks.js';
import { CARCOL, carHitsPeds, carStatic, cars, collideCars, drive, mkCar, nearestNode, pathTo, rmCar } from './06-cars.js';
import { GARAGES, NCOP, emit, jobBeacon, peds, placePed, tint } from './07-people.js';
import { G, flash, player } from './08-input.js';
later({WANT:()=>WANT,addHeat:()=>addHeat,stepCop:()=>stepCop}); // for earlier modules, read when called

/* ============================== jobs / heat / respawn ============================== */
function roadPoint(){for(let t=0;t<40;t++){const e=rpick(EDGES);if(!e.ai||e.L<30)continue;edgePt(e,15+rnd()*(e.L-30),_lp);const off=(e.hw-1.3)*(rnd()<.5?1:-1),x=_lp.x-_lp.tz*off,z=_lp.z+_lp.tx*off;
  if(x<PLAY.x0+80||x>PLAY.x1-80||z<PLAY.z0+80||z>PLAY.z1-80||!walkable(x,z))continue;return[x,z];}return[START.cx,START.cz];}
function farPoint(lo,hi){for(let t=0;t<60;t++){const q=roadPoint(),d=hypot(q[0]-__gs.FX,q[1]-__gs.FZ);if(d>lo&&d<hi)return q;}return roadPoint();}
function stepJob(dt){
  if(__late.MS){jobBeacon.visible=false;return;}
  if(__gs.IN&&!__gs.IN.real){jobBeacon.visible=false;$('job').textContent=G.job?'📦 Courier job waiting outside':'';return;}
  const J=G.job;
  if(!J){G.jobWait-=dt;if(G.jobWait<=0){const[x,z]=farPoint(120,330);G.job={stage:0,x,z,where:placeName(x,z)};jobBeacon.material.color.set(0xffd23f);flash('NEW COURIER JOB',2);}jobBeacon.visible=false;$('job').textContent='';return;}
  jobBeacon.visible=true;jobBeacon.position.set(J.x,0,J.z);
  const d=hypot(J.x-__gs.FX,J.z-__gs.FZ);
  if(J.stage===0){$('job').textContent=`📦 Pick up at ${J.where} — ${d|0} m`;
    if(d<4.5){const[x,z]=farPoint(260,560),dist=hypot(x-J.x,z-J.z);G.job={stage:1,x,z,t:dist/8+25,pay:round((120+dist*1.1)/10)*10,where:placeName(x,z)};jobBeacon.material.color.set(0x3fd9ff);flash('PACKAGE COLLECTED',1.6);}}
  else{J.t-=dt;const s=max(0,J.t|0);$('job').textContent=`🚚 Deliver to ${J.where} — ${d|0} m — ${s/60|0}:${String(s%60).padStart(2,'0')} — $${J.pay}`;
    if(d<4.5){G.cash+=J.pay;flash('DELIVERED  +$'+J.pay,2.4);G.job=null;G.jobWait=5;}
    else if(J.t<=0){flash('TOO LATE — JOB FAILED',2.2);G.job=null;G.jobWait=6;}}
}
/* ============================== wanted system ============================== */
// Six levels, three states.
//  RESPONDING (resp): someone reported you. Units head for the crime scene, the hot zone on the map. Get out of it
//                     before anyone spots you and the call goes cold.
//  IN PURSUIT (act):  a unit can see you. They chase, put officers on the street and, from level 2, shoot.
//  SEARCHING (srch):  they lost sight of you and comb the area around where you were last seen. Stay out of it to slip away.
// Witnesses phone it in a few seconds after a crime (stop them and nobody calls); police who see a crime react at once.
const WL=[null, // per level: cruisers, tactical vans, helicopter, roadblocks, spike strips
  {c:1,s:0,heli:0,rb:0,spk:0},{c:2,s:0,heli:0,rb:0,spk:0},{c:3,s:0,heli:0,rb:1,spk:0},
  {c:3,s:0,heli:1,rb:1,spk:1},{c:2,s:2,heli:1,rb:1,spk:1},{c:1,s:3,heli:1,rb:1,spk:1}];
const COPCOL=0x2a2e34,SWATCOL=0x121418;
const WANT={state:null,sx:0,sz:0,lkx:0,lkz:0,lost:0,cool:0,seen:false,pend:null,hostile:false,spawnCd:0,rbCd:8,shotCd:0,heliCd:0,sightT:0,calm:0};
const wLvl=()=>min(6,floor(G.heat));
const wCen=()=>WANT.state==='resp'?[WANT.sx,WANT.sz]:[WANT.lkx,WANT.lkz];
const wR=()=>WANT.state==='resp'?45+wLvl()*10:70+wLvl()*22;     // hot zone / search area radius
const wNeed=()=>WANT.state==='resp'?5+wLvl()*2:7+wLvl()*3;       // seconds outside it, unseen, to get away
function los(ax,ay,az,bx,by,bz){const dx=bx-ax,dy=by-ay,dz=bz-az,L=hypot(dx,dy,dz);for(let t=2;t<L-1.5;t+=2.5)if(solidAt(ax+dx/L*t,ay+dy/L*t,az+dz/L*t))return false;return true;}
const isCopCar=c=>c.mode==='police'&&!c.boom&&!c.ai.leave;
const activeCop=p=>p.copPed&&p.cop&&!p.hidden&&p.state!=='dead'&&p.state!=='down';
function unitSees(x,y,z){
  for(const c of cars){if(c.boom||!(isCopCar(c)||c.mode==='block'))continue;if(hypot(c.x-x,c.z-z)<62&&los(c.x,c.y+1.3,c.z,x,y,z))return true;}
  for(const p of peds){if(!activeCop(p)||p.cop.ret)continue;if(hypot(p.x-x,p.z-z)<46&&los(p.x,p.y+1.6,p.z,x,y,z))return true;}
  if(__late.HB.cop&&__late.HB.cop.mode==='police'&&hypot(__late.HB.cop.x-x,__late.HB.cop.z-z)<95)return true;
  if(HELI.on&&HELI.state==='hunt'&&hypot(HELI.x-x,HELI.z-z)<72&&los(HELI.x,HELI.y-2,HELI.z,x,y,z))return true;
  return false;}
function bump(v,cap){const b=floor(G.heat);cap=cap||6.4;if(G.heat<cap)G.heat=min(cap,G.heat+v);G.heat=min(6.4,G.heat);
  const n=floor(G.heat);if(n>b&&n>=1)flash('WANTED  '+'⬢'.repeat(n),1.6);}
// every crime goes through here. o.loud: gunfire/explosions get reported even with nobody standing next to you. o.cap: most it can raise the level to
function crime(v,x,z,o){
  if(G.busy||G.menuCam||__late.CUT)return;o=o||{};
  if(__gs.IN&&!__gs.IN.real){bump(v,o.cap);return;}
  if(WANT.state==='act'||unitSees(x,1.2,z)){bump(v,o.cap);if(G.heat>=1&&WANT.state!=='act')wAct(x,z);return;}
  if(WANT.state){bump(v,o.cap);if(WANT.state==='resp'){WANT.sx=x;WANT.sz=z;}else{WANT.lkx=x;WANT.lkz=z;}WANT.cool=0;return;}
  if(WANT.pend){const P=WANT.pend;P.v+=v;P.x=x;P.z=z;if(o.loud&&P.p){P.p=null;P.t=max(P.t,4);}return;} // gunfire: someone you can't see calls it in too
  let wit=null,bd=o.loud?55:38;
  for(let k=1;k<peds.length;k++){const p=peds[k];if(p.hidden||p.copPed||p.actor||p.ins||p.state==='dead')continue;const d=hypot(p.x-x,p.z-z);if(d<bd){bd=d;wit=p;}}
  if(!wit&&!o.loud)return;
  WANT.pend={v,cap:o.cap,x,z,p:wit,t:wit?3+rnd()*2:7};
  if(wit&&wit.state!=='down'){wit.state='flee';wit.timer=12;}
}
function addHeat(v){crime(v,__gs.FX,__gs.FZ);}
function shotsFired(){if(WANT.shotCd>0||(__gs.IN&&!__gs.IN.real))return;WANT.shotCd=2.5;
  if(WANT.state==='act'){WANT.hostile=true;return;}crime(.5,__gs.FX,__gs.FZ,{loud:1,cap:2.2});}
function wReport(x,z){WANT.state='resp';WANT.sx=x;WANT.sz=z;WANT.lkx=x;WANT.lkz=z;WANT.cool=0;WANT.lost=0;flash('POLICE RESPONDING',1.6);}
function wAct(){WANT.state='act';WANT.lkx=__gs.FX;WANT.lkz=__gs.FZ;WANT.lost=0;WANT.cool=0;}
// the police give up: cars drive off, officers walk back, the helicopter leaves
function wClear(msg){G.heat=0;G.arrestT=0;WANT.state=null;WANT.pend=null;WANT.hostile=false;WANT.seen=false;
  for(const c of cars)if(c.mode==='police')c.ai.leave=true;
  for(const p of peds)if(p.copPed&&p.cop)p.cop.ret=true;
  if(HELI.on&&HELI.state!=='down')HELI.state='leave';
  if(msg)flash(msg,2.2);}
// arrested, knocked out or teleported: everything goes at once
function clearPolice(){G.heat=0;G.arrestT=0;Object.assign(WANT,{state:null,pend:null,hostile:false,seen:false,spawnCd:0,rbCd:8,heliCd:0});
  for(const B of RB)dropRB(B,true);RB.length=0;
  for(let k=cars.length-1;k>=0;k--)if(cars[k]!==G.car&&(cars[k].mode==='police'||cars[k].rb))cars.splice(k,1);
  for(const p of peds)if(p.copPed)releaseCop(p);
  HELI.on=false;heliG.visible=false;heliCone.visible=false;heliSpot.intensity=0;}

function stepWanted(dt){
  if(__gs.IN&&!__gs.IN.real){if(G.hp<=0)respawn('KNOCKED OUT',SPOTS.hospital);G.hurtCd-=dt;if(G.hurtCd<-4)G.hp=min(100,G.hp+dt*3);return;}
  WANT.shotCd-=dt;WANT.spawnCd-=dt;WANT.rbCd-=dt;WANT.heliCd-=dt;
  // a witness on the phone
  if(WANT.pend){const P=WANT.pend;P.t-=dt;
    if(P.p&&(P.p.state==='dead'||P.p.hidden)){WANT.pend=null;G.note='The witness never finished the call';G.noteT=4;}
    else if(P.t<=0){WANT.pend=null;bump(P.v,P.cap);if(G.heat>=1&&!WANT.state)wReport(P.x,P.z);}}
  if(G.heat>=1&&!WANT.state)wReport(__gs.FX,__gs.FZ); // heist alarms and stolen cruisers set the level directly
  const lvl=wLvl();
  if(lvl<1){if(WANT.state)wClear();WANT.calm+=dt;if(WANT.calm>4)G.heat=max(0,G.heat-dt*.08);}else WANT.calm=0;
  // what the police can see
  if(WANT.state){
    if((WANT.sightT-=dt)<=0){WANT.sightT=.15;WANT.seen=unitSees(__gs.FX,G.car?1:player.y+1.2,__gs.FZ);}
    if(WANT.seen){if(WANT.state!=='act')wAct();WANT.lkx=__gs.FX;WANT.lkz=__gs.FZ;WANT.lost=0;WANT.cool=0;}
    else if(WANT.state==='act'){WANT.lost+=dt;if(WANT.lost>2.5){WANT.state='srch';WANT.cool=0;}}
    else{const[cx,cz]=wCen(),out=hypot(__gs.FX-cx,__gs.FZ-cz)>wR();WANT.cool+=dt*(out?1:WANT.state==='resp'?0:.25);if(WANT.cool>=wNeed())wClear('SLIPPED AWAY');}
  }else WANT.seen=false;
  // units
  let near=1e9,nc=0,ns=0;
  for(const c of cars)if(isCopCar(c)){if(c.swat)ns++;else nc++;near=min(near,hypot(c.x-__gs.FX,c.z-__gs.FZ));}
  G.copDist=WANT.state?near:1e9;
  if(WANT.state&&lvl>=1){const L=WL[lvl];
    if(WANT.spawnCd<=0){if(nc<L.c){spawnPolice(false);WANT.spawnCd=1.1;}else if(ns<L.s){spawnPolice(true);WANT.spawnCd=1.1;}}
    if(L.heli&&!HELI.on&&WANT.heliCd<=0)spawnHeli();
    if(L.rb&&WANT.state==='act'&&G.car&&G.focusSpeed>10&&WANT.rbCd<=0&&RB.length<2)WANT.rbCd=tryRoadblock()?24:3;
    // officers get out once they've caught up with you
    if(WANT.state==='act')for(const c of cars)if(isCopCar(c)&&!c.ai.hold&&c.ai.dcd<=0&&hypot(c.vx,c.vz)<3.5&&hypot(c.x-__gs.FX,c.z-__gs.FZ)<24&&(!G.car||G.focusSpeed<5))deployCrew(c);
  }
  stepRoadblocks(dt);stepHeli(dt);
  for(const p of peds)if(p.copPed&&p.cop&&(p.state==='dead'||p.state==='down')&&hypot(p.x-__gs.FX,p.z-__gs.FZ)>90)releaseCop(p);
  // arrest: an officer within reach (or a cruiser right next to you) while you're standing still
  let grab=false;
  if(lvl>=1&&WANT.state==='act'&&G.focusSpeed<2.5){
    for(const p of peds)if(activeCop(p)&&!p.cop.ret&&hypot(p.x-__gs.FX,p.z-__gs.FZ)<(G.car?3.4:1.7)){grab=true;break;}
    if(!grab&&!G.car&&near<6.5)grab=true;}
  if(grab){if(G.arrestT===0)flash('STOP! POLICE!',1.4);G.arrestT+=dt;if(G.arrestT>2.2)respawn('ARRESTED',SPOTS.police);}
  else G.arrestT=max(0,G.arrestT-dt*2);
  if(G.hp<=0)respawn('KNOCKED OUT',SPOTS.hospital);
  G.hurtCd-=dt;if(!G.car&&G.hurtCd<-4)G.hp=min(100,G.hp+dt*3);
}

// --- police shooting at you (from a car window, on foot or from the helicopter)
const _wa=new THREE.Vector3(),_wb=new THREE.Vector3();
function copShot(ax,ay,az,acc,dmg){
  const ty=G.car?1:player.y+1.2;if(!los(ax,ay,az,__gs.FX,ty,__gs.FZ))return false;
  const d=hypot(__gs.FX-ax,__gs.FZ-az)||1;_wa.set(ax,ay,az);_wb.set(__gs.FX+(rnd()-.5)*1.4,ty+(rnd()-.5)*.8,__gs.FZ+(rnd()-.5)*1.4);
  __late.tracer(_wa,_wb);__late.bang(.35*clamp(20/d,.25,1));
  if(G.car)acc*=.8;if(G.focusSpeed>6)acc*=.7;
  if(rnd()<acc){if(G.car)G.car.hp=max(0,G.car.hp-dmg*.55);else{__late.hurt(dmg);G.hurtCd=.6;G.shake=max(G.shake,.25);__late.spray(__gs.FX,ty,__gs.FZ,(__gs.FX-ax)/d,(__gs.FZ-az)/d,3);}}
  return true;}

// --- cruisers and tactical vans
function searchPoint(cx,cz,r){const c=nodesNear(cx,cz,r).filter(n=>n.e.some(i=>EDGES[i].ai));if(c.length){const n=rpick(c);return[n.x,n.z];}return[cx,cz];}
function spawnPolice(swat){
  const[cx,cz]=WANT.state==='act'||!WANT.state?[__gs.FX,__gs.FZ]:wCen();
  const cand=nodesNear(cx,cz,230).filter(n=>hypot(n.x-__gs.FX,n.z-__gs.FZ)>110&&n.e.some(i=>EDGES[i].ai));
  if(!cand.length)return;const n=rpick(cand);
  const c=mkCar(swat?2:0,n.x,n.z,atan2(cx-n.x,cz-n.z),'police',swat?SWATCOL:COPCOL);c.spawned=true;c.swat=!!swat;if(swat)c.hp=140;
  c.ai={stuck:0,rev:0,repath:rnd(),path:[],pi:0,gcd:2,crew:[],dcd:0,hold:false,holdT:0,leave:false,sp:null,spT:0};
}
// returns true when the car should be removed
function stepPolice(c,dt){
  const a=c.ai,sp=hypot(c.vx,c.vz),lvl=wLvl();a.dcd-=dt;
  if(a.hold){ // officers are out: wait for them to come back (or not)
    a.crew=a.crew.filter(p=>p.cop&&p.cop.car===c&&!p.hidden&&p.state!=='dead');
    if(!a.crew.length){a.holdT-=dt;if(a.holdT<=0){a.hold=false;a.dcd=10;}}else a.holdT=1;
    drive(c,0,0,true,dt);carStatic(c);collideCars(c);return false;}
  let tx,tz,chase=false;
  if(a.leave){if(!a.lx){const d=hypot(c.x-__gs.FX,c.z-__gs.FZ)||1;a.lx=c.x+(c.x-__gs.FX)/d*400;a.lz=c.z+(c.z-__gs.FZ)/d*400;}
    tx=a.lx;tz=a.lz;if(hypot(c.x-__gs.FX,c.z-__gs.FZ)>160)return true;}
  else if(WANT.state==='act'){tx=__gs.FX;tz=__gs.FZ;chase=true;}
  else{const[cx,cz]=wCen();a.spT-=dt;
    if(!a.sp||a.spT<=0||hypot(c.x-a.sp[0],c.z-a.sp[1])<14){a.sp=searchPoint(cx,cz,WANT.state==='resp'?30:wR()*.6);a.spT=20;}
    tx=a.sp[0];tz=a.sp[1];}
  a.repath-=dt;
  if(a.repath<=0){a.repath=1.3;const s=nearestNode(c.x,c.z),t=nearestNode(tx,tz);a.path=s&&t?pathTo(s,t):[];a.pi=0;
    if(a.path.length>1){const n0=NODES[a.path[0]];if((n0.x-c.x)*sin(c.th)+(n0.z-c.z)*cos(c.th)<0)a.pi=1;}}
  const dist=hypot(tx-c.x,tz-c.z);
  let gx=tx,gz=tz;const direct=(chase&&dist<45)||!a.path.length||a.pi>=a.path.length;
  if(!direct){const n=NODES[a.path[a.pi]];gx=n.x;gz=n.z;if(hypot(gx-c.x,gz-c.z)<11)a.pi++;}
  const diff=wrap(atan2(gx-c.x,gz-c.z)-c.th);
  let st=clamp(diff*1.8,-1,1),thr=1,hb=false;
  if(abs(diff)>.9&&sp>9)thr=-1;
  if(!direct&&hypot(gx-c.x,gz-c.z)<22&&sp>14)thr=-.4;
  if(chase&&dist<7&&G.focusSpeed<3){thr=0;hb=true;}
  else if(!chase&&!a.leave&&dist<14){thr=sp>4?-.5:0;hb=sp<4;}
  else if(a.rev>0){a.rev-=dt;thr=-1;st=-st;}
  else{if(sp<1.2)a.stuck+=dt;else a.stuck=0;if(a.stuck>1.3){a.rev=1.3;a.stuck=0;}}
  const T=c.T,sv=T.accel,sm=T.maxSpeed;T.accel=chase?13:9;T.maxSpeed=chase?50:a.leave?30:34;drive(c,thr,st,hb,dt);T.accel=sv;T.maxSpeed=sm;
  carStatic(c);collideCars(c);if(!G.car)carHitsPeds(c);
  // shooting from the window, level 2 and up
  a.gcd-=dt;
  if(chase&&lvl>=2&&WANT.seen&&a.gcd<=0&&hypot(c.x-__gs.FX,c.z-__gs.FZ)<38){a.gcd=max(.5,(c.swat?.9:1.3)-lvl*.08)+rnd()*.6;copShot(c.x,c.y+1.3,c.z,.16+lvl*.03+(c.swat?.08:0),c.swat?9:5+lvl);}
  return false;
}

// --- officers on foot: a small pool of uniformed people, borrowed from and handed back to the pool
function freeCop(){for(const p of peds)if(p.copPed&&!p.cop)return p;return null;}
function copUp(p,x,z,swat,car){
  p.shirt.set(swat?0x1a1c20:0x1c2940);p.pants.set(swat?0x17191c:0x12161f);p.shoe.set(0x0e0e10);p.accent.set(swat?0x2b2e33:0xc9a227);
  if(!walkable(x,z)||solidAt(x,1,z)){x=car?car.x:__gs.FX;z=car?car.z:__gs.FZ;}
  p.x=x;p.z=z;p.y=groundH(x,z);if(pushOut(p.x,p.z,.32)){p.x=PO.x;p.z=PO.z;}
  p.th=atan2(__gs.FX-x,__gs.FZ-z);p.hidden=false;p.state='walk';p.lie=0;p.vx=p.vz=p.vy=0;p.amp=0;p.talking=false;p.bled=false;p.hp=swat?220:120;
  p.cop={car,swat:!!swat,cd:.8+rnd(),ret:false,sp:null,spT:0,see:false,side:1};return p;}
function releaseCop(p){p.cop=null;p.hidden=true;p.state='walk';p.lie=0;p.hp=100;p.talking=false;p.amp=0;}
function deployCrew(c){
  const n=c.swat?3:wLvl()>=2?2:1,fx=sin(c.th),fz=cos(c.th);
  for(let i=0;i<n;i++){const p=freeCop();if(!p)break;const sd=i%2?-1:1,back=i>=2?-1.8:.3;
    copUp(p,c.x+fz*sd*1.6+fx*back,c.z-fx*sd*1.6+fz*back,c.swat,c);p.cop.side=sd;c.ai.crew.push(p);}
  if(c.ai.crew.length){c.ai.hold=true;c.ai.holdT=1.2;c.vx*=.3;c.vz*=.3;}else c.ai.dcd=5;}
function copFall(p,dt){
  p.vy-=20*dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;if(pushOut(p.x,p.z,.4)){p.x=PO.x;p.z=PO.z;p.vx*=.3;p.vz*=.3;}
  if(p.y<=0){p.y=0;p.vy=0;const k=exp(-5*dt);p.vx*=k;p.vz*=k;if(p.state==='dead'&&!p.bled&&p.lie>1.3){p.bled=true;__late.bloodAt(p.x-sin(p.th)*.7,p.z-cos(p.th)*.7,.7+rnd()*.5);}}
  p.lie=min(PI/2,p.lie+dt*7);p.amp=0;if(p.state==='down'){p.timer-=dt;if(p.timer<=0)p.state='walk';}}
function stepCop(p,dt){
  const o=p.cop;if(!o){p.hidden=true;return;}
  if(p.state==='dead'||p.state==='down'){copFall(p,dt);return;}
  const dx=__gs.FX-p.x,dz=__gs.FZ-p.z,d=hypot(dx,dz)||1,lvl=wLvl(),car=o.car&&o.car.mode==='police'&&!o.car.boom&&cars.includes(o.car)?o.car:null;
  if(!o.ret&&(!WANT.state||(G.car&&(car?hypot(__gs.FX-car.x,__gs.FZ-car.z)>48:d>120))))o.ret=true;
  if(o.ret&&WANT.state==='act'&&!G.car&&d<30&&(car||!o.rb))o.ret=false; // you came back on foot
  if((G.frame+p.cid)%6===0)o.see=d<40&&los(p.x,p.y+1.6,p.z,__gs.FX,G.car?1:player.y+1.2,__gs.FZ);
  let tx=p.x,tz=p.z,sp=0,look=false;o.cd-=dt;
  if(o.ret){
    if(car){const fx=sin(car.th),fz=cos(car.th);tx=car.x+fz*o.side*1.5;tz=car.z-fx*o.side*1.5;sp=4.8;if(hypot(tx-p.x,tz-p.z)<1.3){releaseCop(p);return;}}
    else{tx=p.x-dx/d*10;tz=p.z-dz/d*10;sp=1.6;if(d>70){releaseCop(p);return;}}}
  else if(WANT.state==='act'){
    const armed=!G.car&&__late.ARM.w>0,shoot=WANT.hostile||lvl>=4||(lvl>=2&&(armed||!!G.car));
    if(shoot){
      if(d>15||!o.see){tx=__gs.FX;tz=__gs.FZ;sp=5;}else if(d<6){tx=p.x-dx/d*4;tz=p.z-dz/d*4;sp=2.4;look=true;}else look=true;
      if(o.see&&d<34&&o.cd<=0){o.cd=(o.swat?.55:.9)+rnd()*(o.swat?.5:.8);copShot(p.x+sin(p.th)*.4,p.y+1.4,p.z+cos(p.th)*.4,.18+lvl*.035+(o.swat?.08:0),o.swat?10:6+lvl);}}
    else{tx=__gs.FX;tz=__gs.FZ;sp=d>2.5?5.3:d>1.3?2:0;look=d<2.5;}}
  else{ // responding or searching: walk the area
    const[cx,cz]=wCen();o.spT-=dt;
    if(!o.sp||o.spT<=0||hypot(o.sp[0]-p.x,o.sp[1]-p.z)<1.5){const a=rnd()*6.28,r=rnd()*18;o.sp=[cx+sin(a)*r,cz+cos(a)*r];o.spT=8;}
    tx=o.sp[0];tz=o.sp[1];sp=2;}
  const ex=tx-p.x,ez=tz-p.z,ed=hypot(ex,ez);
  if(sp>0&&ed>.4){p.x+=ex/ed*sp*dt;p.z+=ez/ed*sp*dt;if(!look)p.th+=wrap(atan2(ex,ez)-p.th)*min(1,dt*8);}else sp=0;
  if(look)p.th+=wrap(atan2(dx,dz)-p.th)*min(1,dt*10);
  if(pushOut(p.x,p.z,.32)){p.x=PO.x;p.z=PO.z;}
  p.lie=max(0,p.lie-dt*3);p.y=groundH(p.x,p.z);p.phase+=sp*dt*(sp>3?1.9:3.2);p.amp+=((sp>3?.95:sp>0?.5:0)-p.amp)*min(1,dt*8);
}
// peaked caps for officers, helmets for the tactical unit (the bodies are ordinary pedestrians in uniform colours)
const capMat=new THREE.MeshStandardMaterial({roughness:.55,vertexColors:true});
const capGeo=mergeGeometries([tint(new THREE.CylinderGeometry(.106,.104,.05,20).translate(0,.022,0),[.06,.08,.14]),
  tint(new THREE.CylinderGeometry(.128,.108,.045,20).translate(0,.068,-.004),[.05,.065,.11]),
  tint(new THREE.CylinderGeometry(.092,.092,.01,16,1,false,-PI/2,PI).scale(1,1,.85).rotateX(.18).translate(0,.004,.07),[.02,.02,.025]),
  tint(new THREE.SphereGeometry(.016,8,6).scale(1,1.2,.4).translate(0,.05,.112),[.9,.72,.25])]);
const helmGeo=mergeGeometries([tint(new THREE.SphereGeometry(.14,20,12,0,2*PI,0,PI*.55).scale(1,.95,1.08).translate(0,-.03,0),[.04,.045,.05]),
  tint(new THREE.CylinderGeometry(.147,.147,.02,20).translate(0,-.03,0),[.03,.03,.035])]);
const COPCAPS=Array.from({length:NCOP},()=>{const m=new THREE.Mesh(capGeo,capMat);m.castShadow=true;m.visible=false;scene.add(m);return m;});
const _capV=new THREE.Vector3();
function syncCops(){for(const p of peds){if(!p.copPed)continue;const m=COPCAPS[p.cid],show=!p.hidden&&!!p.cop&&p.lie<.4&&abs(p.x-__gs.FX)<95&&abs(p.z-__gs.FZ)<95;m.visible=show;if(!show)continue;
  m.geometry=p.cop.swat?helmGeo:capGeo;
  if(p.rig&&p.rig.root.visible){p.rig.root.updateMatrixWorld(true);p.rig.b[4].getWorldPosition(m.position);m.position.y+=.15*p.sc;}
  else m.position.set(p.x,p.y+1.75*p.sc,p.z);
  m.rotation.set(0,p.th,0);}}

// --- helicopter (level 4+): spots you from above unless you're under cover; its marksman fires from level 5
const HELI={on:false,state:'hunt',x:0,y:80,z:0,vx:0,vz:0,vy:0,th:0,hp:100,gcd:3,orb:0,spin:0,rot:0,t:0,lx:0,lz:0};
const heliRotor=new THREE.Group(),heliTail=new THREE.Group();
const heliG=(()=>{const g=new THREE.Group(),body=new THREE.MeshStandardMaterial({color:0x1b2433,roughness:.45,metalness:.35}),
  stripe=new THREE.MeshStandardMaterial({color:0xe9edf2,roughness:.5}),glass=new THREE.MeshStandardMaterial({color:0x0c1420,roughness:.08,metalness:.6}),
  dark=new THREE.MeshStandardMaterial({color:0x0d0f12,roughness:.6,metalness:.4});
  const add=(geo,m,x,y,z,par)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;(par||g).add(o);return o;};
  add(new THREE.SphereGeometry(1,24,16).scale(1.15,1.05,2.1),body,0,0,.2);
  add(new THREE.SphereGeometry(1,20,14).scale(.95,.78,1.15),glass,0,.12,1.25);
  add(new THREE.BoxGeometry(2.34,.2,3),stripe,0,-.2,.1);
  add(new THREE.CylinderGeometry(.16,.34,5,10).rotateX(PI/2),body,0,.3,-3.7);
  add(new THREE.BoxGeometry(.08,1.3,.8),body,0,.85,-6);
  add(new THREE.BoxGeometry(1.7,.06,.45),body,0,.32,-5.3);
  for(const sd of[1,-1]){add(new THREE.CylinderGeometry(.06,.06,3.8,8).rotateX(PI/2),dark,sd*.95,-1.38,.25);
    for(const zz of[-.8,1])add(new THREE.BoxGeometry(.06,.55,.07),dark,sd*.85,-1.1,zz);}
  add(new THREE.CylinderGeometry(.13,.13,.42,10),dark,0,1.15,.1);
  for(const r of[0,PI/2])add(new THREE.BoxGeometry(10.5,.04,.3).rotateY(r),dark,0,0,0,heliRotor);
  heliRotor.position.set(0,1.38,.1);g.add(heliRotor);
  for(const r of[0,PI/2])add(new THREE.BoxGeometry(.04,1.5,.13).rotateX(r),dark,0,0,0,heliTail);
  heliTail.position.set(.12,.85,-6);g.add(heliTail);
  const nav=(c,x)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),new THREE.MeshBasicMaterial({color:c}));o.position.set(x,-.15,.3);g.add(o);};
  nav(0xff2030,-1.18);nav(0x20ff60,1.18);
  g.visible=false;scene.add(g);return g;})();
const heliSpot=new THREE.SpotLight(0xe4ecff,0,170,.17,.45,1.2);scene.add(heliSpot,heliSpot.target);
const heliCone=(()=>{const m=new THREE.Mesh(new THREE.ConeGeometry(1,1,24,1,true).translate(0,-.5,0).rotateX(-PI/2),
  new THREE.MeshBasicMaterial({color:0xdfe8ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  m.visible=false;m.frustumCulled=false;scene.add(m);return m;})();
function spawnHeli(){const a=rnd()*6.28;Object.assign(HELI,{on:true,state:'hunt',x:__gs.FX+sin(a)*260,z:__gs.FZ+cos(a)*260,y:90,vx:0,vz:0,vy:0,hp:100,gcd:3,orb:rnd()*6,spin:0,lx:__gs.FX,lz:__gs.FZ});
  HELI.th=atan2(__gs.FX-HELI.x,__gs.FZ-HELI.z);heliG.visible=true;flash('CHOPPER INBOUND',1.4);}
function heliRay(o,d,maxT){if(!HELI.on||HELI.state==='down')return -1;const ox=o.x-HELI.x,oy=o.y-HELI.y,oz=o.z-HELI.z,b=ox*d.x+oy*d.y+oz*d.z,c=ox*ox+oy*oy+oz*oz-2.4*2.4,q=b*b-c;
  if(q<0)return -1;const t=-b-sqrt(q);return t>0&&t<maxT?t:-1;}
function hitHeli(dmg,at){for(let i=0;i<3;i++)emit(at.x,at.y,at.z,(rnd()-.5)*4,rnd()*2,(rnd()-.5)*4,.06,.3,2.6,.9);
  if(!WANT.hostile){WANT.hostile=true;crime(.4,__gs.FX,__gs.FZ);}HELI.hp-=dmg*.3;
  if(HELI.hp<=0&&HELI.state!=='down'){HELI.state='down';HELI.vy=0;HELI.spin=1;flash('CHOPPER DOWN',2);crime(1.2,__gs.FX,__gs.FZ,{loud:1});}}
function boomAt(x,y,z){
  for(let i=0;i<40;i++)emit(x+(rnd()-.5)*3,y+rnd(),z+(rnd()-.5)*3,(rnd()-.5)*9,2+rnd()*7,(rnd()-.5)*9,.9+rnd()*1.2,1.5+rnd(),i<16?2.4:.12,.85);
  __late.thud(1);__late.bang(1.5);const d=hypot(__gs.FX-x,__gs.FZ-z);G.shake=max(G.shake,d<50?.9:.3);
  for(let k=1;k<peds.length;k++){const p=peds[k];if(p.hidden||p.state==='dead')continue;const dx=p.x-x,dz=p.z-z,dd=hypot(dx,dz);if(dd<8){__late.killPed(p,dx/(dd||1),dz/(dd||1));p.vy=4;}else if(dd<40&&!p.copPed){p.state='flee';p.timer=12;}}
  if(d<9){if(G.car)G.car.hp-=(9-d)*8;else{__late.hurt((9-d)*11);G.hurtCd=1;}}
  for(const o of cars)if(!o.boom&&hypot(o.x-x,o.z-z)<7){o.hp-=50;if(o.hp<=0&&o!==G.car)setTimeout(()=>__late.explode(o),200+rnd()*400);}}
function stepHeli(dt){
  if(!HELI.on){heliSpot.intensity=0;heliCone.visible=false;return;}
  HELI.t+=dt;HELI.rot+=dt*28;
  if(HELI.state==='down'){
    HELI.vy-=9.8*dt;HELI.y+=HELI.vy*dt;HELI.x+=HELI.vx*dt;HELI.z+=HELI.vz*dt;HELI.spin=min(5,HELI.spin+dt*2);HELI.th+=HELI.spin*dt;
    if(G.frame%2===0)emit(HELI.x,HELI.y,HELI.z,rnd()-.5,1+rnd(),rnd()-.5,.9,1.6,.12,.7);
    if(HELI.y<=1.5||solidAt(HELI.x,HELI.y-1,HELI.z)){boomAt(HELI.x,max(1,HELI.y),HELI.z);HELI.on=false;heliG.visible=false;heliCone.visible=false;heliSpot.intensity=0;WANT.heliCd=45;return;}}
  else{
    let tx,tz,alt=58,top=24;
    if(HELI.state==='leave'||!WANT.state){HELI.state='leave';const d=hypot(HELI.x-__gs.FX,HELI.z-__gs.FZ)||1;tx=HELI.x+(HELI.x-__gs.FX)/d*100;tz=HELI.z+(HELI.z-__gs.FZ)/d*100;alt=110;top=30;
      if(d>330){HELI.on=false;heliG.visible=false;heliCone.visible=false;heliSpot.intensity=0;return;}}
    else{const act=WANT.state==='act',[cx,cz]=act?[__gs.FX,__gs.FZ]:wCen(),r=act?26:wR()*.55;HELI.orb+=dt*(act?.3:.16);tx=cx+sin(HELI.orb)*r;tz=cz+cos(HELI.orb)*r;}
    const dx=tx-HELI.x,dz=tz-HELI.z,d=hypot(dx,dz)||1,want=min(top,d*.6);
    HELI.vx+=(dx/d*want-HELI.vx)*min(1,dt*.9);HELI.vz+=(dz/d*want-HELI.vz)*min(1,dt*.9);
    // stay above the towers
    const ax=HELI.x+HELI.vx*2,az=HELI.z+HELI.vz*2;let ty=alt;while(ty<420&&(solidAt(HELI.x,ty-10,HELI.z)||solidAt(ax,ty-10,az)))ty+=12;
    HELI.y+=clamp(ty-HELI.y,-5*dt,16*dt);
    if(solidAt(HELI.x+HELI.vx*.5,HELI.y-4,HELI.z+HELI.vz*.5)){HELI.vx*=.85;HELI.vz*=.85;}
    HELI.x+=HELI.vx*dt;HELI.z+=HELI.vz*dt;
    if(hypot(HELI.vx,HELI.vz)>1)HELI.th+=wrap(atan2(HELI.vx,HELI.vz)-HELI.th)*min(1,dt*1.5);
    HELI.gcd-=dt;if(wLvl()>=5&&WANT.state==='act'&&WANT.seen&&HELI.gcd<=0&&hypot(HELI.x-__gs.FX,HELI.z-__gs.FZ)<75){HELI.gcd=2+rnd()*1.2;copShot(HELI.x,HELI.y-1.4,HELI.z,.26,12);}
  }
  const fw=HELI.vx*sin(HELI.th)+HELI.vz*cos(HELI.th);
  heliG.position.set(HELI.x,HELI.y,HELI.z);heliG.rotation.set(clamp(fw*.012,-.25,.25),HELI.th,HELI.state==='down'?.3:0,'YXZ');
  heliRotor.rotation.y=HELI.rot;heliTail.rotation.x=HELI.rot*1.6;
  // searchlight after dark: locked on you in a pursuit, sweeping the search area otherwise
  const lit=night>.05&&HELI.state==='hunt'&&!!WANT.state;heliCone.visible=lit;heliSpot.intensity=lit?night*900:0;
  if(lit){const[cx,cz]=WANT.state==='act'?[__gs.FX,__gs.FZ]:wCen(),sw=WANT.state==='act'?0:wR()*.4;
    HELI.lx+=(cx+sin(HELI.t*.7)*sw-HELI.lx)*min(1,dt*2);HELI.lz+=(cz+cos(HELI.t*.53)*sw-HELI.lz)*min(1,dt*2);
    heliSpot.position.set(HELI.x,HELI.y-1.3,HELI.z);heliSpot.target.position.set(HELI.lx,0,HELI.lz);
    const L=hypot(HELI.lx-HELI.x,HELI.y-1.3,HELI.lz-HELI.z),r=L*.15;heliCone.position.set(HELI.x,HELI.y-1.3,HELI.z);heliCone.scale.set(r,r,L);_wa.set(HELI.lx,0,HELI.lz);heliCone.lookAt(_wa);
    heliCone.material.opacity=.07*night;}
}

// --- roadblocks (level 3+) ahead of you on the road you're driving, with a spike strip from level 4
const RB=[],spikeMat=new THREE.MeshStandardMaterial({color:0x2a2c30,roughness:.45,metalness:.6});
function spikeGeo(w){const P=[new THREE.BoxGeometry(w,.035,.32).translate(0,.018,0)];
  for(let x=-w/2+.1;x<w/2-.05;x+=.2)for(const z of[-.08,.08])P.push(new THREE.ConeGeometry(.025,.09,4).translate(x+(z>0?.1:0),.08,z));return mergeGeometries(P);}
function tryRoadblock(){
  const c=G.car,sp=hypot(c.vx,c.vz)||1,hx=c.vx/sp,hz=c.vz/sp;
  for(const dist of[150,180,120]){
    const r=nearestEdge(__gs.FX+hx*dist,__gs.FZ+hz*dist,30,e=>e.ai&&!e.tram);if(!r)continue;
    if(abs(r.tx*hx+r.tz*hz)<.75)continue; // the road has to run the way you're going
    if(hypot(r.x-__gs.FX,r.z-__gs.FZ)<100||RB.some(b=>hypot(b.x-r.x,b.z-r.z)<60))continue;
    buildRoadblock(r);return true;}
  return false;}
function buildRoadblock(r){
  const lvl=wLvl(),hw=r.e.hw,nx=-r.tz,nz=r.tx,swat=lvl>=6||(lvl>=5&&rnd()<.5),n=hw>7?3:2;
  const dir=sign((__gs.FX-r.x)*r.tx+(__gs.FZ-r.z)*r.tz)||1,B={x:r.x,z:r.z,cars:[],cops:[],spike:null,t:0};
  for(let i=0;i<n;i++){const o=(-1+2*i/(n-1))*max(0,hw-1.6),x=r.x+nx*o,z=r.z+nz*o;
    const cc=mkCar(swat?2:0,x,z,atan2(nx,nz)+(i%2?.35:-.35),'block',swat?SWATCOL:COPCOL);cc.spawned=true;cc.rb=1;cc.swat=swat;B.cars.push(cc);}
  if(WL[lvl].spk){const sx=r.x+r.tx*dir*14,sz=r.z+r.tz*dir*14,m=new THREE.Mesh(spikeGeo(hw*2),spikeMat);
    m.position.set(sx,.01,sz);m.rotation.y=atan2(-nz,nx);m.receiveShadow=true;scene.add(m);B.spike={x:sx,z:sz,tx:r.tx,tz:r.tz,hw,m,hit:false};}
  for(let i=0;i<2;i++){const p=freeCop();if(!p)break;const o=(i?1:-1)*max(0,hw-2.5);
    copUp(p,r.x-r.tx*dir*3.5+nx*o,r.z-r.tz*dir*3.5+nz*o,swat,null);p.cop.rb=B;B.cops.push(p);}
  RB.push(B);}
function dropRB(B,hard){
  for(const c of B.cars)if(c!==G.car&&(hard||c.mode!=='player'))rmCar(c);
  if(B.spike){scene.remove(B.spike.m);B.spike.m.geometry.dispose();B.spike=null;}
  for(const p of B.cops)if(p.cop&&p.cop.rb===B)p.cop.ret=true;}
function stepRoadblocks(dt){
  for(let i=RB.length-1;i>=0;i--){const B=RB[i],d=hypot(B.x-__gs.FX,B.z-__gs.FZ),c=G.car;B.t+=dt;
    if(B.spike&&!B.spike.hit&&c&&!c.flat){const s=B.spike,lx=c.x-s.x,lz=c.z-s.z,al=lx*s.tx+lz*s.tz,ac=-lx*s.tz+lz*s.tx;
      if(abs(al)<c.T.L*.5&&abs(ac)<s.hw){c.flat=1;s.hit=true;flash('TYRES SHREDDED',1.6);__late.thud(.5);}}
    for(const p of B.cops)if(p.cop&&p.cop.rb===B&&!p.cop.ret&&d>120)p.cop.ret=true;
    if(d>240||(!WANT.state&&d>70)||(B.t>90&&d>120)){dropRB(B);RB.splice(i,1);}}}

// --- arrested / knocked out
function fateCard(t,s,arrest){const f=$('fate');f.querySelector('h1').textContent=t;f.querySelector('p').textContent=s;f.className=arrest?'arrest':'ko';f.style.opacity=1;setTimeout(()=>f.style.opacity=0,2600);}
function respawn(text,pos){
  if(G.busy)return;const arrest=text==='ARRESTED',lvl=max(1,wLvl());
  if(__gs.IN)__late.exitInterior(true);if(__late.PANEL)__late.closePanel();if(__late.MS)__late.failMission(arrest?'You were arrested':'You were knocked out');G.busy=true;
  const fee=min(G.cash,arrest?50+lvl*100:150);G.armor=0;__late.closeWheel(false);__late.closePhone(false);__late.endPhoto();
  fateCard(arrest?'BOOKED':'OUT COLD',arrest?`Released from custody · fine −$${fee}`:`Patched up at the hospital · bill −$${fee}`,arrest);
  $('fade').style.opacity=1;
  setTimeout(()=>{
    __late.offWater();if(G.car){G.car.mode='free';G.car.vx=G.car.vz=0;G.car=null;}
    player.hidden=false;player.x=pos[0];player.z=pos[1];player.y=CURB;player.vy=0;__gs.FX=pos[0];__gs.FZ=pos[1];for(const p of peds)if(p!==player)placePed(p,15,160);
    G.cash-=fee;G.hp=100;clearPolice();
    $('fade').style.opacity=0;G.busy=false;
  },2200);
}
function stepGarage(dt){
  G.garageCd-=dt;const c=G.car;if(!c||G.garageCd>0)return;
  for(const[x,z]of GARAGES)if(hypot(c.x-x,c.z-z)<4&&hypot(c.vx,c.vz)<4){
    if(WANT.state==='act')flash('LOSE THE COPS FIRST',1.8);
    else if(G.cash>=150){G.cash-=150;c.hp=100;c.flat=0;c.wasCop=0;c.color.set(rpick(CARCOL));wClear();flash('REPAIRED & RESPRAYED  -$150',2.4);}
    else flash('GARAGE: need $150',1.6);
    G.garageCd=6;
  }
}

export { HELI, RB, WANT, addHeat, capGeo, clearPolice, copShot, crime, heliRay, hitHeli, los, shotsFired, stepGarage, stepJob, stepPolice, stepWanted, syncCops, wCen, wClear, wLvl, wNeed, wR };
