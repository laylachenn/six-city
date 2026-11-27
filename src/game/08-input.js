// Six City — input. One of the game's modules; they load in numbered order (src/game/index.js).
import './07-people.js';
import { __gs, __late, later } from './shared.js';
import { $, PI, QUAL, TEST, abs, atan2, camera, canvas, clamp, cos, groundH, hypot, menuShow, min, sign, sin, wrap } from './01-core.js';
import { WX, WXM, setWeather, sun } from './02-sky.js';
import { PO, pushOut, walkable } from './04-world.js';
import { START, aoPass, renderPass, setPR } from './05-landmarks.js';
import { cars } from './06-cars.js';
import { NCOP, NPED, attachPed, mkPed, peds, placePed } from './07-people.js';
later({G:()=>G,flash:()=>flash,player:()=>player}); // for earlier modules, read when called

/* ============================== game state & input ============================== */
const G={running:false,time:15,sigT:0,cash:0,heat:0,hp:100,car:null,evade:0,arrestT:0,shake:0,hurtCd:0,job:null,jobWait:4,focusSpeed:0,busy:false,garageCd:0,msgT:0,frame:0};
__gs.FX=0;__gs.FZ=0;__gs.dt_=0.016;
const player=mkPed(START.px,START.pz);player.shirt.set(0xfbf8f3);player.pants.set(0x4d6a92);player.skin.set(0xf1c7a4);player.hairC.set(0x8c5834);player.face=1;player.jacket=null;player.accent.set(0xf2a6c2);player.shoe.set(0xffffff);player.shin=player.pants;player.fore=null;player.sc=1;player.male=false;player.tone=1;player.tint=1.25;player.sleeve=.3;player.crop=true;player.shorts=0;player.hair=0;player.denim=1;player.isPlayer=1;player.th=PI;player.onGround=true;
for(let k=0;k<NPED;k++){const p=mkPed(0,0);__gs.FX=player.x;__gs.FZ=player.z;if(!placePed(p,12,170))placePed(p,0,1e9);}
// police officers on foot come from this pool (kept out of the crowd; see the wanted system)
for(let k=0;k<NCOP;k++){const p=mkPed(0,0);Object.assign(p,{copPed:true,cid:k,hidden:true,cop:null,jacket:null,fore:null,sleeve:.97,crop:false,shorts:0,beard:false,hair:p.male?0:2});p.shin=p.pants;}
__gs.camYaw=PI;__gs.camPitch=.24;__gs.camDist=6;__gs.lastMouse=0;__gs.zoomOv=0;
const K={};
addEventListener('keydown',e=>{if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;if(e.code==='Tab')e.preventDefault();if(e.repeat)return;K[e.code]=true;
  if(e.code==='Escape'&&G.charOpen){$('chardone').click();return;}
  if(!G.running)return;
  if(G.gameOpen){if(e.code==='Escape'||e.code==='KeyE')__late.closeGame();return;}
  if(G.phoneOpen){if(e.code==='Escape'||e.code==='KeyK')__late.closePhone();return;}
  if(G.photo){e.preventDefault();if(e.code==='Space'||e.code==='Enter')G.snap=1;else if(e.code==='Escape'||e.code==='KeyK')__late.endPhoto();return;}
  if(__late.CUT){if(e.code==='Space'||e.code==='Enter'){e.preventDefault();__late.cutNext();}else if(e.code==='KeyX'||e.code==='Backspace')__late.endCut();return;}
  if(G.boardOpen){if(e.code==='KeyJ'||e.code==='Escape'){__late.closeBoard(e.code==='Escape');if(e.code==='Escape')__late.pauseMenu();}return;}
  if(e.code==='KeyJ'&&!__late.BM.open){__late.openBoard();return;}
  if(e.code==='KeyK'&&!__late.BM.open){__late.openPhone();return;}
  if(e.code==='Escape'&&__late.BM.open){__late.closeMap(true);__late.pauseMenu();return;}
  if(e.code==='Tab'||e.code==='KeyM'){__late.BM.open?__late.closeMap():__late.openMap();return;}
  if(e.code==='Slash'){e.preventDefault();if(!__late.BM.open)__late.openMap();setTimeout(()=>$('addrq').focus(),30);__late.abLoad();return;}
  if(e.code==='KeyF'){if(__late.PANEL)__late.closePanel();toggleCar();}
  if(e.code==='KeyE')__gs.interact();
  if(__late.PANEL&&/^Digit[1-9]$/.test(e.code))__late.pickOption(+e.code.slice(5)-1);
  else if(/^Digit[1-6]$/.test(e.code)&&!__late.BM.open)__late.selectWeapon(+e.code.slice(5)-1);
  if(e.code==='KeyQ'&&!__late.BM.open)__late.openWheel();
  if(e.code==='KeyR')__late.startReload();
  if(e.code==='KeyT'){G.time=(G.time+1)%24;__gs.envTimer=99;}
  if(e.code==='KeyY'){WX.manual=1;setWeather((WX.mode+1)%WXM.length);__gs.envTimer=2.6;flash('Weather: '+WXM[WX.mode].n);}
  if(__late.BM.open)return;
  if(e.code==='KeyN'){__gs.muted=!__gs.muted;if(__late.master)__late.master.gain.value=__gs.muted?0:.5;if(__gs.muted)__late.radioHush();flash(__gs.muted?'Sound off':'Sound on');}
  if(G.car&&(e.code==='Period'||e.code==='Comma')){__late.radioCycle(e.code==='Period'?1:-1);return;}
  if(e.code==='KeyP'){__gs.qual=(__gs.qual+1)%3;applyQuality();flash('Graphics: '+QUAL[__gs.qual].name);}
  if(e.code==='Space'||e.code.startsWith('Arrow'))e.preventDefault();
});
addEventListener('keyup',e=>{K[e.code]=false;if(e.code==='KeyQ'&&G.ready)__late.closeWheel(true);});
addEventListener('wheel',e=>{if(document.pointerLockElement===canvas&&G.running&&G.car&&!__late.BM.open&&!__late.CUT&&e.deltaY){const n=performance.now();if(n-(__late.RAD.wheelT||0)>180){__late.RAD.wheelT=n;__late.radioCycle(e.deltaY>0?1:-1);}return;}
  if(document.pointerLockElement!==canvas||!G.running||G.car||__late.BM.open||__late.CUT||__late.WH.open)return;const n=__late.WEAPONS.length,s=e.deltaY>0?1:e.deltaY<0?-1:0;if(!s)return;let i=__late.ARM.w;do i=(i+s+n)%n;while(!__late.ARM.own[i]&&i!==__late.ARM.w);__late.selectWeapon(i);},{passive:true});
