// Six City — the TTC: subway stations you can ride between, and streetcars you can ride along on.
import './21-turf.js';
import * as THREE from 'three';
import * as TT from '../ttc.js';
import { __gs, __late, later } from './shared.js';
import { $, MAP, PI, TEST, atan2, canvas, cos, cv, floor, hypot, max, min, scene, sin } from './01-core.js';
import { nearestEdge, solidAt, walkable } from './04-world.js';
import { curbSpot, streamTick } from './05-landmarks.js';
import { cars } from './06-cars.js';
import { peds, placePed } from './07-people.js';
import { G, flash, player } from './08-input.js';
import { WANT, wClear } from './10-police.js';
import { SAVE } from './11-missions.js';
later({openTTC:()=>openTTC,closeTTC:()=>closeTTC,rideTram:()=>rideTram,leaveTram:()=>leaveTram,ttcMapDots:()=>ttcMapDots}); // for earlier modules, read when called

/* ============================== the TTC ==============================
   Lines, stations and entrances are real (MAP.subway, from OpenStreetMap via tools/fetch-ttc.mjs); trip planning is in
   src/ttc.js (unit-tested). E at a station entrance opens the line map: pick a station and you ride there (fare $3,
   fewest transfers first). F next to a streetcar rides along with it; F again to hop off once it stops. */
const NET=MAP.subway||{lines:[],stations:[]};
const ENT=[]; // the station entrances in the playable area, each on open pavement
NET.stations.forEach((s,si)=>{for(const [x0,z0] of s.e){let x=x0,z=z0;if(!walkable(x,z)||solidAt(x,1,z)){const c=curbSpot(x,z,'walk');if(!c)continue;x=c.x;z=c.z;}
  if(ENT.some(e=>hypot(e.x-x,e.z-z)<6))continue;ENT.push({si,x,z});}});
const PLAYABLE=new Set(ENT.map(e=>e.si));
// entrance signs: the red TTC roundel over the station name, on a post facing the street
const postGeo=new THREE.CylinderGeometry(.06,.06,2.6,8).translate(0,1.3,0),postMat=new THREE.MeshStandardMaterial({color:0x2a2c30,metalness:.5,roughness:.5});
const SIGNTEX=new Map();function signTex(si){if(SIGNTEX.has(si))return SIGNTEX.get(si);const c=cv(256,320),g=c.getContext('2d'),s=NET.stations[si];
  g.fillStyle='#ffffff';g.fillRect(0,0,256,320);g.fillStyle='#da251d';g.beginPath();g.arc(128,108,90,0,7);g.fill();g.fillStyle='#fff';g.font='900 74px Inter, Arial Black, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('TTC',128,112);
  g.fillStyle='#111';let fs=40;g.font=`800 ${fs}px Inter, Arial, sans-serif`;while(g.measureText(s.n).width>236&&fs>18){fs-=2;g.font=`800 ${fs}px Inter, Arial, sans-serif`;}g.fillText(s.n,128,236);
  const cols=s.l.map(r=>NET.lines.find(L=>L.ref===r)?.col||'#888');cols.forEach((col,i)=>{g.fillStyle=col;g.fillRect(28+i*(200/cols.length),280,200/cols.length-6,18);});
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;SIGNTEX.set(si,t);return t;}
const signGeo=new THREE.PlaneGeometry(.8,1);
for(const e of ENT){const g=new THREE.Group();g.position.set(e.x,0,e.z);const post=new THREE.Mesh(postGeo,postMat);post.castShadow=true;g.add(post);
  const m=new THREE.MeshStandardMaterial({map:signTex(e.si),roughness:.5,emissive:0xffffff,emissiveMap:signTex(e.si),emissiveIntensity:.25,side:THREE.DoubleSide});
  const sg=new THREE.Mesh(signGeo,m);sg.position.y=2.6;g.add(sg);const r=nearestEdge(e.x,e.z,40);g.rotation.y=r?atan2(r.x-e.x,r.z-e.z):0;scene.add(g);e.g=g;}

