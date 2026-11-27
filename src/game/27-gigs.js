// Six City — gigs. One of the game's modules; they load in numbered order (src/game/index.js).
import './26-phone.js';
import * as GG from '../gigs.js';
import { __gs, __late, later } from './shared.js';
import { $, PLAY, TEST, hypot, max, rnd, rpick } from './01-core.js';
import { curbSpot } from './05-landmarks.js';
import { beacon, calmPed, peds } from './07-people.js';
import { G, flash, player, toggleCar } from './08-input.js';
import { wLvl } from './10-police.js';
import { MS, SAVE } from './11-missions.js';
import { releasePed } from './12-story.js';
import { AB, abLoad, computeRoute, setWaypointAt } from './16-map.js';
import { thud } from './17-audio.js';
later({GIG:()=>GIG,gigSet:()=>gigSet}); // for earlier modules, read when called

/* ============================== gigs: rideshare and food delivery ==============================
   Go online in the Gigs app on the phone (K). Rideshare takes ride requests while you're in a car: pick the rider up at
   a real address, drive them to another one. Food delivery takes orders while you're on a bike or motorcycle: pick up at
   a real restaurant from the address book, drop off at a real address. Pay, time limits, stars and tips are in src/gigs.js. */
if(!SAVE.gigs)SAVE.gigs=GG.newProfile();
const GIG={mode:null,trip:null,wait:4,pause:0,say:null,sayT:0,last:null};
const gigBeacon=beacon(0x35d16a,2.2,36);gigBeacon.visible=false;
let ADDRS=null,FOODS=null;
function places(){if(ADDRS||!AB.data)return!!ADDRS;
  ADDRS=[];for(const s of AB.streets){const nm=GG.shortAddr(s.name);for(const a of s.list)ADDRS.push({x:a.x,z:a.z,label:`${a.n} ${nm}`});}
  FOODS=AB.shops.filter(s=>GG.isFood(s.n)).map(s=>({x:s.x,z:s.z,label:s.n,ad:GG.shortAddr(s.ad)}));return true;}
const inPlay=p=>p.x>PLAY.x0+60&&p.x<PLAY.x1-60&&p.z>PLAY.z0+60&&p.z<PLAY.z1-60;
// a kerb spot at the place, for the marker and for the person waiting there
function atKerb(p){if(!inPlay(p))return null;const s=curbSpot(p.x,p.z,'walk');if(!s||hypot(s.x-p.x,s.z-p.z)>45)return null;return Object.assign({},p,{x:s.x,z:s.z,th:s.th});}
function pickPlace(list,x,z,lo,hi){let k=null;GG.pickWithin(list,x,z,lo,hi,rnd,p=>!!(k=atKerb(p)));return k;}
const vehOk=mode=>{const c=G.car;if(!c||c.hp<=0)return false;return mode==='food'?!!c.bike:!c.bike&&!c.boat&&!c.T.tram&&!c.copCar;};
const speed=()=>G.car?hypot(G.car.vx,G.car.vz):0;
const say=(who,line)=>{GIG.say=who?`💬 ${who}: “${line}”`:line;GIG.sayT=4.5;};
function navTo(p,name){setWaypointAt(p.x,p.z,name);G.wp.gig=1;computeRoute();}
function clearNav(){if(G.wp&&G.wp.gig){G.wp=null;__gs.ROUTE=null;}}
// someone from the crowd waits at the kerb (the rider, or the customer at the door)
function waitPed(p){const q=peds.filter(calmPed).sort((a,b)=>hypot(a.x-p.x,a.z-p.z)-hypot(b.x-p.x,b.z-p.z))[0];if(!q)return null;
  q.actor={x:p.x,z:p.z,th:p.th||0,look:player};q.x=p.x;q.z=p.z;q.vx=q.vz=0;q.amp=0;q.gig=1;return q;}
function letGo(q,at){if(!q)return;if(at&&q.hidden){q.x=at.x;q.z=at.z;q.actor.x=at.x;q.actor.z=at.z;}q.hidden=false;q.gig=0;releasePed(q);}

