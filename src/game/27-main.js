// Six City — main. One of the game's modules; they load in numbered order (src/game/index.js).
import './26-phone.js';
import * as THREE from 'three';
import { __gs, later } from './shared.js';
import { $, MAP, PI, TEST, abs, camera, cos, hypot, max, menuShow, min, renderer, rnd, round, scene, sin, stage } from './01-core.js';
import { night, sinE, skyU, stepRain, stepWeather, sun, updateEnv, updateSky } from './02-sky.js';
import { CULL, archOf, hsh, landMat, pickStyle, polyArea, polyCen, solidAt, walkable, waterMat } from './04-world.js';
import { PROPS, SIGCOL, STRM, WIND, aoPass, bulbMat, clockMat, curbSpot, drawClock, hood, lightState, placeName, poolMat, poolMesh, renderFrame, renderPass, setPR, sigMats, streamTick, updateWorldLights } from './05-landmarks.js';
import { MAXC, TRAFFIC_N, TRAM_N, beamMat, carHitsPeds, carLit, carStatic, cars, collideCars, drive, spawnTraffic, spot, stepTraffic, tickSlots } from './06-cars.js';
import { emit, jobBeacon, peds, placePed, stepCrowd, stepParticles, stepPed, syncPeds } from './07-people.js';
import { G, K, msgEl, player, startGame, stepPlayer, toggleCar } from './08-input.js';
import { charsReady } from './09-characters.js';
import { stepGarage, stepJob, stepPolice, stepWanted, syncCops } from './10-police.js';
import { MISSIONS, MS, SAVE, blistEl, closeBoard, drawTracker, nextStep, openBoard, startMission, stepMission } from './11-missions.js';
import { CUT, stepCut, stepCutPend, stepGivers } from './12-story.js';
import { restoreState, stepLife, stepProperty } from './13-homes.js';
import { DOOR, DOORS, enterInterior, exitInterior, inWalk, stepChop, stepGuards, stepInteriors } from './14-interiors.js';
import { doorHint, nearShop, shopDoor } from './15-casino.js';
import { stepGPS } from './16-map.js';
import { stepAudio, stepRadio } from './17-audio.js';
import { charPreview, openChar, safeSpot, teleportTo } from './18-menu.js';
import { boatStep, stepBoats, stepHarbour, stepRide, syncHarbour } from './19-harbour.js';
import { bikeAfter, stepBikes, syncBikes } from './20-bikes.js';
import { stepTurf, syncGangCaps } from './21-turf.js';
import { stepTTC } from './22-ttc.js';
import { drawHud, drawMinimap } from './23-hud.js';
import { camP, camT, stepCamera, syncCars } from './24-sync.js';
import { ARM, WH, fireWeapon, selectWeapon, stepCombat } from './25-weapons.js';
import { stepPhone, takePhoto } from './26-phone.js';
later({update:()=>update}); // for earlier modules, read when called

