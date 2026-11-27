// Six City — missions. One of the game's modules; they load in numbered order (src/game/index.js).
import './10-police.js';
import { __gs, __late, later } from './shared.js';
import { $, EDGES, NODES, TEST, canvas, cos, floor, hypot, max, min, sin } from './01-core.js';
import { curbSpot, streamTick } from './05-landmarks.js';
import { CT, cars, mkCar, nearestNode, pathTo, spawnTraffic } from './06-cars.js';
import { GARAGES, beacon, peds, placePed } from './07-people.js';
import { G, flash, player } from './08-input.js';
later({MS:()=>MS,SAVE:()=>SAVE,closeBoard:()=>closeBoard,failMission:()=>failMission,openBoard:()=>openBoard}); // for earlier modules, read when called
__gs.saveGame=saveGame$fn;

/* ============================== missions & heists ============================== */
const SAVE_KEY='sixcity-save-v1';
let SAVE={done:[],cash:0};
try{const sv=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(sv&&Array.isArray(sv.done))SAVE=sv;}catch(e){}
if(!TEST)G.cash=SAVE.cash||0;
function saveGame$fn(){try{localStorage.setItem(SAVE_KEY,JSON.stringify({done:SAVE.done,cash:G.cash}));}catch(e){}}
const ptW=(x,z)=>{const s=curbSpot(x,z,'walk');return[s.x,s.z];};
const ptP=(x,z)=>{const s=curbSpot(x,z,'park');return[s.x,s.z];};
const PLACES={
  kensington:ptW(-1185,-260),union:ptP(-10,730),stlawrence:ptW(770,560),harbour:ptW(-300,1300),
  bank:ptW(40,470),hideout:ptP(900,1160),
};
const parkedAt=(x,z,ti,col,extra)=>()=>{const s=curbSpot(x,z,'park');for(let k=cars.length-1;k>=0;k--){const o=cars[k];if(o!==G.car&&o.mode==='parked'&&hypot(o.x-s.x,o.z-s.z)<6)cars.splice(k,1);}
  const c=mkCar(ti,s.x,s.z,s.th,'parked',col);Object.assign(c,extra||{});return c;};
