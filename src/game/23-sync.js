// Six City — sync. One of the game's modules; they load in numbered order (src/game/index.js).
import './22-hud.js';
import * as THREE from 'three';
import { __gs, __late, later } from './shared.js';
import { $, PI, abs, camera, cos, groundH, hypot, max, min, rnd, sin, wrap } from './01-core.js';
import { dome, night } from './02-sky.js';
import { ONE, YAX, _e, _m, _q, _s, _v, solidAt } from './04-world.js';
import { CT, beams, calIM, cars, copBars, rimIM, tyreIM } from './06-cars.js';
import { G, K, player } from './08-input.js';
later({_e2:()=>_e2,_m2:()=>_m2,_m3:()=>_m3,camT:()=>camT}); // for earlier modules, read when called

/* ============================== per-frame sync ============================== */
const _m2=new THREE.Matrix4(),_m3=new THREE.Matrix4(),_e2=new THREE.Euler();
function syncCars(){
  const cnt=CT.map(()=>0);let wn=0,bn=0,cb=0;
  for(const c of cars){
    const T=c.T,k=cnt[c.ti]++;
    _e.set(c.pitch,c.th,c.roll,'YXZ');_m.compose(_v.set(c.x,c.y,c.z),_q.setFromEuler(_e),ONE);
    T.body.setMatrixAt(k,_m);T.body.setColorAt(k,c.color);
    if(T.mir){T.mir.setMatrixAt(k,_m);T.mir.setColorAt(k,c.color);T.chr.setMatrixAt(k,_m);T.drk.setMatrixAt(k,_m);}
    for(let w=0;w<4;w++){const front=w<2,side=w%2?1:-1,flip=side>0?PI:0,st=front?c.steer:0;
      _v.set(side*T.wx,T.wr,front?T.wf:T.wrx);_s.set(1,T.wr,T.wr);
      _e2.set(side>0?-c.spin:c.spin,st+flip,0,'YXZ');_m2.compose(_v,_q.setFromEuler(_e2),_s);_m3.multiplyMatrices(_m,_m2);tyreIM.setMatrixAt(wn,_m3);rimIM.setMatrixAt(wn,_m3);
      _e2.set(0,st+flip,0,'YXZ');_m2.compose(_v,_q.setFromEuler(_e2),_s);_m3.multiplyMatrices(_m,_m2);calIM.setMatrixAt(wn,_m3);calIM.setColorAt(wn,c.cal);wn++;}
    if(night>.05&&(c.mode==='traffic'||c.mode==='police'||c.mode==='player')){_m2.compose(_v.set(c.x,c.y+.12,c.z),_q.setFromAxisAngle(YAX,c.th),ONE);beams.setMatrixAt(bn++,_m2);}
    if((c.mode==='police'||c.copCar||(c.rb&&c.mode!=='player'))&&!c.boom&&cb<copBars.length){const L=copBars[cb++];L.g.visible=true;L.g.position.set(c.x,c.y+c.T.roofH-1.43,c.z);L.g.rotation.y=c.th;const f=(performance.now()/160|0)%2;L.a.material.color.setRGB(f?3:.25,0,0);L.b.material.color.setRGB(0,f?.02:.3,f?.25:3);}
  }
  for(let k=cb;k<copBars.length;k++)copBars[k].g.visible=false;
  CT.forEach((T,i)=>{for(const im of[T.body,T.mir,T.chr,T.drk]){if(!im)continue;im.count=cnt[i];im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;}});
  for(const im of[tyreIM,rimIM,calIM]){im.count=wn;im.instanceMatrix.needsUpdate=true;}if(calIM.instanceColor)calIM.instanceColor.needsUpdate=true;beams.count=bn;beams.instanceMatrix.needsUpdate=true;
}
const camT=new THREE.Vector3(),camP=new THREE.Vector3(),scopeEl=$('scope');
let occF=1;
function stepCamera(dt){
  const c=G.car;let tx,ty,tz,want;
  if(c){tx=c.x;ty=c.y+1.35;tz=c.z;want=6.4+c.T.L*.35;
    if(performance.now()-__gs.lastMouse>1300&&hypot(c.vx,c.vz)>2){const back=c.speed<-1?PI:0;__gs.camYaw+=wrap(c.th+back-__gs.camYaw)*min(1,dt*2.6);__gs.camPitch+=(.24-__gs.camPitch)*min(1,dt*1.5);}}
  else if(G.menuCam){want=11;__gs.camYaw+=dt*.05;__gs.camPitch+=(.2-__gs.camPitch)*min(1,dt*.8);tx=player.x+cos(__gs.camYaw)*2.6;ty=player.y+1.4;tz=player.z-sin(__gs.camYaw)*2.6;}
  else{tx=player.x;ty=player.y+1.55;tz=player.z;want=__gs.zoomOv||4.6;
    if(__late.ARM.w>0){const sh=__late.ARM.aim?.62:.42;tx+=-cos(__gs.camYaw)*sh;tz+=sin(__gs.camYaw)*sh;if(__late.ARM.aim)want=__gs.zoomOv||2.3;}} // over the right shoulder when armed
  if(K.KeyQ&&c)__gs.camYaw+=dt*2.2;if(K.KeyC)__gs.camYaw-=dt*2.2; // on foot, Q is the weapon wheel
  if(__gs.IN&&__gs.IN.camMax)want=min(want,__gs.IN.camMax);
  __gs.camDist+=(want-__gs.camDist)*min(1,dt*5);
  camT.x+=(tx-camT.x)*min(1,dt*18);camT.y+=(ty-camT.y)*min(1,dt*10);camT.z+=(tz-camT.z)*min(1,dt*18);
  // below -0.25 the orbit stays put near the ground and the view tilts up instead, so you can look all the way up a tower
  const op=max(__gs.camPitch,-.25),tilt=max(0,-.25-__gs.camPitch),cp=cos(op),ox=-sin(__gs.camYaw)*cp*__gs.camDist,oy=sin(op)*__gs.camDist,oz=-cos(__gs.camYaw)*cp*__gs.camDist;
  let f=1;
  for(let k=1;k<=10&&!G.noOcc;k++){const t=k/10;if(solidAt(camT.x+ox*t,camT.y+oy*t,camT.z+oz*t)){f=max(.12,(k-1)/10);break;}}
  if(G.menuCam){occF+=(f-occF)*min(1,dt*(f<occF?3:.8));f=occF;}else occF=f; // the menu orbit glides in and out around walls instead of snapping
  camP.set(camT.x+ox*f,max(camT.y+oy*f,groundH(camT.x+ox*f,camT.z+oz*f)+.35),camT.z+oz*f);
  if(G.shake>0){camP.x+=(rnd()-.5)*G.shake;camP.y+=(rnd()-.5)*G.shake;G.shake=max(0,G.shake-dt*1.8);}
  if(__gs.IN&&!__gs.IN.real)camP.y=min(camP.y,__gs.IN.floorY+__gs.IN.ceil-.5);
  if(__gs.IN&&__gs.IN.camR){const dx=camP.x-__gs.IN.ox,dz=camP.z-__gs.IN.oz,d=hypot(dx,dz);if(d>__gs.IN.camR){camP.x=__gs.IN.ox+dx/d*__gs.IN.camR;camP.z=__gs.IN.oz+dz/d*__gs.IN.camR;}}
  camera.position.copy(camP);camera.lookAt(camT.x,camT.y+.25,camT.z);if(tilt>0)camera.rotateX(tilt);
  const scoped=!c&&__late.ARM.aim&&__late.WEAPONS[__late.ARM.w].scope&&!player.hidden&&!G.busy;
  const fov=scoped?11:60+min(20,G.focusSpeed*.36*(c?1:0))-(!c&&__late.ARM.aim&&__late.ARM.w>0?14:0);if(abs(fov-camera.fov)>.05){camera.fov+=(fov-camera.fov)*min(1,dt*(scoped?10:4));camera.updateProjectionMatrix();}
  const sc=scoped&&camera.fov<20;if(sc!==G.scoped){G.scoped=sc;scopeEl.style.display=sc?'block':'none';}
  dome.position.copy(camera.position);
}

export { camP, camT, stepCamera, syncCars };