/* ============================== main update ============================== */
__gs.envTimer=99;
function update(dt){
  __gs.dt_=dt;G.frame++;
  G.time=(G.time+dt/30*(sinE<-.1?2.2:1))%24;G.sigT+=dt;skyU.uTime.value+=dt;
  sigMats[0].color.copy(SIGCOL[lightState(0)]);sigMats[1].color.copy(SIGCOL[lightState(1)]);
  // player
  const pc=G.car;
  if(pc){
    let thr=(K.KeyW||K.ArrowUp?1:0)-(K.KeyS||K.ArrowDown?1:0);const st=(K.KeyA||K.ArrowLeft?1:0)-(K.KeyD||K.ArrowRight?1:0);
    if(pc.hp<=0||G.busy)thr=0;pc.thr=thr;
    if(pc.boat){drive(pc,thr,st,!!K.Space,dt);boatStep(pc,dt);}
    else if(pc.flat){const T=pc.T,a=T.accel,m=T.maxSpeed,g=T.grip;T.accel*=.6;T.maxSpeed*=.45;T.grip*=.55;drive(pc,thr,st+(rnd()-.5)*.3,!!K.Space,dt);T.accel=a;T.maxSpeed=m;T.grip=g; // shredded tyres
      if(G.focusSpeed>4&&G.frame%3===0)emit(pc.x+(rnd()-.5)*1.6,.15,pc.z+(rnd()-.5)*2.4,(rnd()-.5)*2,1+rnd(),(rnd()-.5)*2,.06,.3,2.6,.9);}
    else drive(pc,thr,st,!!K.Space,dt);if(!pc.boat){carStatic(pc);collideCars(pc);carHitsPeds(pc);}if(pc.bike)bikeAfter(pc,dt);
    __gs.FX=pc.x;__gs.FZ=pc.z;G.focusSpeed=hypot(pc.vx,pc.vz);player.x=pc.x;player.z=pc.z;
    if(!pc.boat&&pc.slip>4.5&&G.focusSpeed>7&&G.frame%2===0){const fx=sin(pc.th),fz=cos(pc.th);emit(pc.x-fx*1.4+(rnd()-.5)*1.6,.25,pc.z-fz*1.4+(rnd()-.5)*1.6,pc.vx*.2,.6,pc.vz*.2,.5,.9,.95,.3);}
    if(pc.hp<40&&G.frame%(pc.hp<=0?2:5)===0){const fx=sin(pc.th),fz=cos(pc.th);emit(pc.x+fx*1.7,1,pc.z+fz*1.7,pc.vx*.5+(rnd()-.5),1.6+rnd(),pc.vz*.5+(rnd()-.5),.5,1.6,pc.hp<=0?.08:.45,.55);}
  }else if(G.ride)stepRide(dt);
  else if(!G.busy&&!G.menuCam){stepPlayer(dt);__gs.FX=player.x;__gs.FZ=player.z;}
  // other cars
  const outside=!__gs.IN||__gs.IN.real;let nTraffic=0,nTram=0;
  if(outside){
  for(let k=cars.length-1;k>=0;k--){
    const c=cars[k];if(c===pc)continue;
    const d=hypot(c.x-__gs.FX,c.z-__gs.FZ);
    if(c.mode==='traffic'){if((d>340&&!c.keep)||c.ai.dead){cars.splice(k,1);continue;}if(c.T.tram)nTram++;else nTraffic++;stepTraffic(c,dt);if(c.ai.dead){cars.splice(k,1);continue;}}
    else if(c.mode==='police'){if(stepPolice(c,dt)){cars.splice(k,1);continue;}}
    else if(c.mode==='free'){drive(c,0,0,true,dt);carStatic(c);collideCars(c);if(hypot(c.vx,c.vz)<.15&&abs(c.w)<.05){c.vx=c.vz=c.w=0;c.mode='parked';}}
    else if(c.spawned&&d>240&&c!==G.car){cars.splice(k,1);continue;}
    else{c.roll*=.9;c.pitch*=.9;}
  }
  if(nTraffic<TRAFFIC_N&&cars.length<MAXC-8)spawnTraffic(G.frame<5?40:150,300);
  if(nTram<TRAM_N&&G.frame%20===0&&cars.length<MAXC-8)spawnTraffic(G.frame<5?40:160,320,true);
  if(G.frame%20===0)tickSlots();
  stepBoats(dt);stepBikes(dt);
  }
  // pedestrians
  for(let k=1;k<peds.length;k++){const p=peds[k];stepPed(p,dt);
    if(outside&&!p.ins&&!p.actor&&!p.gang&&(k+G.frame)%60===0&&hypot(p.x-__gs.FX,p.z-__gs.FZ)>200)placePed(p,70,170);}
  if(CUT)stepCut(dt);
  else if(!G.menuCam){stepWanted(dt);stepJob(dt);stepMission(dt);stepLife(dt);stepGPS(dt);stepGarage(dt);stepChop(dt);stepPhone(dt);stepGivers();stepHarbour(dt);stepProperty(dt);stepTurf(dt);stepTTC(dt);stepCutPend(dt);}
  if(G.msgT>0){G.msgT-=dt;if(G.msgT<=0)msgEl.style.opacity=0;}
  if(!CUT)stepCamera(dt);
  // lighting
  stepWeather(dt);updateSky(G.time);stepRain(dt);
  __gs.envTimer+=dt;if(__gs.envTimer>3){__gs.envTimer=0;updateEnv();}
  sun.target.position.set(camT.x,0,camT.z);sun.position.copy(skyU.uSunDir.value).multiplyScalar(700).add(sun.target.position);
  updateWorldLights(dt);stepInteriors(dt);doorHint();stepGuards(dt);stepCrowd(dt);
  bulbMat.emissiveIntensity=night*4;poolMat.opacity=night*.5;poolMesh.visible=night>.03;
  carLit.value.set(.7+night*6,.5+night*3.5);beamMat.opacity=night*.6;
  if(pc&&night>.05){const fx=sin(pc.th),fz=cos(pc.th);spot.intensity=night*140;spot.position.set(pc.x+fx*1.8,pc.y+.9,pc.z+fz*1.8);spot.target.position.set(pc.x+fx*24,0,pc.z+fz*24);}
  else spot.intensity=0;
  WIND.value+=dt;  waterMat.normalMap.offset.x+=dt*.012;waterMat.normalMap.offset.y+=dt*.008;
  jobBeacon.scale.x=jobBeacon.scale.z=1+sin(G.sigT*4)*.08;
  syncCars();syncHarbour();syncBikes();syncPeds();syncCops();syncGangCaps();stepParticles(dt);stepAudio();stepRadio(dt);stepCombat(dt);if(player.punchT>0)player.punchT-=dt;
}

