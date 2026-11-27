// Six City — casino. One of the game's modules; they load in numbered order (src/game/index.js).
import './14-interiors.js';
import * as THREE from 'three';
import * as CZ from '../casino.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { __gs, __late, later } from './shared.js';
import { $, MAP, PI, R, TEST, canvas, clamp, cv, floor, hypot, max, min, rnd, round, rr, scene } from './01-core.js';
import { addCircle, chunkedInstanced, flat, inPoly, mat4, polyCen, solidAt } from './04-world.js';
import { STRM, cellDist, curbSpot, volsOf } from './05-landmarks.js';
import { mkCar } from './06-cars.js';
import { peds } from './07-people.js';
import { G, flash, player } from './08-input.js';
import { SAVE } from './11-missions.js';
import { PANEL, barberPanel, closePanel, clothesPanel, openPanel } from './13-homes.js';
import { DOOR, DOORS, enterInterior, exitInterior, raiseAlarm, smashCase } from './14-interiors.js';
later({FOOD:()=>FOOD,MARQ:()=>MARQ,closeGame:()=>closeGame,nearGame:()=>nearGame,stepCasinoHud:()=>stepCasinoHud}); // for earlier modules, read when called

/* ============================== The Lucky Six: playing the games ==============================
   The rules live in src/casino.js (unit-tested). This is the table UI: chips, bets, cards, the wheel. 1 chip = $1, bought
   and cashed at the cage. Games need your weapon away; guards are there for anyone who forgets. */
if(!TEST)G.chips=SAVE.chips||0;else G.chips=5000;
const czEl=$('cz'),chipsEl=$('chipsHud');
const CZS={bet:25,bj:new CZ.Blackjack(),bjPaid:true,bjMsg:'',rl:{bets:[],spinning:false,last:null,hist:[],msg:''},sl:{reels:['7','7','7'],spinning:false,msg:''},wh:{spinning:false,msg:'',rot:0}};
const BETS=[10,25,100,500,1000,5000];
const fmt=n=>Math.round(n).toLocaleString();
const czCard=(c,hide)=>hide?'<span class="card back"></span>':`<span class="card${c.s==='♥'||c.s==='♦'?' red':''}">${c.r}<small>${c.s}</small></span>`;
function czBetRow(){return `<div class="bets">Bet ${BETS.map(b=>`<button data-bet="${b}" class="${CZS.bet===b?'on':''}"${b>G.chips?' disabled':''}>◆ ${fmt(b)}</button>`).join('')}</div>`;}
function czPay(n){G.chips+=n;}
function czTake(n){if(G.chips<n){flash('NOT ENOUGH CHIPS — VISIT THE CAGE',1.6);return false;}G.chips-=n;return true;}
function openGame(kind){if(G.gameOpen)return;if(__late.ARM.w>0){flash('PUT YOUR WEAPON AWAY',1.6);return;}
  G.gameOpen=kind;G.uiOpen=true;czEl.style.display='block';if(document.pointerLockElement)document.exitPointerLock();
  if(kind==='blackjack'&&CZS.bj.state==='done')CZS.bjMsg='';czRender();}
function closeGame(noLock){if(!G.gameOpen)return;
  if(G.gameOpen==='roulette'&&CZS.rl.bets.length&&!CZS.rl.spinning){for(const b of CZS.rl.bets)czPay(b.amount);CZS.rl.bets=[];} // chips left on the layout come back
  G.gameOpen=null;G.uiOpen=false;czEl.style.display='none';__gs.saveGame();if(!TEST&&!noLock)canvas.requestPointerLock?.();}
function czRender(){const k=G.gameOpen;if(!k)return;
  const title={blackjack:'BLACKJACK',roulette:'AMERICAN ROULETTE',slots:'SLOTS',wheel:'LUCKY WHEEL'}[k];
  let h=`<div class="czh"><b>THE LUCKY SIX</b><span>${title}</span><i>◆ ${fmt(G.chips)}</i><button data-act="close">✕</button></div>`;
  if(k==='blackjack')h+=czBJ();else if(k==='roulette')h+=czRL();else if(k==='slots')h+=czSL();else h+=czWH();
  czEl.innerHTML=h;}
