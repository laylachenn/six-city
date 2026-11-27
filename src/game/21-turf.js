// Six City — turf. One of the game's modules; they load in numbered order (src/game/index.js).
import './20-bikes.js';
import * as THREE from 'three';
import * as HR from '../harbour.js';
import * as GG from '../gangs.js';
import { __gs, __late, later } from './shared.js';
import { $, PI, PLAY, TEST, abs, atan2, camera, cos, cv, floor, groundH, hypot, max, min, rnd, scene, sin, stage, wrap } from './01-core.js';
import { PO, ZONES, onIsland, pushOut, solidAt, walkable } from './04-world.js';
import { curbSpot, hood } from './05-landmarks.js';
import { calmPed, peds, placePed } from './07-people.js';
import { G, flash, player } from './08-input.js';
import { capGeo, copShot, los } from './10-police.js';
import { SAVE } from './11-missions.js';
import { openPanel } from './13-homes.js';
import { setWaypointAt } from './16-map.js';
import { spiral } from './19-harbour.js';
later({GANG:()=>GANG,TC:()=>TC,TF:()=>TF,TURFS:()=>TURFS,stepGang:()=>stepGang,turfPanel:()=>turfPanel}); // for earlier modules, read when called

/* ============================== turf: crews, turf wars, defending what you hold ==============================
   The rules (who starts where, wave sizes, street tax, when rivals hit back) are in src/gangs.js (unit-tested).
   Downtown is cut into 400 m cells; each cell belongs to the neighbourhood it's in, and each neighbourhood is a turf
   with a corner where its crew hangs out (a tag on the ground marks it). E at a rival's tag starts a turf war: three
   waves; clear them and it's yours. Unclaimed turf can be bought off the locals. Your turf pays street tax; rivals hit it. */
const TC=400,TZ=ZONES.find(z=>z.id==='downtown')||PLAY,TCELL=new Map(),TURFS=[];
{const by=new Map();
  for(let x=TZ.x0;x<TZ.x1;x+=TC)for(let z=TZ.z0;z<TZ.z1;z+=TC){const cx=x+TC/2,cz=z+TC/2;let n=0;for(const[a,b]of[[0,0],[-120,-120],[120,-120],[-120,120],[120,120]])if(walkable(cx+a,cz+b)&&!onIsland(cx+a,cz+b))n++;if(n<2)continue;
    const id=hood(cx,cz);if(!id||/Harbour|Lake Ontario/.test(id))continue;let t=by.get(id);if(!t)by.set(id,t={id,cells:[],x:0,z:0});t.cells.push([x,z]);}
  for(const t of by.values()){t.x=t.cells.reduce((s,c)=>s+c[0]+TC/2,0)/t.cells.length;t.z=t.cells.reduce((s,c)=>s+c[1]+TC/2,0)/t.cells.length;
    const s=curbSpot(t.x,t.z,'walk')||{x:t.x,z:t.z};t.cx=s.x;t.cz=s.z;for(const c of t.cells)TCELL.set(c[0]+','+c[1],t);TURFS.push(t);}}
const turfAt=(x,z)=>TCELL.get((floor((x-TZ.x0)/TC)*TC+TZ.x0)+','+(floor((z-TZ.z0)/TC)*TC+TZ.z0))||null;
if(!SAVE.turf||typeof SAVE.turf!=='object'||!TURFS.every(t=>t.id in SAVE.turf)){const a=GG.assignTurf(TURFS.map(t=>({id:t.id,x:t.x,z:t.z})),20261);SAVE.turf={...a.owners,...(SAVE.turf||{})};for(const k in SAVE.turf)if(!TURFS.some(t=>t.id===k))delete SAVE.turf[k];}
const TF={tax:0,next:GG.attackGap(GG.countOf(SAVE.turf,'you')),defend:null,cool:{},hudT:0};
// tags: a spray-painted crew mark on the pavement at each corner
function tagTex(c){const cv2=cv(256,256),g=cv2.getContext('2d');g.clearRect(0,0,256,256);const col=c?c.col:'#e9e6df';
  g.globalAlpha=.85;g.fillStyle=col;for(let k=0;k<26;k++){g.beginPath();g.arc(128+(rnd()-.5)*170,128+(rnd()-.5)*170,3+rnd()*7,0,7);g.fill();}
  g.globalAlpha=1;g.strokeStyle='#111';g.lineWidth=14;g.font='900 110px "Bebas Neue", Impact, sans-serif';g.textAlign='center';g.textBaseline='middle';const t=c?c.tag:'?';
  g.strokeText(t,128,134);g.fillStyle=col;g.fillText(t,128,134);g.lineWidth=6;g.strokeStyle=col;g.beginPath();g.arc(128,128,112,0,7);g.stroke();
  const t2=new THREE.CanvasTexture(cv2);t2.colorSpace=THREE.SRGBColorSpace;return t2;}