function spawnFlee(ti,col,speed,hp,label){
  let c=null;for(let t=0;t<12&&!c;t++)c=spawnTraffic(55,150);
  if(!c){const n=nearestNode(__gs.FX+40,__gs.FZ+40);if(!n)return null;const e=EDGES[n.e[0]];c=mkCar(ti,n.x,n.z,0,'traffic');c.ai={e,dir:e.a===n.i?1:-1,s:n.trim+1,turn:null,stuck:0,ghost:0};}
  c.ti=ti;c.T=CT[ti];c.color.set(col);c.keep=1;c.flee=speed;c.hp=hp;c.maxHp=hp;c.label=label;c.spawned=false;return c;
}
function routeThrough(stops){ // checkpoints along real streets between the given points
  const out=[];let prev=null;
  for(const [x,z] of stops){const n=nearestNode(x,z);if(!n)continue;
    if(prev)for(const i of pathTo(prev,n).slice(1)){const q=[NODES[i].x,NODES[i].z],l=out[out.length-1];if(!l||hypot(q[0]-l[0],q[1]-l[1])>110)out.push(q);}
    else out.push([n.x,n.z]);prev=n;}
  return out;
}
// step builders: each has text(M), optional init(M), target(M) -> [x,z], tick(M,dt) -> true | 'fail:reason'
const ST={
  car:(text)=>({text:()=>text,tick:()=>!!G.car&&!G.car.T.tram}),
  foot:(text)=>({text:()=>text,tick:()=>!G.car}),
  go:(pt,r,text,o={})=>({text:()=>text,init(M){if(o.time)M.timer=o.time;},target:()=>pt,needCar:!!o.useCar,
    tick(M){if(o.useCar&&G.car!==M.refs.car)return false;if(o.car&&!G.car)return false;if(o.foot&&G.car)return false;return hypot(__gs.FX-pt[0],__gs.FZ-pt[1])<r;}}),
  steal:(spawn,text,o={})=>({text:()=>text,init(M){M.refs.car=spawn();if(o.time)M.timer=o.time;},target:M=>[M.refs.car.x,M.refs.car.z],
    tick(M){const c=M.refs.car;if(c.hp<=0)return 'fail:The car was wrecked';if(G.car===c){if(o.heat)G.heat=max(G.heat,o.heat+.2);return true;}return false;}}),
  enter:(text)=>({text:()=>text,needCar:true,target:M=>[M.refs.car.x,M.refs.car.z],tick:M=>G.car===M.refs.car}),
  deliver:(pt,r,text,minHp)=>({needCar:true,text:M=>G.car!==M.refs.car?'Get back in the car':text+(minHp?` (condition ${M.refs.car.hp|0}%, keep it above ${minHp}%)`:''),
    target:M=>G.car===M.refs.car?pt:[M.refs.car.x,M.refs.car.z],
    tick(M){const c=M.refs.car;if(minHp&&c.hp<minHp)return 'fail:The car is too damaged';return G.car===c&&hypot(c.x-pt[0],c.z-pt[1])<r&&hypot(c.vx,c.vz)<7;}}),
  chase:(spawn,text)=>({init(M){M.refs.tgt=spawn();if(!M.refs.tgt)return;flash('TARGET SPOTTED',1.6);},
    text:M=>{const t=M.refs.tgt;return t?`${text} — damage ${100-max(0,t.hp)*100/t.maxHp|0}%`:text;},
    target:M=>M.refs.tgt?[M.refs.tgt.x,M.refs.tgt.z]:null,
    tick(M){const t=M.refs.tgt;if(!t)return 'fail:The target got away';if(!cars.includes(t)||hypot(t.x-__gs.FX,t.z-__gs.FZ)>320)return 'fail:The target got away';
      if(t.hp<=0){t.flee=0;t.mode='free';t.vx=sin(t.th)*t.speed*.5;t.vz=cos(t.th)*t.speed*.5;return true;}return false;}}),
  grab:(text)=>({text:()=>text,target:M=>[M.refs.tgt.x,M.refs.tgt.z],tick:M=>!G.car&&hypot(__gs.FX-M.refs.tgt.x,__gs.FZ-M.refs.tgt.z)<4.5}),
  hold:(pt,r,secs,stars,text)=>({init(M){M.prog=0;flash('DRILLING THE VAULT',1.6);},target:()=>pt,
    text:M=>{const f=min(1,M.prog/secs),n=f*12|0;return `${text}  ${'▮'.repeat(n)}${'▯'.repeat(12-n)} ${f*100|0}% — silent alarm tripped, police arrive when it opens`+(G.car||hypot(__gs.FX-pt[0],__gs.FZ-pt[1])>=r?' (stand in the marker on foot)':'');},
    tick(M,dt){if(!G.car&&hypot(__gs.FX-pt[0],__gs.FZ-pt[1])<r)M.prog+=dt;if(M.prog>=secs){G.heat=max(G.heat,stars+.2);G.evade=0;return true;}return false;}}),
  escape:(stars,text)=>({init(){if(G.heat<stars)G.heat=stars+.2;G.evade=0;},text:()=>text,tick:()=>G.heat<=0}),
  race:(stops,time,text)=>({init(M){M.pts=routeThrough(stops);M.ci=0;M.timer=time;},text:M=>`${text} — checkpoint ${min(M.ci+1,M.pts.length)}/${M.pts.length}`,target:M=>M.pts[M.ci],
    tick(M){if(!G.car)return false;const p=M.pts[M.ci];if(hypot(__gs.FX-p[0],__gs.FZ-p[1])<13){M.ci++;__late.thud(.12);if(M.ci>=M.pts.length)return true;}return false;}}),
};
// steps that happen inside buildings (DOOR / IN come from the interiors section and are only looked up while playing)
Object.assign(ST,{
  goDoor:(id,r,text,o={})=>({text:()=>text,needCar:!!o.useCar,target:()=>__late.DOOR[id].at,
    tick(M){const p=__late.DOOR[id].at;if(o.useCar&&G.car!==M.refs.car)return false;if(o.car&&!G.car)return false;return hypot(__gs.FX-p[0],__gs.FZ-p[1])<r;}}),
  goIn:(id,text)=>({text:()=>G.car?'Get out of the car and walk in (E at the yellow door)':text,target:()=>__gs.IN?null:__late.DOOR[id].at,tick:()=>!!__gs.IN&&__gs.IN.door.id===id}),
  inspot:(key,r,secs,text,o={})=>({init(M){M.prog=0;},target:()=>__gs.IN&&__gs.IN.spots[key],
    text:M=>{if(!__gs.IN)return 'Get back inside';if(secs<=3)return text;const f=min(1,M.prog/secs),n=f*12|0;return `${text}  ${'▮'.repeat(n)}${'▯'.repeat(12-n)} ${f*100|0}%`+(M.prog>0&&hypot(player.x-__gs.IN.spots[key][0],player.z-__gs.IN.spots[key][1])>=r?' — get back to the marker':'');},
    tick(M,dt){if(!__gs.IN)return o.stay?'fail:You left the building':false;const p=__gs.IN.spots[key];if(hypot(player.x-p[0],player.z-p[1])<r)M.prog+=dt;
      if(o.stars&&M.prog>0&&!__gs.IN.alarm)__late.raiseAlarm(o.stars,o.alarmMsg);if(M.prog>=secs){if(o.done)o.done(M);return true;}return false;}}),
  loot:(n,text)=>({init(M){M.got=0;if(__gs.IN)__gs.IN.lootOn=true;},text:M=>`${text} (${M.got}/${n}) — $${(M.take||0).toLocaleString()} so far`,
    target:()=>{if(!__gs.IN)return null;const l=__gs.IN.loot.find(l=>!l.got);return l?[l.x,l.z]:null;},
    tick(M){if(!__gs.IN)return 'fail:You left the money behind';for(const l of __gs.IN.loot)if(!l.got&&hypot(player.x-l.x,player.z-l.z)<1.8){l.got=true;l.g.visible=false;M.got++;M.take=(M.take||0)+l.val;__late.thud(.2);flash('+$'+l.val.toLocaleString(),1);}
      return M.got>=min(n,__gs.IN.loot.length);}}),
  smash:(n,secs,text)=>({init(M){M.timer=secs;},text:()=>`${text} (${__gs.IN?__gs.IN.cases.filter(c=>c.broken).length:0}/${n})`,
    target:()=>{if(!__gs.IN)return null;const c=__gs.IN.cases.find(c=>!c.broken);return c?[c.x,c.z]:null;},tick:()=>__gs.IN?__gs.IN.cases.filter(c=>c.broken).length>=n:'fail:You left the store'}),
  leave:(text)=>({text:()=>text,target:()=>__gs.IN?__gs.IN.spots.exit:null,tick:()=>!__gs.IN}),
  pay:(pt,cost,text)=>({text:()=>G.cash>=cost?`${text} — $${cost.toLocaleString()}`:`${text} — you need $${cost.toLocaleString()}`,target:()=>pt,
    tick(){if(!G.car&&hypot(__gs.FX-pt[0],__gs.FZ-pt[1])<4&&G.cash>=cost){G.cash-=cost;flash('-$'+cost.toLocaleString(),1.6);return true;}return false;}}),
});
const vaultOpen=()=>{if(__gs.IN&&__gs.IN.vault){__gs.IN.vault.opening=true;__late.solDel(__gs.IN.vault.sol);}};
for(const k in ST){const f=ST[k];ST[k]=(...a)=>{const r=f(...a);r.lab=a.filter(x=>typeof x==='string').sort((p,q)=>q.length-p.length)[0];return r;};} // short labels for the tracker
const done=(s,msg)=>Object.assign(s,{done:msg});
PLACES.distillery=ptW(1745,700);PLACES.chinatown=ptP(-1110,-430);PLACES.portlands=ptP(1700,1180);
const MISSIONS=[
  {id:'r1',giver:'R',title:'Welcome to the Six',area:'Kensington Market',pay:500,desc:'Rosie\'s cousin is in town. Pick him up at Union Station and bring him home.',steps:[
    ST.car('Rosie needs a ride. Get a car (press F next to one)'),
    done(ST.go(PLACES.union,11,'Pick up Rosie\'s cousin Jay at Union Station',{car:true,time:200}),'Jay hopped in'),
    ST.go(PLACES.kensington,12,'Drive Jay home to Kensington Market',{car:true,time:180})]},
  {id:'r2',giver:'R',title:'Hot Wheels',area:'Rogers Centre',pay:1500,desc:'A collector wants the red supercar parked by the Rogers Centre. Deliver it in one piece.',steps:[
    ST.steal(parkedAt(-700,1000,4,0xd0101e),'Steal the red supercar parked by the Rogers Centre'),
    ST.deliver(GARAGES[0],7,'Deliver it to the garage on Spadina',50)]},
  {id:'r3',giver:'R',title:'Front Street Sprint',area:'Union Station',pay:2000,desc:'A street race through the core, starting and ending at Union Station.',steps:[
    ST.car('Get a fast car'),
    ST.go(PLACES.union,12,'Drive to the start line at Union Station',{car:true}),
    ST.race([PLACES.union,[-1127,715],[-1127,415],[301,415],[301,640],PLACES.union],150,'Race through the checkpoints')]},
  {id:'r4',giver:'R',title:'Top of the Tower',area:'CN Tower',after:'r1',pay:1200,desc:'Rosie bet you won\'t stand on the CN Tower\'s glass floor, 342 m above the street. Prove her wrong.',steps:[
    ST.goDoor('cn',8,'Go to the CN Tower'),ST.goIn('cn','Take the elevator up (E at the yellow door)'),
    done(ST.inspot('photo',2.4,2.5,'Stand on the Glass Floor for a photo'),'Rosie owes you!'),ST.leave('Take the elevator back down')]},
  {id:'d1',giver:'D',title:'Debt Collector',area:'Old Town',pay:3000,desc:'A guy in a blue sedan owes Dez money. Ram him until his car gives out.',steps:[
    ST.car('Get a car'),
    ST.chase(()=>spawnFlee(0,0x2f6bd8,16,60,'blue sedan'),'Ram the blue sedan until it\'s wrecked')]},
  {id:'d2',giver:'D',title:'Hot Pursuit',area:'College St',pay:4500,desc:'Steal a police cruiser, lose the cops, and get it resprayed.',steps:[
    ST.steal(parkedAt(150,-990,0,0x2a2e34,{copCar:1}),'Steal the police cruiser parked on College St',{heat:2}),
    ST.escape(2,'Lose the cops'),
    ST.deliver(GARAGES[2],7,'Get the cruiser resprayed at the garage on Bay St',0)]},
  {id:'h3',giver:'D',heist:true,req:2,hours:[10,20],title:'Yorkville Smash & Grab',area:'Bloor St W, Yorkville',pay:6000,alarmStars:2,
    desc:'Bloor Diamonds keeps its best stones in the window cases. Walk in during business hours, smash five cases before the cops arrive and get out.',steps:[
    ST.car('Get a car for the getaway'),ST.goDoor('jewel',14,'Drive to Bloor Diamonds in Yorkville',{car:true}),ST.goIn('jewel','Walk in (E at the yellow door)'),
    done(ST.smash(5,45,'Smash the display cases (E)'),'Got the stones!'),ST.leave('Get out of the store'),ST.car('Get in a car'),ST.escape(2,'Lose the cops'),
    ST.go(PLACES.hideout,10,'Lie low at the hideout in East Bayfront',{car:true})]},
  {id:'h1',giver:'H',heist:true,req:3,title:'The Lakeshore Trust Job',area:'King St W',pay:15000,alarmStars:3,
    desc:'Your first bank job. Steal a getaway SUV, drill the vault at Lakeshore Trust, grab the cash and get it to the hideout.',steps:[
    ST.steal(parkedAt(-480,560,2,0x111214),'Steal the black getaway SUV on Wellington St'),
    ST.goDoor('lakeshore',16,'Drive to Lakeshore Trust on King St W',{useCar:true}),ST.goIn('lakeshore','Walk into the bank (E at the yellow door)'),
    done(ST.inspot('drill',2.2,14,'Drill the vault door',{stars:3,alarmMsg:'SILENT ALARM TRIPPED',done:vaultOpen}),'THE VAULT IS OPEN'),
    ST.loot(3,'Grab the cash and gold'),ST.leave('Get out of the bank'),ST.enter('Get back in the getaway SUV'),
    ST.escape(3,'Lose the cops'),ST.deliver(PLACES.hideout,9,'Take the money to the hideout in East Bayfront',0)]},
  {id:'h2',giver:'H',heist:true,after:'h1',title:'The Armoured Truck',area:'Downtown',pay:40000,desc:'An armoured truck is on its run through downtown. Run it off the road and take the cash bags.',steps:[
    ST.car('Get a fast car'),
    ST.chase(()=>spawnFlee(2,0x3b473c,12.5,95,'armoured truck'),'Run the armoured truck off the road'),
    done(ST.grab('Get out and grab the cash bags'),'Got the cash bags!'),
    ST.car('Get a car'),ST.escape(4,'Lose the cops'),ST.go(PLACES.hideout,10,'Get to the hideout in East Bayfront',{car:true})]},
  {id:'p4a',giver:'H',prep:'h4',after:'h1',hours:[10,17.5],title:'Case the ROM',area:'Royal Ontario Museum',pay:500,desc:'Visit the museum during opening hours and photograph the Ontario Sapphire\'s case.',steps:[
    ST.goDoor('rom',10,'Go to the Royal Ontario Museum on Bloor St'),ST.goIn('rom','Walk in like a tourist (E at the yellow door)'),
    done(ST.inspot('gem',2.6,3,'Photograph the Ontario Sapphire (stand by its case)'),'Photos sent to The Architect'),ST.leave('Leave the museum')]},
  {id:'p4b',giver:'H',prep:'h4',after:'h1',title:'Thermal Lance',area:'Distillery District',pay:0,desc:'The sapphire\'s case is armoured glass. Buy a thermal lance from a contact in the Distillery District.',steps:[
    ST.pay(PLACES.distillery,3000,'Buy the thermal lance in the Distillery District'),ST.car('Get a car'),ST.go(PLACES.hideout,10,'Stash it at the hideout',{car:true})]},
  {id:'h4',giver:'H',heist:true,after:['p4a','p4b'],hours:[22,5],night:true,title:'The Crystal Job',area:'Royal Ontario Museum',pay:30000,alarmStars:4,
    desc:'After closing, break into the ROM, cut open the case and take the 563-carat Ontario Sapphire. A fence in Chinatown is waiting.',steps:[
    ST.car('Get a car'),ST.goDoor('rom',14,'Drive to the ROM',{car:true}),ST.goIn('rom','Slip inside (E at the yellow door)'),
    done(ST.inspot('gem',2.2,10,'Cut through the case with the lance',{stars:4,alarmMsg:'MUSEUM ALARM!',done:M=>{if(__gs.IN&&__gs.IN.gem){__gs.IN.gem.visible=false;__gs.IN.gem=null;}M.take=(M.take||0)+35000;}}),'GOT THE SAPPHIRE'),
    ST.leave('Get out of the museum'),ST.car('Get in a car'),ST.escape(4,'Lose the cops'),ST.go(PLACES.chinatown,10,'Sell the sapphire to the fence in Chinatown',{car:true})]},
  {id:'p5a',giver:'H',prep:'h5',after:['h1','h3'],hours:[9,17],title:'Inside Man',area:'King & Bay',pay:1000,desc:'Walk into the Bay Street Reserve as a customer, chat up a teller and get a look at the main vault.',steps:[
    ST.goDoor('bayst',10,'Go to the Bay Street Reserve at King & Bay'),ST.goIn('bayst','Walk in (E at the yellow door)'),
    ST.inspot('teller',2.4,3,'Talk to a teller (stand at the counter)'),done(ST.inspot('vaultdoor',3.2,3,'Get a look at the vault door down the back hall'),'You know the layout'),ST.leave('Walk out casually')]},
  {id:'p5b',giver:'H',prep:'h5',after:['h1','h3'],title:'Wheels of Fortune',area:'Port Lands',pay:1000,desc:'Steal an armoured van from the Port Lands yard — it\'ll get you through the police lines.',steps:[
    ST.steal(parkedAt(1700,1180,2,0x3b473c),'Steal the armoured van in the Port Lands',{heat:1}),ST.escape(1,'Lose the cops'),ST.deliver(PLACES.hideout,9,'Bring it to the hideout',60)]},
  {id:'h5',giver:'H',heist:true,after:['h2','h4','p5a','p5b'],title:'The Bay Street Reserve',area:'King & Bay',pay:60000,alarmStars:5,
    desc:'The big score. Drive the armoured van to King & Bay, drill the main vault, clear it out and survive a five-star escape.',steps:[
    ST.car('Get a car'),ST.goDoor('bayst',16,'Drive to the Bay Street Reserve',{car:true}),ST.goIn('bayst','Storm in (E at the yellow door)'),
    done(ST.inspot('drill',2.2,22,'Drill the main vault',{stars:4,alarmMsg:'ALARM — POLICE INBOUND',done:vaultOpen}),'THE VAULT IS OPEN'),
    ST.loot(5,'Clear out the vault'),ST.leave('Fight your way out'),ST.car('Get in a car'),ST.escape(5,'Lose the cops'),ST.go(PLACES.hideout,10,'Get to the hideout',{car:true})]},
];
const GIVERS={
  R:{name:'Rosie',col:0xff6fae,css:'#ff6fae',at:PLACES.kensington},
  D:{name:'Dez',col:0xffa23a,css:'#ffa23a',at:PLACES.stlawrence},
  H:{name:'The Architect',col:0xffd23f,css:'#ffd23f',at:PLACES.harbour}};