let last=performance.now(),fAcc=0,fN=0,fps=60;__gs.holdRender=false;let prT=0,lowN=0,highN=0;
function frame(now){
  requestAnimationFrame(frame);
  const raw=(now-last)/1000;last=now;const dt=min(.05,max(.001,raw));
  fAcc+=raw;fN++;
  if(fAcc>=.75){fps=round(fN/fAcc);fAcc=0;fN=0;
    if(G.running){ // adaptive resolution, changed rarely: each change rebuilds the post-processing buffers
      prT+=.75;lowN=fps<46?lowN+1:0;highN=fps>=58?highN+1:0;
      if(prT>=2.25&&lowN>=2&&__gs.pr>.6){__gs.pr=max(.6,round((__gs.pr-.2)*20)/20);setPR(__gs.pr);prT=0;lowN=0;}
      else if(prT>=6&&highN>=6&&__gs.pr<__gs.prCap){__gs.pr=min(__gs.prCap,round((__gs.pr+.1)*20)/20);setPR(__gs.pr);prT=0;highN=0;}
    }
  }
  if(G.running&&!G.mapOpen&&!G.boardOpen){update(WH.open?dt*.25:dt);if(G.frame%8===0)drawTracker();if(G.frame%3===0)drawMinimap();if(G.frame%4===0)drawHud(fps);}
  else if(G.charOpen)charPreview();
  else if(G.menuCam)update(dt);
  if(!__gs.IN||__gs.IN.real)streamTick(camera.position.x,camera.position.z);if(G.frame%30===0&&clockMat)drawClock();
  if(!__gs.holdRender)renderFrame();
  if(G.snap){G.snap=0;takePhoto();}
}
// initial state
restoreState();__gs.FX=player.x;__gs.FZ=player.z;camT.set(player.x,1.6,player.z);
streamTick(__gs.FX,__gs.FZ,true);
updateSky(G.time);updateEnv();
for(let k=0;k<TRAFFIC_N;k++)spawnTraffic(35,260);for(let k=0;k<TRAM_N;k++)spawnTraffic(40,300,true);tickSlots();
syncCars();syncPeds();stepCamera(.016);camera.position.copy(camP);drawHud(60);drawMinimap();
if(TEST){G.running=true;menuShow(false);const m=location.search.match(/time=([\d.]+)/);if(m)G.time=+m[1];if(location.search.includes('drive')){toggleCar();K.KeyW=true;}
  const zm=location.search.match(/zoom=([\d.]+)/);if(zm){__gs.zoomOv=__gs.camDist=+zm[1];__gs.camPitch=.08;player.th=-PI/2;for(let k=1;k<6;k++){const q=peds[k];q.x=player.x-.4+(k%2)*1.1;q.z=player.z+(k-3)*1.05+(k>2?.6:-.6);q.tx=q.x-30;q.tz=q.z;q.th=-PI/2;q.hair=k%5;}}
  if(location.search.includes('run')){K.KeyA=true;K.ShiftLeft=true;}
  const sm=location.search.match(/sim=(\d+)/);if(sm){for(let k=0;k<+sm[1];k++){if(k===+sm[1]-90)K.KeyA=true;update(1/60);}K.KeyA=false;const c=G.car;console.log('SIM',JSON.stringify({car:c&&[c.x|0,c.z|0,c.speed.toFixed(1),c.hp|0],cars:cars.length,traffic:cars.filter(c=>c.mode==='traffic').length,heat:G.heat,job:G.job,player:[player.x|0,player.z|0]}));}}