const TAGTEX={};for(const c of[...GG.CREWS,GG.MINE,null])TAGTEX[c?c.id:'none']=tagTex(c);
const tagGeo=new THREE.PlaneGeometry(2.8,2.8).rotateX(-PI/2);
for(const t of TURFS){t.tag=new THREE.Mesh(tagGeo,new THREE.MeshStandardMaterial({map:TAGTEX[SAVE.turf[t.id]||'none'],transparent:true,depthWrite:false,roughness:.9,polygonOffset:true,polygonOffsetFactor:-2}));t.tag.position.set(t.cx,groundH(t.cx,t.cz)+.03,t.cz);t.tag.rotation.y=rnd()*6;scene.add(t.tag);}
function setOwner(t,o){SAVE.turf[t.id]=o;t.tag.material.map=TAGTEX[o||'none'];t.tag.material.needsUpdate=true;__gs.saveGame();}
// the turf pill under the neighbourhood name
const turfEl=document.createElement('span');turfEl.id='turf';turfEl.style.cssText='display:block;margin-top:5px;width:max-content;border-radius:10px;padding:3px 10px;font-size:10.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;box-shadow:0 4px 14px rgba(0,0,0,.3);color:#fff';
$('hood').after(turfEl);
// crew caps (they show in both graphics modes; in Classic the crew wears its colour too)
const CAPMAT=Object.fromEntries([...GG.CREWS,GG.MINE].map(c=>[c.id,new THREE.MeshStandardMaterial({color:c.col,roughness:.6})]));
const GCAPS=Array.from({length:6},()=>{const m=new THREE.Mesh(capGeo,CAPMAT.kings);m.visible=false;m.castShadow=true;scene.add(m);return m;});
let GANG=null; // the one crew you're dealing with: {t, crew, mode:'idle'|'war'|'defend', hostile, members, wave, waves}
function freeGangPeds(n,far){const L=[];for(let k=1;k<peds.length&&L.length<n;k++){const p=peds[k];if(p.copPed||p.actor||p.ins||p.gang||p.giverKey||p.talking||p.hidden)continue;
    if(p.state==='dead'){if(hypot(p.x-camera.position.x,p.z-camera.position.z)>25)L.push(p);continue;}if(calmPed(p)&&hypot(p.x-__gs.FX,p.z-__gs.FZ)>(far||0))L.push(p);}
  return L;}
function gangUp(p,crew,x,z,hostile,i){p.state='walk';p.mode='walk';p.lie=0;p.hp=crew==='you'?200:110;p.bled=false;p.vx=p.vz=p.vy=0;p.amp=0;p.talking=false;p.pt=null;p.e=null;
  p.x=x;p.z=z;p.y=groundH(x,z);if(pushOut(x,z,.32)){p.x=PO.x;p.z=PO.z;}p.th=atan2(__gs.FX-x,__gs.FZ-z);
  p.gPrev=p.jacket;p.jacket=new THREE.Color(GG.crewOf(crew).col);p.gang={crew,i,mx:x,mz:z,hostile,cd:1+rnd(),side:rnd()<.5?1:-1,see:false};return p;}
function releaseGangPed(p){if(!p.gang)return;p.gang=null;p.jacket=p.gPrev||null;p.gPrev=null;if(p.state!=='dead'&&p.state!=='down')placePed(p,70,170);}
function disband(){if(!GANG)return;for(const p of GANG.members)releaseGangPed(p);GANG=null;}
function spawnIdle(t){const o=SAVE.turf[t.id],n=o==='you'?2:4,L=freeGangPeds(n,40);if(!L.length)return;
  GANG={t,crew:o,mode:'idle',hostile:false,members:[],wave:0,waves:[],warned:false};
  L.forEach((p,i)=>{const a=i/L.length*2*PI; // a loose circle beside the tag, each on open pavement and not on top of each other
    const s=spiral(t.cx+3+cos(a)*1.8,t.cz+sin(a)*1.8,(x,z)=>walkable(x,z)&&!solidAt(x,1,z)&&!pushOut(x,z,.35)&&!GANG.members.some(q=>hypot(q.x-x,q.z-z)<1.3),10,.6)||{x:t.cx+cos(a)*1.5,z:t.cz+sin(a)*1.5};
    GANG.members.push(gangUp(p,o,s.x,s.z,false,i));});}
