// Six City — story. One of the game's modules; they load in numbered order (src/game/index.js).
import './11-missions.js';
import * as THREE from 'three';
import { __gs, __late, later } from './shared.js';
import { $, TEST, atan2, camera, clamp, cos, groundH, hypot, max, min, rpick, scene, sin, wrap } from './01-core.js';
import { dome } from './02-sky.js';
import { nearestEdge, solidAt, walkable } from './04-world.js';
import { LM, curbSpot, streamTick } from './05-landmarks.js';
import { attachPed, peds } from './07-people.js';
import { G, flash, player } from './08-input.js';
import { RBS, dressPed, useRigs } from './09-characters.js';
import { GIVERS, MISSIONS, MS, PLACES, SAVE, ST, done, mById, nextFor, ptW, readyM, reqList, spawnFlee, startMission } from './11-missions.js';
later({CHAPTERS:()=>CHAPTERS,CUT:()=>CUT,CUTS_ON:()=>CUTS_ON,SCENES:()=>SCENES,cutNext:()=>cutNext,endCut:()=>endCut,playCut:()=>playCut,queueCut:()=>queueCut,stepActor:()=>stepActor,storyNext:()=>storyNext,storyObjective:()=>storyObjective}); // for earlier modules, read when called

/* ============================== story mode: the plot, chapters and cutscenes ==============================
   The story runs through the existing missions in order (Rosie → Dez → The Architect) and ends with two finale missions.
   Cutscenes play with the city still running around them. A scene is a list of beats:
     ['R','line']          dialogue — the camera picks a shot for whoever is speaking
     {card:[kicker,title,sub]}  title card · {cap,fly}  narration over a camera move · {paper}  a newspaper front page
   kind 'meet' stages you face to face with a character at their spot; anything else is a phone call wherever you are. */
const CUTS_ON=!TEST||location.search.includes('cut');
if(!Array.isArray(SAVE.seen))SAVE.seen=[];
PLACES.oldcity=LM.oldcityhall?ptW(LM.oldcityhall.c[0],LM.oldcityhall.c[1]):ptW(113,-35);
GIVERS.R.area='Kensington Market';GIVERS.D.area='St. Lawrence Market';GIVERS.H.area='the Harbourfront';
const CAST={
  Y:{name:'You',css:'#ffffff'},
  R:{name:'Rosie',css:'#ff6fae',look:{male:false,tone:1,tint:1.02,skin:0xd9a57e,shirt:0xfbf8f3,jacket:0x5b78a2,pants:0x1d1e22,hairC:0xf3a2c4,hair:3,acc:0xf2a6c2,shoe:0xf2a6c2,sleeve:.97}},
  D:{name:'Dez',css:'#ffa23a',look:{male:true,tone:0,tint:.95,skin:0x7c5236,shirt:0xefe4d2,jacket:0xc76b3a,pants:0x2a2a2c,hairC:0x1a1410,hair:0,beard:true,acc:0xffffff,shoe:0x1b1b1f,sleeve:.55}},
  H:{name:'The Architect',css:'#ffd23f',look:{male:false,tone:1,tint:1.12,skin:0xf1c7a4,shirt:0x1c1c1e,jacket:0x2b2f3a,pants:0x1a1a1a,hairC:0xcfcfd4,hair:1,acc:0xffd23f,shoe:0x1b1b1f,sleeve:.97}},
  N:{name:'Nadia Brooks',css:'#7fd0ff',look:{male:false,tone:0,tint:.82,skin:0x5a3a26,shirt:0xd9d9d9,jacket:0x9c2f2f,pants:0x3b4a66,hairC:0x141010,hair:2,acc:0xffffff,shoe:0x1b1b1f,sleeve:.97}},
};

// --- the story missions are gated in order, and two finale missions are added
for(const[id,a]of[['r2','r1'],['r3','r1'],['d1','r2'],['d2','d1'],['h3','d2'],['h1','h3']]){const m=mById(id);m.after=[].concat(m.after||[],a);}
MISSIONS.push(
  {id:'f1',giver:'H',after:'h5',title:'Burned',area:'East Bayfront',pay:0,chain:'f2',
    desc:'Vale moved his ledger the morning of the Reserve job, and there is police tape around the hideout. Someone talked.',steps:[
    ST.car('Get a car'),
    done(ST.go(PLACES.hideout,14,'Check on the hideout in East Bayfront',{car:true}),'IT\'S A SETUP'),
    ST.escape(3,'Lose the cops'),
    ST.go(PLACES.stlawrence,6,'Find Dez at St. Lawrence Market (on foot)',{foot:true})]},
  {id:'f2',giver:'D',after:'f1',title:'Paper Trail',area:'Downtown',pay:25000,
    desc:'Marcus Vale is driving his ledger out of the city in a black SUV. Wreck it, take the ledger, lose the cops and get it to a reporter at Old City Hall.',steps:[
    ST.car('Get a fast car'),
    ST.chase(()=>spawnFlee(2,0x111214,15,110,'black SUV'),'Run Vale\'s black SUV off the road'),
    done(ST.grab('Get out and grab the ledger'),'GOT THE LEDGER'),
    ST.car('Get in a car'),ST.escape(4,'Lose the cops'),
    ST.go(PLACES.oldcity,5,'Bring the ledger to Nadia Brooks at Old City Hall (on foot)',{foot:true})]});

