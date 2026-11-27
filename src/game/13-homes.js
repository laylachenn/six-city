// Six City — homes. One of the game's modules; they load in numbered order (src/game/index.js).
import './12-story.js';
import * as THREE from 'three';
import * as PR from '../property.js';
import * as GG from '../gangs.js';
import * as FA from '../fashion.js';
import { __gs, __late, later } from './shared.js';
import { $, PI, TEST, atan2, camera, cos, cv, floor, groundH, hypot, max, min, rnd, round, rpick, scene, sin, stage } from './01-core.js';
import { addCircle, nearestEdge, onIsland, solidAt, walkable } from './04-world.js';
import { LM, curbSpot, hood } from './05-landmarks.js';
import { CARCOL, CT, mkCar, rmCar } from './06-cars.js';
import { beacon, peds } from './07-people.js';
import { G, flash, player } from './08-input.js';
import { RBS, dressPed, useRigs } from './09-characters.js';
import { WANT, wClear, wLvl } from './10-police.js';
import { GIVERS, MS, SAVE, SAVE_KEY, mById, nextFor, ptW } from './11-missions.js';
import { giverChat } from './12-story.js';
later({PANEL:()=>PANEL,closePanel:()=>closePanel,openPanel:()=>openPanel,pickOption:()=>pickOption,setWaypoint:()=>setWaypoint}); // for earlier modules, read when called
__gs.interact=interact$fn;

/* ============================== homes, wardrobe and talking to people ============================== */
if(!Array.isArray(SAVE.homes))SAVE.homes=[];
const _saveGame0=__gs.saveGame;
// --- saving: everything about your game is kept in this browser (localStorage) and restored next time you open the page.
// It autosaves every few seconds, when you finish a mission, buy something, and whenever you leave or hide the tab.
if(!SAVE.stats)SAVE.stats={};
function snapshot(){const c=G.car,inside=__gs.IN&&__gs.IN.door,wet=(G.ride||(c&&c.boat))&&G.lastShore,sx=wet?G.lastShore.x:__gs.FX,sz=wet?G.lastShore.z:__gs.FZ;
  return{x:+sx.toFixed(1),z:+sz.toFixed(1),th:+(c?c.th:player.th).toFixed(2),time:+G.time.toFixed(2),hp:max(20,G.hp|0),
    car:c&&!c.boat&&!c.bike&&!c.T.tram?{ti:c.ti,col:'#'+c.color.getHexString(),hp:c.hp|0}:null,
    door:inside?(inside.id==='shop'?{shop:1,name:inside.name,kind:inside.kind,sub:inside.sub,at:inside.at,n:inside.n}:{id:inside.id}):null,
    wp:G.wp?{x:G.wp.x,z:G.wp.z,name:G.wp.name}:null,w:__late.ARM.w,ammo:__late.ARM.ammo.slice(),armor:G.armor|0,mission:MS?MS.def.id:null,ts:Date.now()};}
__gs.saveGame=function(){if(TEST)return;try{if(G.started)SAVE.state=snapshot();localStorage.setItem(SAVE_KEY,JSON.stringify({v:2,done:SAVE.done,cash:G.cash,homes:SAVE.homes,home:SAVE.home||null,outfit:SAVE.outfit||null,stats:SAVE.stats,guns:SAVE.guns,chips:G.chips|0,wheelAt:SAVE.wheelAt||0,seen:SAVE.seen,radio:SAVE.radio??0,biz:SAVE.biz,garage:SAVE.garage,closet:SAVE.closet,turf:SAVE.turf,storyDone:!!SAVE.storyDone,state:SAVE.state||null}));}catch(e){}};
addEventListener('pagehide',()=>__gs.saveGame());document.addEventListener('visibilitychange',()=>{if(document.hidden)__gs.saveGame();});
function restoreState(){const s=SAVE.state;if(TEST||!s)return false;
  G.time=s.time??G.time;G.hp=s.hp??100;if(Array.isArray(s.ammo))s.ammo.forEach((a,i)=>{if(i<__late.ARM.ammo.length&&a>=0)__late.ARM.ammo[i]=min(a,__late.WEAPONS[i].mag||0);});G.armor=s.armor||0;if(s.w&&__late.ARM.own[s.w]){__late.ARM.w=s.w;__late.gunMesh.geometry=__late.GUNGEO[s.w]||__late.GUNGEO[1];}
  let x=s.x,z=s.z,th=s.th||0;
  if(s.door){const d=s.door.shop?s.door:__late.DOOR[s.door.id];if(d&&d.at){x=d.at[0]+d.n[0]*1.6;z=d.at[1]+d.n[1]*1.6;th=atan2(d.n[0],d.n[1]);}}
  if(!(isFinite(x)&&isFinite(z)))return false;if(!walkable(x,z)||solidAt(x,1,z)){const q=__late.safeSpot(x,z);x=q.x;z=q.z;}
  player.x=x;player.z=z;player.th=th;__gs.camYaw=th;__gs.FX=x;__gs.FZ=z;
  if(s.car){const q=curbSpot(x,z,'park');if(q){const c=mkCar(s.car.ti,q.x,q.z,q.th,'parked',new THREE.Color(s.car.col).getHex());c.hp=s.car.hp??100;}}
  if(s.wp)G.wp=s.wp;
  if(s.mission){const m=mById(s.mission);if(m){G.note=`“${m.title}” was interrupted when you left — press J to restart it`;G.noteT=12;}}
  G.welcome='Welcome back';return true;}
