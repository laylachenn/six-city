// Six City — phone. One of the game's modules; they load in numbered order (src/game/index.js).
import './24-weapons.js';
import * as PR from '../property.js';
import * as GG from '../gangs.js';
import { __gs, later } from './shared.js';
import { $, TEST, canvas, cos, cv, floor, hypot, min, renderer, rnd, round, rpick, sin } from './01-core.js';
import { curbSpot, hood, placeName } from './05-landmarks.js';
import { CT, cars, mkCar } from './06-cars.js';
import { G, flash } from './08-input.js';
import { wClear, wLvl } from './10-police.js';
import { GIVERS, MISSIONS, SAVE, nextFor } from './11-missions.js';
import { CUT } from './12-story.js';
import { BIZ, HOUSES, PANEL, money } from './13-homes.js';
import { SPOTB } from './14-interiors.js';
import { BM, computeRoute, openMap, setWaypointAt } from './16-map.js';
import { ARM, WEAPONS, click } from './24-weapons.js';
later({PH:()=>PH,closePhone:()=>closePhone,endPhoto:()=>endPhoto,feedEvt:()=>feedEvt,feedPost:()=>feedPost,openPhone:()=>openPhone}); // for earlier modules, read when called

/* ============================== the phone (K) ==============================
   Contacts (call people, get directions, a mechanic who drops off a car, Dez can make a wanted level go away), the map,
   a camera with a photo mode and a gallery, Lookout (the city's social feed: it notices what you get up to) and stats.
   The mouse is freed while it's open; driving keys still work, so you can text and drive (please don't). */
