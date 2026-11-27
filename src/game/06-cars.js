// Six City — cars. One of the game's modules; they load in numbered order (src/game/index.js).
import './05-landmarks.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { __gs, __late } from './shared.js';
import { EDGES, MAP, NODES, PI, R, abs, atan2, ceil, clamp, cos, exp, floor, groundH, hypot, lerp, max, min, mkRng, pick, rnd, rpick, scene, sign, sin, sqrt, stage, wrap } from './01-core.js';
import { radialTexture } from './03-textures.js';
import { PO, _lp, _lq, edgePt, nodesNear, pushOut, walkable } from './04-world.js';
import { START, lightState } from './05-landmarks.js';

/* ============================== cars ============================== */
const CT=[
 {name:'Executive Sedan',L:5.0,W:1.92,yb:.27,belt:.9,hood:.84,roofH:1.43,deck:.96,cf:.95,cr:-1.5,ws:.92,rs:.78,wf:1.58,wrx:-1.52,wr:.36,accel:10,maxSpeed:48,grip:6.8,sun:1},
 {name:'GT Coupe',L:4.75,W:1.96,yb:.22,belt:.78,hood:.7,roofH:1.27,deck:.86,cf:.85,cr:-1.6,ws:1.02,rs:1.12,wf:1.48,wrx:-1.45,wr:.36,accel:15,maxSpeed:68,grip:8,sun:1,doors:1},
 {name:'Luxury SUV',L:5.0,W:2.02,yb:.37,belt:1.12,hood:1.06,roofH:1.77,deck:1.12,cf:1.15,cr:-2.1,ws:.75,rs:.3,wf:1.62,wrx:-1.6,wr:.42,accel:9,maxSpeed:44,grip:5.8,sun:1},
 {name:'Streetcar',tram:true,L:24,W:2.54,yb:.32,belt:1.0,hood:1.05,roofH:3.3,deck:1.05,cf:11.6,cr:-11.6,ws:.3,rs:.3,wf:8,wrx:-8,wr:.36,accel:2.6,maxSpeed:15,grip:9,
   TP:h=>[[-h,2.2],[-h+.15,2.9],[-h+.5,3.25],[h-.5,3.25],[h-.15,2.9],[h,2.2]]},
 {name:'Supercar',L:4.62,W:2.02,yb:.17,belt:.68,hood:.64,roofH:1.13,deck:.84,cf:1.0,cr:-.92,ws:1.02,rs:.72,wf:1.42,wrx:-1.45,wr:.36,accel:20,maxSpeed:82,grip:9.5,doors:1,wing:1}];