// --- menu panel (keys 1-4 pick an option, E closes) ---
const panelEl=$('panel');let PANEL=null;
function openPanel(title,text,opts){PANEL={opts};G.uiOpen=true;
  panelEl.innerHTML=`<div class="pt">${title}</div><div class="pb">${text}</div>`+opts.map((o,i)=>`<div class="po${o.off?' off':''}"><b>${i+1}</b>${o.label}</div>`).join('');panelEl.style.display='block';}
function closePanel(){PANEL=null;G.uiOpen=false;panelEl.style.display='none';for(const p of peds)p.talking=false;}
function pickOption(i){if(!PANEL)return;const o=PANEL.opts[i];if(!o||o.off)return;const r=o.fn();if(r!=='keep'&&PANEL&&PANEL.opts[i]===o)closePanel();}
// --- homes for sale ---
const HOUSES=[
  {id:'kens',name:'Augusta Ave rowhouse',area:'Kensington Market',price:7500,at:ptW(-1215,-330)},
  {id:'sherb',name:'Sherbourne St Victorian',area:'Garden District',price:18000,at:ptW(1120,-560)},
  {id:'kingw',name:'King West loft',area:'King West',price:32000,at:ptW(-1180,470)},
  {id:'qq',name:'Queens Quay penthouse',area:'Harbourfront',price:65000,at:ptW(-560,1268)},
  {id:'wards',name:"Ward's Island cottage",area:"Ward's Island",price:45000,island:true,at:(()=>{ // no road out there: the first spot well inside the island near the Ward's ferry dock
    const ok=(x,z)=>[[0,0],[6,0],[-6,0],[0,6],[0,-6]].every(([a,b])=>onIsland(x+a,z+b));for(let r=0;r<200;r+=3)for(let k=0;k<12;k++){const x=1330+cos(k/12*2*PI)*r,z=2740+sin(k/12*2*PI)*r;if(ok(x,z))return[x,z];}return[1330,2740];})()}];
const signTex=(top,bot,bg)=>{const c=cv(256,160),g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,256,160);g.strokeStyle='#fff';g.lineWidth=8;g.strokeRect(6,6,244,148);
  g.fillStyle='#fff';g.textAlign='center';g.font='900 46px Inter, Arial Black, sans-serif';g.fillText(top,128,72);g.font='700 26px Inter, Arial, sans-serif';g.fillText(bot,128,118);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;};
const postMat=new THREE.MeshStandardMaterial({color:0xf2efe8,roughness:.6});
for(const h of HOUSES){
  const g=new THREE.Group();g.position.set(h.at[0],0,h.at[1]);
  const post=new THREE.Mesh(new THREE.BoxGeometry(.12,2.1,.12),postMat);post.position.y=1.05;post.castShadow=true;g.add(post);
  h.texSale=signTex('FOR SALE','$'+h.price.toLocaleString(),'#1e8a4c');h.texHome=signTex('HOME','Press E','#1b3a8a');
  h.boardMat=new THREE.MeshStandardMaterial({map:h.texSale,roughness:.5,emissive:0xffffff,emissiveMap:h.texSale,emissiveIntensity:.15});
  const board=new THREE.Group(),bf=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.78),h.boardMat),bk=bf.clone();bf.position.z=.01;bk.position.z=-.01;bk.rotation.y=PI;board.add(bf,bk);board.position.set(0,1.75,0);board.rotation.y=atan2(__gs.FX-h.at[0],__gs.FZ-h.at[1]);g.add(board);h.board=board;
  scene.add(g);h.beacon=beacon(0x3cdc78,1.1,7);h.beacon.position.set(h.at[0],0,h.at[1]);h.beacon.visible=true;addCircle(h.at[0],h.at[1],.15);
  const r=nearestEdge(h.at[0],h.at[1],60);if(r)h.board.rotation.y=atan2(r.x-h.at[0],r.z-h.at[1]); // face the street
}
function refreshHouses(){for(const h of HOUSES){const own=SAVE.homes.includes(h.id),t=own?h.texHome:h.texSale;if(h.boardMat.map!==t){h.boardMat.map=t;h.boardMat.emissiveMap=t;h.boardMat.needsUpdate=true;}h.beacon.material.color.set(own?0x4f8bff:0x3cdc78);}}
refreshHouses();
// --- businesses: buy them, upgrade them, empty their safes (the rules and numbers are in src/property.js, unit-tested)
if(!SAVE.biz||typeof SAVE.biz!=='object')SAVE.biz={};if(!SAVE.garage||typeof SAVE.garage!=='object')SAVE.garage={};
const bizTex=(top,bot,bg)=>{const c=cv(320,160),g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,320,160);g.strokeStyle='#fff';g.lineWidth=8;g.strokeRect(6,6,308,148);g.fillStyle='#fff';g.textAlign='center';
  let fs=44;g.font=`900 ${fs}px Inter, Arial Black, sans-serif`;while(g.measureText(top).width>286&&fs>18){fs-=2;g.font=`900 ${fs}px Inter, Arial Black, sans-serif`;}g.fillText(top,160,74);
  g.font='700 26px Inter, Arial, sans-serif';g.fillText(bot,160,120);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;};