addEventListener('mousedown',e=>{if(__late.CUT&&G.running&&e.button===0&&e.target===canvas){__late.cutNext();return;}if(G.photo&&e.button===0&&document.pointerLockElement===canvas){G.snap=1;return;}if(document.pointerLockElement!==canvas||!G.running)return;if(e.button===0){__late.ARM.fire=true;__late.ARM.trigger=true;}if(e.button===2)__late.ARM.aim=true;});
addEventListener('mouseup',e=>{if(e.button===0)__late.ARM.fire=false;if(e.button===2)__late.ARM.aim=false;});
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('blur',()=>{for(const k in K)K[k]=false;if(G.ready)__late.closeWheel(false);});
addEventListener('mousemove',e=>{if(document.pointerLockElement!==canvas)return;if(__late.WH.open){__late.wheelMove(e.movementX,e.movementY);return;}
  const s=G.car?1:camera.fov/60; // aiming down a scope slows the mouse with the zoom
  __gs.camYaw-=e.movementX*.0026*s;__gs.camPitch=clamp(__gs.camPitch+e.movementY*.002*s,-1.45,1.2);__gs.lastMouse=performance.now();});
function applyQuality(){const q=QUAL[__gs.qual];if(aoPass){aoPass.enabled=__gs.qual===2;renderPass.enabled=__gs.qual!==2;}__gs.prCap=min(devicePixelRatio,q.pr);__gs.pr=min(__gs.pr,__gs.prCap);setPR(__gs.pr);
  sun.castShadow=q.shadow>0;if(q.shadow){sun.shadow.mapSize.set(q.shadow,q.shadow);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}}
function startGame(noLock){
  if(!G.running){G.running=true;G.menuCam=false;$('ctl').classList.remove('show');menuShow(false);$('charui').style.display='none';G.charOpen=false;__late.initAudio();if(!G.started){G.started=true;if(__late.CUTS_ON&&!__late.SAVE.done.length&&!__late.SAVE.seen.includes('prologue'))__late.playCut('prologue');else flash(G.charNote?'Detailed characters need a local server':G.welcome||'Welcome to Toronto',3);}}
  if(__late.AC&&__late.AC.state==='suspended')__late.AC.resume();
  if(!TEST&&noLock!==true){try{const q=canvas.requestPointerLock?.();q&&q.catch&&q.catch(()=>flash('Click to look around',2.5));}catch(_){}}
}
$('go').addEventListener('click',()=>{if(G.ready)startGame();});canvas.addEventListener('click',()=>{if(G.ready&&!G.charOpen&&!__late.BM.open)startGame();});
addEventListener('keydown',e=>{if(e.code==='Enter'&&G.ready&&document.body.classList.contains('menu')&&!G.charOpen&&!e.repeat&&e.target.tagName!=='INPUT'){e.preventDefault();startGame();}});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&G.photo){__late.endPhoto();return;}if(document.pointerLockElement!==canvas&&G.running&&!TEST&&!G.mapOpen&&!G.boardOpen&&!G.gameOpen&&!G.phoneOpen)__late.pauseMenu();});

const hintEl=$('hint').firstElementChild,msgEl=$('msg');
function flash(t,dur){msgEl.textContent=t;msgEl.style.opacity=1;G.msgT=dur||1.8;}