function spawnWave(n,crew){const t=GANG.t,L=freeGangPeds(n,0);
  L.forEach((p,i)=>{let s=null;for(let k=0;k<20&&!s;k++){const a=rnd()*2*PI,r=40+rnd()*30,x=t.cx+cos(a)*r,z=t.cz+sin(a)*r;if(walkable(x,z)&&!solidAt(x,1,z)&&!onIsland(x,z))s={x,z};}
    s=s||{x:t.cx,z:t.cz};GANG.members.push(gangUp(p,crew,s.x,s.z,true,GANG.members.length));});
  return L.length;}
function goHostile(){if(!GANG||GANG.crew==='you'||GANG.hostile)return;GANG.hostile=true;for(const p of GANG.members)if(p.gang)p.gang.hostile=true;if(GANG.mode==='idle')flash(GG.crewOf(GANG.crew).name.toUpperCase()+' ARE COMING FOR YOU',1.8);}
function turfShot(){if(GANG&&GANG.crew!=='you'&&GANG.members.some(p=>p.gang&&hypot(p.x-__gs.FX,p.z-__gs.FZ)<30))goHostile();}
function gangMove(p,tx,tz,sp,dt){const dx=tx-p.x,dz=tz-p.z,d=hypot(dx,dz);if(d<.25||sp<=0){p.amp*=.85;return false;}
  const v=min(sp,d/max(dt,1e-3));let nx=p.x+dx/d*v*dt,nz=p.z+dz/d*v*dt;if(!walkable(nx,nz)){p.amp*=.85;return false;}if(pushOut(nx,nz,.32)){nx=PO.x;nz=PO.z;}
  p.x=nx;p.z=nz;p.y=groundH(nx,nz);p.th+=wrap(atan2(dx,dz)-p.th)*min(1,dt*8);p.phase+=v*dt*3.2;p.amp+=(min(1,v/5)-p.amp)*min(1,dt*6);return true;}
function stepGang(p,dt){const g=p.gang;if(!GANG||!GANG.members.includes(p)){releaseGangPed(p);return;}
  const dx=__gs.FX-p.x,dz=__gs.FZ-p.z,d=hypot(dx,dz)||1;
  if(!g.hostile){const at=hypot(g.mx-p.x,g.mz-p.z)<.4;if(!at){p.state='walk';gangMove(p,g.mx,g.mz,1.4,dt);}else{p.state='chat';p.amp*=.85;
      const th=d<9?atan2(dx,dz):atan2(GANG.t.cx+3-p.x,GANG.t.cz-p.z);p.th+=wrap(th-p.th)*min(1,dt*4);}return;}
  p.state='walk';if((G.frame+g.i)%6===0)g.see=d<45&&los(p.x,p.y+1.6,p.z,__gs.FX,G.car?1:player.y+1.2,__gs.FZ);g.cd-=dt;
  if(d>17||!g.see)gangMove(p,__gs.FX,__gs.FZ,4.6,dt);
  else if(d<6)gangMove(p,p.x-dx/d*4,p.z-dz/d*4,2.2,dt);
  else{if(rnd()<dt*.35)g.side*=-1;if(!gangMove(p,p.x-dz/d*g.side*3,p.z+dx/d*g.side*3,1.5,dt))g.side*=-1;}
  if(g.see&&d<20)p.th+=wrap(atan2(dx,dz)-p.th)*min(1,dt*10);
  if(g.see&&d<32&&g.cd<=0&&player.state!=='dead'){g.cd=.85+rnd()*.9;copShot(p.x+sin(p.th)*.4,p.y+1.4,p.z+cos(p.th)*.4,.13+.025*GANG.wave,6);}}
function startWar(t){const crew=SAVE.turf[t.id];if(!__late.ARM.own.some((o,i)=>o&&i>0)){flash('YOU NEED A GUN FOR THIS',1.8);return;}
  if(!GANG||GANG.t!==t){disband();spawnIdle(t);}if(!GANG)return;
  GANG.mode='war';GANG.waves=GG.warWaves(GG.countOf(SAVE.turf,crew));GANG.wave=0;GANG.t0=performance.now();
  const extra=GANG.waves[0]-GANG.members.length;if(extra>0)spawnWave(extra,crew);goHostile();flash('TURF WAR',2);G.wp=null;}
