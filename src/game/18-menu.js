// Six City — menu. One of the game's modules; they load in numbered order (src/game/index.js).
import './17-audio.js';
import * as THREE from 'three';
import { __gs, __late, later } from './shared.js';
import { $, PI, REAL, camera, canvas, cos, hypot, menuShow, scene, sin } from './01-core.js';
import { solidAt, walkable } from './04-world.js';
import { curbSpot, streamTick } from './05-landmarks.js';
import { peds, placePed, syncPeds } from './07-people.js';
import { G, K, flash, player, startGame } from './08-input.js';
import { RBS, dressPed, useRigs } from './09-characters.js';
import { clearPolice } from './10-police.js';
import { SAVE, SAVE_KEY, openBoard } from './11-missions.js';
import { BOTTOMS, HAIRS, HAIRSTYLE, JACKETS, PANEL, SHOES, SKINS, TOPS, applyOutfit, closePanel, cycle, owned, redressPlayer } from './13-homes.js';
import { DOORS, exitInterior } from './14-interiors.js';
import { BM, closeMap, openMap } from './16-map.js';
import { RAD, engGain, heliGain, radioHush, sirGain } from './17-audio.js';
later({pauseMenu:()=>pauseMenu,safeSpot:()=>safeSpot,teleportTo:()=>teleportTo}); // for earlier modules, read when called

/* ============================== menu · character creator · teleport ============================== */
function pauseMenu(){
  G.running=false;G.charOpen=false;__late.ARM.fire=__late.ARM.aim=false;for(const k in K)K[k]=false;
  $('goL').textContent=G.started?'Resume':'Play';$('eyeT').textContent=G.started?'Paused':'Toronto — Open world';menuShow(true);$('charui').style.display='none';
  if(engGain)engGain.gain.value=0;if(sirGain)sirGain.gain.value=0;if(heliGain)heliGain.gain.value=0;if(RAD.out)RAD.out.gain.value=0;radioHush();
  if(document.pointerLockElement)document.exitPointerLock();}
$('mMap').addEventListener('click',e=>{e.stopPropagation();startGame(true);openMap();});
$('mJobs').addEventListener('click',e=>{e.stopPropagation();startGame(true);openBoard();});
window.__gfxShow(REAL?'real':'classic');window.__saveHook=()=>__gs.saveGame();
$('mNew').addEventListener('click',e=>{e.stopPropagation();if(!confirm('Start over? This erases your saved progress, cash, homes and missions in this browser.'))return;G.started=false;try{localStorage.removeItem(SAVE_KEY);}catch(_){}removeEventListener('pagehide',__gs.saveGame);__gs.saveGame=()=>{};location.reload();});

$('mChar').addEventListener('click',e=>{e.stopPropagation();openChar();});

// --- character creator: body, skin, hair, clothes and shoes, previewed live on your character
const hex=c=>'#'+new THREE.Color(c).getHexString();
function charRows(){
  const o=SAVE.outfit,male=!!o.male,hs=HAIRSTYLE[male?'m':'f'];
  const cyc=(k,list,lab)=>`<div class="crow"><span>${lab}</span><div class="cyc"><button data-c="${k}" data-d="-1">‹</button><b>${list[(o[k]??0)%list.length]}</b><button data-c="${k}" data-d="1">›</button></div></div>`;
  const sw=(k,list,lab)=>`<div class="crow"><span>${lab}</span><div class="sw">${list.map((s,i)=>!owned(s)?'':`<i data-s="${k}" data-v="${i}" title="${s.n}" style="background:${typeof s.c==='number'?hex(s.c):s.c}" class="${(o[k]??0)===i?'on':''}"></i>`).join('')}</div></div>`;
  const col=(k,lab,def)=>`<div class="crow"><span>${lab}</span><label class="cpick"><input type="color" data-k="${k}" value="${o[k]||hex(def)}"><em>${o[k]?'Custom':'Default'}</em>${o[k]?`<button data-r="${k}">reset</button>`:''}</label></div>`;
  if(RBS){const L=male?RBS.m:RBS.f;return `<div class="crow"><span>Body</span><div class="seg"><button data-m="0" class="${male?'':'on'}">Feminine</button><button data-m="1" class="${male?'on':''}">Masculine</button></div></div>`
    +`<div class="crow"><span>Person</span><div class="cyc"><button data-c="rb" data-d="-1">‹</button><b>${(o.rb??0)%L.length+1} of ${L.length}</b><button data-c="rb" data-d="1">›</button></div></div>`
    +'<div class="cnote">Realistic graphics: each person comes with their own clothes. Switch to Classic graphics to design your own outfit.</div>';}
  return `<div class="crow"><span>Body</span><div class="seg"><button data-m="0" class="${male?'':'on'}">Feminine</button><button data-m="1" class="${male?'on':''}">Masculine</button></div></div>`
    +sw('skin',SKINS,'Skin tone')+cyc('hs',hs,'Hair style')+sw('h',HAIRS,'Hair colour')
    +(male?`<div class="crow"><span>Beard</span><div class="seg"><button data-beard="0" class="${o.beard?'':'on'}">No</button><button data-beard="1" class="${o.beard?'on':''}">Yes</button></div></div>`:'')
    +cyc('t',TOPS.map(t=>t.n),'Top')+col('tc','Top colour',TOPS[o.t%TOPS.length].c)
    +`<div class="crow"><span>Jacket</span><div class="cyc"><button data-c="jk" data-d="-1">‹</button><b>${JACKETS[o.jk??-1]?.n||'None'}</b><button data-c="jk" data-d="1">›</button></div></div>`
    +cyc('b',BOTTOMS.map(b=>b.n),'Bottoms')+col('bc','Bottoms colour',BOTTOMS[o.b%BOTTOMS.length].c)
    +sw('shoe',SHOES,'Shoes')
    +(G.car?'<div class="cnote">Step out of the car to see yourself in the preview.</div>':'<div class="cnote">Drag on the left to turn around.</div>');}