for(const k in GIVERS){const g=GIVERS[k];g.beacon=beacon(g.col,1.5,16);g.beacon.position.set(g.at[0],0,g.at[1]);}
const tgtBeacon=beacon(0x3fe0ff,2.6,42);
// --- requirements: what a mission needs before you can start it
const fmtH=h=>{h=((h%24)+24)%24;return String(floor(h)).padStart(2,'0')+':'+String(floor((h%1)*60)).padStart(2,'0');};
const mById=id=>MISSIONS.find(q=>q.id===id);
function reqList(m){const R=[];
  if(m.req){const n=SAVE.done.filter(id=>{const q=mById(id);return q&&!q.prep;}).length;R.push({t:`Complete ${m.req} missions (${min(n,m.req)}/${m.req})`,ok:n>=m.req});}
  for(const a of[].concat(m.after||[])){const q=mById(a);R.push({t:(q&&q.prep?'Prep: ':'Finish: ')+(q?q.title:a),ok:SAVE.done.includes(a)});}
  if(m.hours){const [a,b]=m.hours,h=G.time,ok=a<b?h>=a&&h<b:h>=a||h<b;R.push({t:`${m.night?'Night only':'Business hours'}: ${fmtH(a)}–${fmtH(b)} (it's ${fmtH(h)} — press T to skip an hour)`,ok,soft:true});}
  if(G.heat>0)R.push({t:'Lose your wanted level',ok:false,soft:true});
  return R;}