if(TEST){window.__arm=ARM;window.__sel=selectWeapon;window.__fireW=()=>{ARM.cd=0;fireWeapon();};window.__char=openChar;window.__peds=peds;window.__tele=teleportTo;window.__step=n=>{for(let k=0;k<n;k++)update(1/60);};}
window.__G=G;window.__cars=cars;window.__peds=peds;window.__K=K;
if(TEST){window.__R=renderer;window.__S=scene;window.__cam=camera;window.__info=()=>{renderer.info.autoReset=false;renderer.info.reset();renderFrame();renderer.info.autoReset=true;return JSON.stringify({calls:renderer.info.render.calls,tris:renderer.info.render.triangles,geos:renderer.info.memory.geometries,tex:renderer.info.memory.textures});};}
if(TEST)window.__audit=async()=>{const out=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(const d of DOORS){const r={id:d.id,name:d.name,outWalk:walkable(d.at[0],d.at[1])&&!solidAt(d.at[0],1,d.at[1])};if(__gs.IN)exitInterior(true);G.busy=false;enterInterior(d);await wait(800);
    if(!__gs.IN){r.err='did not enter';out.push(r);continue;}r.spawnWalk=inWalk(__gs.IN.spawn[0],__gs.IN.spawn[1])&&!solidAt(__gs.IN.spawn[0],__gs.IN.floorY+1,__gs.IN.spawn[1]);const ex=__gs.IN.spots.exit;r.exitNear=hypot(__gs.IN.spawn[0]-ex[0],__gs.IN.spawn[1]-ex[1]).toFixed(1);
    r.exitWalk=inWalk(ex[0],ex[1]);r.peds=peds.filter(p=>p.ins).length;r.spots=Object.keys(__gs.IN.spots).join(',');for(const k in __gs.IN.spots){if(k==='exit')continue;const s=__gs.IN.spots[k];if(!inWalk(s[0],s[1]))r.err=(r.err||'')+' spot '+k+' not walkable';}
    for(const l of __gs.IN.loot)if(!inWalk(l.x,l.z+(-1.2))&&!inWalk(l.x,l.z))r.err=(r.err||'')+' loot unreachable';
    exitInterior(true);r.backWalk=walkable(player.x,player.z)&&!solidAt(player.x,1,player.z);out.push(r);}
  const pl=MAP.places.map(p=>{const d=DOORS.find(q=>q.name===p.n||q.name.startsWith(p.n.split(' (')[0]));let x=d?d.at[0]+d.n[0]*2.5:p.c[0],z=d?d.at[1]+d.n[1]*2.5:p.c[1];let s=walkable(x,z)&&!solidAt(x,1,z)?null:curbSpot(x,z,'walk');if(s){x=s.x;z=s.z;}s=safeSpot(x,z);x=s.x;z=s.z;return{n:p.n,ok:walkable(x,z)&&!solidAt(x,1,z),d:s?hypot(s.x-p.c[0],s.z-p.c[1])|0:-1};}).filter(p=>!p.ok);
  return{doors:out,badPlaces:pl};};