// --- the line map overlay
const ttcEl=document.createElement('div');ttcEl.id='ttc';document.body.appendChild(ttcEl);
const rideEl=document.createElement('div');rideEl.id='ttcride';document.body.appendChild(rideEl);
let FROM=null;
function openTTC(e){if(G.busy||G.car||G.tram)return;if(WANT.state==='act'){flash('TOO MANY COPS ON YOU — LOSE THEM FIRST',1.8);return;}
  FROM=e;G.ttcOpen=true;G.uiOpen=true;if(document.pointerLockElement)document.exitPointerLock();
  const here=NET.stations[e.si];let h=`<div class="tt-h"><b>TTC</b><span>${here.n}</span><button data-x="1">✕</button></div><p class="tt-sub">Pick a station. Every ride is $${TT.FARE}, transfers included. You have $${G.cash.toLocaleString()}.</p>`;
  for(const L of NET.lines){if(!L.st.some(si=>PLAYABLE.has(si)))continue;h+=`<div class="tt-line"><i style="background:${L.col}"></i><b>${L.name}</b></div><div class="tt-st" style="--c:${L.col}">`;
    for(const si of L.st){const s=NET.stations[si],ok=PLAYABLE.has(si)&&si!==e.si,t=ok?TT.plan(NET,e.si,si):null;
      h+=`<button data-s="${si}" ${ok&&t?'':'disabled'} class="${si===e.si?'here':''}" title="${t?`${t.stops} stops · ${t.minutes} min${t.transfers?` · ${t.transfers} transfer${t.transfers>1?'s':''}`:''}`:si===e.si?'You are here':'Outside the map'}">${s.n}${s.l.length>1?' <em>⇄</em>':''}</button>`;}
    h+='</div>';}
  ttcEl.innerHTML=h;ttcEl.style.display='block';}
function closeTTC(noLock){if(!G.ttcOpen)return;G.ttcOpen=false;G.uiOpen=false;ttcEl.style.display='none';if(!TEST&&!noLock&&G.running)canvas.requestPointerLock?.();}
ttcEl.addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b||b.disabled)return;if(b.dataset.x){closeTTC();return;}if(b.dataset.s)rideTo(+b.dataset.s);});
// the ride: fade out, the stations go by on the screen, come up the stairs at the other end
function rideTo(si){const t=TT.plan(NET,FROM.si,si);if(!t)return;if(G.cash<TT.FARE){flash(`THE FARE IS $${TT.FARE}`,1.4);return;}
  G.cash-=TT.FARE;SAVE.stats.subway=(SAVE.stats.subway||0)+1;closeTTC(true);G.busy=true;$('fade').style.opacity=1;
  const stops=TT.stopsOf(NET,t);let k=0;
  const show=()=>{const st=stops[k],L=NET.lines.find(q=>q.ref===st.line),leg=t.legs.find(l=>l.line===st.line);
    rideEl.innerHTML=`<div class="tr-bar" style="background:${L.col}"></div><div class="tr-l">${L.name} · towards ${NET.stations[TT.towards(NET,leg)].n}</div><div class="tr-n">${st.end&&k===stops.length-1?'Arriving at':'Next station'}</div><div class="tr-s">${NET.stations[st.s].n}</div>${st.end&&k<stops.length-1?'<div class="tr-x">Change trains here</div>':''}`;
    __late.click();};
  setTimeout(()=>{rideEl.style.display='block';show();const tick=setInterval(()=>{k++;if(k<stops.length){show();return;}clearInterval(tick);arrive(si,t);},Math.max(220,Math.min(520,5200/stops.length)));},650);}
function arrive(si,t){const ex=ENT.filter(e=>e.si===si).sort((a,b)=>hypot(a.x-NET.stations[si].x,a.z-NET.stations[si].z)-hypot(b.x-NET.stations[si].x,b.z-NET.stations[si].z))[0];
  player.x=ex.x;player.z=ex.z;player.y=0;player.vy=0;__gs.FX=ex.x;__gs.FZ=ex.z;__late.camT.set(ex.x,1.6,ex.z);streamTick(ex.x,ex.z,true);
  for(const p of peds)if(p!==player&&!p.actor&&!p.gang&&!p.ins)placePed(p,12,160);
  G.time=(G.time+t.minutes/60)%24;
  if(WANT.state&&WANT.state!=='act')wClear('LOST THEM ON THE SUBWAY');
  rideEl.style.display='none';$('fade').style.opacity=0;G.busy=false;flash(NET.stations[si].n.toUpperCase(),2.4);}