const phEl=$('phone'),phS=$('phS'),phT=$('phT'),phC=$('phC'),phN=$('phn'),vfEl=$('vf');
const PH={open:false,app:'home',call:null,view:-1,photos:[],feed:[],unread:0,lastPost:0,evT:{},lvl:0,likeT:0};
try{PH.photos=JSON.parse(localStorage.getItem('sixcity-photos')||'[]');}catch(_){}
try{PH.feed=JSON.parse(localStorage.getItem('sixcity-feed')||'[]');}catch(_){}
const phSave=()=>{if(TEST)return;try{localStorage.setItem('sixcity-feed',JSON.stringify(PH.feed.slice(0,30)));}catch(_){}try{localStorage.setItem('sixcity-photos',JSON.stringify(PH.photos));}catch(_){flash('PHONE STORAGE FULL — DELETE SOME PHOTOS',2);}};
const phEsc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clockStr=()=>{const h=floor(G.time),m=floor((G.time-h)*60);return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');};
const APPS=[['contacts','👥','Contacts'],['map','🗺️','Map'],['camera','📷','Camera'],['photos','🖼️','Photos'],['lookout','📣','Lookout'],['property','🏢','Property'],['stats','📊','Stats']];
function openPhone(){if(PH.open||G.busy||CUT||G.gameOpen||PANEL||BM.open||G.boardOpen||G.photo||!G.running)return;PH.open=true;G.phoneOpen=true;G.uiOpen=true;PH.app='home';PH.call=null;
  phEl.classList.add('on');if(document.pointerLockElement)document.exitPointerLock();phRender();click();}
function closePhone(lock=true){if(!PH.open)return;PH.open=false;G.phoneOpen=false;G.uiOpen=!!PANEL;phEl.classList.remove('on');if(lock&&!TEST)canvas.requestPointerLock?.();}
function nearestSpot(name){let b=null,bd=1e9;for(const s of SPOTB)if(s.name===name){const d=hypot(s.at[0]-__gs.FX,s.at[1]-__gs.FZ);if(d<bd){bd=d;b=s;}}return b;}
function phRoute(at,name){setWaypointAt(at[0],at[1],name);computeRoute();flash('GPS: '+name.toUpperCase(),1.8);}
// --- contacts: what they say depends on where you are in the story
const LINES={R:['Come by the market, I have something for you.','You busy? Kensington. Now-ish.'],D:['I have a client with a problem. Come see me at the market.','Cheese is aging. So is my patience. Come by.'],
  H:['I have work. The Harbourfront. Come alone.','The next piece is ready. Harbourfront.']};
const IDLE={R:['Babe, the market is slammed, call you later!','Nothing right now. Go eat something.'],D:['Nothing for you today. Buy some brie.','Things are quiet. Quiet is good.'],H:["Nothing yet. Stay out of trouble.",'I am thinking. Do not call me while I am thinking.']};
function contacts(){const L=[];
  for(const k in GIVERS){const g=GIVERS[k],m=nextFor(k);L.push({id:k,name:g.name,col:g.css,sub:m?'Has a job for you':'—'});}
  L.push({id:'mo',name:"Mo's Garage",col:'#35d16a',sub:'Drops a car at the kerb · $250'});
  for(const n of['The Lucky Six','Bullet Barn','Waffle Hut','Six Gas'])if(nearestSpot(n))L.push({id:'spot:'+n,name:n,col:SPOTB.find(s=>s.name===n).col,sub:'Directions'});
  return L;}
function phCall(id){const c={id,lines:[],acts:[]};
  if(GIVERS[id]){const g=GIVERS[id],m=nextFor(id);c.name=g.name;c.col=g.css;c.lines.push(rpick(m?LINES[id]:IDLE[id]));
    if(m){c.lines.push(`(“${m.title}”)`);c.acts.push(['dir','Get directions']);}
    const lv=wLvl();if(id==='D'&&lv>0&&lv<=3){const cost=750*lv;c.lines.push(`Cops on you? I know a sergeant. ${'$'+cost.toLocaleString()}, and they forget your face.`);c.acts.push(['bribe',`Pay Dez $${cost.toLocaleString()} to clear it`,G.cash<cost]);}
    if(id==='D'&&lv>3)c.lines.push("That's too hot even for my sergeant. Lose them yourself.");}
  else if(id==='mo'){c.name="Mo's Garage";c.col='#35d16a';c.lines.push(__gs.IN&&!__gs.IN.real?"You're inside somewhere. Call me from the street.":G.car?"You've got wheels already, chief.":'Need a ride? I can have one at the kerb in a minute. $250.');
    if(!(__gs.IN&&!__gs.IN.real)&&!G.car)c.acts.push(['mo','Send a car — $250',G.cash<250]);}
  else if(id.startsWith('spot:')){const n=id.slice(5),s=nearestSpot(n);c.name=n;c.col=s.col;c.lines.push({'The Lucky Six':'The Lucky Six, where every night is lucky. How can I help?','Bullet Barn':'Bullet Barn. We are open. We are always open.','Waffle Hut':'Waffle Hut, open 24 hours, how can I help ya?','Six Gas':'Six Gas, pump 4 is broken, what do you need?'}[n]);c.acts.push(['dir','Get directions']);}
  PH.call=c;PH.app='call';phRender();}
function phCallAct(a){const c=PH.call;if(!c)return;
  if(a==='dir'){if(GIVERS[c.id])phRoute(GIVERS[c.id].at,GIVERS[c.id].name);else{const s=nearestSpot(c.name);if(s)phRoute(s.at,c.name);}closePhone();return;}
  if(a==='bribe'){const cost=750*wLvl();if(G.cash<cost||wLvl()<1||wLvl()>3)return;G.cash-=cost;wClear();flash('DEZ MADE A CALL — YOU\'RE CLEAN',2.2);closePhone();return;}
  if(a==='mo'){if(G.cash<250||G.car)return;let s=null;for(const d of[8,14,22,30]){const q=curbSpot(__gs.FX+sin(__gs.camYaw)*d,__gs.FZ+cos(__gs.camYaw)*d,'park');if(q&&!cars.some(o=>hypot(o.x-q.x,o.z-q.z)<5)){s=q;break;}}
    if(!s){flash('MO CAN\'T FIND A SPOT HERE',1.6);return;}G.cash-=250;const c2=mkCar(rpick([0,0,1,2]),s.x,s.z,s.th,'parked');c2.spawned=false;flash('MO DROPPED A CAR AT THE KERB',2);closePhone();return;}}
// --- Lookout: the city's feed
const HANDLES=['@raccoonwatch','@ttc_delays_again','@sixsidegirl','@kensingtonkid','@queenwestvibes','@condo_dweller','@leafsfan4life','@bikelanebob','@scarbsfinest','@parkdalepoet','@6ixfoodie','@sixcitynews'];
const CANNED=['{hood} looks unreal at {time} ngl','who keeps parking on the streetcar tracks on King','gas is 159.9 again 😭','Waffle Hut at 3am is a spiritual experience','a raccoon just stole my entire pizza in {hood}','TTC delays again. walking it is.',
  'the Gardiner is a parking lot rn','CN Tower lit up tonight 😍','just saw someone parallel park perfectly in {hood}. respect.','$14 for a latte in {hood}???','bike lane on Bloor is full of delivery cars again','free rent in my mind: that one guy who honks at green lights',
  'Kensington on a sunny day >>>','is it just me or are the cops extra busy today','my building has been "under construction" for 3 years','heard someone hit big on the Lucky Wheel 👀','new condo going up in {hood}. shocking.','Leafs lost. city in mourning.'];
const EVT={wanted:['cops chasing someone through {hood} rn 😳🚓','helicopter circling {hood}, what is going on','the sirens in {hood} will not stop'],boom:['uhh was that an EXPLOSION near {place}??','car just blew up in {hood}. i am shaking','{place} is on fire???'],
  alarm:['someone just held up {what} 😭','robbery at {what}. stay safe {hood}','police tape outside {what}'],mission:['police investigating an "incident" in {hood}','something weird is going on in {hood} today','{hood} group chat is going off'],
  chop:["new 'mechanic' on the block, no questions asked 👀"],casino:['someone at the Lucky Six is on a HEATER 🔥','the Lucky Six is buzzing tonight 🎰']};
function feedFill(t,o={}){return t.replace('{hood}',hood(__gs.FX,__gs.FZ)).replace('{place}',placeName(__gs.FX,__gs.FZ)).replace('{time}',clockStr()).replace('{what}',o.what||'a store downtown');}
function feedPost(text,who,img,notify){const p={who:who||rpick(HANDLES),text,img:img||null,t:clockStr(),likes:who==='@you'?0:floor(rnd()*400),mine:who==='@you'};PH.feed.unshift(p);PH.feed.length=min(PH.feed.length,30);
  if(!PH.open||PH.app!=='lookout')PH.unread++;if(notify&&!PH.open){phN.innerHTML=`<b>📣 ${phEsc(p.who)}</b> ${phEsc(p.text)}`;phN.classList.add('on');clearTimeout(phN.t);phN.t=setTimeout(()=>phN.classList.remove('on'),4500);}
  phSave();if(PH.open)phRender();}
function feedEvt(kind,o){const now=performance.now();if(TEST||(PH.evT[kind]||0)>now)return;PH.evT[kind]=now+25000;
  if(kind==='mission'&&o&&o.title&&rnd()<.5){feedPost(`breaking: police respond to “${o.title}” fallout in ${hood(__gs.FX,__gs.FZ)}`,'@sixcitynews',null,true);return;}
  setTimeout(()=>feedPost(feedFill(rpick(EVT[kind]),o),null,null,true),2500+rnd()*4000);}
// --- camera: photo mode hides the HUD; Space or click takes the shot
function startPhoto(){closePhone(true);G.photo=true;document.body.classList.add('photo');vfEl.style.display='block';flash('',0.01);}
function endPhoto(){G.photo=false;document.body.classList.remove('photo');vfEl.style.display='none';}
function takePhoto(){const src=renderer.domElement,w=640,h=round(w*src.height/src.width),c=cv(w,h);c.getContext('2d').drawImage(src,0,0,w,h);
  const url=c.toDataURL('image/jpeg',.8);PH.photos.unshift({url,t:clockStr(),where:placeName(__gs.FX,__gs.FZ)});if(PH.photos.length>8)PH.photos.length=8;phSave();click();
  vfEl.classList.add('shot');setTimeout(()=>vfEl.classList.remove('shot'),160);SAVE.stats.photos=(SAVE.stats.photos||0)+1;}
// --- screens
function phRender(){if(!PH.open)return;phT.textContent=clockStr();phC.textContent='$'+G.cash.toLocaleString();let h='';const A=PH.app;
  if(A==='home'){h='<div class="ph-home">'+APPS.map(([k,i,l])=>`<button data-app="${k}"><span>${i}${k==='lookout'&&PH.unread?`<i>${min(PH.unread,9)}</i>`:''}</span>${l}</button>`).join('')+'</div>';}
  else if(A==='contacts'){h='<div class="ph-h">Contacts</div>'+contacts().map(c=>`<button class="ph-row" data-call="${phEsc(c.id)}"><b style="background:${c.col}">${phEsc(c.name[0])}</b><span>${phEsc(c.name)}<small>${phEsc(c.sub)}</small></span></button>`).join('');}
  else if(A==='call'){const c=PH.call;h=`<div class="ph-call"><b style="background:${c.col}">${phEsc(c.name[0])}</b><h4>${phEsc(c.name)}</h4>${c.lines.map(l=>`<p>${phEsc(l)}</p>`).join('')}${c.acts.map(([a,l,off])=>`<button data-act="${a}"${off?' disabled':''}>${phEsc(l)}</button>`).join('')}<button data-app="contacts" class="end">End call</button></div>`;}
  else if(A==='lookout'){PH.unread=0;h='<div class="ph-h">Lookout</div>'+(PH.feed.length?PH.feed.map(p=>`<div class="ph-post${p.mine?' mine':''}"><b>${phEsc(p.who)}</b><small>${p.t}</small><p>${phEsc(p.text)}</p>${p.img?`<img src="${p.img}">`:''}<em>♥ ${p.likes.toLocaleString()}</em></div>`).join(''):'<p class="ph-empty">Nothing yet. The city is quiet. For now.</p>');}
  else if(A==='photos'){if(PH.view>=0&&PH.photos[PH.view]){const p=PH.photos[PH.view];h=`<div class="ph-h">Photo</div><img class="ph-big" src="${p.url}"><p class="ph-cap">${phEsc(p.where)} · ${p.t}</p><div class="ph-acts"><button data-act="post">Post to Lookout</button><button data-act="dl">Save to computer</button><button data-act="del">Delete</button><button data-act="back">Back</button></div>`;}
    else h='<div class="ph-h">Photos</div>'+(PH.photos.length?'<div class="ph-grid">'+PH.photos.map((p,i)=>`<button data-photo="${i}"><img src="${p.url}"></button>`).join('')+'</div>':'<p class="ph-empty">No photos yet. Open the camera and press Space.</p>');}
  else if(A==='property'){const S=PR.summary(SAVE.biz,G.time);
    h='<div class="ph-h">Property</div>'+`<div class="ph-stat"><span>Earning</span><b>${money(S.perMin)}/min</b></div><div class="ph-stat"><span>Waiting in safes</span><b>${money(S.safe)}</b></div>`
      +BIZ.map(b=>{const st=SAVE.biz[b.id];return `<button class="ph-row" data-bwp="${b.id}"><b style="background:${st?'#c99a1e':'#6b2fb5'}">${st?'★':'$'}</b><span>${phEsc(b.name)}<small>${st?`${money(st.safe)} of ${money(PR.capOf(b,st.lvl))} · ${['starter','upgraded','top of the line'][st.lvl]}`:`${phEsc(b.kind)} · for sale ${money(b.price)}`}</small></span></button>`;}).join('')
      +HOUSES.filter(q=>SAVE.homes.includes(q.id)).map(q=>{const L=SAVE.garage[q.id]||[],n=PR.garageSize(q.id);return `<div class="ph-stat"><span>🏠 ${phEsc(q.name)}</span><b>${n?L.map(c=>CT[c.ti].name).join(', ')||'empty garage':'no garage'}</b></div>`;}).join('')
      +'<div class="ph-h" style="margin-top:12px">Turf</div>'+GG.standings(SAVE.turf).rows.map(r=>`<div class="ph-stat"><span><i style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${r.col};margin-right:7px"></i>${phEsc(r.name)}</span><b>${r.n}</b></div>`).join('')
      +`<div class="ph-stat"><span>Street tax</span><b>${money(GG.taxPerMin(SAVE.turf))}/min</b></div>`
      +'<div class="ph-empty" style="margin-top:8px">Tap a business to set a waypoint.</div>';}
  else if(A==='stats'){const s=SAVE.stats||{},rows=[['Cash','$'+G.cash.toLocaleString()],['Chips','◆'+(G.chips||0).toLocaleString()],['Missions done',SAVE.done.length+' / '+MISSIONS.length],['Weapons owned',ARM.own.filter(Boolean).length+' / '+WEAPONS.length],
      ['Stores robbed',s.robbed||0],['Cars chopped',s.chopped||0],['Meals eaten',s.meals||0],['Blackjack hands',s.bjHands||0],['Photos taken',s.photos||0],['Homes owned',(SAVE.homes||[]).length],['Businesses owned',Object.keys(SAVE.biz||{}).length],['Business takings','$'+(s.bizEarned||0).toLocaleString()],['City bike rides',s.rides||0],['Turf held',GG.countOf(SAVE.turf,'you')],['Turf wars won',s.turfWon||0]];
    h='<div class="ph-h">Stats</div>'+rows.map(([a,b])=>`<div class="ph-stat"><span>${a}</span><b>${b}</b></div>`).join('');}
  phS.innerHTML=h;}
phEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset;
  if(d.ph==='home'){PH.app='home';PH.view=-1;phRender();return;}
  if(d.ph==='back'){PH.app=PH.app==='call'?'contacts':PH.app==='photos'&&PH.view>=0?'photos':'home';PH.view=-1;phRender();return;}
  if(d.app){if(d.app==='map'){closePhone(false);openMap();return;}if(d.app==='camera'){startPhoto();return;}PH.app=d.app;PH.view=-1;phRender();return;}
  if(d.call){phCall(d.call);return;}
  if(d.bwp){const b=BIZ.find(q=>q.id===d.bwp);if(b){setWaypointAt(b.at[0],b.at[1],b.name);closePhone(false);flash('WAYPOINT SET',1.4);}return;}
  if(d.photo){PH.view=+d.photo;phRender();return;}
  if(d.act){if(PH.app==='call'){phCallAct(d.act);return;}const p=PH.photos[PH.view];if(!p)return;
    if(d.act==='post'){feedPost(`${p.where} 📸`,'@you',p.url);PH.app='lookout';PH.view=-1;}
    else if(d.act==='dl'){const a=document.createElement('a');a.href=p.url;a.download='six-city-'+Date.now()+'.jpg';a.click();}
    else if(d.act==='del'){PH.photos.splice(PH.view,1);PH.view=-1;phSave();}
    else if(d.act==='back')PH.view=-1;
    phRender();}});
function stepPhone(dt){
  if(PH.open&&G.frame%15===0){phT.textContent=clockStr();phC.textContent='$'+G.cash.toLocaleString();}
  const lv=wLvl();if(lv>=3&&PH.lvl<3)feedEvt('wanted');PH.lvl=lv;
  PH.likeT-=dt;if(PH.likeT<=0){PH.likeT=4;let ch=false;for(const p of PH.feed)if(p.mine&&p.likes<2000&&rnd()<.5){p.likes+=1+floor(rnd()*12);ch=true;}if(ch&&PH.open&&PH.app==='lookout')phRender();}
  if(!G.menuCam&&!CUT&&performance.now()-PH.lastPost>70000+rnd()*60000){PH.lastPost=performance.now();if(!TEST)feedPost(feedFill(rpick(CANNED)));}}
if(!PH.feed.length&&!TEST)for(let i=0;i<4;i++)PH.feed.push({who:rpick(HANDLES),text:rpick(CANNED).replace('{hood}','Kensington').replace('{time}','sunset'),img:null,t:'earlier',likes:floor(rnd()*300)});
PH.lastPost=performance.now();

export { stepPhone, takePhoto };