// --- blackjack
function czBJ(){const g=CZS.bj,st=g.state,live=st==='player'||st==='insurance';let h='';
  if(g.hands.length){const dv=CZ.handValue(live?[g.dealer[0]]:g.dealer).total;
    h+=`<div class="row"><em>Dealer ${live?'':'· '+dv}</em><div class="cards">${g.dealer.map((c,i)=>czCard(c,live&&i===1)).join('')}</div></div>`;
    h+=`<div class="hands">${g.hands.map((x,i)=>{const v=CZ.handValue(x.cards),r=g.results&&g.results[i];
      return `<div class="hand${st==='player'&&i===g.active?' act':''}"><div class="cards">${x.cards.map(c=>czCard(c)).join('')}</div><em>${v.soft&&v.total<21?'soft ':''}${v.total} · ◆${fmt(x.bet)}${r?' · <b class="'+r.r+'">'+{win:'WIN',lose:'LOSE',push:'PUSH',bust:'BUST',blackjack:'BLACKJACK',surrender:'SURRENDERED'}[r.r]+'</b>':''}</em></div>`;}).join('')}</div>`;}
  else h+=`<div class="intro">Blackjack pays 3 to 2 · Dealer stands on soft 17 · Insurance pays 2 to 1<br>Double on any two cards · Split up to four hands · Late surrender</div>`;
  if(CZS.bjMsg)h+=`<div class="msg">${CZS.bjMsg}</div>`;
  if(st==='insurance')h+=`<div class="acts"><button data-act="ins1"${G.chips<g.hands[0].bet/2?' disabled':''}>Insurance ◆${fmt(g.hands[0].bet/2)}</button><button data-act="ins0">No insurance</button></div>`;
  else if(st==='player'){const b=g.hand.bet;h+=`<div class="acts"><button data-act="hit">Hit</button><button data-act="stand">Stand</button>`+
    `<button data-act="double"${!g.canDouble()||G.chips<b?' disabled':''}>Double</button><button data-act="split"${!g.canSplit()||G.chips<b?' disabled':''}>Split</button>`+
    `<button data-act="surrender"${!g.canSurrender()?' disabled':''}>Surrender</button></div>`;}
  else h+=czBetRow()+`<div class="acts"><button data-act="deal" class="go"${G.chips<CZS.bet?' disabled':''}>Deal ◆${fmt(CZS.bet)}</button></div>`;
  return h;}
function czBJDone(){const g=CZS.bj;if(g.state!=='done'||CZS.bjPaid)return;CZS.bjPaid=true;czPay(g.payout);const net=g.payout-g.staked;
  CZS.bjMsg=net>0?`You win ◆${fmt(net)}`:net<0?`You lose ◆${fmt(-net)}`:'Push — your bet comes back';if(g.insuranceReturn)CZS.bjMsg+=' · insurance paid';if(g.shuffled)CZS.bjMsg+=' · new shoe';
  if(net>0)__late.click();if(net>=1000)__late.feedEvt('casino');SAVE.stats.bjHands=(SAVE.stats.bjHands||0)+1;}
function czBJAct(a){const g=CZS.bj;
  if(a==='deal'){if(!czTake(CZS.bet))return;CZS.bjPaid=false;CZS.bjMsg='';g.deal(CZS.bet);}
  else if(a==='ins1'){if(!czTake(g.hands[0].bet/2))return;g.insure(true);}
  else if(a==='ins0')g.insure(false);
  else if(a==='hit')g.hit();else if(a==='stand')g.stand();
  else if(a==='double'){if(!g.canDouble()||!czTake(g.hand.bet))return;g.double();}
  else if(a==='split'){if(!g.canSplit()||!czTake(g.hand.bet))return;g.split();}
  else if(a==='surrender')g.surrender();
  czBJDone();}