// --- streetcars: ride along
function rideTram(c){if(G.cash<TT.FARE){flash(`THE FARE IS $${TT.FARE}`,1.4);return;}G.cash-=TT.FARE;G.tram=c;c.keep=true;player.hidden=true;SAVE.stats.streetcar=(SAVE.stats.streetcar||0)+1;flash('STREETCAR · $'+TT.FARE,1.4);__late.click();}
function leaveTram(force){const c=G.tram;if(!force&&abs2(c)>2.5){flash('WAIT FOR IT TO STOP',1.2);return;}
  const fx=sin(c.th),fz=cos(c.th);let spot=null;for(const o of[c.T.W/2+1.8,-(c.T.W/2+1.8),c.T.W/2+3.5,-(c.T.W/2+3.5)]){const x=c.x+fz*o,z=c.z-fx*o;if(walkable(x,z)&&!solidAt(x,1,z)){spot={x,z};break;}}
  spot=spot||curbSpot(c.x,c.z,'walk')||{x:c.x,z:c.z};player.x=spot.x;player.z=spot.z;player.y=0;player.vy=0;player.th=c.th;player.hidden=false;c.keep=false;G.tram=null;}
const abs2=c=>Math.abs(c.speed||0);
function tramNear(){for(const c of cars){if(!c.T.tram||c.mode!=='traffic')continue;const dx=player.x-c.x,dz=player.z-c.z,fx=sin(c.th),fz=cos(c.th),lf=dx*fx+dz*fz,ll=-dx*fz+dz*fx;if(Math.abs(lf)<c.T.L/2+1&&Math.abs(ll)<c.T.W/2+2.2)return c;}return null;}
function stepTTC(dt){G.ttcHint='';G.ttcNear=null;
  if(G.tram){const c=G.tram;if(!cars.includes(c)){leaveTram(true);return;}player.x=c.x;player.z=c.z;__gs.FX=c.x;__gs.FZ=c.z;G.focusSpeed=abs2(c);
    const st=c.ai&&c.ai.e&&c.ai.e.short;G.ttcHint=`Riding the streetcar${st?' along '+st:''} · ${abs2(c)<2.5?'press F to hop off':'F to hop off when it stops'}`;return;}
  if(G.car||G.busy||G.ride)return;
  for(const e of ENT)if(Math.abs(e.x-player.x)<3&&Math.abs(e.z-player.z)<3){G.ttcNear=e;G.ttcHint=`Press E to take the subway from ${NET.stations[e.si].n}`;return;}
  if(G.frame%6===0)G.tramNear=tramNear();if(G.tramNear&&cars.includes(G.tramNear))G.ttcHint=`Press F to ride the streetcar ($${TT.FARE})`;
  if(G.frame%30===0)for(const e of ENT)e.g.visible=Math.abs(e.x-__gs.FX)+Math.abs(e.z-__gs.FZ)<700;}
// station dots on the big map
function ttcMapDots(dot,s){const seen=new Set();for(const e of ENT){if(seen.has(e.si))continue;seen.add(e.si);const st=NET.stations[e.si],col=NET.lines.find(L=>L.ref===st.l[0])?.col||'#da251d';dot(st.x,st.z,col,5,s>.35?st.n:'');}}
if(TEST){window.__ttc=()=>({lines:NET.lines.map(L=>L.ref+':'+L.st.length),ent:ENT.length,stations:PLAYABLE.size,near:G.ttcNear&&NET.stations[G.ttcNear.si].n,hint:G.ttcHint,open:!!G.ttcOpen,tram:!!G.tram,busy:G.busy,pos:[player.x|0,player.z|0],cash:G.cash,time:+G.time.toFixed(2)});
  window.__ent=name=>{const e=ENT.find(q=>NET.stations[q.si].n===name);if(!e)return null;player.x=e.x+.5;player.z=e.z;__gs.FX=player.x;__gs.FZ=player.z;return[e.x|0,e.z|0];};
  window.__tramGo=()=>{const c=cars.filter(q=>q.T.tram&&q.mode==='traffic').sort((a,b)=>hypot(a.x-player.x,a.z-player.z)-hypot(b.x-player.x,b.z-player.z))[0];if(!c)return null;player.x=c.x+cos(c.th)*2.6;player.z=c.z-sin(c.th)*2.6;rideTram(c);return [c.x|0,c.z|0];};}

export { stepTTC };