const CHAPTERS=[
  {n:1,title:'New in the Six',main:['r1','r2'],side:['r3','r4'],
    sum:'You\'re sleeping on Rosie\'s couch in Kensington Market. Vale Holdings has bought her building, and she has sixty days to take their buyout or pay a rent she can\'t afford.'},
  {n:2,title:'Market Value',main:['d1','d2','h3'],
    sum:'Rosie sends you to Dez, who sells cheese at St. Lawrence Market and lends money to people banks won\'t touch. A stolen police laptop shows Marcus Vale has been paying off city councillors.'},
  {n:3,title:'Blueprints',main:['h1','h2'],
    sum:'Dez introduces the Architect. She designed the vault at the Bay Street Reserve and took the blame when Vale\'s money went missing. Vale\'s real books are in that vault, and his bribes ride through downtown in an armoured truck.'},
  {n:4,title:'Bay Street',main:['p4a','p4b','h4','p5a','p5b','h5'],
    sum:'You pay for the big job with Vale\'s favourite sapphire, case the Reserve and steal a way through the police lines. Then the big one.'},
  {n:5,title:'Paper Trail',main:['f1','f2'],
    sum:'Somebody talked. The ledger is on the move, and the only way to finish Vale is to put it in front of the whole city.'},
];
function storyNext(){for(const ch of CHAPTERS)for(const id of ch.main)if(!SAVE.done.includes(id))return{ch,m:mById(id)};return null;}
function storyObjective(){const s=storyNext();if(!s)return null;const{ch,m}=s,g=GIVERS[m.giver],R=reqList(m),hard=R.find(r=>!r.ok&&!r.soft),soft=R.find(r=>!r.ok&&r.soft);
  return{ch,text:hard?hard.t:`See ${g.name} at ${g.area}`+(soft?` — ${soft.t}`:'')};}

// --- casting: a nearby pedestrian is borrowed, dressed as the character and stood on their mark, then given back
const LOOKC=['skin','shirt','pants','hairC','accent','shoe'];
function pedLook(p){return{male:p.male,tone:p.tone,tint:p.tint,hair:p.hair,beard:p.beard,sleeve:p.sleeve,crop:p.crop,shorts:p.shorts,face:p.face,sc:p.sc,
  c:LOOKC.map(k=>p[k].getHex()),jacket:p.jacket?p.jacket.getHex():null,shin:p.shin===p.pants?'p':p.shin===p.skin?'s':p.shin.getHex(),fore:p.fore===p.skin};}
function setLook(p,L){const prev=pedLook(p);
  if(L.c)LOOKC.forEach((k,i)=>p[k].set(L.c[i]));
  else{p.skin.set(L.skin);p.shirt.set(L.shirt);p.pants.set(L.pants);p.hairC.set(L.hairC);p.accent.set(L.acc);p.shoe.set(L.shoe);}
  p.male=L.male;p.tone=L.tone;p.tint=L.tint;p.hair=L.hair;p.beard=!!L.beard;p.sleeve=L.sleeve;p.crop=!!L.crop;p.shorts=L.shorts||0;if(L.face!=null)p.face=L.face;p.sc=L.sc||1;
  p.jacket=L.jacket!=null?new THREE.Color(L.jacket):null;
  p.shin=L.shin==null||L.shin==='p'?p.pants:L.shin==='s'?p.skin:new THREE.Color(L.shin);p.fore=L.fore?p.skin:null;
  if(useRigs&&!RBS&&p.rig){scene.remove(p.rig.root);dressPed(p);} // the detailed characters bake clothing into their material
  return prev;}
function grabPed(male,x,z){let best=null,bd=1e9;
  for(let k=1;k<peds.length;k++){const p=peds[k];if(p.copPed||p.actor||p.gang||p.ins||p.hidden||p.talking||p.state==='dead'||p.state==='down')continue;
    const d=hypot(p.x-x,p.z-z)+(RBS&&p.male!==male?1e5:0);if(d<bd){bd=d;best=p;}} // realistic people can't change body, so match it
  return best;}