function turfPanel(t){const o=SAVE.turf[t.id],c=GG.crewOf(o);
  if(o==='you'){openPanel(t.id,`Your crew's turf. It pays $${GG.TAX_PER_MIN} a minute in street tax.`,[{label:'Leave',fn:()=>{}}]);return;}
  if(!o){const cost=2500;openPanel(t.id,`Nobody runs ${t.id} yet. Pay off the locals and it's yours: $${GG.TAX_PER_MIN} a minute in street tax, and rivals will want it.`,[
    {label:`Tag it for $${cost.toLocaleString()}`,off:G.cash<cost,fn:()=>{G.cash-=cost;setOwner(t,'you');flash('TURF CLAIMED',2.2);__late.feedPost(`new tag on the corner in ${t.id} 👀`,null,null,true);}},{label:'Not now',fn:()=>{}}]);return;}
  const W=GG.warWaves(GG.countOf(SAVE.turf,o));openPanel(`${t.id} · ${c.name}`,`This is ${c.name} turf. Take it in a turf war: ${W.length} waves (${W.join(', ')} of them). You'll need a gun.`,[
    {label:'Start a turf war',fn:()=>{startWar(t);}},{label:'Not now',fn:()=>{}}]);}
function stepTurf(dt){
  if(__gs.IN&&!__gs.IN.real)return;
  // street tax
  const mine=GG.countOf(SAVE.turf,'you');TF.tax+=GG.taxPerMin(SAVE.turf)*dt/60;if(TF.tax>=1){const v=floor(TF.tax);G.cash+=v;TF.tax-=v;SAVE.stats.tax=(SAVE.stats.tax||0)+v;}
  // the pill under the neighbourhood name
  if((TF.hudT-=dt)<=0){TF.hudT=.3;const t=turfAt(__gs.FX,__gs.FZ),c=t&&GG.crewOf(SAVE.turf[t.id]),txt=t?(c?c.name:'Unclaimed turf'):'';if(turfEl.textContent!==txt){turfEl.textContent=txt;turfEl.style.background=c?c.col:'#5b6170';turfEl.style.display=txt?'block':'none';}}
  // rivals hit back
  if(TF.defend){const D=TF.defend;D.t-=dt;
    if(!GANG||GANG.mode!=='defend'){if(hypot(__gs.FX-D.t_.cx,__gs.FZ-D.t_.cz)<90&&!G.busy){disband();GANG={t:D.t_,crew:D.crew,mode:'defend',hostile:true,members:[],wave:0,waves:GG.warWaves(GG.countOf(SAVE.turf,D.crew)).slice(0,2)};spawnWave(GANG.waves[0],D.crew);flash('DEFEND YOUR TURF',2);}
      else if(D.t<=0){setOwner(D.t_,D.crew);flash(`LOST ${D.t_.id.toUpperCase()} TO THE ${GG.crewOf(D.crew).name.toUpperCase()}`,2.6);TF.defend=null;}
      else if(G.frame%30===0){G.note=`The ${GG.crewOf(D.crew).name} are hitting your turf in ${D.t_.id} — ${HR.clock(D.t)} to get there`;G.noteT=1.2;}}}
  else if(mine>=2&&!(GANG&&GANG.mode!=='idle')){TF.next-=dt/60;if(TF.next<=0){TF.next=GG.attackGap(mine);const a=GG.nextAttack(TURFS.map(t=>({id:t.id,x:t.x,z:t.z})),SAVE.turf);
    if(a){const t=TURFS.find(q=>q.id===a.turf);TF.defend={t_:t,crew:a.crew,t:GG.DEFEND_SECONDS};setWaypointAt(t.cx,t.cz,'Defend '+t.id);}}}
  // a fight in progress
  if(GANG&&(GANG.mode==='war'||GANG.mode==='defend')){const t=GANG.t,left=GANG.members.filter(p=>p.gang&&p.state!=='dead').length;
    if(hypot(__gs.FX-t.cx,__gs.FZ-t.cz)>170||G.hp<=0||performance.now()-(GANG.t0||performance.now())>300000){const m=GANG.mode;disband();
      if(m==='defend'&&TF.defend){setOwner(TF.defend.t_,TF.defend.crew);flash(`LOST ${t.id.toUpperCase()}`,2.4);TF.defend=null;}else flash('YOU WALKED AWAY FROM THE TURF WAR',2.2);return;}
    if(!left){if(GANG.wave<GANG.waves.length-1){GANG.wave++;for(const p of GANG.members.filter(q=>q.state==='dead'))releaseGangPed(p);GANG.members=GANG.members.filter(q=>q.gang);spawnWave(GANG.waves[GANG.wave],GANG.crew);flash(`WAVE ${GANG.wave+1}`,1.4);}
      else{const m=GANG.mode,c=GG.crewOf(GANG.crew);for(const p of GANG.members.filter(q=>q.state==='dead'))releaseGangPed(p);GANG.members=GANG.members.filter(q=>q.gang);disband();
        if(m==='war'){setOwner(t,'you');flash('TURF TAKEN: '+t.id.toUpperCase(),3);SAVE.stats.turfWon=(SAVE.stats.turfWon||0)+1;setTimeout(()=>__late.feedPost(`the ${c.name} just lost ${t.id}. who's running it now?? 😳`,null,null,true),3000);}
        else{TF.defend=null;G.cash+=500;flash('TURF DEFENDED  +$500',2.6);}G.wp=null;TF.cool[t.id]=performance.now()+60000;}}
    else if(G.frame%20===0){G.note=`${GANG.mode==='war'?'Turf war':'Defending'} ${t.id} · wave ${GANG.wave+1}/${GANG.waves.length} · ${left} left`;G.noteT=.8;}
    return;}
  // crews hanging out on their corner
  if(G.frame%20===0){let best=null,bd=230;for(const t of TURFS){if(!SAVE.turf[t.id])continue;const d=hypot(__gs.FX-t.cx,__gs.FZ-t.cz);if(d<bd){bd=d;best=t;}}
    if(GANG&&(GANG.t!==best||GANG.crew!==SAVE.turf[GANG.t.id]))disband();
    if(GANG&&GANG.hostile&&!GANG.members.some(p=>p.gang&&p.state!=='dead')){TF.cool[GANG.t.id]=performance.now()+120000;disband();}
    if(!GANG&&best&&!(TF.cool[best.id]>performance.now())&&!(__gs.IN))spawnIdle(best);}
  if(GANG&&GANG.mode==='idle'&&!GANG.hostile&&GANG.crew!=='you'){const d=hypot(__gs.FX-GANG.t.cx-3,__gs.FZ-GANG.t.cz);
    if(!G.car&&__late.ARM.w>0&&__late.ARM.aim&&d<16)goHostile();
    else if(d<6&&!G.car&&!GANG.warned){GANG.warned=true;G.note=`${GG.crewOf(GANG.crew).name} turf. Keep walking — or press E at their tag if you want a war.`;G.noteT=5;}}}