const unlockedM=m=>reqList(m).every(r=>r.ok||r.soft);
const readyM=m=>reqList(m).every(r=>r.ok);
const nextFor=k=>{for(const m of MISSIONS)if(m.giver===k&&!SAVE.done.includes(m.id)&&unlockedM(m))return m;return null;};

// --- Missions & Heists board (J)
const boardEl=$('board'),blistEl=$('blist');let boardTab='s';
function storyHTML(){const cur=__late.storyNext();
  return __late.CHAPTERS.map(ch=>{const fin=ch.main.every(id=>SAVE.done.includes(id)),live=cur&&cur.ch===ch,seen=fin||live;
    const li=(id,side)=>{const m=mById(id),d=SAVE.done.includes(id);return `<li class="${d?'y':''}">${d?'✓':'○'} ${m.title}${side?' <i>(side job)</i>':''}</li>`;};
    return `<div class="bc ${fin?'done':live?'live':'lock'}"><div class="bh"><b>CHAPTER ${ch.n} · ${seen?ch.title:'???'}</b><span class="bs">${fin?'DONE ✓':live?'NOW PLAYING':'LOCKED'}</span></div>
      <div class="bd">${seen?ch.sum:'Keep playing to find out what happens.'}</div>${seen?`<ul>${ch.main.map(id=>li(id)).join('')}${(ch.side||[]).map(id=>li(id,1)).join('')}</ul>`:''}
      ${live?`<div class="bp">▶ ${__late.storyObjective().text}</div>`:''}</div>`;}).join('')+(SAVE.storyDone?'<div class="bd">You finished the story. Every job can still be replayed from the other tabs.</div>':'');}