function castPed(key,x,z,th){const p=grabPed(CAST[key].look.male,x,z);if(!p)return null;
  p.prevLook=setLook(p,CAST[key].look);p.actor={x,z,th:th||0,look:null};
  p.x=x;p.z=z;p.y=groundH(x,z);p.th=th||0;p.state='walk';p.lie=0;p.vx=p.vz=p.vy=0;p.amp=0;return p;}
function releasePed(p){if(!p)return;p.actor=null;p.giverKey=null;if(p.prevLook){setLook(p,p.prevLook);p.prevLook=null;}
  if(p.state!=='dead'&&p.state!=='down'){p.e=null;attachPed(p);}}
function stepActor(p,dt){ // stands on its mark (walking back to it if moved) and turns to face you when you're close
  const a=p.actor,dx=a.x-p.x,dz=a.z-p.z,d=hypot(dx,dz);
  if(d>6){p.x=a.x;p.z=a.z;}
  else if(d>.12){const sp=min(1.3,d*2.5);p.th+=wrap(atan2(dx,dz)-p.th)*min(1,dt*8);p.x+=dx/d*sp*dt;p.z+=dz/d*sp*dt;p.phase+=sp*dt*3.2;p.amp+=(.5-p.amp)*min(1,dt*8);}
  else{const L=a.look,th=L&&hypot(L.x-p.x,L.z-p.z)<14?atan2(L.x-p.x,L.z-p.z):a.th;p.th+=wrap(th-p.th)*min(1,dt*5);p.amp*=.85;}
  p.lie=max(0,p.lie-dt*3);p.y=groundH(p.x,p.z);}
// the people who give you work wait by their marker whenever they have something for you
function giverSpot(g){if(!g.spot){const r=nearestEdge(g.at[0],g.at[1],60);let tx=1,tz=0;if(r){tx=r.tx;tz=r.tz;}
  let x=g.at[0]+tx*4.2,z=g.at[1]+tz*4.2;if(!walkable(x,z)||solidAt(x,1,z)){x=g.at[0]-tx*4.2;z=g.at[1]-tz*4.2;tx=-tx;tz=-tz;}
  g.spot={x,z,th:atan2(-tx,-tz)};}return g.spot;}
function stepGivers(){
  if(G.frame%15)return;
  for(const k in GIVERS){const g=GIVERS[k],d=hypot(__gs.FX-g.at[0],__gs.FZ-g.at[1]),p=g.ped;
    const want=(!__gs.IN||__gs.IN.real)&&d<90&&(!!nextFor(k)||(!!MS&&MS.def.giver===k));
    if(p&&(!want||p.state==='dead'||p.state==='down'||!p.actor)){releasePed(p);g.ped=null;continue;}
    if(want&&!p&&d>18){const s=giverSpot(g),q=castPed(k,s.x,s.z,s.th);if(q){q.actor.look=player;q.giverKey=k;g.ped=q;}}}}
const GIVER_IDLE={
  R:['Don\'t touch the mannequins. One of them bites.','Vale\'s guy came by again. I hid in the change room.','You hungry? The patty place two doors down is open late.'],
  D:['Try the aged gouda. On the house. Nothing else is on the house.','I hear things. Mostly about cheese. Sometimes not.','Rosie vouches for you. Don\'t make her a liar.'],
  H:['Keep your voice down. Sound carries over the water.','Every vault is just a door with opinions.','Patience. Plans fail when people hurry.']};
function giverChat(k){const g=GIVERS[k],m=nextFor(k),why=m&&reqList(m).find(r=>!r.ok);
  __late.openPanel(g.name,`“${rpick(GIVER_IDLE[k])}”`+(m?`<br><br>Next job: <b>${m.title}</b> — ${m.desc||''}`:''),[
    m?{label:readyM(m)&&!MS?`Let's do it: ${m.title}`:`Not yet — ${why?why.t:'finish your current job'}`,off:!readyM(m)||!!MS,fn:()=>{__late.closePanel();startMission(m);}}:{label:'Nothing right now',off:true,fn:()=>{}},
    {label:'Bye!',fn:()=>{}}]);}

