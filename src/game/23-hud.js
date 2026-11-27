// Six City — hud. One of the game's modules; they load in numbered order (src/game/index.js).
import './22-ttc.js';
import * as PR from '../property.js';
import { __gs, __late, later } from './shared.js';
import { $, EDGES, MAP, PI, PLAY, QUAL, abs, ceil, clamp, cos, cv, floor, hypot, lerp, max, min, round, sin, sqrt } from './01-core.js';
import { BASINS, nearestEdge, walkable } from './04-world.js';
import { hood } from './05-landmarks.js';
import { cars } from './06-cars.js';
import { GARAGES, peds } from './07-people.js';
import { G, hintEl, player } from './08-input.js';
import { HELI, RB, WANT, wCen, wLvl, wNeed, wR } from './10-police.js';
import { GIVERS, MISSIONS, MS, SAVE } from './11-missions.js';
import { HOUSES, nearHomeGarage } from './13-homes.js';
import { SPOTB } from './14-interiors.js';
import { nearBoat, spiral } from './19-harbour.js';
import { nearBike } from './20-bikes.js';
later({drawMap:()=>drawMap}); // for earlier modules, read when called

/* ============================== minimap & HUD ============================== */
// the world is too big for one canvas: features are bucketed into 1 km tiles that are painted on demand,
// plus one coarse overview for the zoomed-out big map
const MMS=.55,TILE=1024,TPX=ceil(TILE*MMS),MB={x0:PLAY.x0-400,z0:PLAY.z0-400,x1:PLAY.x1+400,z1:max(PLAY.z1+400,4350)};
const MFEAT=new Map(),MTILES=new Map(),tkey=(i,j)=>i+','+j;
{
  const ALL=[];
  const add=(p,col,w)=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of p){if(q[0]<x0)x0=q[0];if(q[0]>x1)x1=q[0];if(q[1]<z0)z0=q[1];if(q[1]>z1)z1=q[1];}
    const f={p,col,w},m=(w||0)/2+1;ALL.push(f);
    for(let i=floor((x0-m)/TILE);i<=floor((x1+m)/TILE);i++)for(let j=floor((z0-m)/TILE);j<=floor((z1+m)/TILE);j++){const k=tkey(i,j);let L=MFEAT.get(k);if(!L)MFEAT.set(k,L=[]);L.push(f);}};
  add(MAP.land,'#efe9dd');for(const p of MAP.landExtra||[])add(p,'#efe9dd');for(const p of MAP.islands)add(p,'#bfe0a8');
  for(const p of MAP.railLand)add(p,'#ddd5c6');
  for(const L of MAP.lots||[])add(L.p,'#d9d6d0');
  for(const gp of MAP.green)add(gp.p,gp.k===2?'#bde3a0':'#acd98f');
  for(const z of MAP.plazas)add(z.p,'#f8f3e8');
  for(const b of BASINS)add(b,'#86c3dd');
  for(const r of MAP.sceneRoads)add(r.p,'#cfc7b6',r.hw*2+3);
  for(const e of EDGES)add(e.p,'#cfc7b6',e.hw*2+3);
  for(const r of MAP.sceneRoads)add(r.p,'#ffffff',r.hw*2);
  for(const e of EDGES)add(e.p,/motorway/.test(e.c)?'#f6c66a':/primary|secondary|trunk/.test(e.c)?'#ffe7a3':'#ffffff',e.hw*2);
  for(const l of MAP.tram)add(l,'rgba(214,40,52,.6)',1.4);
  for(const gd of MAP.gardiner)if(gd.el)add(gd.p,'#f3bd5c',9);
  for(const v of MAP.vols){if(v.b>2)continue;add(v.p,v.h>70?'#b3abc7':'#d6cfc2');}
  MFEAT.all=ALL;
}
function paintMap(g,list){g.lineCap='round';g.lineJoin='round';
  for(const f of list){const p=f.p;g.beginPath();g.moveTo(p[0][0],p[0][1]);for(let k=1;k<p.length;k++)g.lineTo(p[k][0],p[k][1]);
    if(f.w){g.strokeStyle=f.col;g.lineWidth=f.w;g.stroke();}else{g.closePath();g.fillStyle=f.col;g.fill();}}}