function boardHTML(){
  if(boardTab==='s')return storyHTML();
  const list=MISSIONS.filter(m=>boardTab==='h'?(m.heist||m.prep):!(m.heist||m.prep));
  const order=m=>MS&&MS.def===m?0:readyM(m)&&!SAVE.done.includes(m.id)?1:unlockedM(m)&&!SAVE.done.includes(m.id)?2:SAVE.done.includes(m.id)?4:3;
  return list.slice().sort((a,b)=>order(a)-order(b)).map(m=>{
    const g=GIVERS[m.giver],dn=SAVE.done.includes(m.id),live=MS&&MS.def===m,R=reqList(m),ok=R.every(r=>r.ok),unl=R.every(r=>r.ok||r.soft);
    const st=live?['IN PROGRESS','live']:dn?['DONE ✓','done']:ok?['READY','ready']:unl?['WAITING','wait']:['LOCKED','lock'];
    let prog='';if(live)prog=`<div class="bp">Step ${MS.i+1} of ${m.steps.length}: ${MS.def.steps[MS.i].lab}</div>`;
    const preps=MISSIONS.filter(q=>q.prep===m.id);if(preps.length)prog+=`<div class="bp">Prep missions: ${preps.filter(q=>SAVE.done.includes(q.id)).length}/${preps.length} done</div>`;
    const steps=`<details><summary>${m.steps.length} steps</summary><ol>${m.steps.map(s=>`<li>${s.lab}</li>`).join('')}</ol></details>`;
    return `<div class="bc ${st[1]}"><div class="bh"><b>${m.prep?'PREP · ':m.heist?'HEIST · ':''}${m.title}</b><span class="bs">${st[0]}</span></div>
      <div class="bm"><i style="background:${g.css}">${m.giver}</i>${g.name} · ${m.area||''} · <b>$${m.pay.toLocaleString()}</b>${m.heist?' + loot':''}</div>
      <div class="bd">${m.desc||''}</div>${R.length?`<ul>${R.map(r=>`<li class="${r.ok?'y':'n'}">${r.ok?'✓':'✗'} ${r.t}</li>`).join('')}</ul>`:''}${prog}${steps}
      <div class="bb">${live?`<button data-q="${m.id}">Quit mission</button>`:`<button data-s="${m.id}" ${ok&&!MS?'':'disabled'}>${dn?'Replay':'Start'}</button>`}<button data-w="${m.id}">Waypoint to ${g.name}</button></div></div>`;}).join('')||'<div class="bd">Nothing here yet.</div>';}