// --- cutscene player
let CUT=null,cutPend=null;
const cutSub=$('cutsub'),cutWho=$('cutwho'),cutTxt=$('cutline'),cutCap=$('cutcap'),cutCard=$('cutcard'),cutPaper=$('cutpaper');
const _cv=new THREE.Vector3(),_cl=new THREE.Vector3();
function playCut(id,done){const S=SCENES[id];if(!S||!CUTS_ON||CUT){if(done)done();return;}__late.closePhone(false);__late.endPhoto();
  if(!SAVE.seen.includes(id))SAVE.seen.push(id);
  if(__late.PANEL)__late.closePanel();__late.ARM.fire=__late.ARM.aim=false;G.busy=true;
  CUT={id,S,i:-1,t:0,dur:1,done,n:0,last:null,shot:'',actors:[],anchor:null,
    cam:{f:camera.position.clone(),t:camera.position.clone(),lf:__late.camT.clone(),lt:__late.camT.clone()}};
  if(S.kind==='meet'){stageMeet(S);meetWide();}
  document.body.classList.add('cut');cutNext();}
function stageMeet(S){const who=S.who,g=GIVERS[who],at=S.at?S.at():g.at;
  const r=nearestEdge(at[0],at[1],60);let tx=1,tz=0,nx=0,nz=1;
  if(r){tx=r.tx;tz=r.tz;const dx=r.x-at[0],dz=r.z-at[1],d=hypot(dx,dz);if(d>.5){nx=dx/d;nz=dz/d;}else{nx=-tz;nz=tx;}}
  const A={x:at[0]+tx*.85,z:at[1]+tz*.85},P={x:at[0]-tx*.85,z:at[1]-tz*.85};
  __late.offWater();if(G.car){const c=G.car,s=curbSpot(at[0],at[1],'park');c.vx=c.vz=c.w=c.speed=0;c.mode='parked';if(s){c.x=s.x;c.z=s.z;c.th=s.th;}G.car=null;}
  player.hidden=false;player.x=P.x;player.z=P.z;player.y=groundH(P.x,P.z);player.vy=0;player.amp=0;player.th=atan2(A.x-P.x,A.z-P.z);__gs.FX=P.x;__gs.FZ=P.z;
  let p=g&&g.ped&&g.ped.actor?g.ped:null;
  if(!p){p=castPed(who,A.x,A.z,0);if(p&&g){p.giverKey=who;g.ped=p;}else if(p)CUT.actors.push(p);}
  if(p){Object.assign(p.actor,{x:A.x,z:A.z,look:player});p.x=A.x;p.z=A.z;p.y=groundH(A.x,A.z);p.th=atan2(P.x-A.x,P.z-A.z);p.amp=0;}
  CUT.st={A,P,nx,nz};}
function setShot(f,t,lf,lt){const c=CUT.cam;c.f.set(f[0],f[1],f[2]);c.t.set(t[0],t[1],t[2]);c.lf.set(lf[0],lf[1],lf[2]);c.lt.set(lt[0],lt[1],lt[2]);}
function meetWide(){const{A,P,nx,nz}=CUT.st,mx=(A.x+P.x)/2,mz=(A.z+P.z)/2,gy=groundH(mx,mz);
  setShot([mx+nx*3.4,gy+1.6,mz+nz*3.4],[mx+nx*2.9,gy+1.55,mz+nz*2.9],[mx,gy+1.35,mz],[mx,gy+1.35,mz]);CUT.shot='wide';}