// --- roulette
const RLB=[['red','Red'],['black','Black'],['odd','Odd'],['even','Even'],['low','1–18'],['high','19–36'],['dozen:1','1st 12'],['dozen:2','2nd 12'],['dozen:3','3rd 12'],['column:1','Col 1'],['column:2','Col 2'],['column:3','Col 3']];
function czRL(){const R=CZS.rl,on=(t,v)=>R.bets.filter(b=>b.type===t&&String(b.value??'')===String(v??'')).reduce((a,b)=>a+b.amount,0);
  const num=p=>{const c=CZ.pocketColor(p),s=on('straight',p);return `<button data-rl="straight:${p}" class="n ${c}${R.last===p?' hit':''}">${p}${s?`<i>${fmt(s)}</i>`:''}</button>`;};
  let h=`<div class="rlres">${R.last?`<span class="ball ${CZ.pocketColor(R.last)}">${R.last}</span>`:'<span class="ball">–</span>'}<div class="hist">${R.hist.map(p=>`<span class="${CZ.pocketColor(p)}">${p}</span>`).join('')}</div></div>`;
  h+=`<div class="board"><div class="zeros">${num('0')}${num('00')}</div><div class="nums">`;
  for(let c=0;c<12;c++)for(let r=2;r>=0;r--)h+=num(String(c*3+r+1));
  h+=`</div></div><div class="outs">${RLB.map(([k,l])=>{const [t,v]=k.split(':'),s=on(t,v);return `<button data-rl="${k}">${l}${s?`<i>${fmt(s)}</i>`:''}</button>`;}).join('')}</div>`;
  const tot=R.bets.reduce((a,b)=>a+b.amount,0);if(R.msg)h+=`<div class="msg">${R.msg}</div>`;
  h+=czBetRow()+`<div class="acts"><button data-act="rlclear"${!tot||R.spinning?' disabled':''}>Clear</button><button data-act="rlspin" class="go"${!tot||R.spinning?' disabled':''}>${R.spinning?'Spinning…':'Spin · ◆'+fmt(tot)+' on the table'}</button></div>`;
  return h;}
function czRLAct(a,v){const R=CZS.rl;if(R.spinning)return;
  if(v){const [t,val]=v.split(':');if(!czTake(CZS.bet))return;const ex=R.bets.find(b=>b.type===t&&String(b.value??'')===String(val??''));if(ex)ex.amount+=CZS.bet;else R.bets.push({type:t,value:val,amount:CZS.bet});R.msg='';return;}
  if(a==='rlclear'){for(const b of R.bets)czPay(b.amount);R.bets=[];return;}
  if(a==='rlspin'&&R.bets.length){R.spinning=true;R.msg='No more bets…';const res=CZ.spinRoulette();let n=0;
    const tick=()=>{if(G.gameOpen&&++n<18){R.last=CZ.POCKETS[floor(rnd()*38)];czRender();setTimeout(tick,60+n*12);return;} // walking away settles the spin at once
      R.last=res;R.hist.unshift(res);R.hist.length=min(R.hist.length,12);const ret=R.bets.reduce((a,b)=>a+CZ.roulettePayout(b,res),0),staked=R.bets.reduce((a,b)=>a+b.amount,0);
      czPay(ret);R.bets=[];R.spinning=false;R.msg=`${res} ${CZ.pocketColor(res).toUpperCase()} · `+(ret>0?`you collect ◆${fmt(ret)}${ret>staked?' (+'+fmt(ret-staked)+')':''}`:`the house takes ◆${fmt(staked)}`);if(ret>staked)__late.click();czRender();};
    tick();}}
// --- slots
function czSL(){const S=CZS.sl;let h=`<div class="reels">${S.reels.map(s=>`<span>${s}</span>`).join('')}</div>`;
  h+=`<div class="pay">${CZ.SLOT_SYMBOLS.slice().reverse().map(x=>`<span>${x.s}${x.s}${x.s} <b>×${x.three}</b></span>`).join('')}<span>🍒🍒 <b>×2</b></span><span>🍒 first reel <b>×1</b></span></div>`;
  if(S.msg)h+=`<div class="msg">${S.msg}</div>`;
  return h+czBetRow()+`<div class="acts"><button data-act="slspin" class="go"${S.spinning||G.chips<CZS.bet?' disabled':''}>${S.spinning?'Spinning…':'Spin ◆'+fmt(CZS.bet)}</button></div>`;}
function czSLAct(){const S=CZS.sl;if(S.spinning||!czTake(CZS.bet))return;S.spinning=true;S.msg='';const res=CZ.spinSlots(),bet=CZS.bet;let n=0;
  const tick=()=>{if(!G.gameOpen){S.spinning=false;czPay(bet*CZ.slotMultiplier(res));return;}n++;S.reels=S.reels.map((s,i)=>n>8+i*5?res[i]:CZ.spinReel());czRender();
    if(n<18){setTimeout(tick,55);return;}const m=CZ.slotMultiplier(res);czPay(bet*m);S.spinning=false;if(m>=25)__late.feedEvt('casino');S.msg=m>1?`WIN ◆${fmt(bet*m)}`:m===1?'Bet back':'No win';if(m>=25)flash('JACKPOT!',2);if(m>1)__late.click();czRender();};
  tick();}