function drawBoard(){blistEl.innerHTML=boardHTML();for(const b of boardEl.querySelectorAll('.tabs button'))b.classList.toggle('on',b.dataset.tab===boardTab);
  const hs=MISSIONS.filter(m=>m.heist),ms=MISSIONS.filter(m=>!m.heist&&!m.prep);$('bsum').textContent=`Missions ${ms.filter(m=>SAVE.done.includes(m.id)).length}/${ms.length} · Heists ${hs.filter(m=>SAVE.done.includes(m.id)).length}/${hs.length}`;}
function openBoard(){G.boardOpen=true;boardEl.style.display='block';if(document.pointerLockElement)document.exitPointerLock();drawBoard();}
function closeBoard(noLock){G.boardOpen=false;boardEl.style.display='none';if(!TEST&&!noLock&&G.running)canvas.requestPointerLock?.();}
boardEl.addEventListener('click',e=>{e.stopPropagation();const t=e.target;
  if(t.dataset.tab){boardTab=t.dataset.tab;drawBoard();return;}
  if(t.id==='bclose'){closeBoard();return;}
  if(t.dataset.q){failMission('You quit');drawBoard();return;}
  if(t.dataset.w){const m=mById(t.dataset.w),g=GIVERS[m.giver];__late.setWaypoint(g.at[0],g.at[1],g.name);closeBoard();flash('WAYPOINT SET',1.4);return;}
  if(t.dataset.s){const m=mById(t.dataset.s);if(!readyM(m)||MS)return;closeBoard();startFromBoard(m);}});