// --- going online and offline (from the phone)
function gigSet(mode){
  if(mode&&MS){flash("FINISH YOUR JOB FIRST",1.6);return;}
  if(GIG.trip)endTrip(null,'You went offline',GIG.trip.stage!=='pickup');
  GIG.mode=mode||null;GIG.wait=3+rnd()*3;G.job=null;
  if(mode){abLoad().then(places).catch(()=>{});flash(`ONLINE · ${GG.KINDS[mode].name.toUpperCase()}`,2);}else{flash('OFFLINE',1.4);$('job').textContent='';}
  gigBeacon.visible=false;}
// --- a new request
function offer(){const mode=GIG.mode,K=GG.KINDS[mode],me={x:__gs.FX,z:__gs.FZ};let pk,dp;
  if(mode==='ride'){pk=pickPlace(ADDRS,me.x,me.z,70,260);if(pk)dp=pickPlace(ADDRS,pk.x,pk.z,K.lo,K.hi);}
  else{pk=pickPlace(FOODS,me.x,me.z,50,380);if(pk)dp=pickPlace(ADDRS,pk.x,pk.z,K.lo,K.hi);}
  if(!pk||!dp){GIG.wait=4;GIG.fails=(GIG.fails||0)+1;return;}
  const r=rnd(),mood=mode==='food'?(r<.3?'rush':'calm'):(r<.2?'rush':r<.38?'nervous':'calm'),dist=hypot(dp.x-pk.x,dp.z-pk.z);
  const T={mode,pk,dp,mood,dist,name:rpick(GG.RIDERS),base:GG.fare(mode,dist,mood),limit:GG.timeLimit(mode,dist,mood,!!(G.car&&G.car.T.pedal)),
    stage:'pickup',t:0,wait:0,away:0,bumps:0,dmg:0,heat:0,hold:0,chat:0,lastHp:null,ped:null};
  GIG.trip=T;navTo(pk,mode==='ride'?T.name:pk.label);thud(.15);
  if(mode==='ride'){T.ped=waitPed(pk);flash('RIDE REQUEST',1.8);say('',`🚗 ${T.name}${GG.MOODS[mood].label?' ('+GG.MOODS[mood].label+')':''} · ${pk.label} → ${dp.label} · $${T.base}`);}
  else{flash('NEW ORDER',1.8);say('',`🛵 ${pk.label} → ${dp.label} · $${T.base}${mood==='rush'?' · hungry customer':''}`);}}
// --- finishing: s = stars, or null for a cancelled trip
function endTrip(s,why,penalty=true){const T=GIG.trip;if(!T)return;GIG.trip=null;clearNav();gigBeacon.visible=false;GIG.wait=5+rnd()*5;
  if(s==null){if(penalty)GG.cancel(SAVE.gigs);letGo(T.ped,G.car?curbSpot(G.car.x,G.car.z,'walk'):null);if(why){flash(why.toUpperCase(),2.4);}
    GIG.last={why};}
  else{const R=GG.finish(SAVE.gigs,T.mode,T.base,s,T.mood);G.cash+=R.total;
    flash(`${'★'.repeat(s)}${'☆'.repeat(5-s)}  +$${R.total.toLocaleString()}`,3);
    say('',`${T.mode==='ride'?T.name+' paid':'Delivered'}: $${R.base}${R.tip?` + $${R.tip} tip`:''}${R.bonus?` + $${R.bonus} streak bonus (${SAVE.gigs.streak} in a row)`:''}`);
    GIG.last=R;thud(.25);__gs.saveGame();}
  if(SAVE.gigs.trips>=5&&GG.rating(SAVE.gigs)<GG.LOW_RATING&&GIG.mode){GIG.pause=60;say('',`⚠️ Your rating is ${GG.rating(SAVE.gigs).toFixed(2)}. The app paused offers for a minute.`);}
  if(__late.PH.open&&__late.PH.app==='gigs')__late.phRender();}
function stars(T){return GG.stars({late:max(0,T.t-T.limit),damage:T.dmg,heat:T.heat,bumps:T.bumps},T.mood);}
const fmtT=s=>{s=max(0,s|0);return `${s/60|0}:${String(s%60).padStart(2,'0')}`;};