function mapTile(i,j,make){const k=tkey(i,j);let c=MTILES.get(k);
  if(c){MTILES.delete(k);MTILES.set(k,c);return c;}if(!make)return null;
  c=cv(TPX,TPX);const g=c.getContext('2d');g.fillStyle='#86c3dd';g.fillRect(0,0,TPX,TPX);g.scale(TPX/TILE,TPX/TILE);g.translate(-i*TILE,-j*TILE);
  paintMap(g,MFEAT.get(k)||[]);MTILES.set(k,c);if(MTILES.size>64)MTILES.delete(MTILES.keys().next().value);return c;}
let MOV=null;const OMS=min(.28,sqrt(12e6/((MB.x1-MB.x0)*(MB.z1-MB.z0))));
function mapOverview(){if(MOV)return MOV;MOV=cv(ceil((MB.x1-MB.x0)*OMS),ceil((MB.z1-MB.z0)*OMS));const g=MOV.getContext('2d');g.fillStyle='#86c3dd';g.fillRect(0,0,MOV.width,MOV.height);
  g.scale(OMS,OMS);g.translate(-MB.x0,-MB.z0);paintMap(g,MFEAT.all);return MOV;}
// ctx is already in world coordinates; draws the part of the map inside [x0,x1]x[z0,z1]
function drawMap(ctx,x0,z0,x1,z1,coarse,budget){
  if(coarse){ctx.drawImage(mapOverview(),MB.x0,MB.z0,MB.x1-MB.x0,MB.z1-MB.z0);return;}
  let made=0;budget=budget??99;
  for(let i=floor(x0/TILE);i<=floor(x1/TILE);i++)for(let j=floor(z0/TILE);j<=floor(z1/TILE);j++){
    if(i*TILE>MB.x1||(i+1)*TILE<MB.x0||j*TILE>MB.z1||(j+1)*TILE<MB.z0)continue;
    let c=mapTile(i,j,false);if(!c&&made<budget){c=mapTile(i,j,true);made++;}
    if(c)ctx.drawImage(c,i*TILE,j*TILE,TILE+.5,TILE+.5);}}
const mm=$('mm').getContext('2d');
function drawInteriorMap(){ // floor plan of the interior you're in
  const sc=__gs.IN.walkFn?2.2:3,phi=__gs.camYaw+PI,cp=cos(phi),sp=sin(phi);
  mm.save();mm.clearRect(0,0,200,200);mm.beginPath();if(mm.roundRect)mm.roundRect(0,0,200,200,22);else mm.rect(0,0,200,200);mm.clip();mm.fillStyle='#14204a';mm.fillRect(0,0,200,200);
  mm.translate(100,100);mm.rotate(phi);mm.scale(sc,sc);mm.translate(-player.x,-player.z);mm.fillStyle='#e8e1d2';
  if(__gs.IN.walkFn){for(let x=-60;x<=60;x+=2)for(let z=-60;z<=60;z+=2)if(__gs.IN.walkFn(player.x+x,player.z+z))mm.fillRect(player.x+x-1,player.z+z-1,2.1,2.1);}
  else for(const r of __gs.IN.walk)mm.fillRect(__gs.IN.ox+r[0],__gs.IN.oz+r[1],r[2]-r[0],r[3]-r[1]);
  mm.restore();
  const blip=(x,z,col,r)=>{let dx=(x-player.x)*sc,dz=(z-player.z)*sc,sx=dx*cp-dz*sp,sy=dx*sp+dz*cp;const m=max(abs(sx),abs(sy));if(m>88){sx*=88/m;sy*=88/m;}mm.fillStyle=col;mm.beginPath();mm.arc(100+sx,100+sy,r,0,7);mm.fill();mm.strokeStyle='rgba(20,20,40,.7)';mm.lineWidth=1.5;mm.stroke();};
  blip(__gs.IN.spots.exit[0],__gs.IN.spots.exit[1],'#45ff7a',6);for(const p of peds)if(p.ins&&p.state!=='dead'&&p.ins.role==='guard')blip(p.x,p.z,__gs.IN.alarm?'#ff3040':'#7f8ca8',4);
  for(const c of __gs.IN.cases)if(!c.broken)blip(c.x,c.z,'#ffd23f',3.5);if(MS&&MS.tp)blip(MS.tp[0],MS.tp[1],'#3fe0ff',6);
  const th=player.th,hx=sin(th),hz=cos(th),ax=hx*cp-hz*sp,ay=hx*sp+hz*cp;
  mm.fillStyle='#e8303f';mm.strokeStyle='#fff';mm.lineWidth=2;mm.beginPath();mm.moveTo(100+ax*10,100+ay*10);mm.lineTo(100-ax*6-ay*7,100-ay*6+ax*7);mm.lineTo(100-ax*2,100-ay*2);mm.lineTo(100-ax*6+ay*7,100-ay*6-ax*7);mm.closePath();mm.fill();mm.stroke();}