function startFromBoard(m){const g=GIVERS[m.giver];G.busy=true;$('fade').style.opacity=1;
  setTimeout(()=>{if(__gs.IN)__late.exitInterior(true);__late.offWater();const c=G.car;
    if(c){const s=curbSpot(g.at[0],g.at[1],'park');c.x=s.x;c.z=s.z;c.th=s.th;c.vx=c.vz=c.w=c.speed=0;__gs.FX=c.x;__gs.FZ=c.z;player.x=c.x;player.z=c.z;}
    else{player.x=g.at[0]+2;player.z=g.at[1];player.y=0;__gs.FX=player.x;__gs.FZ=player.z;}
    __late.camT.set(__gs.FX,1.6,__gs.FZ);streamTick(__gs.FX,__gs.FZ,true);for(const p of peds)if(p!==player&&!p.ins)placePed(p,12,160);
    $('fade').style.opacity=0;G.busy=false;startMission(m);},650);}
// --- tracker: the current mission's steps, top right
const trackEl=$('track');let trackTxt='';
function drawTracker(){let h='';
  if(MS){const m=MS.def;h=`<div class="tt">${m.heist?'💰 ':m.prep?'🧰 ':'⭐ '}${m.title}</div>`+m.steps.map((s,i)=>i<MS.i?`<div class="ts d">✓ ${s.lab}</div>`:i===MS.i?`<div class="ts c">▶ ${s.text(MS)}</div>`:`<div class="ts">○ ${s.lab}</div>`).join('')+
    (MS.take?`<div class="tk">Take: $${MS.take.toLocaleString()}</div>`:'')+`<div class="th">J — story & missions</div>`;}
  else if(!SAVE.storyDone&&G.started){const o=__late.storyObjective();if(o)h=`<div class="tt">📖 Chapter ${o.ch.n} · ${o.ch.title}</div><div class="ts c">▶ ${o.text}</div><div class="th">J — story & missions</div>`;}
  if(h!==trackTxt){trackTxt=h;trackEl.innerHTML=h;trackEl.style.display=h?'block':'none';}}