const BIZ=PR.BUSINESSES.map(d=>{const at=ptW(d.at[0],d.at[1]),b={...d,at,def:d};
  const g=new THREE.Group();g.position.set(at[0],0,at[1]);const post=new THREE.Mesh(new THREE.BoxGeometry(.12,2.1,.12),postMat);post.position.y=1.05;post.castShadow=true;g.add(post);
  b.texSale=bizTex(d.name,'FOR SALE $'+(d.price/1000)+'k','#6b2fb5');b.texOwn=bizTex(d.name,'YOURS · Press E','#2a1c5c');
  b.boardMat=new THREE.MeshStandardMaterial({map:b.texSale,roughness:.5,emissive:0xffffff,emissiveMap:b.texSale,emissiveIntensity:.15});
  const board=new THREE.Group(),bf=new THREE.Mesh(new THREE.PlaneGeometry(1.5,.75),b.boardMat),bk=bf.clone();bf.position.z=.01;bk.position.z=-.01;bk.rotation.y=PI;board.add(bf,bk);board.position.y=1.75;g.add(board);
  const r=nearestEdge(at[0],at[1],60);if(r)board.rotation.y=atan2(r.x-at[0],r.z-at[1]);scene.add(g);
  b.beacon=beacon(0xa05cff,1.1,7);b.beacon.position.set(at[0],0,at[1]);b.beacon.visible=true;addCircle(at[0],at[1],.15);
  if(d.wash){const s=curbSpot(at[0],at[1],'park');b.bay=s?[s.x,s.z]:at;}
  return b;});
function refreshBiz(){for(const b of BIZ){const own=!!SAVE.biz[b.id],t=own?b.texOwn:b.texSale;if(b.boardMat.map!==t){b.boardMat.map=t;b.boardMat.emissiveMap=t;b.boardMat.needsUpdate=true;}b.beacon.material.color.set(own?0xffc23d:0xa05cff);}}
refreshBiz();
const money=v=>'$'+floor(v).toLocaleString();
function bizPanel(b){const st=SAVE.biz[b.id],where=hood(b.at[0],b.at[1]);
  if(!st){const c=PR.canBuy(SAVE.biz,b.id,G.cash);
    openPanel('For sale: '+b.name,`${b.kind} · ${where} · <b>${money(b.price)}</b><br>Takes about ${money(b.rate)} a minute while you're out playing. ${b.perk}<br>${c.ok?'You can afford it.':c.why+' — try missions and heists.'}`,[
      {label:`Buy it for ${money(b.price)}`,off:!c.ok,fn:()=>{G.cash-=b.price;SAVE.biz[b.id]={lvl:0,safe:0};SAVE.stats.biz=(SAVE.stats.biz||0)+1;__gs.saveGame();refreshBiz();flash('BUSINESS PURCHASED',3);__late.thud(.2);
        setTimeout(()=>__late.feedPost(`${b.name} in ${where} has a new owner 👀 ${b.night?'the line is already round the block':'hope they keep the prices'}`,null,null,true),4000);}},
      {label:'Not now',fn:()=>{}}]);return;}
  const cap=PR.capOf(b,st.lvl),up=PR.canUpgrade(SAVE.biz,b.id,G.cash),lv=['Starter','Upgraded','Top of the line'][st.lvl];
  openPanel(b.name,`${b.kind} · ${lv} · ${money(PR.rateOf(b,st.lvl,G.time))}/min right now<br>Safe: <b>${money(st.safe)}</b> of ${money(cap)}${st.safe>=cap?' — full, it has stopped filling':''}<br>${b.perk}`,[
    {label:`Collect ${money(st.safe)}`,off:st.safe<1,fn:()=>{const v=floor(st.safe);G.cash+=v;st.safe-=v;SAVE.stats.bizEarned=(SAVE.stats.bizEarned||0)+v;__gs.saveGame();flash('+'+money(v),1.8);__late.click();bizPanel(b);return 'keep';}},
    up.cost==null&&!up.ok?{label:'Fully upgraded',off:true,fn:()=>{}}:{label:`Upgrade for ${money(up.cost)} (+50% takings, bigger safe)`,off:!up.ok,fn:()=>{G.cash-=up.cost;st.lvl++;__gs.saveGame();flash('UPGRADED',2);__late.thud(.15);bizPanel(b);return 'keep';}},
    {label:'Leave',fn:()=>{}}]);}
function stepProperty(dt){
  const m=dt/60;for(const b of BIZ){const st=SAVE.biz[b.id];if(!st)continue;if(PR.accrue(st,b,m,G.time).filled){G.note=`💰 The safe at ${b.name} is full — drop by to collect`;G.noteT=8;}}
  // the car wash: pull into the bay
  const w=BIZ.find(b=>b.wash),c=G.car;G.washCd=(G.washCd||0)-dt;
  if(w&&SAVE.biz[w.id]&&c&&!c.boat&&!c.T.tram&&G.washCd<=0&&hypot(c.x-w.bay[0],c.z-w.bay[1])<6&&hypot(c.vx,c.vz)<4){G.washCd=8;
    if(WANT.state==='act'&&wLvl()>2)flash('TOO HOT TO WASH — LOSE SOME STARS',1.8);else{c.hp=100;c.flat=0;c.wasCop=0;c.color.set(rpick(CARCOL));if(wLvl()<=2)wClear();flash('WASHED & RESPRAYED — ON THE HOUSE',2.4);}}
  // the boat club keeps a speedboat at its slip for you
  const bc=BIZ.find(b=>b.boat);G.clubCd=(G.clubCd||0)-dt;
  if(bc&&SAVE.biz[bc.id]&&G.clubCd<=0&&typeof __late.BOATS!=='undefined'){G.clubCd=5;const B=G.clubBoat;
    const gone=!B||!__late.BOATS.includes(B)||B.hp<=0,away=B&&B!==G.car&&__late.BOATS.includes(B)&&hypot(B.x-B.home.x,B.z-B.home.z)>40;
    if((gone||away)&&hypot(__gs.FX-bc.at[0],__gs.FZ-bc.at[1])>150&&(!B||hypot(__gs.FX-B.x,__gs.FZ-B.z)>150)){if(B&&__late.BOATS.includes(B)&&B!==G.car)__late.rmBoat(B); // tow the old one home, bring a fresh one
      for(const[ox,oz]of[[0,20],[40,20],[-40,20],[0,60]]){const s=__late.dockSpot(bc.at[0]+ox,bc.at[1]+oz,0);if(s&&!__late.BOATS.some(o=>hypot(o.x-s.x,o.z-s.z)<14)){G.clubBoat=__late.mkBoat(0,s.x,s.z,s.th,0xffc23d);G.clubBoat.home=s;break;}}}}}