function toggleCar(){
  if(G.busy||G.ride)return;
  if(G.car&&G.car.boat){__late.leaveBoat();return;}
  if(G.car&&G.car.bike){__late.leaveBike();return;}
  if(G.car){
    const c=G.car;if(hypot(c.vx,c.vz)>5){flash('Slow down to get out',1.2);return;}
    const fx=sin(c.th),fz=cos(c.th),o=c.T.W/2+.75;let x=c.x+fz*o,z=c.z-fx*o;
    if(pushOut(x,z,.4)){x=c.x-fz*o;z=c.z+fx*o;}
    player.x=x;player.z=z;player.y=groundH(x,z);player.th=c.th;player.hidden=false;player.vy=0;
    c.mode='free';G.car=null;return;
  }
  let best=null,bd=3.6;for(const c of cars){const d=hypot(c.x-player.x,c.z-player.z);if(d<bd){bd=d;best=c;}}
  {const nb=__late.nearBike();if(nb&&(!best||nb.d<bd)){__late.boardBike(nb.b);return;}}
  if(!best){const b=__late.nearBoat();if(b)__late.boardBoat(b);return;}
  if(best.T.tram){flash("You can't drive a streetcar",1.4);return;}
  if(best.mode==='traffic'||best.mode==='police'||best.mode==='block'){
    __late.addHeat(best.mode==='traffic'?.7:1.5);
    if(best.mode==='traffic'){best.vx=sin(best.th)*best.speed;best.vz=cos(best.th)*best.speed;
      let far=null,fd=0;for(let k=1;k<peds.length;k++){const p=peds[k],d=hypot(p.x-__gs.FX,p.z-__gs.FZ);if(d>fd){fd=d;far=p;}}
      if(far){far.x=best.x+cos(best.th)*1.6;far.z=best.z-sin(best.th)*1.6;far.y=0;far.state='flee';far.timer=9;far.lie=0;attachPed(far);}}
  }
  if(best.mode==='police'||best.mode==='block')best.wasCop=1;
  best.mode='player';best.ai=null;G.car=best;player.hidden=true;
}
function stepPlayer(dt){
  if(G.uiOpen){player.amp*=.85;G.focusSpeed=0;return;}
  const p=player,ox=p.x,oz=p.z,fw=(K.KeyW||K.ArrowUp?1:0)-(K.KeyS||K.ArrowDown?1:0),rt=(K.KeyD||K.ArrowRight?1:0)-(K.KeyA||K.ArrowLeft?1:0);
  const fx=sin(__gs.camYaw),fz=cos(__gs.camYaw);let dx=fx*fw-fz*rt,dz=fz*fw+fx*rt;const l=hypot(dx,dz);
  const lock=__late.ARM.w>0&&(__late.ARM.aim||__late.ARM.faceT>0);
  if(l>0){const sp=__late.ARM.aim?2.6:(K.ShiftLeft||K.ShiftRight)?7.6:3.7;dx/=l;dz/=l;p.th+=wrap((lock?__gs.camYaw:atan2(dx,dz))-p.th)*min(1,dt*12);p.x+=dx*sp*dt;p.z+=dz*sp*dt;
    p.phase+=sp*dt*(sp>5?1.7:2.9);p.amp+=((sp>5?1:.55)-p.amp)*min(1,dt*10);G.focusSpeed=sp;}
  else{p.amp+=(0-p.amp)*min(1,dt*10);G.focusSpeed=0;if(lock)p.th+=wrap(__gs.camYaw-p.th)*min(1,dt*14);}
  if(K.Space&&p.onGround){p.vy=6.2;p.onGround=false;}
  p.vy=(p.vy||0)-20*dt;p.y+=p.vy*dt;const g=groundH(p.x,p.z);if(p.y<=g){p.y=g;p.vy=0;p.onGround=true;}
  if(pushOut(p.x,p.z,.36)){p.x=PO.x;p.z=PO.z;}
  for(const c of cars){
    const ddx=p.x-c.x,ddz=p.z-c.z,rch=c.T.L/2+1;if(abs(ddx)>rch||abs(ddz)>rch)continue;
    const cfx=sin(c.th),cfz=cos(c.th),lf=ddx*cfx+ddz*cfz,ll=-ddx*cfz+ddz*cfx,hl=c.T.L/2+.3,hw=c.T.W/2+.3;
    if(abs(lf)<hl&&abs(ll)<hw&&p.y<c.y+1.2){
      if(hw-abs(ll)<hl-abs(lf)){const s=(sign(ll)||1)*(hw-abs(ll));p.x+=-cfz*s;p.z+=cfx*s;}
      else{const s=(sign(lf)||1)*(hl-abs(lf));p.x+=cfx*s;p.z+=cfz*s;}
    }
  }
  if(!walkable(p.x,p.z)){p.x=ox;p.z=oz;}
}


export { G, K, flash, hintEl, msgEl, player, startGame, stepPlayer, toggleCar };