let MS=null;
function startMission(def){const sc=def.id+'_in';if(__late.CUTS_ON&&__late.SCENES[sc]&&!SAVE.seen.includes(sc)&&!__late.CUT){G.job=null;__late.playCut(sc,()=>beginMission(def));return;}beginMission(def);}
function beginMission(def){G.job=null;MS={def,i:-1,refs:{},timer:0};flash((def.heist?'HEIST: ':'')+def.title.toUpperCase(),3);nextStep();}
function nextStep(){MS.i++;MS.timer=0;if(MS.i>=MS.def.steps.length){passMission();return;}const st=MS.def.steps[MS.i];if(st.init)st.init(MS);}
function cleanupMission(){for(const c of Object.values(MS.refs))if(c&&c.T){c.keep=0;c.flee=0;c.copCar=c.copCar&&c!==G.car?1:0;c.spawned=true;}MS=null;tgtBeacon.visible=false;G.missionCd=4;G.job=null;G.jobWait=14;}
function passMission(){const d=MS.def,tot=d.pay+(MS.take||0);__late.feedEvt('mission',d);G.cash+=tot;if(!SAVE.done.includes(d.id))SAVE.done.push(d.id);
  flash((d.heist?'HEIST':d.prep?'PREP':'MISSION')+' PASSED  +$'+tot.toLocaleString(),4);__late.thud(.25);cleanupMission();__gs.saveGame();
  const sc=d.id+'_out';if(__late.SCENES[sc]&&!SAVE.seen.includes(sc))__late.queueCut(sc,d.chain?()=>{const n=mById(d.chain);if(n&&!MS)startMission(n);}:null);
  const unlocked=Object.keys(GIVERS).filter(k=>nextFor(k)&&nextFor(k).heist&&k==='H');if(unlocked.length&&d.giver!=='H')G.note='New heist available from The Architect at Harbourfront',G.noteT=8;}
function failMission(why){flash('MISSION FAILED',2.6);G.note=why+' — go back to the marker to try again';G.noteT=6;cleanupMission();}
function stepMission(dt){
  G.missionCd=(G.missionCd||0)-dt;G.missionHint='';
  G.saveT=(G.saveT||0)+dt;if(G.saveT>8){G.saveT=0;__gs.saveGame();}
  for(const k in GIVERS){const g=GIVERS[k];g.beacon.visible=!MS&&!!nextFor(k);}
  if(!MS){
    if(G.noteT>0){G.noteT-=dt;const t='📣 '+G.note;if($('job').textContent!==t)$('job').textContent=t;}
    for(const k in GIVERS){const g=GIVERS[k],m=nextFor(k);if(!m)continue;const d=hypot(__gs.FX-g.at[0],__gs.FZ-g.at[1]);
      const ok=readyM(m),why=reqList(m).find(r=>!r.ok);
      if(d<16)G.missionHint=ok?`${g.name}: “${m.title}” — walk into the marker`:`${g.name}: “${m.title}” — ${why?why.t:''}`;
      if(d<3.4&&ok&&G.missionCd<=0&&!G.busy&&!__gs.IN)startMission(m);}
    return;
  }
  const st=MS.def.steps[MS.i];
  if(MS.timer>0){MS.timer-=dt;if(MS.timer<=0){failMission('Out of time');return;}}
  if(st.needCar&&MS.refs.car&&MS.refs.car.hp<=0){failMission('The car was wrecked');return;}
  const r=st.tick(MS,dt);
  if(typeof r==='string'){failMission(r.slice(5));return;}
  if(r){if(st.done)flash(st.done,2);nextStep();return;}
  const t=st.target?st.target(MS):null;tgtBeacon.visible=!!t;if(t)tgtBeacon.position.set(t[0],0,t[1]);MS.tp=t;
  tgtBeacon.scale.x=tgtBeacon.scale.z=1+sin(G.sigT*5)*.1;
  let txt=`${MS.def.heist?'💰':'⭐'} ${MS.def.title}: ${st.text(MS)}`;
  if(MS.timer>0){const s=MS.timer|0;txt+=` — ${s/60|0}:${String(s%60).padStart(2,'0')}`;}
  if($('job').textContent!==txt)$('job').textContent=txt;
}
if(TEST)window.__fail=()=>{if(MS)failMission('test');};
if(TEST)window.__ms=()=>MS;
if(TEST)window.__mission=id=>{const m=MISSIONS.find(q=>q.id===id);startMission(m);return m.title;};

export { GIVERS, MISSIONS, MS, PLACES, SAVE, SAVE_KEY, ST, blistEl, closeBoard, done, drawTracker, mById, nextFor, nextStep, openBoard, ptW, readyM, reqList, spawnFlee, startMission, stepMission };