// --- home garages: park at your home's marker and press E; take cars out from the home menu
function nearHomeGarage(){const c=G.car;if(!c||c.boat||c.bike||c.T.tram||hypot(c.vx,c.vz)>3)return null;for(const h of HOUSES)if(SAVE.homes.includes(h.id)&&!h.island&&hypot(c.x-h.at[0],c.z-h.at[1])<9)return h;return null;}
function storeInGarage(h){const c=G.car;if(WANT.state){flash('Lose the cops first',1.6);return;}if(MS){flash('Not in the middle of a job',1.6);return;}
  const r=PR.storeCar(SAVE.garage[h.id],h.id,{ti:c.ti,col:'#'+c.color.getHexString(),hp:c.hp});if(!r.ok){flash(r.why.toUpperCase(),1.8);return;}
  SAVE.garage[h.id]=r.list;const s=curbSpot(h.at[0],h.at[1],'walk')||{x:h.at[0],z:h.at[1]};rmCar(c);G.car=null;player.hidden=false;player.x=s.x;player.z=s.z;player.y=groundH(s.x,s.z);player.vy=0;__gs.FX=s.x;__gs.FZ=s.z;
  __gs.saveGame();flash(`${c.T.name.toUpperCase()} STORED (${r.list.length}/${PR.garageSize(h.id)})`,2.2);}
function garagePanel(h){const L=SAVE.garage[h.id]||[],n=PR.garageSize(h.id);
  openPanel('Garage · '+h.name,L.length?`${L.length} of ${n} spaces used. Take one out and it'll be waiting at the curb with you in it.`:`Empty. Drive a car up to your front door and press E to keep it here (${n} space${n>1?'s':''}).`,[
    ...L.map((q,i)=>({label:`Take out the ${CT[q.ti].name} (${q.hp}% condition)`,fn:()=>{const r=PR.takeCar(SAVE.garage[h.id],i);if(!r.ok)return;const s=curbSpot(h.at[0],h.at[1],'park');if(!s){flash('NO ROOM AT THE CURB',1.6);return;}
      SAVE.garage[h.id]=r.list;const car=mkCar(r.car.ti,s.x,s.z,s.th,'parked',new THREE.Color(r.car.col).getHex());car.hp=r.car.hp;car.mode='player';G.car=car;player.hidden=true;__gs.saveGame();flash(car.T.name.toUpperCase(),1.8);}})),
    {label:'Back',fn:()=>{homeMenu(h);return 'keep';}}]);}
if(TEST){window.__biz=()=>({own:SAVE.biz,garage:SAVE.garage,biz:BIZ.map(b=>({id:b.id,at:b.at.map(v=>v|0),hood:hood(b.at[0],b.at[1])})),cash:G.cash});window.__bizPanel=id=>bizPanel(BIZ.find(b=>b.id===id));window.__bay=()=>{const w=BIZ.find(b=>b.wash);return w.bay;};window.__carHp=v=>{if(G.car&&v!=null)G.car.hp=v;const w=BIZ.find(b=>b.wash);return G.car&&{hp:G.car.hp,heat:G.heat,want:WANT.state,d:+hypot(G.car.x-w.bay[0],G.car.z-w.bay[1]).toFixed(1),v:+hypot(G.car.vx,G.car.vz).toFixed(1),cd:G.washCd};};}
// --- wardrobe ---
const TOPS=[{n:'White crop top',c:0xfbf8f3,sl:.3,crop:true,acc:0xf2a6c2},{n:'Pink tee',c:0xf4a3bf,sl:.3,crop:false,acc:0xffffff},{n:'Lavender long-sleeve',c:0xb7a6e8,sl:.97,crop:true,acc:0xffffff},
  {n:'Black tank top',c:0x1c1d21,sl:.03,crop:true,acc:0xe8303f},{n:'Cream sweater',c:0xefe4d2,sl:.97,crop:false,acc:0xc9a27a},{n:'Red tee',c:0xd8343f,sl:.3,crop:false,acc:0xffffff}];
const BOTTOMS=[{n:'Blue jeans',c:0x4d6a92,den:1,sh:0},{n:'Black jeans',c:0x25272c,den:1,sh:0},{n:'Light-wash jeans',c:0x8ea6c6,den:1,sh:0},{n:'White trousers',c:0xeeeae2,den:0,sh:0},
  {n:'Denim shorts',c:0x5b78a2,den:1,sh:1},{n:'Black skirt',c:0x1d1e22,den:0,sh:2}];
const SKINS=[{n:'Fair',c:'#f3d2b8',tone:1,tint:1.25},{n:'Light',c:'#e2b593',tone:1,tint:1.08},{n:'Medium',c:'#c69270',tone:1,tint:.9},
  {n:'Tan',c:'#a87150',tone:0,tint:1.25},{n:'Brown',c:'#7c4d31',tone:0,tint:1.02},{n:'Deep',c:'#4f301f',tone:0,tint:.8}];