function drawMinimap(){
  if(__gs.IN&&!__gs.IN.real){drawInteriorMap();return;}
  const spd=G.car?abs(G.car.speed):0,sc=lerp(.62,.36,clamp(spd/28,0,1)),phi=__gs.camYaw+PI,cp=cos(phi),sp=sin(phi);
  mm.save();mm.clearRect(0,0,200,200);mm.beginPath();if(mm.roundRect)mm.roundRect(0,0,200,200,22);else mm.rect(0,0,200,200);mm.clip();
  mm.fillStyle='#86c3dd';mm.fillRect(0,0,200,200);
  mm.translate(100,100);mm.rotate(phi);mm.scale(sc,sc);mm.translate(-__gs.FX,-__gs.FZ);{const r=145/sc;drawMap(mm,__gs.FX-r,__gs.FZ-r,__gs.FX+r,__gs.FZ+r,false,2);
    if(G.frame%20===0){const i0=floor(__gs.FX/TILE),j0=floor(__gs.FZ/TILE);out:for(let di=-1;di<=1;di++)for(let dj=-1;dj<=1;dj++)if(!mapTile(i0+di,j0+dj,false)){mapTile(i0+di,j0+dj,true);break out;}}}
  if(__gs.ROUTE){mm.lineCap='round';mm.lineJoin='round';mm.beginPath();__gs.ROUTE.pts.forEach((q,i)=>i?mm.lineTo(q[0],q[1]):mm.moveTo(q[0],q[1]));mm.strokeStyle='rgba(255,255,255,.95)';mm.lineWidth=13;mm.stroke();mm.strokeStyle='#8a5cff';mm.lineWidth=8;mm.stroke();}
  if(WANT.state==='resp'||WANT.state==='srch'){const[cx,cz]=wCen(),r=WANT.state==='resp';mm.beginPath();mm.arc(cx,cz,wR(),0,7);mm.fillStyle=r?'rgba(255,178,31,.2)':'rgba(95,211,255,.18)';mm.fill();
    mm.setLineDash([10/sc,7/sc]);mm.lineWidth=3/sc;mm.strokeStyle=r?'#ffb21f':'#5fd3ff';mm.stroke();mm.setLineDash([]);}
  mm.restore();
  const blip=(x,z,col,r,edge)=>{let dx=(x-__gs.FX)*sc,dz=(z-__gs.FZ)*sc,sx=dx*cp-dz*sp,sy=dx*sp+dz*cp;const m=max(abs(sx),abs(sy));if(m>90){if(!edge)return;sx*=90/m;sy*=90/m;}
    mm.fillStyle=col;mm.beginPath();mm.arc(100+sx,100+sy,r,0,7);mm.fill();mm.strokeStyle='rgba(20,20,40,.7)';mm.lineWidth=1.5;mm.stroke();};
  for(const[x,z]of GARAGES)blip(x,z,'#35d16a',5,false);
  for(const s of SPOTB)blip(s.at[0],s.at[1],s.col,4.5,false);
  for(const k in GIVERS){const g=GIVERS[k];if(!g.beacon.visible)continue;let dx=(g.at[0]-__gs.FX)*sc,dz=(g.at[1]-__gs.FZ)*sc,sx=dx*cp-dz*sp,sy=dx*sp+dz*cp;const m=max(abs(sx),abs(sy));if(m>86){sx*=86/m;sy*=86/m;}
    mm.fillStyle=g.css;mm.beginPath();mm.arc(100+sx,100+sy,8,0,7);mm.fill();mm.strokeStyle='#14204a';mm.lineWidth=2;mm.stroke();mm.fillStyle='#14204a';mm.font='900 10px Inter, sans-serif';mm.textAlign='center';mm.textBaseline='middle';mm.fillText(k,100+sx,100+sy+.5);}
  if(MS&&MS.tp)blip(MS.tp[0],MS.tp[1],'#3fe0ff',7,true);
  for(const h of HOUSES){const own=SAVE.homes.includes(h.id);let dx=(h.at[0]-__gs.FX)*sc,dz=(h.at[1]-__gs.FZ)*sc,sx=dx*cp-dz*sp,sy=dx*sp+dz*cp;if(max(abs(sx),abs(sy))>88)continue;
    mm.fillStyle=own?'#4f8bff':'#2fc36a';mm.strokeStyle='#14204a';mm.lineWidth=2;mm.beginPath();mm.moveTo(100+sx,100+sy-8);mm.lineTo(100+sx+7,100+sy-1);mm.lineTo(100+sx+5,100+sy-1);mm.lineTo(100+sx+5,100+sy+6);mm.lineTo(100+sx-5,100+sy+6);mm.lineTo(100+sx-5,100+sy-1);mm.lineTo(100+sx-7,100+sy-1);mm.closePath();mm.fill();mm.stroke();}
  if(G.wp)blip(G.wp.x,G.wp.z,'#b48cff',6.5,true);
  const fl=(performance.now()/250|0)%2;
  for(const c of cars)if(c.mode==='police')blip(c.x,c.z,fl?'#ff3040':'#3060ff',4.5,false);
  for(const p of peds)if(p.copPed&&p.cop&&!p.hidden&&p.state!=='dead')blip(p.x,p.z,fl?'#3060ff':'#ff3040',2.6,false);
  for(const B of RB)blip(B.x,B.z,'#ff3040',5.5,false);
  if(HELI.on)blip(HELI.x,HELI.z,fl?'#ff3040':'#3060ff',6,true);
  if(WANT.pend&&WANT.pend.p&&fl)blip(WANT.pend.p.x,WANT.pend.p.z,'#ffb21f',4.5,false);
  if(G.job)blip(G.job.x,G.job.z,G.job.stage?'#2fb8ff':'#ffbf1f',6.5,true);
  { // "N" marker for Toronto's grid north
    const nx=0*cp-(-1)*sp,ny=0*sp+(-1)*cp,m=max(abs(nx),abs(ny)),x=100+nx/m*86,y=100+ny/m*86;
    mm.fillStyle='#14204a';mm.beginPath();mm.arc(x,y,8,0,7);mm.fill();mm.fillStyle='#fff';mm.font='800 10px Inter, sans-serif';mm.textAlign='center';mm.textBaseline='middle';mm.fillText('N',x,y+.5);}
  const th=G.car?G.car.th:player.th,hx=sin(th),hz=cos(th),ax=hx*cp-hz*sp,ay=hx*sp+hz*cp;
  mm.fillStyle='#e8303f';mm.strokeStyle='#fff';mm.lineWidth=2;mm.beginPath();mm.moveTo(100+ax*10,100+ay*10);mm.lineTo(100-ax*6-ay*7,100-ay*6+ax*7);mm.lineTo(100-ax*2,100-ay*2);mm.lineTo(100-ax*6+ay*7,100-ay*6-ax*7);mm.closePath();mm.fill();mm.stroke();
}
const hud={wst:$('wst'),wl:$('wst').firstElementChild,wb:$('wst').querySelector('u i'),cash:$('cash'),stars:$('stars'),clock:$('clock'),spd:$('spd').firstElementChild,veh:$('veh'),chb:$('chb'),hpb:$('hpb'),arw:$('arw'),arb:$('arb'),br:$('br'),fps:$('fps'),street:$('street'),hood:$('hood'),prog:$('prog')};
let shownCash=0,wKey='',wLab='';hud.stars.innerHTML='<i></i>'.repeat(6);const wPips=[...hud.stars.children];
const xhEl=$('xh'),ammoEl=$('ammo');let ammoTxt='';
function drawHud(fps){
  {const armed=!G.car&&!player.hidden,W=__late.WEAPONS[__late.ARM.w];xhEl.style.display=armed&&__late.ARM.w>0&&!G.scoped?'block':'none';xhEl.className=__late.ARM.aim?'aim':'';
   const t=!armed?'':__late.ARM.w?`${W.n}<b>${__late.ARM.reload>0?'—':__late.ARM.ammo[__late.ARM.w]}</b>/ ${W.mag}`:'Fists';if(t!==ammoTxt){ammoTxt=t;ammoEl.innerHTML=t;ammoEl.style.display=t?'block':'none';}}
  shownCash+=(G.cash-shownCash)*.2;if(abs(G.cash-shownCash)<1)shownCash=G.cash;
  hud.cash.textContent=round(shownCash).toLocaleString();
  {const s=wLvl(),st=WANT.state||(WANT.pend?'resp':''),k=s+st;
   if(k!==wKey){wKey=k;hud.stars.className='glass '+st;hud.wst.className='glass '+st;wPips.forEach((e,i)=>e.className=i<s?'on':'');}
   let lab='',f=-1;
   if(WANT.state==='act'){lab=G.arrestT>0?'HANDS UP':'IN PURSUIT';if(G.arrestT>0)f=G.arrestT/2.2;}
   else if(WANT.state){lab=WANT.state==='resp'?'RESPONDING':'SEARCHING';f=WANT.cool/wNeed();}
   else if(WANT.pend)lab='WITNESS CALLING';
   if(lab!==wLab){wLab=lab;hud.wl.textContent=lab;hud.wst.style.display=lab?'block':'none';}
   hud.wb.parentNode.style.display=f<0?'none':'';if(f>=0)hud.wb.style.width=min(100,f*100)+'%';}
  const h=floor(G.time),mi=floor((G.time-h)*60);hud.clock.textContent=String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0');
  hud.hpb.style.width=max(0,G.hp)+'%';{const a=G.armor||0;hud.arw.style.display=a>0?'block':'none';if(a>0)hud.arb.style.width=a+'%';}
  if(G.car){hud.br.style.display='';hud.spd.textContent=round(abs(G.car.speed)*3.6);hud.veh.textContent=G.car.T.name+(G.car.hp<=0?' — wrecked':'');hud.chb.style.width=G.car.hp+'%';hud.chb.style.background=G.car.hp<35?'#ff7a3d':'';}
  else hud.br.style.display='none';
  if(G.frame%12===0){const r=__gs.IN&&!__gs.IN.real?null:nearestEdge(__gs.FX,__gs.FZ,30),st=__gs.IN?__gs.IN.name:r?r.e.short:'',hd=__gs.IN?(__gs.IN.alarm?'ALARM':'INSIDE'):hood(__gs.FX,__gs.FZ);if(hud.street.textContent!==st)hud.street.textContent=st;if(hud.hood.textContent!==hd)hud.hood.textContent=hd;}
  let hint='';
  if(!G.car&&!G.ride&&!G.tram){for(const c of cars)if(!c.T.tram&&hypot(c.x-player.x,c.z-player.z)<3.6){hint='Press F to '+(c.mode==='traffic'?'take this car':'get in');break;}
    {const nb=nearBike();if(nb&&(!hint||nb.d<2))hint=nb.b.mode==='docked'?'Press F to ride a city bike ($3)':'Press F to get on the '+nb.b.T.name.toLowerCase();}
    if(!hint){const b=nearBoat();if(b)hint='Press F to take the '+b.T.name.toLowerCase();}}
  else if(G.car&&G.car.boat&&G.car.hp>0&&hypot(G.car.vx,G.car.vz)<3&&spiral(G.car.x,G.car.z,walkable,G.car.T.W/2+7,2))hint='Press F to step ashore';
  else if(G.car&&G.car.hp<=0)hint=G.car.boat?'Engine dead — get near the shore and press F':'Engine dead — press F to get out';
  if(!hint&&G.car&&!G.ride){const h=nearHomeGarage();if(h)hint=`Press E to keep this car in your garage (${(SAVE.garage[h.id]||[]).length}/${PR.garageSize(h.id)})`;}
  if(!hint&&G.ttcHint)hint=G.ttcHint;
  if(!hint&&G.ferryHint)hint=G.ferryHint;
  if(!hint&&G.lifeHint)hint=G.lifeHint;
  if(!hint&&G.missionHint)hint=G.missionHint;
  if(hintEl.textContent!==hint)hintEl.textContent=hint;
  const pg='MISSIONS '+SAVE.done.length+'/'+MISSIONS.length;if(hud.prog.textContent!==pg)hud.prog.textContent=pg;
  hud.fps.textContent=fps+' fps · '+QUAL[__gs.qual].name+' · '+__gs.pr.toFixed(2)+'x';
}

export { drawHud, drawMinimap };