const clearLine=(x,y,z,tx,ty,tz)=>{if(solidAt(x,y,z))return false;for(let k=1;k<6;k++){const t=k/6;if(solidAt(x+(tx-x)*t,y+(ty-y)*t,z+(tz-z)*t))return false;}return true;};
function dialogShot(who){const C=CUT,S=C.S,onCall=S.kind!=='meet'||(S.callers||[]).includes(who);
  if(!onCall){const{A,P,nx,nz}=C.st,sp=who==='Y'?P:A,ls=who==='Y'?A:P,gy=groundH(sp.x,sp.z);
    let kind=C.last===null?'wide':who!==C.last?'ots':C.shot==='ots'?'close':'ots';
    if(kind==='ots'&&++C.n%4===0)kind='wide';C.last=who;
    if(kind==='wide'){meetWide();return;}
    let dx=sp.x-ls.x,dz=sp.z-ls.z;const d=hypot(dx,dz)||1;dx/=d;dz/=d;C.shot=kind;
    if(kind==='ots'){const f=[ls.x-dx*1.05+nx*.55,gy+1.72,ls.z-dz*1.05+nz*.55];setShot(f,[f[0]+dx*.15,f[1],f[2]+dz*.15],[sp.x,gy+1.55,sp.z],[sp.x,gy+1.55,sp.z]);}
    else{const f=[sp.x-dx*1.45+nx*.5,gy+1.62,sp.z-dz*1.45+nz*.5];setShot(f,[f[0]+dx*.18,f[1],f[2]+dz*.18],[sp.x,gy+1.55,sp.z],[sp.x,gy+1.55,sp.z]);}
    return;}
  // a phone call: the camera orbits you (or your car) wherever you are, following as you coast
  const c=G.car,o=c||player,cx=o.x,cz=o.z,gy=c?c.y:player.y,th=o.th,ly=gy+(c?1:1.45);C.last=who;
  C.anchor={o,x:cx,z:cz};
  if(who==='Y'&&!c){const fx=sin(th),fz=cos(th),f=[cx+fx*1.7-fz*.45,gy+1.62,cz+fz*1.7+fx*.45];
    if(clearLine(f[0],f[1],f[2],cx,gy+1.5,cz)){setShot(f,[f[0]-fx*.2,f[1],f[2]-fz*.2],[cx,gy+1.55,cz],[cx,gy+1.55,cz]);return;}}
  const R=c?7.5:3.6,h=c?2.3:1.75,base=[2.5,-2.3,.9,-.8];
  for(let k=0;k<8;k++){const a=th+base[(C.n+k)%4]+(k>3?.4:0),x=cx+sin(a)*R,z=cz+cos(a)*R;
    if(k===7||clearLine(x,gy+h,z,cx,ly,cz)){const a2=a+.16;setShot([x,gy+h,z],[cx+sin(a2)*R,gy+h,cz+cos(a2)*R],[cx,ly,cz],[cx,ly,cz]);C.n+=k+1;return;}}}
function cutNext(){const C=CUT;if(!C)return;C.i++;const b=C.S.beats[C.i];
  cutSub.style.opacity=0;cutCap.style.opacity=0;
  if(!b){endCut();return;}
  C.t=0;C.anchor=null;const line=Array.isArray(b);
  cutCard.classList.toggle('on',!line&&!!b.card);cutCard.classList.toggle('solid',!line&&!!b.solid);cutPaper.classList.toggle('on',!line&&!!b.paper);
  if(line){const[who,txt]=b,P=CAST[who],onCall=C.S.kind!=='meet'||(C.S.callers||[]).includes(who);
    cutWho.textContent=(onCall&&who!=='Y'?'📱 ':'')+P.name;cutWho.style.color=P.css;cutTxt.textContent=txt;cutSub.style.opacity=1;
    C.dur=clamp(1.8+txt.length*.055,3,9);dialogShot(who);return;}
  C.dur=b.dur||4;
  if(b.fly){const F=typeof b.fly==='function'?b.fly():b.fly;setShot(F.from,F.to,F.look,F.look2||F.look);streamTick(F.to[0],F.to[2],true);}
  else if(C.S.kind==='meet'&&C.st&&C.i===0)meetWide();
  if(b.cap){cutCap.textContent=b.cap;cutCap.style.opacity=1;}
  if(b.card){$('cardk').textContent=b.card[0];$('cardt').textContent=b.card[1];$('cards').textContent=b.card[2]||'';}
  if(b.paper)cutPaper.innerHTML=b.paper;}
function stepCut(dt){const C=CUT,c=C.cam;C.t+=dt;const u=min(1,C.t/C.dur),k=u*u*(3-2*u);
  _cv.lerpVectors(c.f,c.t,k);_cl.lerpVectors(c.lf,c.lt,k);
  if(C.anchor){const o=C.anchor.o,dx=o.x-C.anchor.x,dz=o.z-C.anchor.z;_cv.x+=dx;_cv.z+=dz;_cl.x+=dx;_cl.z+=dz;}
  camera.position.copy(_cv);camera.lookAt(_cl);if(camera.fov!==40){camera.fov=40;camera.updateProjectionMatrix();}
  dome.position.copy(camera.position);__late.camT.copy(_cl);player.amp*=.85;
  if(C.t>=C.dur)cutNext();}
function endCut(){const C=CUT;if(!C)return;CUT=null;
  document.body.classList.remove('cut');cutSub.style.opacity=0;cutCap.style.opacity=0;cutCard.classList.remove('on','solid');cutPaper.classList.remove('on');
  for(const p of C.actors)releasePed(p);
  for(const k in GIVERS){const g=GIVERS[k];if(g.ped&&g.ped.actor){const s=giverSpot(g);Object.assign(g.ped.actor,{x:s.x,z:s.z,th:s.th});}}
  G.busy=false;const o=G.car||player;__gs.camYaw=o.th;__gs.camPitch=.22;__gs.FX=o.x;__gs.FZ=o.z;__late.camT.set(__gs.FX,(G.car?G.car.y:player.y)+1.55,__gs.FZ);
  if(C.S.end)C.S.end();__gs.saveGame();if(C.done)C.done();}