const SHOES=[{n:'White',c:0xffffff},{n:'Black',c:0x1b1b1f},{n:'Red',c:0xd8293a},{n:'Navy',c:0x23315e},{n:'Tan',c:0xb98a5a},{n:'Pink',c:0xf2a6c2}];
const HAIRSTYLE={f:['Long','Buns','Buzzed'],m:['Buzzed','Side part']};
const HAIRS=[{n:'Chestnut brown',c:0x8c5834},{n:'Dark brown',c:0x3e2617},{n:'Black',c:0x141010},{n:'Honey blonde',c:0xc9a15a},{n:'Copper',c:0xa4482a},{n:'Pastel pink',c:0xf3a2c4}];
if(!SAVE.outfit)SAVE.outfit={t:0,b:0,h:0};
// --- shop pieces (src/fashion.js): added to the end of each list, locked until bought. Jackets are a layer over the top.
if(!Array.isArray(SAVE.closet))SAVE.closet=[];
const JACKETS=[];
for(const it of FA.CATALOG){const e={...it};({top:TOPS,bottom:BOTTOMS,jacket:JACKETS,shoes:SHOES,hair:HAIRS})[it.slot].push(e);}
const owned=it=>FA.owns(SAVE.closet,it);
const cycle=(list,cur,dir,opt)=>FA.nextOwned(list,cur,dir,SAVE.closet,opt);
function applyOutfit(){const o=SAVE.outfit,t=TOPS[o.t%TOPS.length],b=BOTTOMS[o.b%BOTTOMS.length],h=HAIRS[o.h%HAIRS.length];
  player.shirt.set(t.c);player.sleeve=t.sl;player.crop=t.crop;player.accent.set(t.acc);player.pants.set(b.c);player.shin=player.pants;player.denim=b.den;player.shorts=b.sh;player.hairC.set(h.c);
  player.male=!!o.male;const sk=SKINS[o.skin??0]||SKINS[0];player.tone=sk.tone;player.tint=sk.tint;player.skin.set(sk.c);player.hair=o.hs??0;player.beard=!!o.beard;
  player.shoe.set((SHOES[o.shoe??0]||SHOES[0]).c);if(o.tc)player.shirt.set(o.tc);if(o.bc)player.pants.set(o.bc);if(player.male)player.crop=false;
  const j=JACKETS[o.jk??-1];player.jacket=j?new THREE.Color(j.c):null;if(j){player.sleeve=.97;player.crop=false;}}
function redressPlayer(){applyOutfit();if(useRigs&&player.rig){scene.remove(player.rig.root);dressPed(player);player.rig.root.visible=!player.hidden;}}
applyOutfit();
function wardrobe(){const o=SAVE.outfit;openPanel('Wardrobe',`Top: <b>${TOPS[o.t%TOPS.length].n}</b><br>Jacket: <b>${JACKETS[o.jk??-1]?.n||'None'}</b><br>Bottoms: <b>${BOTTOMS[o.b%BOTTOMS.length].n}</b><br>Hair: <b>${HAIRS[o.h%HAIRS.length].n}</b>`,[
  {label:'Next top',fn:()=>{o.t=cycle(TOPS,o.t,1);o.tc=null;redressPlayer();wardrobe();return 'keep';}},
  {label:'Next jacket',fn:()=>{o.jk=cycle(JACKETS,o.jk??-1,1,true);redressPlayer();wardrobe();return 'keep';}},
  {label:'Next bottoms',fn:()=>{o.b=cycle(BOTTOMS,o.b,1);o.bc=null;redressPlayer();wardrobe();return 'keep';}},
  {label:'Next shoes',fn:()=>{o.shoe=cycle(SHOES,o.shoe??0,1);redressPlayer();wardrobe();return 'keep';}},
  {label:'Next hair colour',fn:()=>{o.h=cycle(HAIRS,o.h,1);redressPlayer();wardrobe();return 'keep';}},
  {label:'Done',fn:()=>{__gs.saveGame();homeMenu(HOUSES.find(h=>h.id===SAVE.home)||HOUSES[0]);return 'keep';}}]);}
function homeMenu(h){openPanel(h.name,`Your place in ${h.area}.`,[
  {label:'Sleep until morning (heal + save)',fn:()=>{closePanel();$('fade').style.opacity=1;G.busy=true;setTimeout(()=>{G.time=8;__gs.envTimer=99;G.hp=100;SAVE.home=h.id;__gs.saveGame();$('fade').style.opacity=0;G.busy=false;flash('GOOD MORNING',2.4);},1100);}},
  {label:'Wardrobe',fn:()=>{wardrobe();return 'keep';}},
  ...(PR.garageSize(h.id)?[{label:`Garage (${(SAVE.garage[h.id]||[]).length}/${PR.garageSize(h.id)})`,fn:()=>{garagePanel(h);return 'keep';}}]:[]),
  {label:SAVE.home===h.id?'This is your main home':'Make this my main home',off:SAVE.home===h.id,fn:()=>{SAVE.home=h.id;__gs.saveGame();flash('MAIN HOME SET',1.8);}},
  {label:'Leave',fn:()=>{}}]);}
function housePanel(h){
  if(SAVE.homes.includes(h.id)){if(G.heat>0){flash('Lose the cops first',1.6);return;}homeMenu(h);return;}
  const can=G.cash>=h.price;
  openPanel('For sale: '+h.name,`${h.area} · <b>$${h.price.toLocaleString()}</b><br>${can?'You can afford it.':`You need $${(h.price-G.cash).toLocaleString()} more — try missions and heists.`}`,[
    {label:`Buy it for $${h.price.toLocaleString()}`,off:!can,fn:()=>{G.cash-=h.price;SAVE.homes.push(h.id);SAVE.home=h.id;__gs.saveGame();refreshHouses();flash('HOME PURCHASED',3);__late.thud(.2);}},
    {label:'Not now',fn:()=>{}}]);}