if(TEST)window.__prof={scene,get landMat(){return landMat;},CULL,aoPass,renderPass,setPR};
if(TEST)window.__front=()=>{let n=0,ok=0;for(const c of STRM.list){if(c.lod!==1||!c.shops)continue;for(const s of c.shops){for(const t of[.1,.5,.9]){n++;player.x=s.ax+(s.bx-s.ax)*t+s.nx*1.4;player.z=s.az+(s.bz-s.az)*t+s.nz*1.4;const q=nearShop();if(q&&q.n===s.n)ok++;}}}return ok+'/'+n;};
if(TEST)window.__props=()=>{const out=[];scene.traverse(o=>{if(o.isInstancedMesh&&PROPS&&Object.values(PROPS).some(p=>p.geo===o.geometry)&&o.count){const m=new THREE.Matrix4();o.getMatrixAt(0,m);const v=new THREE.Vector3().setFromMatrixPosition(m);out.push([Object.keys(PROPS).find(k=>PROPS[k].geo===o.geometry),v.x|0,v.z|0]);}});return out.slice(0,40);};
if(TEST)window.__dbg={STRM,enterInterior,shopDoor,get ARM(){return ARM;},get MS(){return MS;},get IN(){return __gs.IN;},player,DOOR,nextStep,startMission,MISSIONS,SAVE,G,peds,interact:()=>__gs.interact(),stepFrames:n=>{for(let k=0;k<n;k++)update(1/60);}};
if(TEST){window.__enter=id=>{if(__gs.IN)exitInterior(true);G.busy=false;enterInterior(DOOR[id]);};window.__exit=()=>exitInterior(true);window.__IN=()=>__gs.IN&&{name:__gs.IN.name,ox:__gs.IN.ox,oz:__gs.IN.oz,spots:__gs.IN.spots,alarm:__gs.IN.alarm};window.__doors=()=>DOORS.map(d=>[d.id,d.at.map(Math.round)]);
  window.__cam=(yaw,pitch,dist,lx,lz)=>{if(lx!==undefined&&__gs.IN){player.x=__gs.IN.ox+lx;player.z=__gs.IN.oz+lz;__gs.FX=player.x;__gs.FZ=player.z;camT.set(__gs.FX,__gs.IN.floorY+1.6,__gs.FZ);}__gs.camYaw=yaw;__gs.camPitch=pitch;__gs.zoomOv=__gs.camDist=dist;G.noOcc=dist>12;__gs.lastMouse=performance.now()+1e9;};window.__board=()=>{openBoard();return blistEl.innerText.slice(0,400);};window.__closeBoard=()=>closeBoard(true);window.__MS=()=>MS&&{id:MS.def.id,i:MS.i,text:MS.def.steps[MS.i].text(MS)};}
if(TEST)window.__style=(x,z,rad=45)=>MAP.vols.filter(v=>{const c=polyCen(v.p);return hypot(c[0]-x,c[1]-z)<rad;}).map(v=>{const ar=abs(polyArea(v.p)),[cx,cz]=polyCen(v.p),arch=archOf(v,v.p,ar,cx,cz);return{c:[cx|0,cz|0],k:v.k,h:v.h,b:v.b,m:v.m,col:v.col,lv:v.lv,arch,st:pickStyle(v,ar,hsh(cx,cz),arch).slice(0,3).map(q=>q&&q.isColor?'tint':q)};});
if(TEST)window.__mv=(x,z)=>{player.x=x;player.z=z;__gs.FX=x;__gs.FZ=z;camT.set(x,1.6,z);__gs.lastMouse=performance.now()+1e9;};
if(TEST)window.__tp=(x,z,yaw,pitch,dist,th)=>{if(th!==undefined)player.th=th;if(G.car){G.car.x=x;G.car.z=z;}player.x=x;player.z=z;__gs.FX=x;__gs.FZ=z;__gs.camYaw=yaw;__gs.camPitch=pitch;__gs.zoomOv=__gs.camDist=dist;G.noOcc=dist>40;camT.set(x,1.6,z);streamTick(x,z,true);for(const p of peds)if(p!==player)placePed(p,8,120);__gs.lastMouse=performance.now()+1e9;return placeName(x,z)+' / '+hood(x,z);};
if(!TEST){await stage(.96,'Warming up');try{await renderer.compileAsync(scene,camera);}catch(e){}
  G.menuCam=!G.started;G.ready=true;window.__bootDone=true;window.__boot(1,'');$('start').classList.add('ready');
  for(const id of['mChar','mJobs','mMap','mNew'])$(id).disabled=false;$('go').classList.remove('wait');$('goL').textContent=SAVE.state?'Continue':'Play';
  requestAnimationFrame(()=>requestAnimationFrame(()=>$('start').classList.add('live')));
  if(window.__wantPlay)startGame();}
requestAnimationFrame(frame);
if(TEST){await charsReady;__gs.holdRender=false;renderFrame();}