for(const T of CT){const n=max(3,ceil(T.L/T.W)),a=T.L/2-T.W*.5;T.offs=Array.from({length:n},(_,k)=>-a+2*a*k/(n-1));}
const MAXC=150;
const carLit={value:new THREE.Vector2(.6,.5)};
function carBodyGeo(T){
  const h=T.L/2,rf=T.cf-T.ws,rb=T.cr+T.rs;
  const TP=T.TP?T.TP(h):[[-h,T.deck-.3],[-h+.06,T.deck-.1],[-h+.24,T.deck],[T.cr,max(T.belt,T.deck)],[rb,T.roofH],[(rb+rf)/2,T.roofH+.02],[rf,T.roofH],[T.cf,T.belt],[h-.45,T.hood],[h-.12,T.hood-.07],[h,T.hood-.26]];
  const lin=z=>{for(let k=1;k<TP.length;k++)if(z<=TP[k][0]){const a=TP[k-1],b=TP[k];return lerp(a[1],b[1],(z-a[0])/max(1e-6,b[0]-a[0]));}return TP[TP.length-1][1];};
  let zs=[];for(let z=-h;z<h-.01;z+=T.tram?.1:.06)zs.push(z);zs.push(h,T.cr,rb,rf,T.cf);zs.sort((a,b)=>a-b);zs=zs.filter((z,k)=>k===0||z-zs[k-1]>.025);
  let top=zs.map(lin);for(let pass=0;pass<(T.tram?2:4);pass++)top=top.map((v,k)=>k===0||k===top.length-1?v:(top[k-1]+2*v+top[k+1])/4);
  const pos=[],ring=[],idx=[],NR=21;
  zs.forEach((z,si)=>{
    const e=min(z+h,h-z),t=clamp(1-e/.55,0,1),t2=clamp(1-e/.35,0,1),hw=T.W/2*(1-.2*t*t),yb=T.yb+.14*t2*t2,tp=top[si];
    const c=clamp((tp-T.belt)/(T.roofH-T.belt),0,1),sh=min(T.belt,tp-.07),hr=hw*.76,cr=.01+.025*c,x8=lerp(hw-.16,hr-.07,c);
    const pts=[[0,yb],[hw*.72,yb],[hw*.95,yb+.07],[hw,yb+.2],[hw,lerp(yb+.2,sh,.6)],[hw-.015,sh-.02],[hw-.05,sh+.012],[lerp(hw-.09,hr,c),sh+(tp-sh)*.82],[x8,tp-.008],[x8*.5,tp+cr*.8],[0,tp+cr]];
    for(let i=0;i<NR;i++){const k=i<=10?i:20-i,q=pts[k];pos.push((i<=10?1:-1)*q[0],q[1],z);ring.push(k);}
  });
  for(let si=0;si<zs.length-1;si++)for(let i=0;i<NR-1;i++){const a=si*NR+i,b=a+1,c=a+NR,d=c+1;idx.push(a,b,c,b,d,c);}
  const n=zs.length,c0=pos.length/3;pos.push(0,(T.yb+top[0])/2+.07,-h);ring.push(3);pos.push(0,(T.yb+top[n-1])/2+.07,h);ring.push(3);
  for(let i=0;i<NR-1;i++){idx.push(c0,i+1,i);const a=(n-1)*NR+i;idx.push(c0+1,a,a+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aRing',new THREE.Float32BufferAttribute(ring,1));g.setIndex(idx);g.computeVertexNormals();return g;
}
function carMat(T){
  const m=new THREE.MeshPhysicalMaterial({metalness:.5,roughness:.3,clearcoat:1,clearcoatRoughness:.03,envMapIntensity:1});
  const u={uC1:{value:new THREE.Vector4(T.cf,T.cf-T.ws,T.cr+T.rs,T.cr)},uC2:{value:new THREE.Vector4(T.wf,T.wrx,T.wr,T.L/2)},uC3:{value:new THREE.Vector4(T.hood-.37,T.deck-.4,T.W/2,T.yb)},uLit:carLit,uX:{value:new THREE.Vector4(T.tram?1.9:0,T.tram?1:0,T.sun?1:0,T.doors?1:0)},uC4:{value:new THREE.Vector4(T.hood-.16,T.deck-.17,T.belt,0)}};
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,u);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float aRing;varying vec4 vCar;').replace('#include <begin_vertex>','#include <begin_vertex>\nvCar=vec4(position,aRing);');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
      uniform vec4 uC1,uC2,uC3,uX,uC4;uniform vec2 uLit;varying vec4 vCar;float gGl=0.,gTr=0.,gHd=0.,gTl=0.,gBk=0.,gCh=0.;
      float h31(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
      float up(float a,float b,float x){return smoothstep(a,b,x);}float dn(float a,float b,float x){return 1.-smoothstep(a,b,x);}
      // a thin glowing line that stays at least ~1.5 px wide and dims to keep its brightness, so it fades with distance
      // instead of popping on and off between pixels (the LED strips are only 1-2 cm across)
      float aaLine(float d,float w0,float w1){float fw=fwidth(d)+1e-5,w=(w0+w1)*.5,e=max(w,fw*.75);return (1.-smoothstep(e-max(w1-w0,fw)*.5,e+max(w1-w0,fw)*.5,d))*min(1.,w/e);}`)
     .replace('#include <color_fragment>',`#include <color_fragment>
      {vec3 q=vCar.xyz;float rg=vCar.w,ax=abs(q.x),t=clamp(rg-6.,0.,1.);
       float zf=mix(uC1.x-.14,uC1.y-.07,t),zr=mix(uC1.w+.14,uC1.z+.07,t),zb=(uC1.y+uC1.z)*.5-.08;
       float side=up(6.1,6.22,rg)*dn(6.86,6.97,rg)*up(zr,zr+.03,q.z)*dn(zf-.03,zf,q.z)*(uX.x>0.?1.:up(.03,.045,abs(q.z-zb)));
       if(uX.x>0.){float pz=abs(fract(q.z/uX.x+.5)-.5)*uX.x;side*=up(.1,.14,pz);}
       float tp=up(8.25,8.4,rg),car=uX.x>0.?0.:1.;
       float ws=tp*up(uC1.y+.03,uC1.y+.07,q.z)*dn(uC1.x-.1,uC1.x-.05,q.z),rw=tp*up(uC1.w+.05,uC1.w+.1,q.z)*dn(uC1.z-.07,uC1.z-.03,q.z);
       float sr=uX.z*car*tp*up(uC1.z+.1,uC1.z+.15,q.z)*dn(uC1.y-.14,uC1.y-.09,q.z)*dn(uC3.z*.5,uC3.z*.56,ax);
       gGl=max(max(side,sr),max(ws,rw));
       float sideO=car*up(5.96,6.08,rg)*dn(6.99,7.1,rg)*up(zr-.05,zr-.02,q.z)*dn(zf+.02,zf+.05,q.z);
       float pil=dn(.045,.06,abs(q.z-zb))*(1.-uX.w);
       float trim=clamp(sideO-side,0.,1.);gCh=trim*(1.-pil);gBk=trim*pil;
       float d=min(length(vec2(q.z-uC2.x,q.y-uC2.z)),length(vec2(q.z-uC2.y,q.y-uC2.z)));
       float arch=dn(uC2.z+.08,uC2.z+.1,d)*up(.5,1.,rg)*dn(5.,6.,rg);
       float low=dn(uC3.w+.09,uC3.w+.11,q.y);
       float grille=up(uC2.w-.2,uC2.w-.16,q.z)*dn(uC3.z*.38,uC3.z*.44,ax)*dn(.07,.09,abs(q.y-(uC4.x-.13)));
       gTr=max(arch,low*(1.-grille));gBk=max(gBk,grille*car);
       float fz=up(uC2.w-.34,uC2.w-.29,q.z),hx=up(uC3.z*.44,uC3.z*.5,ax)*dn(uC3.z*.95,uC3.z*1.,ax);
       float led=aaLine(abs(q.y-uC4.x+(ax-uC3.z*.7)*.12),.013,.024)*hx*fz,lens=dn(.05,.062,abs(q.y-uC4.x+.03))*hx*fz;
       gHd=car>.5?led:up(uC2.w-.3,uC2.w-.26,q.z)*dn(.05,.07,abs(q.y-uC3.x))*up(uC3.z*.42,uC3.z*.48,ax);gBk=max(gBk,lens*(1.-led));
       float rz=dn(-uC2.w+.27,-uC2.w+.32,q.z),bar=aaLine(abs(q.y-uC4.y),.012,.022)*dn(uC3.z*.96,uC3.z*1.,ax),cnr=dn(.045,.058,abs(q.y-uC4.y+.012))*up(uC3.z*.62,uC3.z*.68,ax);
       gTl=car>.5?rz*max(bar,cnr):dn(-uC2.w+.24,-uC2.w+.28,q.z)*dn(.045,.065,abs(q.y-uC3.y))*up(uC3.z*.36,uC3.z*.42,ax);
       float hz=uC4.z-.12,hdl=car*up(3.6,3.9,rg)*dn(5.2,5.5,rg)*dn(.014,.02,abs(q.y-hz))*max(dn(.08,.095,abs(q.z-(zb+.42))),(1.-uX.w)*dn(.08,.095,abs(q.z-(zb-.36))));
       gCh=max(gCh,hdl);
       float seam=max(dn(.004,.009,abs(q.z-(uC1.x-.12))),max(dn(.004,.009,abs(q.z-zb))*(1.-uX.w),dn(.004,.009,abs(q.z-(uC1.w+.3)))))*up(1.5,2.,rg)*dn(5.4,5.9,rg)*(1.-arch);
       float paint=1.-clamp(gGl+gTr+gBk+gCh+gHd+gTl,0.,1.);
       diffuseColor.rgb*=mix(1.,.955+.09*h31(floor(q*900.)),paint*car);
       diffuseColor.rgb*=1.-.6*seam;
       if(uX.y>0.)diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.6,.6,.62),tp*(1.-max(ws,rw)));
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.01,.012,.016),gGl);
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.022),gTr);
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.018)*(.7+.6*step(.5,fract((q.x*1.3+q.y)*28.)*fract((q.x*1.3-q.y)*28.)*4.)*grille+.3*(1.-grille)),gBk);
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.82,.83,.85),gCh);
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.95,.97,1.),gHd);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.45,.015,.02),gTl);}`)
     .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.06,gGl);roughnessFactor=mix(roughnessFactor,.7,gTr);roughnessFactor=mix(roughnessFactor,.14,max(gBk,gCh));')
     .replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\nmaterial.clearcoat*=1.-gTr;')
     .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=1.-max(max(max(gGl,gTr),max(gHd,gTl)),gBk);metalnessFactor=mix(metalnessFactor,1.,gCh);')
     .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.92,.96,1.)*gHd*uLit.x*1.4+vec3(1.,.05,.04)*gTl*uLit.y*1.3;');};
  m.customProgramCacheKey=()=>'carbody';return m;
}
const mkIM=(g,m,sh)=>{const im=new THREE.InstancedMesh(g,m,MAXC);im.count=0;im.frustumCulled=false;im.castShadow=!!sh;im.receiveShadow=true;scene.add(im);return im;};
const mirMat=new THREE.MeshPhysicalMaterial({metalness:.5,roughness:.3,clearcoat:1,clearcoatRoughness:.03}),chromeMat=new THREE.MeshStandardMaterial({color:0xd6d8dc,metalness:1,roughness:.12}),
  blackMat=new THREE.MeshStandardMaterial({color:0x0c0d0f,metalness:.2,roughness:.35});
for(const T of CT){T.body=mkIM(carBodyGeo(T),carMat(T),true);T.wx=T.W/2-.085;if(T.tram)continue;
  const h=T.L/2,mz=T.cf-.12,my=T.belt+.06,mx=T.W/2+.06,mir=[];
  for(const sd of[1,-1]){mir.push(new THREE.SphereGeometry(.1,10,8).scale(.55,.62,1).translate(sd*mx,my,mz),new THREE.BoxGeometry(.16,.03,.06).translate(sd*(mx-.1),my-.03,mz+.02));}
  T.mir=mkIM(mergeGeometries(mir),mirMat,true);
  const ch=[];for(const sd of[1,-1])ch.push(new THREE.CylinderGeometry(.045,.05,.16,12,1,true).rotateX(PI/2).translate(sd*T.W*.29,T.yb+.13,-h+.03));
  if(!T.wing)for(const sd of[1,-1])ch.push(new THREE.CylinderGeometry(.045,.05,.16,12,1,true).rotateX(PI/2).translate(sd*T.W*.21,T.yb+.13,-h+.03));
  T.chr=mkIM(mergeGeometries(ch),chromeMat,false);
  const bk=[new THREE.BoxGeometry(T.W*.86,.035,.3).translate(0,T.yb+.05,h-.14)];
  for(let k=-2;k<=2;k++)bk.push(new THREE.BoxGeometry(.02,.14,.36).translate(k*T.W*.12,T.yb+.1,-h+.18));
  if(T.wing){bk.push(new THREE.BoxGeometry(T.W*.84,.03,.32).translate(0,T.deck+.36,-h+.3));for(const sd of[1,-1])bk.push(new THREE.BoxGeometry(.03,.36,.16).translate(sd*T.W*.28,T.deck+.18,-h+.34));
    for(const sd of[1,-1])bk.push(new THREE.BoxGeometry(.05,.26,.5).translate(sd*(T.W/2-.02),T.belt-.16,-.32));}
  T.drk=mkIM(mergeGeometries(bk),blackMat,true);}
// wheels: rubber tyre, multi-spoke alloy rim + brake disc (spin), caliper (steers but doesn't spin). Built around the Y axis, then turned to X.
const V2w=(x,y)=>new THREE.Vector2(x,y),paintW=(g,v)=>{const n=g.attributes.position.count,a=new Float32Array(n*3).fill(v);g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;};
const tyreIM=(()=>{const g=new THREE.LatheGeometry([[.7,-.125],[.9,-.13],[.975,-.105],[1,-.05],[1,.05],[.975,.105],[.9,.13],[.7,.125]].map(q=>V2w(q[0],q[1])),22).rotateZ(PI/2);
  const im=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({color:0x111214,roughness:.88}),MAXC*4);im.count=0;im.frustumCulled=false;im.castShadow=true;scene.add(im);return im;})();
const rimIM=(()=>{const P=[paintW(new THREE.LatheGeometry([[.6,-.11],[.66,-.1],[.7,.1],[.66,.125],[.6,.11]].map(q=>V2w(q[0],q[1])),22),.85),
    paintW(new THREE.CylinderGeometry(.63,.63,.05,22,1,true).translate(0,-.05,0),.25),
    paintW(new THREE.CylinderGeometry(.5,.5,.025,22).translate(0,-.04,0),.42),
    paintW(new THREE.CylinderGeometry(.16,.18,.05,14).translate(0,.1,0),.9),paintW(new THREE.CylinderGeometry(.07,.07,.06,10).translate(0,.125,0),.15)];
  for(let k=0;k<10;k++){const sp=new THREE.BoxGeometry(.05,.045,.48).translate(0,.085,.4);sp.rotateZ(.06*(k%2?1:-1));sp.rotateY(k*PI/5);P.push(paintW(sp,k%2?.95:.8));}
  const g=mergeGeometries(P.map(q=>q.index?q.toNonIndexed():q)).rotateZ(PI/2);g.computeVertexNormals();
  const im=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({vertexColors:true,metalness:.95,roughness:.22}),MAXC*4);im.count=0;im.frustumCulled=false;scene.add(im);return im;})();
const calIM=(()=>{const g=new THREE.CylinderGeometry(.58,.58,.07,10,1,true,-.7,1.3).translate(0,-.01,0).rotateZ(PI/2);
  const im=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({metalness:.3,roughness:.4,side:THREE.DoubleSide}),MAXC*4);im.count=0;im.frustumCulled=false;scene.add(im);return im;})();
const CALCOL=[0xd01c1c,0xd01c1c,0xf2c230,0x18181a,0x2f6bd8,0xbfc2c6];
const beamMat=new THREE.MeshBasicMaterial({map:radialTexture([[0,'rgba(255,240,210,.9)'],[.4,'rgba(255,235,200,.35)'],[1,'rgba(255,230,190,0)']]),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:true});
// The beam is a flat sheet hugging the road; on crowned/sloped roads and curbs the ground pokes through it and the
// glow flickers (z-fighting). Pull each vertex ~1.2m toward the camera in view space: on screen it stays put, but its
// depth sits safely above the road while walls, cars and people in front of it still hide it.
beamMat.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <project_vertex>',
  '#include <project_vertex>\n{vec4 mv=mvPosition;mv.xyz*=max(0.,1.-1.2/max(length(mv.xyz),.001));gl_Position=projectionMatrix*mv;}');};
const beams=new THREE.InstancedMesh(new THREE.PlaneGeometry(7,15).rotateX(-PI/2).translate(0,0,9.5),beamMat,MAXC);beams.count=0;beams.frustumCulled=false;scene.add(beams);
const spot=new THREE.SpotLight(0xfff0d0,0,90,.6,.7,1.4);scene.add(spot,spot.target);
const copBars=[];for(let k=0;k<12;k++){const g=new THREE.Group(),a=new THREE.Mesh(new THREE.BoxGeometry(.5,.13,.3),new THREE.MeshBasicMaterial({color:0xff0000})),b=new THREE.Mesh(a.geometry,new THREE.MeshBasicMaterial({color:0x0030ff}));
  a.position.set(.3,1.53,-.3);b.position.set(-.3,1.53,-.3);g.add(a,b);g.visible=false;scene.add(g);copBars.push({g,a,b});}
const CARCOL=[0xf3f1ec,0xf3f1ec,0x0b0c0f,0x0b0c0f,0x0b0c0f,0x3a3d42,0xb9bcc0,0xb9bcc0,0x8a8d8f,0x14234a,0x5a1020,0x15382a,0xb7a37a,0x8e0d14,0x2d3f5a];
const cars=[];
function mkCar(ti,x,z,th,mode,col){
  const c={ti,T:CT[ti],x,z,y:groundH(x,z),th,vx:0,vz:0,w:0,steer:0,spin:0,roll:0,pitch:0,speed:0,mode,color:new THREE.Color(col??rpick(CARCOL)),hp:100,ai:null,spawned:false,thr:0,cal:new THREE.Color(rpick(CALCOL))};
  cars.push(c);return c;
}
const rmCar=c=>{const k=cars.indexOf(c);if(k>=0)cars.splice(k,1);};
// parked cars: kerbside slots along streets with a parking lane, filled in near the player
const SLOTS=[];
for(const e of EDGES){
  if(!e.ai||e.pk<1.8||e.c==='living_street'||e.tram)continue;const A=NODES[e.a],B=NODES[e.b];
  for(const sd of[1,-1])for(let s=A.trim+6;s<e.L-B.trim-6;s+=6.8){
    if(R()>.42)continue;edgePt(e,s,_lp);const off=(e.hw-1.15)*sd,x=_lp.x-_lp.tz*off,z=_lp.z+_lp.tx*off;
    if(!walkable(x,z))continue;
    SLOTS.push({x,z,th:atan2(_lp.tx,_lp.tz)+(sd<0&&!e.ow?PI:0),ti:(()=>{const r=R();return r<.08?4:r<.26?1:r<.52?2:0;})(),col:pick(CARCOL),car:null});
  }
}
for(let k=SLOTS.length-1;k>=0;k--)if(hypot(SLOTS[k].x-START.cx,SLOTS[k].z-START.cz)<9)SLOTS.splice(k,1);
{const MR=mkRng(5151);for(const s of SLOTS)if(MR()<.075)s.moto=MR()<.6?1:2;} // a motorcycle at about one kerb space in thirteen
// parking-lot stalls (laid out by tools/build-map.mjs): about half taken, filled in only close by so the lots don't use up the traffic
for(const L of MAP.lots||[])if(L.s)for(const [x,z,th] of L.s){if(R()>.5)continue;SLOTS.push({x,z,th,ti:(()=>{const r=R();return r<.06?4:r<.3?1:r<.6?2:0;})(),col:pick(CARCOL),car:null,lot:1});}
const SLOTG=new Map(),SLK=100;for(const s of SLOTS){const k=floor(s.x/SLK)+','+floor(s.z/SLK);let L=SLOTG.get(k);if(!L)SLOTG.set(k,L=[]);L.push(s);}
function tickSlots(){
  let nLot=0;for(const c of cars)if(c.lot)nLot++;
  const i0=floor(__gs.FX/SLK),j0=floor(__gs.FZ/SLK);
  for(let i=i0-2;i<=i0+2;i++)for(let j=j0-2;j<=j0+2;j++)for(const s of SLOTG.get(i+','+j)||[]){
    const d=abs(s.x-__gs.FX)+abs(s.z-__gs.FZ);
    if(s.blocked)continue;
    if(s.car){if(s.car.bike?!__late.BIKES.includes(s.car):!cars.includes(s.car))s.car=null;continue;}
    if(s.lot&&(d>110||nLot>=36))continue;
    if(d<170&&d>40&&cars.length<MAXC-14){const gap=s.lot?2.2:5.5;if(cars.some(o=>abs(o.x-s.x)<gap&&abs(o.z-s.z)<gap))continue;s.car=s.moto?__late.mkBike(s.moto-1,s.x,s.z,s.th,'parked'):mkCar(s.ti,s.x,s.z,s.th+(s.lot?PI:0),'parked',s.col);s.car.spawned=true;if(s.lot){s.car.lot=1;nLot++;}}
  }
}
mkCar(4,START.cx,START.cz,START.cth,'parked',0xb01020);

function drive(c,thr,st,hb,dt){
  const T=c.T,fx=sin(c.th),fz=cos(c.th),rx=-fz,rz=fx;
  let vf=c.vx*fx+c.vz*fz,vl=c.vx*rx+c.vz*rz;const v0=vf;
  const ms=min(.55,40/(vf*vf+1));
  c.steer+=(st*ms-c.steer)*min(1,dt*9);
  if(thr>0){vf+=(vf<-.5?24:T.accel*(1-max(0,vf)/T.maxSpeed))*thr*dt;}
  else if(thr<0){vf+=(vf>.5?26:T.accel*.7*(1-max(0,-vf)/(T.maxSpeed*.3)))*thr*dt;}
  vf*=exp(-dt*(thr===0?.4:.03));
  if(hb)vf-=sign(vf)*min(abs(vf),9*dt);
  const grip=hb?1.3:T.grip/(1+abs(vf)*.015);
  vl*=exp(-grip*dt);
  const yaw=vf/2.7*Math.tan(c.steer)*(hb?1.35:1);
  c.th+=(yaw+c.w)*dt;c.w*=exp(-4*dt);
  const f2x=sin(c.th),f2z=cos(c.th);
  c.vx=f2x*vf-f2z*vl;c.vz=f2z*vf+f2x*vl;
  c.x+=c.vx*dt;c.z+=c.vz*dt;
  c.spin+=vf/T.wr*dt;c.speed=vf;
  c.roll+=(clamp(yaw*vf*.0045,-.08,.08)-c.roll)*min(1,dt*6);
  c.pitch+=(clamp(-(vf-v0)/max(dt,1e-3)*.0035,-.05,.05)-c.pitch)*min(1,dt*6);
  c.slip=abs(vl);
}
function carStatic(c){
  const fx=sin(c.th),fz=cos(c.th),T=c.T;let imp=0;
  for(const off of T.offs){
    const px=c.x+fx*off,pz=c.z+fz*off;
    if(pushOut(px,pz,T.W*.55)){
      c.x+=PO.x-px;c.z+=PO.z-pz;const vn=c.vx*PO.nx+c.vz*PO.nz;
      if(vn<0){c.vx-=1.3*vn*PO.nx;c.vz-=1.3*vn*PO.nz;c.w+=(fz*off*PO.nx-fx*off*PO.nz)*-vn*.05;imp=max(imp,-vn);}
    }
  }
  if(!walkable(c.x,c.z)&&c.px!==undefined){imp=max(imp,hypot(c.vx,c.vz));c.x=c.px;c.z=c.pz;c.vx*=-.3;c.vz*=-.3;}
  c.px=c.x;c.pz=c.z;
  c.y+=(groundH(c.x,c.z)-c.y)*min(1,__gs.dt_*14);
  if(imp>3)crash(c,imp);
}
function crash(c,imp){c.lastImp=max(c.lastImp||0,imp);
  c.hp=max(0,c.hp-(imp-3)*1.8);
  if(c===__late.G.car){__late.thud(min(.7,imp*.04));__late.G.shake=min(.6,imp*.03);}
}
function collideCars(A){
  const afx=sin(A.th),afz=cos(A.th);
  for(const B of cars){
    if(B===A)continue;const ddx=A.x-B.x,ddz=A.z-B.z,reach=(A.T.L+B.T.L)/2+1;if(abs(ddx)>reach||abs(ddz)>reach)continue;
    const bfx=sin(B.th),bfz=cos(B.th),ra=A.T.W*.52,rb=B.T.W*.52;
    for(const oa of A.T.offs)for(const ob of B.T.offs){
      const dx=A.x+afx*oa-(B.x+bfx*ob),dz=A.z+afz*oa-(B.z+bfz*ob),d2=dx*dx+dz*dz,rs=ra+rb;
      if(d2>=rs*rs||d2<1e-6)continue;
      const d=sqrt(d2),nx=dx/d,nz=dz/d,pen=rs-d,heavy=B.T.tram?.06:.5;
      if(B.mode==='traffic'){B.vx=bfx*B.speed;B.vz=bfz*B.speed;if(B.flee)B.speed*=.75;else if(!B.T.tram){B.mode='free';B.spawned=true;}else B.speed*=.5;if(A===__late.G.car&&!B.flee)__late.addHeat(.25);}
      else if(B.mode==='parked'||B.mode==='block')B.mode='free';
      A.x+=nx*pen*(1-heavy);A.z+=nz*pen*(1-heavy);if(!B.T.tram){B.x-=nx*pen*.5;B.z-=nz*pen*.5;}
      const vn=(A.vx-B.vx)*nx+(A.vz-B.vz)*nz;
      if(vn<0){
        const jj=-1.3*vn/2;A.vx+=jj*nx*(B.T.tram?2:1);A.vz+=jj*nz*(B.T.tram?2:1);if(!B.T.tram){B.vx-=jj*nx;B.vz-=jj*nz;}
        A.w+=(afz*oa*nx-afx*oa*nz)*jj*.1;if(!B.T.tram)B.w-=(bfz*ob*nx-bfx*ob*nz)*jj*.1;
        if(-vn>3){crash(A,-vn*.7);crash(B,-vn*.7);if(A===__late.G.car&&B.mode==='police')__late.addHeat(.4);}
      }
    }
  }
}
function carHitsPeds(c){
  const sp=hypot(c.vx,c.vz),fx=sin(c.th),fz=cos(c.th),hl=c.T.L/2+.3,hw=c.T.W/2+.3;
  for(let k=0;k<__late.peds.length;k++){
    const p=__late.peds[k];if(p.hidden||p.state==='down'||p.state==='dead')continue;
    const dx=p.x-c.x,dz=p.z-c.z;if(abs(dx)>hl+1||abs(dz)>hl+1)continue;
    const lf=dx*fx+dz*fz,ll=-dx*fz+dz*fx;if(abs(lf)>hl||abs(ll)>hw||p.y>c.y+1.3)continue;
    if(k===0){ if(c===__late.G.car)continue; if(sp>4&&__late.G.hurtCd<=0){__late.G.hp-=sp*2.2;__late.G.hurtCd=.8;__late.G.shake=.5;__late.thud(.5);} continue; }
    if(sp>3){p.state='down';p.timer=4+rnd()*2;p.vx=c.vx*1.1;p.vz=c.vz*1.1;p.vy=2.5+sp*.12;if(c===__late.G.car){__late.addHeat(1);__late.thud(.35);}}
    else{const s=sign(ll)||1;p.x+=s*-fz*.12;p.z+=s*fx*.12;}
  }
}

/* --- traffic AI on the real street graph --- */
const TRAFFIC_N=30,TRAM_N=5;
function lanePt(e,dir,s,off,o){const sab=dir>0?s:e.L-s;edgePt(e,sab,o);if(dir<0){o.tx=-o.tx;o.tz=-o.tz;}o.x+=-o.tz*off;o.z+=o.tx*off;return o;}
const endNode=(e,dir)=>NODES[dir>0?e.b:e.a];
const canEnter=(e,n)=>e.ai&&(!e.ow||e.a===n.i);
const laneOff=(c,e)=>c.T.tram?e.tlo:e.lo;
function spawnTraffic(minD,maxD,tram){
  const cand=nodesNear(__gs.FX,__gs.FZ,maxD).filter(n=>hypot(n.x-__gs.FX,n.z-__gs.FZ)>=minD);
  for(let t=0;t<14&&cand.length;t++){
    const n=rpick(cand),opts=n.e.map(i=>EDGES[i]).filter(e=>canEnter(e,n)&&(!tram||e.tram)&&e.L>(tram?40:18));
    if(!opts.length)continue;
    const e=rpick(opts),dir=e.a===n.i?1:-1,ti=tram?3:(()=>{const r=rnd();return r<.1?4:r<.28?1:r<.55?2:0;})(),T=CT[ti],en=endNode(e,dir);
    const s=n.trim+T.L/2+2+rnd()*max(1,e.L-n.trim-en.trim-T.L-6);
    lanePt(e,dir,s,tram?e.tlo:e.lo,_lp);
    if(cars.some(o=>hypot(o.x-_lp.x,o.z-_lp.z)<(o.T.L+T.L)/2+3))continue;
    const c=mkCar(ti,_lp.x,_lp.z,atan2(_lp.tx,_lp.tz),'traffic',tram?0xd2202e:undefined);
    c.spawned=true;c.speed=tram?5:8;c.ai={e,dir,s,turn:null,stuck:0,ghost:0};return c;
  }
}
function chooseNext(c,e,dir){
  const n=endNode(e,dir),tram=c.T.tram;
  const opts=n.e.map(i=>EDGES[i]).filter(x=>x!==e&&canEnter(x,n)&&(!tram||x.tram));
  if(!opts.length){if(!tram&&!e.ow)return{e,dir:-dir};return null;}
  lanePt(e,dir,e.L,0,_lp);const hx=_lp.tx,hz=_lp.tz;
  const w=opts.map(x=>{const d=x.a===n.i?1:-1;lanePt(x,d,0,0,_lq);const dot=hx*_lq.tx+hz*_lq.tz;
    return tram?(dot>.7?10:dot>.2?.4:.02):(dot>.85?5:dot>-.3?2.2:.15)*(x.c==='residential'||x.c==='living_street'?.5:1);});
  let pickI=0;
  if(tram){for(let k=1;k<w.length;k++)if(w[k]>w[pickI])pickI=k;}
  else{let tot=w.reduce((a,b)=>a+b,0),r=rnd()*tot;for(pickI=0;pickI<w.length-1;pickI++){r-=w[pickI];if(r<=0)break;}}
  const x=opts[pickI];return{e:x,dir:x.a===n.i?1:-1};
}
function stepTraffic(c,dt){
  const a=c.ai,e=a.e,fx=sin(c.th),fz=cos(c.th),tram=c.T.tram;
  const base=c.flee||(tram?8.5:e.c==='motorway'?24:/primary|secondary|trunk|motorway/.test(e.c)?12.5:e.c==='tertiary'?10.5:8);
  let target=a.turn?(tram?5:6.5):base,blocked=false;
  if(!a.turn&&!c.flee){const N=endNode(e,a.dir);
    if(N.sig){const stopS=e.L-N.trim-1.6-c.T.L/2,rem=stopS-a.s;lanePt(e,a.dir,e.L,0,_lp);const ls=lightState(abs(_lp.tx)>abs(_lp.tz)?1:0);
      if(rem>-.6&&rem<30&&(ls===0||(ls===1&&rem>4)))target=min(target,max(0,rem)*.9);}
    else{const rem=e.L-N.trim-a.s;if(rem<14)target=min(target,max(4,rem*.7));}}
  if(a.ghost>0)a.ghost-=dt;
  else{
    const look=6+c.speed*1.3;
    for(const o of cars){
      if(o===c)continue;const dx=o.x-c.x,dz=o.z-c.z,reach=look+(c.T.L+o.T.L)/2+3;if(abs(dx)>reach||abs(dz)>reach)continue;
      const f=dx*fx+dz*fz,gap=f-(c.T.L+o.T.L)/2-2;if(f<.5||gap>look)continue;
      if(abs(-dx*fz+dz*fx)<1.9){target=min(target,max(0,gap)*1.2);blocked=true;}
    }
    for(const p of __late.peds){
      if(p.hidden)continue;const dx=p.x-c.x,dz=p.z-c.z;if(abs(dx)>30||abs(dz)>30)continue;
      const f=dx*fx+dz*fz,gap=f-c.T.L/2-1.9;if(f<.5||gap>look)continue;
      if(abs(-dx*fz+dz*fx)<1.6){target=min(target,max(0,gap)*1.2);blocked=true;}
    }
  }
  if(blocked&&c.speed<.3){a.stuck+=dt;if(a.stuck>(c.flee?1.2:9)){a.ghost=3;a.stuck=0;}}else a.stuck=0;
  c.speed+=clamp(target-c.speed,-16*dt,(tram?2:3.5)*dt);if(c.speed<0)c.speed=0;
  const ds=c.speed*dt;
  if(!a.turn){
    a.s+=ds;const N=endNode(e,a.dir);
    if(a.s>=e.L-N.trim-.01){
      const nx=chooseNext(c,e,a.dir);if(!nx){a.dead=true;return;}
      lanePt(e,a.dir,min(a.s,e.L-N.trim),laneOff(c,e),_lp);const P0x=_lp.x,P0z=_lp.z,T0x=_lp.tx,T0z=_lp.tz;
      const s2=min(N.trim,nx.e.L*.5);lanePt(nx.e,nx.dir,s2,laneOff(c,nx.e),_lq);const P2x=_lq.x,P2z=_lq.z,T2x=_lq.tx,T2z=_lq.tz;
      let P1x=(P0x+P2x)/2,P1z=(P0z+P2z)/2;const den=T0x*T2z-T0z*T2x;
      if(abs(den)>.15){const t=((P2x-P0x)*T2z-(P2z-P0z)*T2x)/den;if(t>0&&t<40){P1x=P0x+T0x*t;P1z=P0z+T0z*t;}}
      const len=hypot(P1x-P0x,P1z-P0z)+hypot(P2x-P1x,P2z-P1z);
      if(len<.4){a.e=nx.e;a.dir=nx.dir;a.s=s2;}
      else{a.turn={x0:P0x,z0:P0z,x1:P1x,z1:P1z,x2:P2x,z2:P2z,len,e:nx.e,dir:nx.dir,s2};a.t=0;}
    }else{lanePt(e,a.dir,a.s,laneOff(c,e),_lp);c.x=_lp.x;c.z=_lp.z;c.th=atan2(_lp.tx,_lp.tz);c.steer*=.8;}
  }
  if(a.turn){
    const T=a.turn;a.t+=ds/T.len;
    if(a.t>=1){a.e=T.e;a.dir=T.dir;a.s=T.s2;a.turn=null;lanePt(a.e,a.dir,a.s,laneOff(c,a.e),_lp);c.x=_lp.x;c.z=_lp.z;c.th=atan2(_lp.tx,_lp.tz);}
    else{const t=a.t,u=1-t;c.x=u*u*T.x0+2*u*t*T.x1+t*t*T.x2;c.z=u*u*T.z0+2*u*t*T.z1+t*t*T.z2;
      const dx=u*(T.x1-T.x0)+t*(T.x2-T.x1),dz=u*(T.z1-T.z0)+t*(T.z2-T.z1);if(dx*dx+dz*dz>1e-6){const nth=atan2(dx,dz);c.steer=clamp(wrap(nth-c.th)*8,-.5,.5);c.th=nth;}}
  }
  c.vx=sin(c.th)*c.speed;c.vz=cos(c.th)*c.speed;c.spin+=c.speed/c.T.wr*dt;c.y=0;
}
/* --- police AI: shortest path through the street graph, then direct pursuit --- */
function nearestNode(x,z){let best=null,bd=1e9;for(const n of nodesNear(x,z,180)){if(!n.e.some(i=>EDGES[i].ai))continue;const d=hypot(n.x-x,n.z-z);if(d<bd){bd=d;best=n;}}return best;}
function pathTo(a,b){
  const N=NODES.length,dist=new Float64Array(N).fill(Infinity),prev=new Int32Array(N).fill(-1),done=new Uint8Array(N),open=[a.i];dist[a.i]=0;
  while(open.length){let bi=0;for(let k=1;k<open.length;k++)if(dist[open[k]]<dist[open[bi]])bi=k;const u=open[bi];open[bi]=open[open.length-1];open.pop();
    if(done[u])continue;done[u]=1;if(u===b.i)break;
    for(const ei of NODES[u].e){const e=EDGES[ei];if(!e.ai)continue;const v=e.a===u?e.b:e.a,nd=dist[u]+e.L;if(nd<dist[v]){dist[v]=nd;prev[v]=u;open.push(v);}}}
  const path=[];for(let v=b.i;v>=0;v=prev[v]){path.push(v);if(v===a.i)break;}return path.reverse();
}

await stage(.76,'Filling the sidewalks');
export { CARCOL, CT, MAXC, SLOTS, TRAFFIC_N, TRAM_N, beamMat, beams, calIM, carHitsPeds, carLit, carStatic, cars, collideCars, copBars, crash, drive, mkCar, nearestNode, pathTo, rimIM, rmCar, spawnTraffic, spot, stepTraffic, tickSlots, tyreIM };