// start at your main home, with a car outside (unless there's a saved spot from last time — see restoreState)
if(!TEST&&SAVE.home&&!SAVE.state){const h=HOUSES.find(q=>q.id===SAVE.home);if(h){player.x=h.at[0];player.z=h.at[1];__gs.FX=h.at[0];__gs.FZ=h.at[1];const s=curbSpot(h.at[0],h.at[1],'park');if(s&&!h.island)mkCar(SAVE.home==='qq'?4:SAVE.home==='kingw'?1:2,s.x,s.z,s.th,'parked',0x14234a);}}
// --- talking to people ---
const FIRST=['Maya','Jordan','Priya','Sam','Leo','Aisha','Daniel','Mei','Omar','Grace','Luca','Zara','Noah','Chloe','Ravi','Sofia','Tyler','Hana','Marcus','Elena'];
const CHAT=['Beautiful day in the Six, eh?','If the streetcar doesn\'t show up in five minutes, I\'m walking.','Rush hour on the Gardiner is no joke. Take King if you can.',
  'You ever been up the CN Tower? The glass floor freaks me out every time.','I\'m on my way to grab a peameal bacon sandwich at the market.','Sorry! Sorry. I\'m just in a hurry.',
  'Winter\'s coming. Time to dig out the big coat.','Did you see the lineup outside that new brunch place? Wild.','I moved here last year and I still get lost in the PATH.',
  'My cousin swears the best patties are in Kensington.','The islands are so nice in the summer. Ferry\'s worth it.','Honestly? Best city in the world. Don\'t tell Montreal.'];
const HOODTALK={'Flemingdon Park':'The Science Centre used to be the best field trip ever. I still miss it.','Don Mills':'Don Mills was one of the first planned suburbs in Canada. The Shops are nice for a walk.',
  'Banbury-Don Mills':'Edwards Gardens in the spring? Unreal. Bring a camera.','Leaside':'Leaside is all cute houses and the Bayview strip. Very calm.','Thorncliffe Park':'Best samosas in the city, right here in Thorncliffe.',
  'East York':'East York, the borough of homes! Taylor Creek is great for a bike ride.','Don Valley':'Did you know there are trails all the way down the valley? Check out the Brick Works market.',
  'The Danforth':'Greektown, baby. Souvlaki at 2 a.m. is a way of life.','Greektown':'Taste of the Danforth every summer. Best food festival in Toronto.','Pape Village':'Pape Village has the best little bakeries.',
  'North York Centre':'Mel Lastman Square gets packed in winter when the rink opens.','Willowdale':'Yonge and Sheppard has the best Korean food. Fight me.','Lansing':'It\'s all condos up here now. I remember when it was just bungalows.',
  'Yonge-Eglinton':'Yonge and Eglinton — they call it Young and Eligible.','Davisville':'Davisville is so quiet. Mount Pleasant Cemetery is weirdly nice for a walk.',
'Kensington Market':'Kensington\'s all vintage shops and amazing food. Watch out for the bikes though.','Financial District':'Everyone down here walks fast and drinks way too much coffee.',
  'Chinatown':'Best dumplings in the city are a block from here, I promise.','Harbourfront':'Love it down by the water. You can see the islands from the boardwalk.',
  'Entertainment District':'Theatres, restaurants, clubs — this place never sleeps on weekends.','St. Lawrence':'The market\'s been here forever. Get there early on Saturday.',
  'Civic Centre':'They do skating at Nathan Phillips Square in the winter. So pretty at night.','Downtown Yonge':'Yonge Street is chaos in the best way.','Railway Lands':'Game nights around here get packed. Leave the car at home.',
  'King West':'King West is all lofts and patios now. Fancy.','Garden District':'Quieter around here. Lots of old Victorian houses.'};
const DEST=[['cn','the CN Tower'],['union','Union Station'],['eaton','the Eaton Centre'],['arena','Scotiabank Arena'],['rogers','the Rogers Centre'],['market','St. Lawrence Market'],
  ['oldcityhall','Old City Hall'],['legislature',"Queen's Park"],['Sankofa Square','Sankofa Square'],['Nathan Phillips Square','Nathan Phillips Square']].filter(d=>LM[d[0]]);