// --- every frame
function stepGigs(dt){
  if(GIG.sayT>0)GIG.sayT-=dt;
  if(!GIG.mode)return;
  if(MS){if(GIG.trip)endTrip(null,'Gig cancelled: you started a job',false);GIG.mode=null;return;}
  const T=GIG.trip,K=GG.KINDS[GIG.mode];let txt;
  if(__gs.IN&&!__gs.IN.real){gigBeacon.visible=false;$('job').textContent=`${K.icon} ${T?'Your '+(T.mode==='ride'?'rider is':'order is')+' waiting outside':'Gigs paused while you\'re inside'}`;return;}
  if(!T){gigBeacon.visible=false;
    if(!places())txt=`${K.icon} ${K.name}: loading the city…`;
    else if(!vehOk(GIG.mode))txt=`${K.icon} ${K.name}: ${GIG.mode==='ride'?'get in a car to take ride requests':'get on a bike or motorcycle to take orders (share bikes wait at the docks)'}`;
    else if(wLvl()>0)txt=`${K.icon} ${K.name}: lose the cops to get requests`;
    else if(GIG.pause>0){GIG.pause-=dt;txt=`${K.icon} ${K.name}: offers paused for ${GIG.pause|0}s`;}
    else{GIG.wait-=dt;txt=`${K.icon} ${K.name}: waiting for a ${GIG.mode==='ride'?'ride request':'order'}… · ★ ${GG.rating(SAVE.gigs).toFixed(2)}`;if(GIG.wait<=0)offer();}
    if(GIG.sayT>0)txt=GIG.say;if($('job').textContent!==txt)$('job').textContent=txt;return;}
  // the vehicle: bumps and damage count while you have the rider (or the food) with you
  const v=G.car,hp=v?v.hp:null,carrying=T.stage==='drop'||T.stage==='hand';
  if(carrying&&v&&T.lastHp!=null&&T.lastVeh===v&&hp<T.lastHp){const d=(T.lastHp-hp)*100/(v.bike&&v.T.pedal?60:100);T.dmg+=d;if(d>=2){T.bumps++;if(T.mode==='ride'&&GIG.sayT<2)say(T.name,rpick(GG.CHAT.bump));else if(T.mode==='food'&&GIG.sayT<2)say('','🥡 The food took a hit');}}
  const lv=T.lastVeh;if(carrying&&T.mode==='food'&&lv&&lv.bike&&lv.fallen&&v!==lv&&T.fell!==lv){T.fell=lv;T.bumps+=3;say('','🥡 You came off the bike and the order went flying. It\'s a mess now');}
  T.lastHp=hp;T.lastVeh=v;
  if(carrying)T.heat=max(T.heat,wLvl());
  const tgt=T.stage==='pickup'||T.stage==='board'?T.pk:T.dp,d=hypot(__gs.FX-tgt.x,__gs.FZ-tgt.z);
  gigBeacon.visible=d<40||!(G.wp&&G.wp.gig);gigBeacon.position.set(tgt.x,0,tgt.z);gigBeacon.material.color.set(T.stage==='pickup'||T.stage==='board'?0x35d16a:0x3fd9ff);
  if(T.ped&&T.stage==='drop'&&v){T.ped.x=T.ped.actor.x=v.x;T.ped.z=T.ped.actor.z=v.z;}
  if(T.stage==='pickup'){T.wait+=dt;
    if(T.wait>150){endTrip(null,T.mode==='ride'?`${T.name} cancelled the ride`:'The restaurant gave the order to someone else');return;}
    const ok=T.mode==='ride'?vehOk('ride'):true;
    txt=T.mode==='ride'?`🚗 Pick up ${T.name} at ${T.pk.label} — ${d|0} m`+(ok?'':' (you need a car)'):`🛵 Pick up the order at ${T.pk.label} — ${d|0} m`;
    if(ok&&d<(T.mode==='ride'?9:7)&&speed()<2.5){T.stage='board';T.hold=T.mode==='ride'?1.6:2.2;if(T.ped){T.ped.actor.x=v?v.x:T.ped.x;T.ped.actor.z=v?v.z:T.ped.z;}}}
  else if(T.stage==='board'){T.hold-=dt;
    txt=T.mode==='ride'?`🚗 ${T.name} is getting in…`:`🛵 Picking up the order…`;
    if(d>14){T.stage='pickup';}
    else if(T.hold<=0){T.stage='drop';T.t=0;T.veh=G.car;T.lastHp=G.car?G.car.hp:null;T.lastVeh=G.car;if(T.ped)T.ped.hidden=true;navTo(T.dp,T.dp.label);
      if(T.mode==='ride')say(T.name,rpick(GG.CHAT[T.mood]));else say('',`🥡 Got it. ${fmtT(T.limit)} to get it there hot.`);}}
  else if(T.stage==='drop'){T.t+=dt;const left=T.limit-T.t;
    if(T.mode==='ride'){
      if(wLvl()>=2){say(T.name,rpick(GG.CHAT.cops));endTrip(null,`${T.name} jumped out`);return;}
      if(G.car!==T.veh){T.away+=dt;if(T.away>25){endTrip(null,`${T.name} gave up on you`);return;}txt=`🚗 Get back in the car — ${T.name} is waiting (${25-T.away|0}s)`;}
      else T.away=0;
      if(!T.chat&&T.t>T.limit*.45){T.chat=1;say(T.name,rpick(GG.CHAT[T.mood]));}}
    if(T.t>T.limit+90){endTrip(null,T.mode==='ride'?`${T.name} got out and walked`:'The food went cold: order cancelled');return;}
    if(!txt)txt=`${T.mode==='ride'?`🚗 Take ${T.name} to`:'🛵 Deliver to'} ${T.dp.label} — ${d|0} m — ${left>=0?fmtT(left):'LATE '+fmtT(-left)} — $${T.base} — ${'★'.repeat(stars(T))}`;
    if(d<45&&T.mode==='food'&&!T.ped)T.ped=waitPed(T.dp);
    if(d<(T.mode==='ride'?9:7)&&speed()<2.5&&(T.mode==='food'||G.car===T.veh)){T.stage='hand';T.hold=1.2;}}
  else if(T.stage==='hand'){T.hold-=dt;txt=T.mode==='ride'?`🚗 ${T.name} is getting out…`:'🛵 Handing over the order…';
    if(d>14)T.stage='drop';
    else if(T.hold<=0){const s=stars(T),ped=T.ped;T.ped=null;letGo(ped,T.dp);endTrip(s);return;}}
  if(GIG.sayT>0&&txt&&!txt.startsWith('🚗 Get back'))txt=GIG.say+'   '+txt;
  if($('job').textContent!==txt)$('job').textContent=txt;
}
if(TEST)window.__gig=()=>({frame:G.frame,fails:GIG.fails,wait:GIG.wait,me:[__gs.FX|0,__gs.FZ|0],mode:GIG.mode,trip:GIG.trip&&Object.assign({},GIG.trip,{ped:!!GIG.trip.ped,veh:!!GIG.trip.veh,lastVeh:undefined}),profile:SAVE.gigs,places:ADDRS&&[ADDRS.length,FOODS.length],last:GIG.last,job:$('job').textContent,cash:G.cash});
if(TEST){window.__gigSet=gigSet;window.__gigCar=()=>{if(!G.car)toggleCar();return !!G.car&&G.car.T.name;}; // test hooks: get in the nearest car, jump to the current target
  window.__gigGo=(off=0)=>{const T=GIG.trip;if(!T)return null;const p=T.stage==='pickup'||T.stage==='board'?T.pk:T.dp,c=G.car,x=p.x+off,z=p.z;
    if(c){c.x=x;c.z=z;c.vx=c.vz=c.w=c.speed=0;}player.x=x;player.z=z;__gs.FX=x;__gs.FZ=z;return [T.stage,x|0,z|0];};}

export { GIG, gigSet, stepGigs };