function renderChar(){$('charrows').innerHTML=charRows();}
function charChanged(){redressPlayer();__gs.saveGame();renderChar();}
$('charrows').addEventListener('click',e=>{const b=e.target.closest('[data-c],[data-s],[data-m],[data-beard],[data-r]');if(!b)return;const o=SAVE.outfit;
  if(b.dataset.c){const k=b.dataset.c,d=+b.dataset.d; // shop pieces you haven't bought are skipped
    if(k==='t'||k==='b'||k==='jk')o[k]=cycle(k==='t'?TOPS:k==='b'?BOTTOMS:JACKETS,o[k]??(k==='jk'?-1:0),d,k==='jk');
    else{const n=k==='rb'?(o.male?RBS.m:RBS.f).length:HAIRSTYLE[o.male?'m':'f'].length;o[k]=((o[k]??0)+d+n)%n;}if(k==='t')o.tc=null;if(k==='b')o.bc=null;}
  else if(b.dataset.s)o[b.dataset.s]=+b.dataset.v;
  else if(b.dataset.m){o.male=b.dataset.m==='1';o.hs=0;o.rb=0;}
  else if(b.dataset.beard)o.beard=b.dataset.beard==='1';
  else if(b.dataset.r)o[b.dataset.r]=null;
  charChanged();});
$('charrows').addEventListener('input',e=>{const k=e.target.dataset.k;if(!k)return;SAVE.outfit[k]=e.target.value;applyOutfit();if(useRigs&&player.rig){scene.remove(player.rig.root);dressPed(player);}});
$('charrows').addEventListener('change',e=>{if(e.target.dataset.k)charChanged();});
$('chardone').addEventListener('click',()=>{G.charOpen=false;$('charui').style.display='none';menuShow(true);});
const CP={yaw:0,drag:null};
function openChar(){G.charOpen=true;CP.yaw=0;menuShow(false);$('charui').style.display='block';renderChar();}
canvas.addEventListener('mousedown',e=>{if(G.charOpen)CP.drag=e.clientX;});
addEventListener('mouseup',()=>{CP.drag=null;});
addEventListener('mousemove',e=>{if(G.charOpen&&CP.drag!==null){CP.yaw+=(e.clientX-CP.drag)*.01;CP.drag=e.clientX;}});
function charPreview(){ // camera in front of your character, slightly to the left so the panel doesn't cover them
  const p=player,a=p.th+CP.yaw,d=3.1,fx=sin(a),fz=cos(a);p.amp*=.8;
  const lx=cos(a)*1.05,lz=-sin(a)*1.05;
  camera.position.set(p.x+fx*d+lx,p.y+1.35,p.z+fz*d+lz);camera.lookAt(p.x+lx*.9,p.y+1.0,p.z+lz*.9);
  if(camera.fov!==45){camera.fov=45;camera.updateProjectionMatrix();}
  syncPeds();__late.updateGun();}

// --- teleport straight to any place on the map
// nearest spot you can actually stand on (spiral search), so a teleport or a restored save never strands you
function safeSpot(x,z){const ok=(a,b)=>walkable(a,b)&&!solidAt(a,1,b);if(ok(x,z))return{x,z};for(let r=2;r<=120;r+=2)for(let k=0;k<16;k++){const a=k/16*2*PI,px=x+cos(a)*r,pz=z+sin(a)*r;if(ok(px,pz))return{x:px,z:pz};}return{x,z};}
function teleportTo(x,z,name){
  if(G.busy)return;{const d=DOORS.find(q=>q.name===name||name&&q.name.startsWith(name.split(' (')[0]));if(d){x=d.at[0]+d.n[0]*2.5;z=d.at[1]+d.n[1]*2.5;}}if(BM.open)closeMap();if(PANEL)closePanel();G.busy=true;$('fade').style.opacity=1;
  setTimeout(()=>{
    __late.offWater();const c=G.car;
    if(c){const s=curbSpot(x,z,'park')||{x,z,th:c.th};c.x=s.x;c.z=s.z;c.th=s.th;c.vx=c.vz=c.w=c.speed=0;__gs.FX=c.x;__gs.FZ=c.z;player.x=c.x;player.z=c.z;}
    else{let s=walkable(x,z)&&!solidAt(x,1,z)?{x,z}:curbSpot(x,z,'walk')||{x,z};s=safeSpot(s.x,s.z);player.x=s.x;player.z=s.z;player.y=0;player.vy=0;__gs.FX=s.x;__gs.FZ=s.z;}
    if(__gs.IN)exitInterior(true);__late.camT.set(__gs.FX,1.6,__gs.FZ);streamTick(__gs.FX,__gs.FZ,true);
    clearPolice();
    for(const p of peds)if(p!==player)placePed(p,12,160);
    if(G.wp&&hypot(G.wp.x-x,G.wp.z-z)<80){G.wp=null;__gs.ROUTE=null;}
    $('fade').style.opacity=0;G.busy=false;flash(name.toUpperCase(),2.4);
  },650);}

export { charPreview, openChar, safeSpot, teleportTo };