// --- lucky wheel: one free spin per in-game day
function czWheelCanvas(){const c=document.createElement('canvas');c.width=c.height=520;const g=c.getContext('2d'),N=CZ.WHEEL.length,R=250;g.translate(260,260);
  CZ.WHEEL.forEach((s,i)=>{const a0=(i/N-.25)*2*PI-PI/N,a1=a0+2*PI/N;g.fillStyle=s.kind==='car'?'#ffd23f':s.kind==='cash'?'#2fbf71':s.kind==='mystery'?'#9b5de5':i%2?'#c8102e':'#1d1d24';
    g.beginPath();g.moveTo(0,0);g.arc(0,0,R,a0,a1);g.closePath();g.fill();g.strokeStyle='#ffd23f';g.lineWidth=2;g.stroke();
    g.save();g.rotate((a0+a1)/2);g.fillStyle=s.kind==='car'?'#1d1d24':'#fff';g.font='800 17px Inter, sans-serif';g.textAlign='right';g.textBaseline='middle';g.fillText(s.label,R-14,0);g.restore();});
  g.fillStyle='#ffd23f';g.beginPath();g.arc(0,0,34,0,7);g.fill();g.fillStyle='#1d1d24';g.font='900 15px Inter';g.textAlign='center';g.textBaseline='middle';g.fillText('LUCKY',0,-6);g.fillText('SIX',0,10);return c;}
let czWC=null;
function czWH(){const W=CZS.wh,left=(SAVE.wheelAt||0)+CZ.WHEEL_COOLDOWN_MS-Date.now();
  let h=`<div class="wheel"><div class="ptr">▼</div><img id="czwimg" style="transform:rotate(${W.rot}deg)"></div>`;if(W.msg)h+=`<div class="msg">${W.msg}</div>`;
  h+=`<div class="acts"><button data-act="whspin" class="go"${W.spinning||left>0?' disabled':''}>${W.spinning?'Spinning…':left>0?'Next free spin in '+floor(left/60000)+':'+String(floor(left/1000)%60).padStart(2,'0'):'Spin — free'}</button></div>`;
  setTimeout(()=>{const im=$('czwimg');if(im){czWC=czWC||czWheelCanvas().toDataURL();im.src=czWC;}},0);return h;}
function czWHAct(){const W=CZS.wh;if(W.spinning||(SAVE.wheelAt||0)+CZ.WHEEL_COOLDOWN_MS>Date.now())return;
  const k=CZ.spinWheel(),N=CZ.WHEEL.length,target=W.rot-(W.rot%360)+360*5+(360-k*360/N);W.spinning=true;W.msg='';SAVE.wheelAt=Date.now();__gs.saveGame();
  const from=W.rot,t0=performance.now(),dur=4200;
  const step=now=>{const t=min(1,(now-t0)/dur),e=1-Math.pow(1-t,3);W.rot=from+(target-from)*e;const im=$('czwimg');if(im)im.style.transform=`rotate(${W.rot}deg)`;
    if(__gs.IN&&__gs.IN.wheel)__gs.IN.wheel.rotation.z=-W.rot*PI/180;
    if(t<1){requestAnimationFrame(step);return;}W.spinning=false;W.msg='You won: '+czPrize(CZ.WHEEL[k]);__late.click();czRender();};
  requestAnimationFrame(step);czRender();}
function czPrize(s){
  if(s.kind==='chips'){czPay(s.amount);return s.label;}
  if(s.kind==='cash'){G.cash+=s.amount;return s.label+' cash';}
  if(s.kind==='armour'){G.armor=100;return 'full body armour';}
  if(s.kind==='car'){const d=__gs.IN&&__gs.IN.door;if(d){const q=curbSpot(d.at[0]+d.n[0]*6,d.at[1]+d.n[1]*6,'park');if(q){const c=mkCar(4,q.x,q.z,q.th,'parked',0xd4af37);c.spawned=false;c.keep=1;}}flash('YOUR SUPERCAR IS PARKED OUTSIDE',2.6);return 'a gold Supercar — it\'s parked outside';}
  const r=rnd(); // mystery
  if(r<.15){G.cash+=15000;return 'Mystery: $15,000!';}
  if(r<.5&&!__late.ARM.own[4]){__late.ARM.own[4]=true;SAVE.guns=__late.ARM.own.map((v,k)=>v?k:-1).filter(k=>k>=0);return 'Mystery: a rifle (added to your weapons)';}
  czPay(750);return 'Mystery: 750 chips';}
czEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.bet){CZS.bet=+b.dataset.bet;czRender();return;}
  const a=b.dataset.act;if(a==='close'){closeGame();return;}
  const k=G.gameOpen;if(k==='blackjack')czBJAct(a);else if(k==='roulette')czRLAct(a,b.dataset.rl);else if(k==='slots'&&a==='slspin')czSLAct();else if(k==='wheel'&&a==='whspin')czWHAct();
  czRender();});
// the cage: buy and cash out chips
function cagePanel(){openPanel('THE LUCKY SIX · CAGE',`Chips ◆${fmt(G.chips)} · Cash $${fmt(G.cash)}`,[100,1000,10000].map(n=>({label:`Buy ◆${fmt(n)} chips — $${fmt(n)}`,off:G.cash<n,fn:()=>{G.cash-=n;G.chips+=n;__late.click();__gs.saveGame();cagePanel();return 'keep';}}))
  .concat([{label:`Cash out all chips — $${fmt(G.chips)}`,off:G.chips<=0,fn:()=>{G.cash+=G.chips;flash('+$'+fmt(G.chips),1.6);G.chips=0;__late.click();__gs.saveGame();}},{label:'Leave',fn:()=>{}}]));}
function nearGame(){if(!__gs.IN||!__gs.IN.games)return null;let best=null,bd=1.9;for(const g of __gs.IN.games){const d=hypot(player.x-g.x,player.z-g.z);if(d<bd){bd=d;best=g;}}return best;}
function stepCasinoHud(){const show=!!(__gs.IN&&__gs.IN.games);chipsEl.style.display=show?'block':'none';if(show){const t='◆ '+fmt(G.chips);if(chipsEl.textContent!==t)chipsEl.textContent=t;}}

// what each kind of place serves at the register: [name, price, health]
const FOOD={
  mcd:[['McNuggets',6,25],['Big Mac combo',12,55],['McCafé coffee',2,8]],tims:[['Double-Double',2,8],['Timbits (10)',3,15],["Farmer's Wrap",5,30]],sbux:[['Pike Place',3,8],['Cake Pop',3,12],['Breakfast sandwich',7,30]],
  cafe:[['Espresso',3,8],['Pastry',4,15],['Sandwich',9,35]],bakery:[['Croissant',3,12],['Butter tart',4,15],['Sandwich',8,35]],
  pizza:[['Slice',4,20],['Panzerotto',9,40],['Large pepperoni',16,75]],subway:[['Cookies',3,10],['6-inch',8,35],['Footlong',12,60]],
  qsr:[['Fries',4,15],['Combo #1',12,50],['Family meal',22,90]],waffle:[['Hash browns',3,15],['Waffle',6,30],['All-Star Breakfast',11,65]],
  sushi:[['Miso soup',4,12],['Maki combo',16,50],['Omakase',45,100]],asian:[['Spring rolls',6,20],['Noodles',14,50],['Feast for one',24,85]],
  pub:[['Wings',13,35],['Burger & fries',19,60],['Fish & chips',21,70]],restaurant:[['Soup',9,25],['Pasta',22,60],['Three courses',48,100]],
  conv:[['Chips',3,8],['Energy drink',4,12],['Sandwich',7,28]],grocery:[['Fruit',3,10],['Deli sandwich',8,32],['Rotisserie chicken',13,55]]};