const compass=(dx,dz)=>['north','northeast','east','southeast','south','southwest','west','northwest'][((round(atan2(dx,-dz)/(PI/4))%8)+8)%8];
const wpBeacon=beacon(0xb48cff,2.2,34);
function setWaypoint(x,z,name){G.wp={x,z,name};__gs.ROUTE=null;G.routeT=0;}
function npcName(p){if(!p.nm)p.nm=FIRST[floor(rnd()*FIRST.length)];return p.nm;}
function talkTo(p){
  const nm=npcName(p);p.talking=true;
  if(G.heat>=1){closePanel();p.talking=false;p.state='flee';p.timer=8;flash(nm+': "I don\'t want any trouble!"',2);return;}
  openPanel(nm,`“${rpick(CHAT)}”`,[
    {label:'Chat',fn:()=>{const h=hood(__gs.FX,__gs.FZ);openPanel(nm,`“${HOODTALK[h]||rpick(CHAT)}”`,PANEL.opts);return 'keep';}},
    {label:'Ask for directions',fn:()=>{const far=DEST.filter(d=>hypot(LM[d[0]].c[0]-__gs.FX,LM[d[0]].c[1]-__gs.FZ)>150),d=rpick(far.length?far:DEST),c=LM[d[0]].c,dist=hypot(c[0]-__gs.FX,c[1]-__gs.FZ);
      setWaypoint(c[0],c[1],d[1]);openPanel(nm,`“Have you been to ${d[1]}? It's about ${dist>1000?(dist/1000).toFixed(1)+' km':round(dist/10)*10+' m'} ${compass(c[0]-__gs.FX,c[1]-__gs.FZ)} of here. I'll put it on your map!”`,PANEL.opts);return 'keep';}},
    {label:'Give them $20',off:G.cash<20,fn:()=>{G.cash-=20;let tip='';const r=rnd();
      const h=HOUSES.find(q=>!SAVE.homes.includes(q.id)),g=Object.keys(GIVERS).find(k=>nextFor(k));
      if(r<.35&&h){tip=` By the way — there's a ${h.name.toLowerCase()} for sale in ${h.area}. Look for the green sign.`;setWaypoint(h.at[0],h.at[1],h.name);}
      else if(r<.6&&g){tip=` Oh, and ${GIVERS[g].name} is looking for help. I marked where on your map.`;setWaypoint(GIVERS[g].at[0],GIVERS[g].at[1],GIVERS[g].name);}
      openPanel(nm,`“Aw, thank you! That's so kind.${tip}”`,PANEL.opts.map((o,i)=>i===2?{label:'Give them $20',off:G.cash<20,fn:o.fn}:o));return 'keep';}},
    {label:'Bye!',fn:()=>{}}]);
}
function interact$fn(){
  if(PANEL){closePanel();return;}
  if(G.car&&!G.busy){const h=nearHomeGarage();if(h)storeInGarage(h);return;}
  if(G.ttcNear&&!G.car&&!G.tram){__late.openTTC(G.ttcNear);return;}
  if(G.car||G.busy||G.ride)return;
  if(__late.HB.near){__late.boardFerry(__late.HB.near.F,__late.HB.near.e);return;}
  for(const h of HOUSES)if(hypot(player.x-h.at[0],player.z-h.at[1])<3.6){housePanel(h);return;}
  for(const b of BIZ)if(hypot(player.x-b.at[0],player.z-b.at[1])<3.6){bizPanel(b);return;}
  if(!(__late.GANG&&__late.GANG.mode!=='idle'))for(const t of __late.TURFS)if(hypot(player.x-t.cx,player.z-t.cz)<3){__late.turfPanel(t);return;}
  let best=null,bd=3.4;for(let k=1;k<peds.length;k++){const p=peds[k];if(p.copPed||p.hidden||(p.gang&&p.gang.hostile)||p.state==='down'||p.state==='dead')continue;const d=hypot(p.x-player.x,p.z-player.z);if(d<bd){bd=d;best=p;}}
  if(best&&best.giverKey){giverChat(best.giverKey);return;}
  if(best)talkTo(best);
}
function stepLife(dt){
  for(const h of HOUSES){h.beacon.scale.x=h.beacon.scale.z=1+sin(G.sigT*3+h.price)*.06;h.beacon.visible=hypot(camera.position.x-h.at[0],camera.position.z-h.at[1])>6;}
  if(G.wp){wpBeacon.visible=true;wpBeacon.position.set(G.wp.x,0,G.wp.z);if(hypot(__gs.FX-G.wp.x,__gs.FZ-G.wp.z)<28){flash('YOU\'VE ARRIVED: '+G.wp.name.toUpperCase(),2.2);G.wp=null;}}else wpBeacon.visible=false;
  if(PANEL&&G.car)closePanel();
  if(!PANEL&&!G.car){let near='';for(const h of HOUSES)if(hypot(player.x-h.at[0],player.z-h.at[1])<4)near=SAVE.homes.includes(h.id)?'Press E to go inside':'Press E to look at this home ($'+h.price.toLocaleString()+')';
    if(!near&&!(__late.GANG&&__late.GANG.mode!=='idle'))for(const t of __late.TURFS)if(hypot(player.x-t.cx,player.z-t.cz)<3){const o=SAVE.turf[t.id];near=o==='you'?'Your crew\'s tag':o?`Press E at the ${GG.crewOf(o).name} tag to start a turf war`:'Press E to claim this turf';}
    if(!near)for(const b of BIZ)if(hypot(player.x-b.at[0],player.z-b.at[1])<4){const st=SAVE.biz[b.id];near=st?`Press E to check on ${b.name} (${money(st.safe)} in the safe)`:`Press E to look at ${b.name} (${money(b.price)})`;}
    if(!near){for(let k=1;k<peds.length;k++){const p=peds[k];if(!p.hidden&&!(p.gang&&p.gang.hostile)&&p.state!=='down'&&hypot(p.x-player.x,p.z-player.z)<3.4){near=p.giverKey?'Press E to talk to '+GIVERS[p.giverKey].name:'Press E to talk';break;}}}
    G.lifeHint=near;}else G.lifeHint='';
}
if(TEST){window.__interact=__gs.interact;window.__pick=pickOption;window.__panel=()=>PANEL&&panelEl.innerText;window.__save=SAVE;window.__houses=HOUSES;}