// phone calls after a mission wait a moment, and wait until you've lost the cops and left any building
function queueCut(id,done){if(!CUTS_ON||!SCENES[id]){if(done)done();return;}cutPend={id,done,t:2.6,told:false};}
function stepCutPend(dt){const q=cutPend;if(!q||CUT||MS)return;
  if(G.busy||(__gs.IN&&!__gs.IN.real)||G.heat>0){if(G.heat>0&&!q.told){q.told=true;G.note='📱 Missed call — lose the cops and they\'ll call back';G.noteT=8;}return;}
  q.t-=dt;if(q.t<=0){cutPend=null;playCut(q.id,q.done);}}

// --- the script
const cnC=LM.cn?LM.cn.c:[-622,897],unC=LM.union?LM.union.c:[-28,777],kmC=PLACES.kensington;
const toGiver=k=>()=>{const g=GIVERS[k];__late.setWaypoint(g.at[0],g.at[1],g.name+' — '+g.area);};
const SCENES={
  prologue:{kind:'call',end:toGiver('R'),beats:[
    {card:['','SIX CITY','a Toronto story'],solid:true,dur:3.6},
    {fly:{from:[cnC[0]+380,60,cnC[1]+470],to:[cnC[0]+250,110,cnC[1]+300],look:[cnC[0],240,cnC[1]],look2:[cnC[0],330,cnC[1]]},cap:'Toronto. Three million people, one very tall tower and nowhere to park.',dur:6.5},
    {fly:{from:[unC[0]-70,28,unC[1]-125],to:[unC[0]+50,20,unC[1]-110],look:[unC[0],10,unC[1]]},cap:'You got off the train at Union a week ago. One duffel bag. One phone number.',dur:6},
    {fly:{from:[kmC[0]+60,40,kmC[1]+50],to:[kmC[0]+28,16,kmC[1]+30],look:[kmC[0],4,kmC[1]]},cap:'The number was Rosie\'s. She sells vintage clothes in Kensington Market. For now.',dur:6},
    {fly:()=>{const p=player,fx=sin(p.th),fz=cos(p.th);return{from:[p.x+18,p.y+34,p.z+18],to:[p.x-fx*4.5,p.y+2.1,p.z-fz*4.5],look:[p.x,p.y+1.4,p.z]};},cap:'This morning, she called.',dur:4.5},
    ['R','Morning, couch-surfer. You alive?'],
    ['Y','Define alive.'],
    ['R','Upright and able to drive. Come by the shop on Augusta, I need a favour.'],
    ['Y','What kind of favour?'],
    ['R','The kind I explain in person. Kensington Market. Follow the pink marker.']]},

  // ---------- chapter 1: Rosie
  r1_in:{kind:'meet',who:'R',beats:[
    {card:['CHAPTER 1','New in the Six',''],dur:3},
    ['R','There you are. Did the raccoons keep you up again?'],
    ['Y','One of them tried the door handle. I think it\'s learning.'],
    ['R','Welcome to Toronto. Okay, the favour. My cousin Jay\'s train gets into Union in twenty minutes.'],
    ['R','I\'d go myself, but a man from Vale Holdings is coming to talk about my lease.'],
    ['Y','Vale? The condo people?'],
    ['R','They bought the whole block. They want me out so they can knock it down and build forty floors of glass.'],
    ['R','Grab a car. Any car. Don\'t tell me which one.']]},
  r1_out:{kind:'call',beats:[
    ['R','Jay says you ran two reds and nearly kissed a streetcar. He\'s in love.'],
    ['R','Bad news, though. Vale\'s guy left a letter. My rent triples in sixty days unless I take their buyout.'],
    ['Y','How much do you need?'],
    ['R','More than I\'ve got. Come by when you want to make some money. Not the legal kind.']]},
  r2_in:{kind:'meet',who:'R',beats:[
    ['R','So. I know a collector who pays very well for cars that aren\'t technically for sale.'],
    ['Y','Rosie.'],
    ['R','It\'s one car! Red, low, parked by the Rogers Centre. The owner\'s inside watching the game.'],
    ['R','Get it to the garage on Spadina in one piece. Mostly one piece.']]},
  r2_out:{kind:'call',end:toGiver('D'),beats:[
    ['R','The collector paid. Half goes to rent, half goes to keeping you in groceries.'],
    ['R','He also said you should meet a friend of his. Dez, at St. Lawrence Market. Dez solves problems.'],
    ['Y','That sounds like a bad idea.'],
    ['R','It is. Go anyway.']]},
  r3_in:{kind:'meet',who:'R',beats:[
    ['R','Jay signed you up for a street race. I said no. He said you\'d say yes.'],
    ['Y','What\'s the prize?'],
    ['R','Two grand and bragging rights. Start line\'s at Union. Try not to die.']]},
  r4_in:{kind:'meet',who:'R',beats:[
    ['R','Bet you twelve hundred bucks you won\'t stand on the CN Tower\'s glass floor.'],
    ['Y','You don\'t have twelve hundred bucks.'],
    ['R','I will after you chicken out.']]},

  // ---------- chapter 2: Dez
  d1_in:{kind:'meet',who:'D',beats:[
    {card:['CHAPTER 2','Market Value',''],dur:3},
    ['D','Rosie\'s friend. You look like trouble with good manners.'],
    ['D','I sell cheese. I also lend money to people the banks don\'t like.'],
    ['D','A guy in a blue sedan owes me three grand and keeps forgetting. Remind him.'],
    ['Y','Remind him how?'],
    ['D','With your bumper. Don\'t hurt him. Hurt the car.']]},
  d1_out:{kind:'call',beats:[
    ['D','He paid. Funny how a crumpled fender jogs the memory.'],
    ['D','Come back when you\'re ready for something with more salt on it.']]},
  d2_in:{kind:'meet',who:'D',beats:[
    ['D','Next one\'s spicy. There\'s a police cruiser parked on College with a laptop in it.'],
    ['D','A client of mine wants to know what the cops have on him. Take the whole car.'],
    ['Y','You want me to steal a police car.'],
    ['D','Borrow. Then get it resprayed on Bay Street so it stops being a police car.']]},
  d2_out:{kind:'call',beats:[
    ['D','My client says thank you. And the laptop had a file on Vale Holdings. Rosie\'s new landlord.'],
    ['D','Marcus Vale has been buying city councillors the way I buy brie. Wholesale.'],
    ['Y','So he gets his rezoning and Rosie gets a moving truck.'],
    ['D','Unless somebody spoils it. Come see me.']]},
  h3_in:{kind:'meet',who:'D',beats:[
    ['D','You want to help Rosie? Small money won\'t do it. Vale wins by outspending everybody.'],
    ['D','Bloor Diamonds in Yorkville. Business hours. Five cases, then out before the cops show.'],
    ['D','Pull this off and I\'ll introduce you to someone who plays a much bigger game.']]},
  h3_out:{kind:'call',end:toGiver('H'),beats:[
    ['D','Clean work. I made a call. Somebody wants to meet you down at the Harbourfront.'],
    ['D','They call her the Architect. She doesn\'t do small jobs, and she doesn\'t do second chances.']]},

  // ---------- chapter 3: The Architect
  h1_in:{kind:'meet',who:'H',beats:[
    {card:['CHAPTER 3','Blueprints',''],dur:3},
    ['H','Don\'t look at me. Look at the lake. People watch this spot.'],
    ['H','Six years ago I designed the vault at the Bay Street Reserve. The best on the continent.'],
    ['H','Then forty million of Marcus Vale\'s dollars vanished on paper, and my name was on every page.'],
    ['H','Vale keeps his real books in that vault. Who he paid, how much, for which vote. Kensington is next on his list.'],
    ['Y','So we rob the Reserve.'],
    ['H','Eventually. First I need to know you can open a vault I didn\'t design. Lakeshore Trust, on King West.']]},
  h1_out:{kind:'call',beats:[
    ['H','Not bad. Sloppy on the exit, but not bad.'],
    ['H','Now we start taking things from Marcus Vale. Come and see me.']]},
  p4a_in:{kind:'meet',who:'H',beats:[
    {card:['CHAPTER 4','Bay Street',''],dur:3},
    ['H','The ROM has the Ontario Sapphire. Vale\'s foundation paid for that gallery.'],
    ['H','Selling his favourite stone pays for the Reserve. Go be a tourist. Take pictures of the case.']]},
  p4b_in:{kind:'meet',who:'H',beats:[
    ['H','That case is armoured glass. You\'ll need a thermal lance.'],
    ['H','My contact in the Distillery District sells them. Cash only. Don\'t ask what else he sells.']]},
  h4_in:{kind:'meet',who:'H',beats:[
    ['H','After closing. Cut the case, take the stone, sell it to the fence in Chinatown.'],
    ['H','Every dollar goes to the Reserve. Don\'t get sentimental about it.']]},
  h4_out:{kind:'call',beats:[
    ['H','The fence paid. Vale\'s people are already on the news calling it a tragedy.'],
    ['H','Next, we find out who works at the Reserve these days.']]},

  // ---------- chapter 4: Bay Street
  h2_in:{kind:'meet',who:'H',beats:[
    ['H','Vale pays his councillors in cash. An armoured truck carries it through downtown every week.'],
    ['H','This week, it doesn\'t arrive.']]},
  h2_out:{kind:'call',beats:[
    ['H','Inside the cash bags there were envelopes. With names on them.'],
    ['Y','So it\'s real.'],
    ['H','It\'s real. And the ledger in the Reserve is what makes it stick. Now we pay for the job.']]},
  p5a_in:{kind:'meet',who:'H',beats:[
    ['H','I know the vault. I don\'t know the new staff.'],
    ['H','Walk into the Reserve, chat up a teller and get a look down the back hall. Smile. You\'re a customer.']]},
  p5b_in:{kind:'meet',who:'H',beats:[
    ['H','When the alarm goes, every cruiser in the city comes for us. We need something they can\'t stop.'],
    ['H','There\'s an armoured van in a yard in the Port Lands. Bring it to the hideout.']]},
  h5_in:{kind:'meet',who:'H',beats:[
    ['H','This is it. Main vault. Box 1414. That one is Vale\'s.'],
    ['H','Take all the cash you can carry. I only want the ledger.'],
    ['H','Once the drill starts, it\'s every cop in Toronto. Are you ready?'],
    ['Y','Rosie has forty days left. I\'m ready.']]},
  h5_out:{kind:'call',end:toGiver('H'),beats:[
    ['H','We\'re clear. But box 1414 was empty.'],
    ['Y','Empty?'],
    ['H','He moved it that morning. Somebody told him we were coming. Meet me at the Harbourfront. Now.']]},

  // ---------- chapter 5: Paper Trail
  f1_in:{kind:'meet',who:'H',beats:[
    {card:['CHAPTER 5','Paper Trail',''],dur:3},
    ['H','An hour ago the police put tape around our hideout in East Bayfront.'],
    ['H','Four people knew the date. You, me, Rosie, and Dez.'],
    ['Y','Rosie would never.'],
    ['H','Then go and look at the hideout, and after that, go and ask Dez. Carefully.']]},
  f1_out:{kind:'meet',who:'D',beats:[
    ['D','Before you say anything. Vale bought my debts. All of them. He owns the stall, the house. Me.'],
    ['D','He said nobody would get hurt if I told him when. I\'m sorry. I\'m truly sorry.'],
    ['Y','Where\'s the ledger, Dez?'],
    ['D','In a black SUV leaving his King West office right now. He\'s driving it out of the city himself.'],
    ['D','There\'s a reporter at the Queen Street Courier. Nadia Brooks. She\'ll be waiting at Old City Hall.'],
    ['D','Get it to her. Let me have done one good thing this year.']]},
  f2_out:{kind:'meet',who:'N',at:()=>PLACES.oldcity,callers:['R','H'],end(){SAVE.storyDone=true;flash('STORY COMPLETE',4);},beats:[
    ['N','Nadia Brooks, Queen Street Courier. Dez said you\'d be the one who looks like they\'ve been chased.'],
    ['Y','Every councillor Vale paid. Dates, amounts, his handwriting.'],
    ['N','This is all of it. It runs on the front page tomorrow morning.'],
    ['N','You might want to be somewhere else when it does.'],
    {paper:'<div class="mast">The Queen Street Courier</div><div class="ed">Toronto · Late edition</div><h2>VALE CHARGED IN CITY HALL BRIBERY PROBE</h2><p>Ledger names four councillors · Kensington rezoning frozen · Developer\'s Bay Street vault box found empty, police say</p>',dur:7},
    {card:['TWO WEEKS LATER','',''],dur:2.6},
    ['R','They froze the rezoning! And the building\'s for sale again. To the tenants. To us!'],
    ['Y','Told you it would work out.'],
    ['R','You told me nothing, you just kept stealing cars. Get over here, Jay made a cake. It\'s terrible.'],
    ['H','Clean work. I\'m leaving town for a while. Don\'t call me. I\'ll call you.'],
    {card:['THE END','Six City','The city is still yours. Every job can be replayed from the board (J).'],solid:true,dur:6.5}]},
};
if(TEST){window.__cut=id=>playCut(id);window.__CUT=()=>CUT&&{id:CUT.id,i:CUT.i,line:cutTxt.textContent,cam:camera.position.toArray().map(v=>+v.toFixed(1))};window.__cutNext=()=>cutNext();window.__story=()=>storyObjective();}

export { CUT, giverChat, releasePed, stepCut, stepCutPend, stepGivers };