const GUNSHOP=[[2,1200],[3,1800],[4,4500],[5,7500]],ARMOUR_PRICE=600;
function serving(){if(!__gs.IN||__gs.IN.alarm)return false;return peds.some(p=>p.ins&&p.ins.role==='staff'&&p.state!=='dead'&&p.state!=='down'&&p.state!=='flee');}
function foodPanel(){const M=FOOD[__gs.IN.T];openPanel(__gs.IN.name.toUpperCase(),`What can I get you? You have $${G.cash.toLocaleString()}.`,
  M.map(([n,pr,hp])=>({label:`${n} — $${pr} <small style="opacity:.6">+${hp} health</small>`,off:G.cash<pr,fn:()=>{G.cash-=pr;G.hp=min(100,G.hp+hp);SAVE.stats.meals=(SAVE.stats.meals||0)+1;__late.thud(.15);flash('+'+hp+' HEALTH',1.2);}})).concat([{label:'Nothing, thanks',fn:()=>{}}]));}
function gunPanel(){const o=GUNSHOP.map(([i,pr])=>({label:__late.ARM.own[i]?`${__late.WEAPONS[i].n} — owned`:`${__late.WEAPONS[i].n} — $${pr.toLocaleString()}`,off:__late.ARM.own[i]||G.cash<pr,
    fn:()=>{G.cash-=pr;__late.ARM.own[i]=true;SAVE.guns=__late.ARM.own.map((v,k)=>v?k:-1).filter(k=>k>=0);__late.selectWeapon(i);flash(__late.WEAPONS[i].n.toUpperCase()+' BOUGHT',1.6);__late.click();__gs.saveGame();}}));
  const full=(G.armor||0)>=100;o.push({label:full?'Body armour — full':`Body armour — $${ARMOUR_PRICE}`,off:full||G.cash<ARMOUR_PRICE,fn:()=>{G.cash-=ARMOUR_PRICE;G.armor=100;flash('+ ARMOUR',1.4);__late.click();__gs.saveGame();}});
  o.push({label:'Just looking',fn:()=>{}});openPanel('BULLET BARN',`Cash only, no questions. You have $${G.cash.toLocaleString()}.`,o);}
// E: doors, exits and smashing cases come before talking to people
const interact0=__gs.interact;
__gs.interact=function(){if(PANEL){closePanel();return;}if(G.busy||G.boardOpen)return;
  if(__gs.IN){const ex=__gs.IN.spots.exit;if(hypot(player.x-ex[0],player.z-ex[1])<3.2){exitInterior();return;}
    for(const c of __gs.IN.cases)if(!c.broken&&hypot(player.x-c.x,player.z-c.z)<1.9){smashCase(c);return;}
    const gm=nearGame();if(gm&&!(gm.kind==='cashier'&&__late.ARM.w>0)){if(gm.kind==='cashier'){if(__late.ARM.w>0)return;cagePanel();}else openGame(gm.kind);return;}
    const rg=__gs.IN.spots.register,atReg=rg&&hypot(player.x-rg[0],player.z-rg[1])<2.2;
    if(atReg&&/^(fashion|shoes|barber|beauty)$/.test(__gs.IN.T)&&__late.ARM.w===0){if(!serving())flash("NOBODY'S SERVING",1.4);else if(/^(barber|beauty)$/.test(__gs.IN.T))barberPanel(__gs.IN.name);else clothesPanel(__gs.IN.T,__gs.IN.name);return;}
    if(atReg&&__gs.IN.T==='guns'){if(serving())gunPanel();else flash("NOBODY'S SERVING",1.4);return;}
    if(atReg&&FOOD[__gs.IN.T]&&__late.ARM.w===0){if(serving())foodPanel();else flash("NOBODY'S SERVING",1.4);return;}
    if(rg&&!__gs.IN.robbed&&__late.ARM.w>0&&hypot(player.x-rg[0],player.z-rg[1])<2.2){__gs.IN.robbed=true;const big=__gs.IN.door&&__gs.IN.door.theme==='casino',v=big?3000+floor(rnd()*6000):150+floor(rnd()*750);G.cash+=v;flash('+$'+v.toLocaleString(),1.4);raiseAlarm(big?3:2,big?'CAGE ROBBED — GUARDS!':'ROBBERY!');SAVE.stats.robbed=(SAVE.stats.robbed||0)+1;return;}
    interact0();return;}
  if(!G.car){for(const d of DOORS)if(hypot(player.x-d.at[0],player.z-d.at[1])<2.6){enterInterior(d);return;}const s=nearShop();if(s){enterInterior(shopDoor(s));return;}}
  interact0();};