function syncGangCaps(){let k=0;if(GANG)for(const p of GANG.members){if(k>=GCAPS.length)break;if(!p.gang||p.lie>.4||abs(p.x-__gs.FX)>95||abs(p.z-__gs.FZ)>95)continue;const m=GCAPS[k++];m.visible=true;m.material=CAPMAT[p.gang.crew];
    if(p.rig&&p.rig.root.visible){p.rig.root.updateMatrixWorld(true);p.rig.b[4].getWorldPosition(m.position);m.position.y+=.15*p.sc;}else m.position.set(p.x,p.y+1.75*p.sc,p.z);m.rotation.set(0,p.th+PI,0);}
  for(;k<GCAPS.length;k++)GCAPS[k].visible=false;}
if(TEST){window.__turf=()=>({n:TURFS.length,turfs:TURFS.map(t=>({id:t.id,o:SAVE.turf[t.id],c:[t.cx|0,t.cz|0],cells:t.cells.length})),here:(turfAt(__gs.FX,__gs.FZ)||{}).id,pill:turfEl.textContent,
    gang:GANG&&{t:GANG.t.id,crew:GANG.crew,mode:GANG.mode,hostile:GANG.hostile,wave:GANG.wave,waves:GANG.waves,alive:GANG.members.filter(p=>p.gang&&p.state!=='dead').length,n:GANG.members.length},defend:TF.defend&&{t:TF.defend.t_.id,crew:TF.defend.crew,left:TF.defend.t|0},hp:G.hp|0,cash:G.cash});
  window.__turfPanel=id=>turfPanel(TURFS.find(t=>t.id===id));window.__killGang=()=>{if(GANG)for(const p of GANG.members)if(p.gang&&p.state!=='dead')__late.killPed(p,0,1);};
  window.__attackNow=()=>{TF.next=0;};window.__setTurf=(id,o)=>setOwner(TURFS.find(t=>t.id===id),o);window.__god=()=>{G.hp=1e6;};}

await stage(.93,'Finishing up');
export { goHostile, stepTurf, syncGangCaps, turfShot };