await stage(.86,'Furnishing interiors');
// --- clothes shops, shoe shops and barbers: E at the till (the stock and prices are in src/fashion.js)
const LIST_OF={top:TOPS,bottom:BOTTOMS,jacket:JACKETS,shoes:SHOES,hair:HAIRS},KEY_OF={top:'t',bottom:'b',jacket:'jk',shoes:'shoe',hair:'h'};
function wear(it){const o=SAVE.outfit,k=KEY_OF[it.slot];o[k]=LIST_OF[it.slot].findIndex(q=>q.id===it.id);if(k==='t')o.tc=null;if(k==='b')o.bc=null;redressPlayer();__gs.saveGame();}
function clothesPanel(kind,name){
  if(RBS){const L=SAVE.outfit.male?RBS.m:RBS.f,pr=150;openPanel(name.toUpperCase(),`Realistic graphics: people come dressed head to toe, so here you buy a whole new look. You have ${money(G.cash)}.`,[
    {label:`A whole new look — ${money(pr)}`,off:G.cash<pr,fn:()=>{G.cash-=pr;SAVE.outfit.rb=((SAVE.outfit.rb??0)+1)%L.length;redressPlayer();__gs.saveGame();flash('NEW LOOK',1.6);__late.click();}},{label:'Just looking',fn:()=>{}}]);return;}
  const slots=FA.sells(kind);if(slots.length===1){clothesSlot(kind,name,slots[0]);return;}
  openPanel(name.toUpperCase(),`What are you after? You have ${money(G.cash)}.`,[...slots.map(sl=>({label:FA.SLOT_NAME[sl],fn:()=>{clothesSlot(kind,name,sl);return 'keep';}})),{label:'Just looking',fn:()=>{}}]);}
function clothesSlot(kind,name,sl){const o=SAVE.outfit,L=FA.stock(kind,sl),multi=FA.sells(kind).length>1;
  openPanel(name.toUpperCase()+' · '+FA.SLOT_NAME[sl],`You have ${money(G.cash)}. New pieces go straight on, and into your wardrobe at home.`,[
    ...L.map(it=>{const mine=owned(it),on=LIST_OF[sl][o[KEY_OF[sl]]]?.id===it.id;
      return{label:mine?`${it.n} — ${on?'wearing it':'yours · put it on'}`:`${it.n} — ${money(it.price)}`,off:on||(!mine&&G.cash<it.price),fn:()=>{
        if(!mine){const r=FA.buy(SAVE.closet,it.id,G.cash);if(!r.ok){flash(r.why.toUpperCase(),1.4);return 'keep';}G.cash-=r.cost;SAVE.closet=r.closet;SAVE.stats.clothes=(SAVE.stats.clothes||0)+1;flash('NEW: '+it.n.toUpperCase(),1.6);__late.click();}
        wear(it);clothesSlot(kind,name,sl);return 'keep';}};}),
    {label:multi?'Back':'Done',fn:()=>{if(multi){clothesPanel(kind,name);return 'keep';}}}]);}
function barberPanel(name){const o=SAVE.outfit,male=!!o.male,styles=HAIRSTYLE[male?'m':'f'];
  if(RBS){openPanel(name.toUpperCase(),'Realistic graphics: people come with their own hair. Switch to Classic graphics in the menu for a cut or a colour.',[{label:'Maybe later',fn:()=>{}}]);return;}
  const cut=(lab,fn,pr)=>({label:`${lab} — ${money(pr)}`,off:G.cash<pr,fn:()=>{G.cash-=pr;fn();SAVE.stats.cuts=(SAVE.stats.cuts||0)+1;redressPlayer();__gs.saveGame();__late.thud(.1);flash('FRESH',1.2);barberPanel(name);return 'keep';}});
  openPanel(name.toUpperCase(),`Take a seat. Right now: ${styles[(o.hs??0)%styles.length]}, ${HAIRS[o.h%HAIRS.length].n.toLowerCase()}. You have ${money(G.cash)}.`,[
    ...styles.map((st,i)=>i===(o.hs??0)%styles.length?null:cut(`Cut: ${st}`,()=>{o.hs=i;},FA.CUT_PRICE)).filter(Boolean),
    ...(male?[cut(o.beard?'Shave the beard':'Grow out a beard',()=>{o.beard=!o.beard;},FA.BEARD_PRICE)]:[]),
    {label:'Colour…',fn:()=>{barberColours(name);return 'keep';}},{label:'Done',fn:()=>{}}]);}
function barberColours(name){const o=SAVE.outfit;
  openPanel(name.toUpperCase()+' · COLOUR',`New colours are yours to keep: switch back any time from the wardrobe at home. You have ${money(G.cash)}.`,[
    ...FA.stock('barber','hair').map(it=>{const mine=owned(it),on=HAIRS[o.h]?.id===it.id;return{label:mine?`${it.n} — ${on?'that\'s you':'yours · dye it again (free)'}`:`${it.n} — ${money(it.price)}`,off:on||(!mine&&G.cash<it.price),fn:()=>{
      if(!mine){const r=FA.buy(SAVE.closet,it.id,G.cash);if(!r.ok)return 'keep';G.cash-=r.cost;SAVE.closet=r.closet;SAVE.stats.cuts=(SAVE.stats.cuts||0)+1;flash(it.n.toUpperCase(),1.4);__late.click();}
      wear(it);barberColours(name);return 'keep';}};}),
    {label:'Back',fn:()=>{barberPanel(name);return 'keep';}}]);}

export { BIZ, BOTTOMS, HAIRS, HAIRSTYLE, HOUSES, JACKETS, cycle, owned, clothesPanel, barberPanel, PANEL, SHOES, SKINS, TOPS, applyOutfit, closePanel, money, nearHomeGarage, openPanel, redressPlayer, restoreState, stepLife, stepProperty };