// the shop whose frontage you're standing at: within 2.6 m in front of any part of its bay
function nearShop(){let best=null,bd=2.6;const px=player.x,pz=player.z;for(const c of STRM.list){if(c.lod!==1||!c.shops||cellDist(c,px,pz)>6)continue;for(const s of c.shops){
  const dx=s.bx-s.ax,dz=s.bz-s.az,l2=dx*dx+dz*dz||1,t=clamp(((px-s.ax)*dx+(pz-s.az)*dz)/l2,0,1),qx=s.ax+dx*t,qz=s.az+dz*t,f=(px-qx)*s.nx+(pz-qz)*s.nz;if(f<-.3)continue;const d=hypot(px-qx,pz-qz);if(d<bd){bd=d;best=s;}}}return best;}
const shopDoor=s=>({id:'shop',name:s.n,theme:'shop',kind:s.k,sub:s.sub,at:[s.x,s.z],n:[s.nx,s.nz]});
function doorHint(){if(__gs.IN||G.car)return;for(const d of DOORS)if(hypot(player.x-d.at[0],player.z-d.at[1])<2.6){G.lifeHint=`Press E to go into ${d.name}`;return;}
  if(G.frame%6===0)G.shopNear=nearShop();if(G.shopNear)G.lifeHint=`Press E to go into ${G.shopNear.n}`;}

/* --- exterior details that make the places recognisable from the street --- */
// marquees and name signs over the real entrances
function marquee(id,text,w,hgt,bg,fg,y){const d=DOOR[id];if(!d)return;const c=cv(1024,round(1024*hgt/w)),g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);
  if(bg!=='transparent'){g.strokeStyle='rgba(255,230,150,.9)';g.lineWidth=10;g.strokeRect(8,8,c.width-16,c.height-16);for(let x=24;x<c.width;x+=36){g.fillStyle='#ffe9a8';g.beginPath();g.arc(x,22,6,0,7);g.arc(x,c.height-22,6,0,7);g.fill();}}
  g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';const lines=text.split('\n');let fs=c.height/(lines.length*1.35);g.font=`900 ${fs}px Inter, Arial Black, sans-serif`;
  while(lines.some(l=>g.measureText(l).width>c.width*.88)&&fs>10){fs-=3;g.font=`900 ${fs}px Inter, Arial Black, sans-serif`;}lines.forEach((l,k)=>g.fillText(l,c.width/2,c.height/2+(k-(lines.length-1)/2)*fs*1.18));
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,hgt),new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.5,roughness:.5,transparent:bg==='transparent',alphaTest:bg==='transparent'?.4:0}));
  const [nx,nz]=d.n;m.position.set(d.at[0]-nx*1.95,y||5.2,d.at[1]-nz*1.95);m.lookAt(m.position.x+nx,m.position.y,m.position.z+nz);scene.add(m);MARQ.push(m.material);}
const MARQ=[];
marquee('massey','MASSEY HALL',9,2.2,'#1a1a1a','#ffd23f');marquee('mlg','MAPLE LEAF GARDENS',12,2.4,'#f4f1e6','#1b3d8f');marquee('danforth','THE DANFORTH\nMUSIC HALL',9,2.6,'#141414','#ff5a5a');
marquee('pow','PRINCESS OF WALES',10,2,'#2b0f16','#f5d98c');marquee('meridian','MERIDIAN HALL',9,1.8,'#111','#fff');marquee('rth','ROY THOMSON HALL',9,1.3,'transparent','#dfe6ee',4.2);
marquee('arena','SCOTIABANK ARENA',14,2.2,'#c8102e','#ffffff',9);marquee('rogers','ROGERS CENTRE',16,2.6,'#1d5fd1','#ffffff',11);marquee('ripleys',"RIPLEY'S AQUARIUM OF CANADA",14,2.2,'#0d4a7a','#ffffff',8);marquee('hhof','HOCKEY HALL OF FAME',10,1.6,'#1d1d1d','#e9d79a',6);
marquee('library','TORONTO PUBLIC LIBRARY',10,1.4,'transparent','#24456e',4.5);marquee('eaton','EATON CENTRE',10,1.6,'#111','#fff',6);marquee('union','UNION',6,1.2,'#20482a','#fff',4.6);
marquee('lakeshore','LAKESHORE TRUST',8,1.4,'#16233f','#e9d79a',5);marquee('bayst','BAY STREET RESERVE',10,1.5,'#16233f','#e9d79a',6.5);marquee('jewel','BLOOR DIAMONDS',7,1.2,'#f4efe6','#a8852f',4.2);
marquee('science','ONTARIO SCIENCE CENTRE',12,1.8,'transparent','#ffcf3f',5.5);marquee('agakhan','AGA KHAN MUSEUM',9,1.2,'transparent','#3a3530',4);
// Allan Gardens' Palm House dome and the Ismaili Centre's crystal prayer-hall roof
{const ph=volsOf('Allan Gardens Conservatory').filter(v=>v.p.length===8).sort((a,b)=>b.h-a.h)[0];
 if(ph){const [cx,cz]=polyCen(ph.p);let r=0;for(const q of ph.p)r+=hypot(q[0]-cx,q[1]-cz);r=r/ph.p.length*.98;
  const g=new THREE.Group(),dm=new THREE.Mesh(new THREE.SphereGeometry(r,24,10,0,2*PI,0,PI/2),new THREE.MeshStandardMaterial({color:0xcfe3ea,roughness:.08,metalness:.4,transparent:true,opacity:.55,emissive:0xbfe0ff,emissiveIntensity:0}));dm.scale.y=1.15;g.add(dm);
  for(let k=0;k<12;k++){const rib=new THREE.Mesh(new THREE.TorusGeometry(r,.12,4,24,PI),new THREE.MeshStandardMaterial({color:0xf2f2ee,roughness:.5}));rib.rotation.y=k/12*PI;rib.scale.y=1.15;g.add(rib);}
  const lant=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.4,2.4,12),new THREE.MeshStandardMaterial({color:0xf2f2ee}));lant.position.y=r*1.15+1;g.add(lant);g.position.set(cx,ph.h,cz);scene.add(g);MARQ.push(dm.material);}}
{const v=volsOf('Ismaili Centre Toronto')[0];if(v){const [cx,cz]=polyCen(v.p);const c=new THREE.Mesh(new THREE.IcosahedronGeometry(9,0),new THREE.MeshStandardMaterial({color:0xeef4f6,roughness:.05,metalness:.5,transparent:true,opacity:.7,flatShading:true,emissive:0xfff2d8,emissiveIntensity:0}));
  c.scale.set(1,.7,1);c.position.set(cx,v.h+3,cz);scene.add(c);MARQ.push(c.material);}}
// HTO Park's yellow umbrellas and Sugar Beach's pink ones (with its candy-striped rock)
for(const [name,col] of[['HTO Park',0xffd21f],['Sugar Beach',0xff7eb6]]){const g=MAP.green.find(q=>q.n===name);if(!g)continue;const fp=flat(g.p);let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of g.p){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}
  const items=[];for(let t=0;t<400&&items.length<34;t++){const x=rr(x0,x1),z=rr(z0,z1);if(!inPoly(x,z,fp)||solidAt(x,1,z)||items.some(o=>hypot(o.x-x,o.z-z)<4.5))continue;items.push({x,z,m:mat4(x,0,z,R()*6)});addCircle(x,z,.12);}
  const geo=mergeGeometries([new THREE.CylinderGeometry(.05,.05,2.6,6).translate(0,1.3,0),new THREE.ConeGeometry(1.5,.6,10,1,true).translate(0,2.75,0)].map(q=>q.index?q.toNonIndexed():q));
  chunkedInstanced(geo,new THREE.MeshStandardMaterial({color:col,roughness:.7,side:THREE.DoubleSide}),items,true,900);
  if(name==='Sugar Beach'){const c=cv(64,256),q=c.getContext('2d');for(let k=0;k<16;k++){q.fillStyle=k%2?'#ffffff':'#f05a9a';q.save();q.translate(0,k*16);q.transform(1,.5,0,1,0,0);q.fillRect(0,0,64,16);q.restore();}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,1);
    const [cx,cz]=polyCen(g.p),rock=new THREE.Mesh(new THREE.DodecahedronGeometry(2.4,1),new THREE.MeshStandardMaterial({map:t,roughness:.6}));rock.scale.set(1.4,.8,1);rock.position.set(cx,1.2,cz);scene.add(rock);addCircle(cx,cz,3);}}

export { doorHint, nearShop, shopDoor };
