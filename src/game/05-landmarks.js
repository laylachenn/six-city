// Six City — landmarks. One of the game's modules; they load in numbered order (src/game/index.js).
import './04-world.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { __gs, __late, later } from './shared.js';
import { ATM, C3, EDGES, MAP, N8AOPass, NODES, PI, R, REAL, RT, abs, atan2, camera, ceil, clamp, cos, cv, floor, hypot, lerp, max, min, mkRng, realTex, renderer, round, rr, scene, sin, smooth, sqrt, stage } from './01-core.js';
import { WX, night, sinE, skyU } from './02-sky.js';
import { noiseTexture, radialTexture, speckle } from './03-textures.js';
import { CULL, FTILE, GB, MeshBag, PV, SIGNMATS, STY, UP, WHITE, YAX, _lp, addCircle, addDecal, addVol, bgb, capRing, chunkedInstanced, cnMat, cullTick, cumOf, decalMat, edgePt, facMats, facVar, flat, grassTex, hsh, inPoly, lmMats, lmMeshes, mat4, meshesOf, nearestEdge, nodesNear, nrmOf, ntAdd, ntHit, offsetLine, onIsland, onWater, parseCol, plainMat, polyArea, polyCen, polyInto, ringOff, solidAt, walkable, wallQ, waterMat, zoneAt } from './04-world.js';
later({gbBox:()=>gbBox}); // for earlier modules, read when called

/* ============================== landmarks modelled by hand ============================== */
// Each one is placed on its real OpenStreetMap footprint; the generic extrusion of the parts it replaces is switched off.
// They are built when you come within range and dropped again when you leave.
const VN=new Map();for(const v of MAP.vols)if(v.n){let L=VN.get(v.n);if(!L)VN.set(v.n,L=[]);L.push(v);}
const volsOf=n=>VN.get(n)||[];
const LMODELS=[];
function landmark(name,x,z,r,build){LMODELS.push({name,x,z,r,build,obj:null});}
function lmTick(x,z,all){for(const L of LMODELS){const d=hypot(L.x-x,L.z-z);
  if(!L.obj&&d<L.r){L.obj=L.build()||new THREE.Group();scene.add(L.obj);if(!all)return;}
  else if(L.obj&&d>L.r+400){scene.remove(L.obj);L.obj.traverse(o=>{if(o.geometry)o.geometry.dispose();});L.obj=null;}}}
const LMM={ // shared landmark materials
  copper:new THREE.MeshStandardMaterial({color:0x4d7f6a,roughness:.7,metalness:.25}),
  slate:new THREE.MeshStandardMaterial({color:0x3d4448,roughness:.7,metalness:.1}),
  stoneCL:new THREE.MeshStandardMaterial({color:0xb7a27f,roughness:.92,map:noiseTexture('#c9b796',150,235,1,[1,.93,.8])}),
  concrete:new THREE.MeshStandardMaterial({color:0xe6e3dc,roughness:.8}),
  limestone:new THREE.MeshStandardMaterial({color:0xe2d9c6,roughness:.85}),
  steel:new THREE.MeshStandardMaterial({color:0xd8dadc,roughness:.35,metalness:.7}),
  glass:new THREE.MeshStandardMaterial({color:0x2a3a46,roughness:.08,metalness:.9,emissive:0xffd9a0,emissiveIntensity:0}),
  vault:new THREE.MeshStandardMaterial({color:0xcfe3ec,roughness:.05,metalness:.6,transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false}),
  red:new THREE.MeshStandardMaterial({color:0xc4302b,roughness:.6}),
};
const legMats=['#1d1d1d','#efefef','#d43a2f','#f2c230','#7a4fb0','#2f7fd0','#3aa05a','#1d1d1d','#ff8a2a','#efefef','#d43a2f','#2f7fd0'].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.5,metalness:.3}));
const boxGeo=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
// oriented box through GB (vertex coloured, plain or textured) — used for battlements and other small blocks
function gbBox(g,x,y0,z,w,h,d,ry,col){const c=cos(ry),s=sin(ry),P=(a,b,y)=>[x+a*c+b*s,y,z-a*s+b*c],hw=w/2,hd=d/2,y1=y0+h;
  const q=[[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]];for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],nx=(b[1]-a[1]),nz=-(b[0]-a[0]),l=hypot(nx,nz);
    const n=[(nx*c+nz*s)/l,0,(-nx*s+nz*c)/l];g.quad(P(a[0],a[1],y0),P(b[0],b[1],y0),P(b[0],b[1],y1),P(a[0],a[1],y1),n,col);}
  g.quad(P(-hw,-hd,y1),P(hw,-hd,y1),P(hw,hd,y1),P(-hw,hd,y1),UP,col);}
function crenellate(g,p,y,col,mw,gap,depth,hgt){ // merlons along every edge of a footprint
  for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length],L=hypot(c[0]-a[0],c[1]-a[1]);if(L<1)continue;const tx=(c[0]-a[0])/L,tz=(c[1]-a[1])/L,ry=atan2(-tz,tx);
    const n=max(1,floor(L/(mw+gap)));for(let k=0;k<n;k++){const s=(k+.5)*L/n;gbBox(g,a[0]+tx*s+tz*depth/2,y,a[1]+tz*s-tx*depth/2,mw,hgt,depth,ry,col);}}}
function hipRoof(g,x0,x1,z0,z1,y,h,col){ // axis-aligned hipped roof, ridge along the long side
  const lx=x1-x0,lz=z1-z0,ins=min(lx,lz)/2,A=[x0,y,z0],B=[x1,y,z0],C=[x1,y,z1],D=[x0,y,z1],cx=(x0+x1)/2,cz=(z0+z1)/2;
  let r1,r2;if(lx>=lz){r1=[x0+ins,y+h,cz];r2=[x1-ins,y+h,cz];g.quad(A,B,r2,r1,nrmOf(A,B,r2,[0,1,-1]),col);g.quad(C,D,r1,r2,nrmOf(C,D,r1,[0,1,1]),col);g.tri(B,C,r2,nrmOf(B,C,r2,[1,1,0]),col);g.tri(D,A,r1,nrmOf(D,A,r1,[-1,1,0]),col);}
  else{r1=[cx,y+h,z0+ins];r2=[cx,y+h,z1-ins];g.quad(B,C,r2,r1,nrmOf(B,C,r2,[1,1,0]),col);g.quad(D,A,r1,r2,nrmOf(D,A,r1,[-1,1,0]),col);g.tri(A,B,r1,nrmOf(A,B,r1,[0,1,-1]),col);g.tri(C,D,r2,nrmOf(C,D,r2,[0,1,1]),col);}}
const mainPart=n=>{let best=null;for(const v of volsOf(n))if(!best||abs(polyArea(v.p))>abs(polyArea(best.p)))best=v;return best;};

// --- Toronto City Hall (Viljo Revell, 1965): two curved towers of unequal height cupping the saucer-shaped council chamber.
// The towers' inner faces are glass; their backs are windowless ribbed concrete.
{const V=volsOf('Toronto City Hall'),dome=V.find(v=>v.rs===4);
 if(dome){const [ox,oz]=polyCen(dome.p);let R0=0;for(const q of dome.p)R0+=hypot(q[0]-ox,q[1]-oz);R0/=dome.p.length;
  const towers=V.filter(v=>v.b>=7&&v.h>60);
  for(const v of V)if(towers.includes(v)||v===dome||(v.h<=13.5&&abs(polyCen(v.p)[0]-ox)<15&&abs(polyCen(v.p)[1]-oz)<15))v.skip=1;
  landmark('cityhall',ox,oz,3200,()=>{const g=lmMeshes(()=>{
    for(const v of towers){const p=v.p,n=p.length;let dist=0;
      for(let i=0;i<n;i++){const a=p[i],c=p[(i+1)%n],L=hypot(c[0]-a[0],c[1]-a[1]);if(L<.01)continue;const nrm=[(c[1]-a[1])/L,0,-(c[0]-a[0])/L],mx=(a[0]+c[0])/2,mz=(a[1]+c[1])/2,
        tl=hypot(ox-mx,oz-mz)||1,f=(nrm[0]*(ox-mx)+nrm[2]*(oz-mz))/tl,st=f>.3?STY.CHGL:STY.RIB;
        wallQ(bgb('k',st),a,c,v.b,v.h,v.h,nrm,WHITE,FTILE[st],dist,0,0);dist+=L;}
      polyInto(bgb('k',STY.PLAIN),p,v.h,0,C3(.55,.55,.53));}});
    // the council chamber: a white saucer on a short stem, ribbed underneath, with a shallow dome on top
    const mb=new MeshBag(),pr=[[0,12.6],[6.5,12.7],[R0*.55,13.6],[R0*.8,15],[R0*.96,16.6],[R0,17.4],[R0*.99,18.1],[R0*.9,19.3],[R0*.7,21.3],[R0*.45,23.6],[R0*.2,24.8],[0,25.1]];
    mb.add(new THREE.LatheGeometry(pr.map(q=>new THREE.Vector2(q[0],q[1])),72),LMM.concrete,ox,0,oz);
    mb.add(new THREE.CylinderGeometry(6.2,6.8,5,32,1,true),LMM.glass,ox,10.3,oz);
    for(let k=0;k<40;k++){const th=k/40*2*PI,r0=7,r1=R0*.97,y0=12.9,y1=16.7,L=r1-r0,an=atan2(y1-y0,L);
      const fin=boxGeo(L,.7,.35);fin.rotateZ(an);fin.translate((r0+r1)/2,(y0+y1)/2-.35,0);fin.rotateY(th);mb.add(fin,LMM.concrete,ox,0,oz);}
    return mb.into(g);});}}

// --- Sharp Centre for Design (Alsop, 2004): a black-and-white pixelated "tabletop" 26 m up on twelve multicoloured legs
{const V=volsOf('Sharp Centre for Design'),old=V.find(v=>v.h<20),core=V.filter(v=>v.h>=20).sort((a,b)=>abs(polyArea(b.p))-abs(polyArea(a.p)))[0];
 if(old&&core){for(const v of V)if(v!==old)v.skip=1;
  const xs=old.p.map(q=>q[0]),cxw=(min(...xs)+max(...xs))/2,[kx,kz]=polyCen(core.p),X0=cxw-15.5,X1=cxw+15.5,Z0=kz-58,Z1=kz+26,Y0=26,Y1=35;
  landmark('sharp',(X0+X1)/2,(Z0+Z1)/2,2600,()=>{const g=lmMeshes(()=>{const s=bgb('k',STY.SHARP),pts=[[X0,Z0],[X1,Z0],[X1,Z1],[X0,Z1]];let d=0;
      for(let i=0;i<4;i++){const a=pts[i],c=pts[(i+1)%4],L=hypot(c[0]-a[0],c[1]-a[1]),nrm=[-(c[1]-a[1])/L,0,(c[0]-a[0])/L];
        s.quad([a[0],Y0,a[1]],[c[0],Y0,c[1]],[c[0],Y1,c[1]],[a[0],Y1,a[1]],nrm,WHITE,[d/40,0],[(d+L)/40,0],[(d+L)/40,1],[d/40,1]);d+=L;}
      const bt=[[X0,Y0,Z0],[X1,Y0,Z0],[X1,Y0,Z1],[X0,Y0,Z1]];s.quad(bt[0],bt[1],bt[2],bt[3],[0,-1,0],WHITE,[0,0],[31/40,0],[31/40,84/9/4],[0,84/9/4]);
      polyInto(bgb('k',STY.PLAIN),pts,Y1,0,C3(.6,.6,.6));});
    const mb=new MeshBag();
    // the red stair / lift core that climbs into the box
    mb.add(boxGeo(6.5,Y1-.2,5.6),LMM.red,kx,(Y1-.2)/2,kz);
    // six pairs of tapered steel legs, each pair splaying out from one footing
    let k=0;for(const [fx,fz] of[[X0+3,Z0+9],[X1-3,Z0+12],[X0+2,Z0+38],[X1-2.5,Z0+44],[X0+4,Z1-16],[X1-3,Z1-10]])for(const sd of[-1,1]){
      const tx=fx+sd*rr(1,3.5)*(fx<cxw?-1:1)*.4,tz=fz+sd*rr(4,8),L=hypot(tx-fx,Y0,tz-fz),geo=new THREE.CylinderGeometry(.32,.5,L,10);
      geo.translate(0,L/2,0);const dir=new THREE.Vector3(tx-fx,Y0,tz-fz).normalize();geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(YAX,dir));geo.translate(fx,0,fz);mb.add(geo,legMats[k++%12]);}
    return mb.into(g);});}}

// --- Roy Thomson Hall (Erickson, 1982): a round hall wrapped in a sloping tent of diamond-patterned glass
{const v=mainPart('Roy Thomson Hall');
 if(v){for(const q of volsOf('Roy Thomson Hall'))q.skip=1;const [ox,oz]=polyCen(v.p),p=v.p,n=p.length;
  landmark('rth',ox,oz,2600,()=>lmMeshes(()=>{const g=bgb('k',STY.RTH),LV=[[0,1],[3.2,1],[8.5,.88],[13,.74],[17,.58],[20.4,.42]],at=(q,s)=>[ox+(q[0]-ox)*s,oz+(q[1]-oz)*s];
    for(let k=0;k<LV.length-1;k++){const [y0,s0]=LV[k],[y1,s1]=LV[k+1];let d=0;
      for(let i=0;i<n;i++){const a=p[i],c=p[(i+1)%n],L=hypot(c[0]-a[0],c[1]-a[1]);if(L<.01)continue;
        const A=at(a,s0),B=at(c,s0),C2=at(c,s1),D=at(a,s1),P0=[A[0],y0,A[1]],P1=[B[0],y0,B[1]],P2=[C2[0],y1,C2[1]],P3=[D[0],y1,D[1]],m=[(a[0]+c[0])/2-ox,.3,(a[1]+c[1])/2-oz];
        g.quad(P0,P1,P2,P3,nrmOf(P0,P1,P2,m),WHITE,[d/7,y0/7],[(d+L)/7,y0/7],[(d+L)/7,y1/7],[d/7,y1/7]);d+=L;}}
    polyInto(bgb('k',STY.PLAIN),p.map(q=>at(q,.42)),20.4,0,C3(.5,.52,.55));
    polyInto(bgb('k',STY.RTH),p.map(q=>at(q,.2)),20.9,.14,WHITE);
    for(let i=0;i<n;i++){const a=at(p[i],.2),c=at(p[(i+1)%n],.2),L=hypot(c[0]-a[0],c[1]-a[1])||1;bgb('k',STY.PLAIN).quad([a[0],20.4,a[1]],[c[0],20.4,c[1]],[c[0],20.9,c[1]],[a[0],20.9,a[1]],[(c[1]-a[1])/L,0,-(c[0]-a[0])/L],C3(.5,.52,.55));}}));}}

// --- Casa Loma (E.J. Lennox, 1914): Gothic Revival castle of warm sandstone — battlemented walls, steep copper roofs,
// the square open-topped Norman Tower to the east, the round Scottish Tower with its conical roof to the west, a glass-domed conservatory.
{const v=mainPart('Casa Loma');
 if(v&&abs(polyArea(v.p))>1500){v.skip=1;const [ox,oz]=polyCen(v.p),W=16;
  landmark('casaloma',ox,oz,2400,()=>{const stone=parseCol('#b29a76');
    const g=lmMeshes(()=>{const gs=bgb('k',STY.ARCH),p=v.p;let d=0;
      for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length],L=hypot(c[0]-a[0],c[1]-a[1]);if(L<.01)continue;wallQ(gs,a,c,0,W,W,[(c[1]-a[1])/L,0,-(c[0]-a[0])/L],C3(1.05,.93,.74),FTILE[STY.ARCH],d,0,.25);d+=L;}
      polyInto(bgb('k',STY.PLAIN),p,W,0,C3(.25,.22,.19));
      crenellate(bgb('k',STY.PLAIN),p,W,stone,.9,.8,.6,1.2);
      // Norman Tower: square, 4 storeys above the house, crenellated open top
      const NT=[[ox+11,oz-21],[ox+24,oz-21],[ox+24,oz-8],[ox+11,oz-8]];d=0;
      for(let i=0;i<4;i++){const a=NT[i],c=NT[(i+1)%4],L=13;wallQ(gs,a,c,0,33,33,[(c[1]-a[1])/L,0,-(c[0]-a[0])/L],C3(1.05,.93,.74),FTILE[STY.ARCH],d,0,.25);d+=L;}
      polyInto(bgb('k',STY.PLAIN),NT,33,0,C3(.3,.27,.23));crenellate(bgb('k',STY.PLAIN),NT,33,stone,1,.9,.7,1.6);
      for(const [x,z] of NT)gbBox(bgb('k',STY.PLAIN),x,31,z,2.2,4.2,2.2,0,stone);
      // steep hipped copper roofs over the main ranges, behind the battlements
      const cu=C3(.08,.2,.14);hipRoof(bgb('k',STY.PLAIN),ox-25,ox+8,oz-6,oz+11,W,10,cu);hipRoof(bgb('k',STY.PLAIN),ox+8,ox+38,oz-4,oz+12,W,9,cu);hipRoof(bgb('k',STY.PLAIN),ox-26,ox-11,oz+10,oz+22,W,7.5,cu);});
    const mb=new MeshBag(),S=LMM.stoneCL,Cu=LMM.copper;
    // Scottish Tower: round, enclosed, conical roof with a flared eave
    mb.add(new THREE.CylinderGeometry(6.4,6.8,30,28),S,ox-24,15,oz-9);
    mb.add(new THREE.CylinderGeometry(7.4,7.4,1.2,28),S,ox-24,30.6,oz-9);
    mb.add(new THREE.LatheGeometry([[0,0],[8.2,0],[6.6,2.2],[3.6,7],[.4,12.5],[0,13]].map(q=>new THREE.Vector2(q[0],q[1])),28),Cu,ox-24,31.2,oz-9);
    // round corner turrets with candle-snuffer roofs
    for(const [x,z,h,r] of[[-29,15,23,2.6],[-13,22,22,2.4],[38,-5,22,2.4],[39,13,21,2.6],[25,-21,37,2.3],[2,-17,24,2.2],[-18,-14,23,2.2]]){
      mb.add(new THREE.CylinderGeometry(r,r,h,18),S,ox+x,h/2,oz+z);mb.add(new THREE.ConeGeometry(r*1.25,r*3.3,18),Cu,ox+x,h+r*1.65,oz+z);}
    // conservatory on the east end: stained-glass dome
    mb.add(new THREE.SphereGeometry(6.5,24,10,0,2*PI,0,PI/2),LMM.glass,ox+36,W-2,oz+3);
    mb.add(new THREE.CylinderGeometry(6.7,6.7,1,24),S,ox+36,W-1.6,oz+3);
    // chimneys
    for(const [x,z] of[[-8,-2],[14,6],[-20,4],[28,0]])mb.add(boxGeo(1.6,6,2.6),S,ox+x,W+7,oz+z);
    return mb.into(g);});}}

// --- Rogers Centre (1989): the first fully retractable stadium roof — four segmented panels, white, ribbed.
{const v=volsOf('Rogers Centre').find(q=>q.rs===4);
 if(v){v.skip=1;const [cx,cz]=polyCen(v.p);let r=0;for(const q of v.p)r+=hypot(q[0]-cx,q[1]-cz);r=r/v.p.length*.97;
  landmark('rogers',cx,cz,3500,()=>{const H=v.rh||54,top=v.h||86,Rs=(r*r+H*H)/(2*H),th=Math.asin(min(1,r/Rs));
    const geo=new THREE.SphereGeometry(Rs,96,24,0,2*PI,0,th),P=geo.attributes.position,U=geo.attributes.uv;
    for(let k=0;k<P.count;k++)U.setXY(k,P.getX(k)/(2*r)+.5,P.getZ(k)/(2*r)+.5); // plan-view mapping so the panel seams run straight
    const c=cv(1024),g=c.getContext('2d');g.fillStyle='#e4e6e8';g.fillRect(0,0,1024,1024);speckle(g,1024,8000,190,240,.15);
    // two fixed quarter-domes (north and south) with radial ribs, two sliding barrel panels between them with ribs across
    const B=[.27,.5,.73];g.strokeStyle='rgba(120,125,132,.75)';g.lineWidth=1.6;
    for(let y=B[0]*1024;y<B[2]*1024;y+=13){g.beginPath();g.moveTo(0,y);g.lineTo(1024,y);g.stroke();}
    for(const [cy,sgn] of[[B[0],-1],[B[2],1]])for(let k=0;k<=24;k++){const a=k/24*PI;g.beginPath();g.moveTo(512,cy*1024);g.lineTo(512+cos(a)*700,cy*1024+sgn*sin(a)*700);g.stroke();}
    for(const b of B){g.fillStyle='rgba(70,74,80,.85)';g.fillRect(0,b*1024-4,1024,8);g.fillStyle='rgba(255,255,255,.7)';g.fillRect(0,b*1024+4,1024,3);}
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
    const dome=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:t,roughness:.42,metalness:.3}));dome.position.set(cx,top-Rs,cz);dome.castShadow=dome.receiveShadow=true;
    const grp=new THREE.Group();grp.add(dome);
    // the roof's rail ring sitting on the stands
    const ring=new THREE.Mesh(new THREE.TorusGeometry(r*1.005,1.1,6,96).rotateX(PI/2),LMM.steel);ring.position.set(cx,top-H+.4,cz);grp.add(ring);
    return grp;});}}

// --- Union Station (1927): 22 Tuscan columns along Front Street under an attic carved UNION STATION
{const V=volsOf('Union Station'),front=V.filter(v=>v.b>=11.5&&v.b<=12.5&&v.h>=18).sort((a,b)=>abs(polyArea(b.p))-abs(polyArea(a.p)))[0];
 if(front){let x0=1e9,x1=-1e9,z0=1e9;for(const q of front.p){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);}
  landmark('union',(x0+x1)/2,z0,2600,()=>{const mb=new MeshBag(),N=22,zc=z0+1.3,g=new THREE.Group();
    for(let k=0;k<N;k++){const x=x0+1.6+(x1-x0-3.2)*k/(N-1);
      mb.add(new THREE.CylinderGeometry(.68,.8,10.6,16),LMM.limestone,x,.9+5.3,zc);mb.add(boxGeo(1.9,.9,1.9),LMM.limestone,x,.45,zc);mb.add(boxGeo(1.9,.55,1.9),LMM.limestone,x,11.75,zc);mb.add(new THREE.CylinderGeometry(.95,.72,.55,16),LMM.limestone,x,11.2,zc);}
    mb.add(boxGeo(x1-x0+1,.5,4.2),LMM.limestone,(x0+x1)/2,.25,zc+.6);mb.into(g);
    const c=cv(2048,128),tg=c.getContext('2d');tg.fillStyle='#d9cfbb';tg.fillRect(0,0,2048,128);tg.fillStyle='#6f6656';tg.font='600 92px Georgia, Times New Roman, serif';tg.textAlign='center';tg.textBaseline='middle';
    tg.fillText('U N I O N     S T A T I O N',1024,68);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
    const s=new THREE.Mesh(new THREE.PlaneGeometry(min(40,x1-x0-8),2.5),new THREE.MeshStandardMaterial({map:t,roughness:.85}));let zf=z0;for(const v of V)if(v.b<15&&v.h>16.5)for(const q of v.p)if(q[0]>x0+4&&q[0]<x1-4)zf=min(zf,q[1]);
    s.rotation.y=PI;s.position.set((x0+x1)/2,15.6,zf-.06);g.add(s);
    return g;});}}

// --- Old City Hall (E.J. Lennox, 1899): clock faces on the 104 m tower, showing game time
const clockC=cv(256),clockT=new THREE.CanvasTexture(clockC);clockT.colorSpace=THREE.SRGBColorSpace;let clockMin=-1;
function drawClock(){const g=clockC.getContext('2d'),m=floor(__late.G.time*60)%720;if(m===clockMin)return;clockMin=m;
  g.clearRect(0,0,256,256);g.fillStyle='#2b2a27';g.beginPath();g.arc(128,128,127,0,7);g.fill();g.fillStyle='#efe9d8';g.beginPath();g.arc(128,128,112,0,7);g.fill();
  g.fillStyle='#2b2a27';for(let k=0;k<12;k++){const a=k/12*2*PI;g.save();g.translate(128,128);g.rotate(a);g.fillRect(-3,-104,6,k%3?12:20);g.restore();}
  const hand=(a,l,w)=>{g.save();g.translate(128,128);g.rotate(a);g.fillRect(-w/2,-l,w,l+10);g.restore();};hand((m/720)*2*PI,62,9);hand((m%60)/60*2*PI,92,5);
  clockT.needsUpdate=true;}
{const V=volsOf('Old City Hall'),spire=V.find(v=>v.b>=70);
 if(spire){const [sx,sz]=polyCen(spire.p);const shaft=V.filter(v=>v.b<1&&abs(polyCen(v.p)[0]-sx)<4&&abs(polyCen(v.p)[1]-sz)<4).sort((a,b)=>b.h-a.h)[0]||spire;
  landmark('oldcityhall',sx,sz,2600,()=>{const g=new THREE.Group(),p=shaft.p,y=min(shaft.h,spire.b)-6.5;drawClock();
    const mat=new THREE.MeshStandardMaterial({map:clockT,emissive:0xfff1c8,emissiveMap:clockT,emissiveIntensity:.05,transparent:true,alphaTest:.5,roughness:.6});clockMat=mat;
    for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length],L=hypot(c[0]-a[0],c[1]-a[1]);if(L<4)continue;const nx=(c[1]-a[1])/L,nz=-(c[0]-a[0])/L;
      const m=new THREE.Mesh(new THREE.CircleGeometry(min(3,L*.36),40),mat);m.position.set((a[0]+c[0])/2+nx*.12,y,(a[1]+c[1])/2+nz*.12);m.lookAt(m.position.x+nx,y,m.position.z+nz);g.add(m);}
    return g;});}}
let clockMat=null;

// --- Gooderham "Flatiron" Building (1892): Derek Besant's trompe-l'oeil mural on the back wall facing Berczy Park
{const v=volsOf('Gooderham Building').sort((a,b)=>abs(polyArea(b.p))-abs(polyArea(a.p)))[0];
 if(v){const p=v.p,[cx,cz]=polyCen(p);let best=null,bd=-2;
  for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length],L=hypot(c[0]-a[0],c[1]-a[1]);if(L<8)continue;const nx=(c[1]-a[1])/L,nz=-(c[0]-a[0])/L;if(-nx>bd){bd=-nx;best={a,c,L,nx,nz};}}
  if(best)landmark('flatiron',cx,cz,1500,()=>{const {a,c,L,nx,nz}=best,H=v.h-1,cc=cv(512,round(512*H/L)),g=cc.getContext('2d'),W=cc.width,Hh=cc.height;
    g.fillStyle='#7b3f33';g.fillRect(0,0,W,Hh);
    // the painted facade "pinned" to the wall, its top edge rippling like loose cloth
    g.save();g.beginPath();g.moveTo(W*.06,Hh*.95);for(let x=0;x<=40;x++){const t=x/40;g.lineTo(W*(.06+.88*t),Hh*(.1+.05*sin(t*14)));}g.lineTo(W*.94,Hh*.95);g.closePath();g.clip();
    g.fillStyle='#c9b79a';g.fillRect(0,0,W,Hh);
    for(let j=0;j<5;j++)for(let i=0;i<7;i++){const x=W*(.11+i*.12),y=Hh*(.18+j*.155),w=W*.07,h=Hh*.11;g.fillStyle='#3b4148';g.beginPath();g.ellipse(x+w/2,y+w*.4,w/2,w*.4,0,PI,0);g.lineTo(x+w,y+h);g.lineTo(x,y+h);g.fill();
      g.fillStyle='rgba(255,255,255,.18)';g.fillRect(x+w*.1,y+w*.3,w*.15,h*.6);g.fillStyle='#e3d6bf';g.fillRect(x-3,y+h,w+6,4);}
    g.restore();g.strokeStyle='rgba(40,20,15,.55)';g.lineWidth=3;g.strokeRect(W*.06,Hh*.1,W*.88,Hh*.85);
    const t=new THREE.CanvasTexture(cc);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(L*.96,H),new THREE.MeshStandardMaterial({map:t,roughness:.9}));
    m.position.set((a[0]+c[0])/2+nx*.08,H/2,(a[1]+c[1])/2+nz*.08);m.lookAt(m.position.x+nx,H/2,m.position.z+nz);const grp=new THREE.Group();grp.add(m);return grp;});}}

// --- Eaton Centre (Zeidler, 1977): the long glass barrel vault over the galleria
{const v=volsOf('CF Toronto Eaton Centre').filter(q=>q.rs===5).sort((a,b)=>abs(polyArea(b.p))-abs(polyArea(a.p)))[0];
 if(v){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of v.p){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}
  v.rs=0; // flat roof under the glass
  landmark('eaton',(x0+x1)/2,(z0+z1)/2,1800,()=>{const mb=new MeshBag(),cx=(x0+x1)/2,hw=(x1-x0)/2-1.2,L=z1-z0-4,y=v.h;
    const vg=new THREE.CylinderGeometry(hw,hw,L,24,1,true,-PI/2,PI);vg.rotateX(-PI/2);vg.scale(1,.55,1);mb.add(vg,LMM.vault,cx,y,(z0+z1)/2);
    for(let s=0;s<=L;s+=4.5){const rib=new THREE.TorusGeometry(hw,.09,4,20,PI);rib.scale(1,.55,1);mb.add(rib,LMM.steel,cx,y,z0+2+s);}
    return mb.into(new THREE.Group(),false);});}}

/* --- streaming: building tiles are built around the camera a few at a time, and dropped again far away ---
   Normal tiles are 400 m: full detail within ~600 m, a lighter version (no shopfronts, awnings or sheds, no shadows) out to ~1.45 km.
   Towers 70 m and up live in 1 km tiles that stay out to ~4.6 km so the skyline is always there. */
const STRM={cells:new Map(),list:[],jobs:[],job:null,px:1e9,pz:1e9,t:0};
{const add=v=>{const [x,z]=polyCen(v.p),tall=v.h>=70||!!v.tb,S=tall?1000:400,i=floor(x/S),j=floor(z/S),k=(tall?'T':'')+i+','+j;
   let c=STRM.cells.get(k);if(!c){c={tall,S,x:(i+.5)*S,z:(j+.5)*S,vols:[],lod:-1,meshes:[]};STRM.cells.set(k,c);STRM.list.push(c);}c.vols.push(v);};
 for(const v of MAP.vols)if(!v.skip)add(v);
 for(const p of MAP.platforms)add({p,b:0,h:1.1,k:'platform',rs:0,col:'#a9a6a0',n:''});}
const NEAR_R=600,FAR_R=1450,DROP_R=1650,TALL_R=4600,TALL_DROP=5200;
const cellDist=(c,x,z)=>{const h=c.S/2;return hypot(max(0,abs(x-c.x)-h),max(0,abs(z-c.z)-h));};
function wantLod(c,d){if(c.tall)return d<TALL_R?1:d>TALL_DROP?-1:c.lod;
  if(d<NEAR_R||(c.lod===1&&d<NEAR_R+80))return 1;if(d<FAR_R)return 0;return d>DROP_R?-1:c.lod;}
function dropCell(c){for(const m of c.meshes){scene.remove(m);m.geometry.dispose();}for(const pg of c.signs||[]){if(pg.mat){pg.mat.map.dispose();pg.mat.dispose();SIGNMATS.delete(pg.mat);}}c.meshes=[];c.signs=null;c.shops=null;c.lod=-1;}
function streamPlan(x,z){STRM.jobs.length=0;
  for(const c of STRM.list){const d=cellDist(c,x,z),w=wantLod(c,d),J=STRM.job;
    if(J&&J.c===c&&J.lod!==w)STRM.job=null;
    if(w===-1){if(c.lod!==-1)dropCell(c);continue;}
    if(w!==c.lod&&!(STRM.job&&STRM.job.c===c))STRM.jobs.push({c,lod:w,d:d-(w===1?500:0)});}
  STRM.jobs.sort((a,b)=>a.d-b.d);STRM.px=x;STRM.pz=z;}
function streamWork(ms,nearOnly){const t0=performance.now();
  while(performance.now()-t0<ms){
    if(!STRM.job){const j=STRM.jobs.shift();if(!j)return;if(j.c.lod===j.lod)continue;if(nearOnly&&j.lod!==1){STRM.jobs.unshift(j);return;}STRM.job={c:j.c,lod:j.lod,i:0,bch:new Map()};}
    const J=STRM.job,V=J.c.vols,save=__gs.BCH;__gs.BCH=J.bch;__gs.LODF=J.lod===0;
    for(let n=0;J.i<V.length&&n<16;n++)addVol(V[J.i++]);
    __gs.BCH=save;__gs.LODF=false;
    if(J.i>=V.length){const ms2=meshesOf(J.bch,J.lod===1);dropCell(J.c);J.c.meshes=ms2;J.c.signs=J.bch.signs||null;J.c.shops=J.bch.shops||null;for(const m of ms2)scene.add(m);J.c.lod=J.lod;STRM.job=null;}}}
// force: build everything close to (x,z) right now (start-up, teleports); otherwise a few ms of work per frame
function streamTick(x,z,force){
  if(force||hypot(x-STRM.px,z-STRM.pz)>40||++STRM.t%30===0)streamPlan(x,z);
  streamWork(force?1e9:__late.G.running?3:8,force);lmTick(x,z,force);}

const LM=MAP.landmarks;
/* --- CN Tower: hand-built at its real position and height (553 m) --- */
let cnTip=null,cnLights=null;
if(LM.cn){
  const [cx,cz]=LM.cn.c,g=new THREE.Group();g.position.set(cx,0,cz);
  // leg directions from the tower's three base sections in the map data
  let base=0;{const legs=MAP.vols.filter(v=>v.n==='CN Tower'&&v.b<1&&v.h>250&&v.h<400).map(v=>polyCen(v.p));
    if(legs.length)base=atan2(legs[0][1]-cz,legs[0][0]-cx);}
  const conc=new THREE.MeshStandardMaterial({color:0xdedad2,roughness:.62,metalness:.05,emissive:0x000000});cnLights=conc;
  // Y-shaped shaft: core with three tapering wings, lofted between cross-sections
  const yOutline=(y)=>{const k=min(1,y/338),L=lerp(26,6.2,Math.pow(k,.75)),t=lerp(4.6,3.4,k),pts=[];
    for(let i=0;i<3;i++){const a=base+i*2*PI/3,d=atan2(t,L),R2=hypot(L,t);
      pts.push([cos(a-d)*R2,sin(a-d)*R2],[cos(a+d)*R2,sin(a+d)*R2]);const c=a+PI/3,rc=t/sin(PI/3);pts.push([cos(c)*rc,sin(c)*rc]);}
    return pts;};
  {const gb=new GB(),Y=[0,20,45,80,120,170,220,270,310,338,370];const C=WHITE;
    for(let k=0;k<Y.length-1;k++){const A=yOutline(Y[k]),B=yOutline(Y[k+1]),n=A.length;
      for(let i=0;i<n;i++){const j=(i+1)%n,a0=[A[i][0],Y[k],A[i][1]],a1=[A[j][0],Y[k],A[j][1]],b1=[B[j][0],Y[k+1],B[j][1]],b0=[B[i][0],Y[k+1],B[i][1]];
        const mx=(A[i][0]+A[j][0])/2,mz=(A[i][1]+A[j][1])/2;gb.quad(a0,a1,b1,b0,nrmOf(a0,a1,b1,[mx,0,mz]),C);}}
    const sh=new THREE.Mesh(gb.geo(),conc);sh.castShadow=sh.receiveShadow=true;g.add(sh);}
  const lathe=(pts,mat,seg)=>{const m=new THREE.Mesh(new THREE.LatheGeometry(pts.map(q=>new THREE.Vector2(q[0],q[1])),seg||48),mat);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
  // upper core through the pods
  lathe([[0,368],[4.6,368],[4.2,446],[0,446]],conc,24);
  // main pod: white body, dark sloping observation glass, restaurant level, lower EdgeWalk ring
  lathe([[0,330],[7,331],[15,334],[20.5,338.5],[21.5,341],[21,342]],conc);
  const glass=new THREE.MeshStandardMaterial({color:0x1d2a36,metalness:.9,roughness:.08,emissive:0xffd9a0,emissiveIntensity:0});
  lathe([[21,342],[23,346],[23.2,350],[22,353.5]],glass,56);
  lathe([[22,353.5],[21.2,355],[20,357],[20.6,358],[20.6,361],[18.5,363]],conc,56);
  lathe([[18.5,363],[19,364],[19,367.5],[17.5,369]],glass,56);
  lathe([[17.5,369],[13,372],[8,374.5],[4.6,375.5],[0,375.5]],conc,48);
  // SkyPod
  lathe([[0,442],[5.6,443],[7.2,446],[7.2,448]],conc,32);
  lathe([[7.2,448],[7.4,449.5],[7.2,452]],glass,32);
  lathe([[7.2,452],[6,454],[3,456],[0,456]],conc,32);
  // antenna: tapering steel mast with banded sections
  const steel=new THREE.MeshStandardMaterial({color:0xc4c6c8,metalness:.7,roughness:.35});
  lathe([[0,455],[2.5,455],[2.3,480],[1.9,505],[1.4,525],[1,540],[.55,551],[0,553]],steel,16);
  for(const y of[470,492,512,530])lathe([[2.6-(y-470)*.015,y],[2.9-(y-470)*.015,y+.8],[2.6-(y-470)*.015,y+1.6]],steel,16);
  cnTip=new THREE.Mesh(new THREE.SphereGeometry(.9,10,8),new THREE.MeshBasicMaterial({color:0xff2020}));cnTip.position.y=553.5;g.add(cnTip);
  scene.add(g);addCircle(cx,cz,9);
}
// big screens around Sankofa Square (Yonge & Dundas) and Maple Leaf Square
const bbCanvas=cv(1024,1024),bbTex=(()=>{const g=bbCanvas.getContext('2d'),ADS=[['SUMMER','SALE','#ff3d6e','#ffb14a'],['NEW','SEASON','#3a7bff','#58f0d0'],['LIVE','TONIGHT','#7a2cff','#ff5ac8'],['ICED','COFFEE','#2b1a12','#ffcf8a'],['SIX CITY','FC','#e8303f','#14204a'],['TECH','WEEK','#00c2a8','#0b1022'],['STREET','EATS','#ff7a00','#ffe14d'],['THE','FESTIVAL','#ff4f8b','#4f6bff']];
  ADS.forEach(([a,b2,c1,c2],k)=>{const x=(k%2)*512,y=floor(k/2)*256,gr=g.createLinearGradient(x,y,x+512,y+256);gr.addColorStop(0,c1);gr.addColorStop(1,c2);g.fillStyle=gr;g.fillRect(x,y,512,256);
    g.fillStyle='rgba(255,255,255,.14)';for(let q=0;q<6;q++){g.beginPath();g.arc(x+R()*512,y+R()*256,20+R()*90,0,7);g.fill();}
    g.fillStyle='#fff';g.font='900 86px Inter, Arial Black, sans-serif';g.textBaseline='middle';g.fillText(a,x+34,y+92);g.font='900 64px Inter, Arial Black, sans-serif';g.fillText(b2,x+36,y+180);
    g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=10;g.strokeRect(x+5,y+5,502,246);});
  const t=new THREE.CanvasTexture(bbCanvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;})();
const bbMat=new THREE.MeshBasicMaterial({map:bbTex,side:THREE.DoubleSide});
{
  const gb=new GB();let slot=0;
  const around=(name,rad,maxN,minH,maxW)=>{const L=LM[name];if(!L)return;const [cx,cz]=L.c,cands=[];
    for(const v of MAP.vols){if(v.b>1||v.h<minH)continue;const [vx,vz]=polyCen(v.p);if(hypot(vx-cx,vz-cz)>rad)continue;
      for(let i=0;i<v.p.length;i++){const a=v.p[i],c=v.p[(i+1)%v.p.length],dx=c[0]-a[0],dz=c[1]-a[1],L2=hypot(dx,dz);if(L2<9)continue;
        const nx=dz/L2,nz=-dx/L2,mx=(a[0]+c[0])/2,mz=(a[1]+c[1])/2,tx=cx-mx,tz=cz-mz,tl=hypot(tx,tz)||1,f=(nx*tx+nz*tz)/tl;if(f<.5)continue;
        cands.push({a,c,L:L2,nx,nz,h:v.h,score:f*min(L2,30)/(tl+25)});}}
    cands.sort((p,q)=>q.score-p.score);
    for(const w of cands.slice(0,maxN)){const bw=min(w.L*.82,maxW),bh=min(bw*.5,w.h-9),y0=6.5;if(bh<4)continue;
      const mx=(w.a[0]+w.c[0])/2+w.nx*.3,mz=(w.a[1]+w.c[1])/2+w.nz*.3,tx=(w.c[0]-w.a[0])/w.L,tz=(w.c[1]-w.a[1])/w.L;
      const u0=(slot%2)*.5,vv=floor(slot/2)%4*.25;slot++;
      const A=[mx-tx*bw/2,y0,mz-tz*bw/2],B=[mx+tx*bw/2,y0,mz+tz*bw/2],C=[B[0],y0+bh,B[2]],D=[A[0],y0+bh,A[2]];
      gb.quad(B,A,D,C,[w.nx,0,w.nz],WHITE,[u0,1-vv-.25],[u0+.5,1-vv-.25],[u0+.5,1-vv],[u0,1-vv]);}};
  around('Sankofa Square',95,9,14,22);around('Maple Leaf Square',140,2,12,34);
  if(!gb.empty){const m=new THREE.Mesh(gb.geo(),bbMat);scene.add(m);}
}
let bbTimer=0;
// Nathan Phillips Square: reflecting pool, arches and the 3D TORONTO sign
let signMat=null;
if(LM['Nathan Phillips Square']){
  const P=LM['Nathan Phillips Square'].p,xs=P.map(q=>q[0]),zs=P.map(q=>q[1]),x0=min(...xs),x1=max(...xs),z0=min(...zs),z1=max(...zs),cx=(x0+x1)/2;
  const pw=min(64,(x1-x0)*.5),pd=min(26,(z1-z0)*.24),pz=z1-pd/2-14;
  const pool=new THREE.Mesh(new THREE.PlaneGeometry(pw,pd).rotateX(-PI/2),waterMat.clone());pool.position.set(cx,.06,pz);scene.add(pool);
  const rim=new THREE.MeshStandardMaterial({color:0xcfcac0,roughness:.8});
  for(const [w,d,x,z] of[[pw+1.2,.6,cx,pz-pd/2],[pw+1.2,.6,cx,pz+pd/2],[.6,pd,cx-pw/2,pz],[.6,pd,cx+pw/2,pz]]){const b=new THREE.Mesh(new THREE.BoxGeometry(w,.45,d),rim);b.position.set(x,.22,z);b.receiveShadow=true;scene.add(b);}
  for(const k of[-1,0,1]){const a=new THREE.Mesh(new THREE.TorusGeometry(min(7,pd/2),.32,8,24,PI),new THREE.MeshStandardMaterial({color:0xe2ded6,roughness:.7}));a.rotation.y=PI/2;a.position.set(cx+k*pw*.3,0,pz);a.castShadow=true;scene.add(a);}
  const sc=cv(1024,160),sg=sc.getContext('2d');sg.fillStyle='#fff';sg.font='900 150px Inter, Arial Black, sans-serif';sg.textAlign='center';sg.textBaseline='middle';sg.fillText('TORONTO',512,86);
  const st=new THREE.CanvasTexture(sc);st.colorSpace=THREE.SRGBColorSpace;
  signMat=new THREE.MeshStandardMaterial({map:st,emissiveMap:st,emissive:0xffffff,emissiveIntensity:.2,alphaTest:.5,side:THREE.DoubleSide,roughness:.4});
  for(const dz of[0,.25,.5]){const s=new THREE.Mesh(new THREE.PlaneGeometry(20,3.1),signMat);s.position.set(cx,1.7,pz-pd/2-7-dz);s.castShadow=dz===0;scene.add(s);}
}

/* --- North York & East York: touches the footprints can't show --- */
function signBoard(text,x,z,th,w,h,bg,fg,y0){ // free-standing two-sided sign on a concrete plinth, th = facing yaw
  const c=cv(1024,round(1024*h/w)),g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';
  const lines=text.split('\n');let fs=c.height/(lines.length*1.25);g.font=`900 ${fs}px Inter, Arial Black, sans-serif`;
  while(lines.some(l=>g.measureText(l).width>c.width*.9)&&fs>10){fs-=4;g.font=`900 ${fs}px Inter, Arial Black, sans-serif`;}
  lines.forEach((l,k)=>g.fillText(l,c.width/2,c.height/2+(k-(lines.length-1)/2)*fs*1.2));
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
  const grp=new THREE.Group();grp.position.set(x,0,z);grp.rotation.y=th;y0=y0??.9;
  const face=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,emissiveMap:t,emissive:0xffffff,emissiveIntensity:.15,roughness:.5,side:THREE.DoubleSide}));
  face.position.y=y0+h/2;face.castShadow=true;grp.add(face);
  const base=new THREE.Mesh(new THREE.BoxGeometry(w+.6,y0+.15,.7),new THREE.MeshStandardMaterial({color:0xb9b5ad,roughness:.85}));base.position.y=(y0+.15)/2;base.castShadow=base.receiveShadow=true;grp.add(base);
  scene.add(grp);const ux=cos(th),uz=-sin(th);for(let k=-1;k<=1;k++)addCircle(x+ux*k*w/3,z+uz*k*w/3,.5);return grp;}
function signAt(L,text,w,h,bg,fg){if(!L)return;const s=curbSpot(L.c[0],L.c[1],'walk');if(!s)return;
  const dx=L.c[0]-s.x,dz=L.c[1]-s.z,d=hypot(dx,dz)||1,x=s.x+dx/d*4,z=s.z+dz/d*4;signBoard(text,x,z,atan2(-dx,-dz),w,h,bg,fg);}
signAt(LM.sciencecentre,'ONTARIO\nSCIENCE CENTRE',9,3.4,'#1c1c1e','#ffffff');
signAt(LM.agakhan,'AGA KHAN MUSEUM',8,1.6,'#f4f1ea','#3a3530');
signAt(LM.nycivic,'NORTH YORK CIVIC CENTRE',9,1.5,'#24456e','#ffffff');
signAt(LM.eycivic,'EAST YORK CIVIC CENTRE',8,1.5,'#24456e','#ffffff');
signAt(LM.brickworks,'EVERGREEN BRICK WORKS',8,1.6,'#6b2f22','#f3e6d0');
signAt(LM.donmills,'SHOPS AT DON MILLS',8,1.6,'#2b2b2b','#ffffff');
// the Don Valley Brick Works chimney, lettered down its side
if(LM.brickworks){const[cx,cz]=LM.brickworks.c,H=40,c=cv(256,1024),g=c.getContext('2d');
  for(let y=0;y<1024;y+=8)for(let x=0;x<256;x+=16){const o=(y/8)%2?8:0,v=R()*.25;g.fillStyle=`rgb(${150+v*80|0},${62+v*40|0},${44+v*30|0})`;g.fillRect(x+o-16,y,15,7);}
  g.fillStyle='#f2e8d6';g.font='900 74px Inter, Arial Black, sans-serif';g.textAlign='center';g.textBaseline='middle';
  [...'BRICKWORKS'].forEach((ch,k)=>g.fillText(ch,128,110+k*80));
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.repeat.set(2,1);
  let x=cx+28,z=cz+18;for(let k=0;k<12&&solidAt(x,1,z);k++){x+=6;z+=4;}
  const ch=new THREE.Mesh(new THREE.CylinderGeometry(1.7,2.6,H,20,1,true),new THREE.MeshStandardMaterial({map:t,roughness:.95,side:THREE.DoubleSide}));ch.position.set(x,H/2,z);ch.castShadow=true;scene.add(ch);
  const cap=new THREE.Mesh(new THREE.TorusGeometry(1.75,.3,6,20).rotateX(PI/2),new THREE.MeshStandardMaterial({color:0x4a2219,roughness:.9}));cap.position.set(x,H,z);scene.add(cap);addCircle(x,z,2.7);}
function poolAt(cx,cz,w,d,th){const g=new THREE.Group();g.position.set(cx,0,cz);g.rotation.y=th||0;
  const pool=new THREE.Mesh(new THREE.PlaneGeometry(w,d).rotateX(-PI/2),waterMat.clone());pool.position.y=.06;g.add(pool);
  const rim=new THREE.MeshStandardMaterial({color:0xd6d1c7,roughness:.8});
  for(const [bw,bd,x,z] of[[w+1.2,.6,0,-d/2],[w+1.2,.6,0,d/2],[.6,d,-w/2,0],[.6,d,w/2,0]]){const b=new THREE.Mesh(new THREE.BoxGeometry(bw,.45,bd),rim);b.position.set(x,.22,z);b.receiveShadow=true;g.add(b);}
  scene.add(g);}
// Mel Lastman Square: the big reflecting pool that turns into a skating rink in winter
if(LM['Mel Lastman Square']){const P=LM['Mel Lastman Square'].p,[cx,cz]=LM['Mel Lastman Square'].c;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of P){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}
  if(!solidAt(cx,1,cz))poolAt(cx,cz,min(46,(x1-x0)*.45),min(30,(z1-z0)*.35));}
// Aga Khan Park: five reflecting pools in a row between the museum and the Ismaili Centre
if(LM.agakhan&&LM.ismaili){const[a0,a1]=LM.agakhan.c,[b0,b1]=LM.ismaili.c,dx=b0-a0,dz=b1-a1,L=hypot(dx,dz),th=atan2(dx,dz);
  if(L>40&&L<400)for(let k=0;k<5;k++){const t=.3+k*.1,x=a0+dx*t,z=a1+dz*t;if(!solidAt(x,1,z))poolAt(x,z,10,L*.075,th);}}


/* --- realistic mode: photo-scanned street props (Poly Haven, CC0), simplified to a few thousand triangles each --- */
const PROPS=REAL?await (async()=>{const L=new GLTFLoader(),out={};
  const one=async(name,height)=>{try{const g=await L.loadAsync(`assets/real/models/${name}.glb`);g.scene.updateMatrixWorld(true);const geos=[];let mat=null;
    g.scene.traverse(o=>{if(!o.isMesh)return;let q=o.geometry.clone().applyMatrix4(o.matrixWorld);if(q.index)q=q.toNonIndexed();for(const k of Object.keys(q.attributes))if(!['position','normal','uv'].includes(k))q.deleteAttribute(k);geos.push(q);mat=mat||o.material;});
    let geo=mergeGeometries(geos);geo.computeBoundingBox();const bb=geo.boundingBox,s=height/(bb.max.y-bb.min.y);geo.translate(-(bb.min.x+bb.max.x)/2,-bb.min.y,-(bb.min.z+bb.max.z)/2);geo.scale(s,s,s);
    if(mat){mat=mat.clone();mat.side=THREE.FrontSide;}out[name]={geo,mat};}catch(e){console.warn('prop',name,e);}};
  await Promise.all([one('painted_wooden_bench',.85),one('street_lamp_01',4.2),one('metal_trash_can',.95),one('fire_hydrant',.78)]);return out;})():{};
const prop=(name,geo,mat)=>PROPS[name]?[PROPS[name].geo,PROPS[name].mat]:[geo,mat];

await stage(.6,'Planting parks');
/* --- parks: footpaths (the real ones where OpenStreetMap has them), benches and lamps along them; playgrounds, dog parks, running
   tracks and outdoor pools where they really are; golf courses get greens, flags and sand traps --- */
{const PK=MAP.green.filter(g=>g.pk&&!g.g),paths=new GB(),pathC=C3(.78,.74,.68),dirtC=C3(.66,.52,.38),sandG=new GB(),greenG=new GB(),play=new Map(),benches=[],lampsP=[],flags=[],picnic=[];
  const surf=new GB(),track=new GB(),trackL=new GB(),deck=new GB(),poolW=new GB();
  const playG=(x,z)=>{const k=floor(x/500)+','+floor(z/500);let g=play.get(k);if(!g)play.set(k,g={gb:new GB(),x:(floor(x/500)+.5)*500,z:(floor(z/500)+.5)*500});return g.gb;};
  const ribbon=(g,p,w,col,closed)=>{const q=closed?[...p,p[0]]:p,L=offsetLine(q,-w/2),Rr=offsetLine(q,w/2),cum=cumOf(q);for(let i=0;i<q.length-1;i++){const va=cum[i]/3,vb=cum[i+1]/3;
    g.quad([L[i][0],0,L[i][1]],[Rr[i][0],0,Rr[i][1]],[Rr[i+1][0],0,Rr[i+1][1]],[L[i+1][0],0,L[i+1][1]],UP,col,[0,va],[w/3,va],[w/3,vb],[0,vb]);}};
  const smooth=p=>{let q=p;for(let it=0;it<2;it++){const o=[];for(let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length];o.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}q=o;}return q;};
  const ccw=p=>polyArea(p)>0?p:p.slice().reverse(),circ=(x,z,a,b,n)=>Array.from({length:n||16},(_,k)=>[x+cos(k/(n||16)*2*PI)*a,z+sin(k/(n||16)*2*PI)*b]);
  const domAng=p=>{let best=0,bl=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],l=hypot(b[0]-a[0],b[1]-a[1]);if(l>bl){bl=l;best=atan2(b[1]-a[1],b[0]-a[0]);}}return best;};
  // benches and lamps beside a path, every 24 m, where there's room inside the park
  const furnish=(q,fp,wd)=>{const cum=cumOf(q),tot=cum[cum.length-1];
    for(let s=8;s<tot;s+=24){let k=1;while(k<cum.length-1&&cum[k]<s)k++;const p0=q[k-1],p1=q[k],t=(s-cum[k-1])/((cum[k]-cum[k-1])||1),x=p0[0]+(p1[0]-p0[0])*t,z=p0[1]+(p1[1]-p0[1])*t,dx=p1[0]-p0[0],dz=p1[1]-p0[1],l=hypot(dx,dz)||1;
      for(const sd of[1,-1]){const ox=x-dz/l*(wd/2+.8)*sd,oz=z+dx/l*(wd/2+.8)*sd;if(!inPoly(ox,oz,fp)||solidAt(ox,1,oz))continue;
        if((s/24|0)%2===0&&sd>0){benches.push({x:ox,z:oz,m:mat4(ox,0,oz,atan2(dz,-dx)*1+(sd>0?0:PI))});addCircle(ox,oz,.5);}
        else if((s/24|0)%3===1&&sd<0){lampsP.push({x:ox,z:oz,m:mat4(ox,0,oz,0)});addCircle(ox,oz,.15);}}}};
  // parks without mapped paths: a looping path a little inside the edge, and one across
  for(const g of PK){if(g.rp)continue;const ar=abs(polyArea(g.p));if(ar<1800||g.p.length<4)continue;const fp=flat(g.p),[cx,cz]=polyCen(g.p),r=mkRng(floor(cx*7+cz*13)),inset=min(14,sqrt(ar)*.12);
    const loop=smooth(ringOff(ccw(g.p),-inset)).filter(q=>inPoly(q[0],q[1],fp));if(loop.length<6)continue;
    ribbon(paths,loop,2.2,pathC,true);
    const a=loop[0],b=loop[floor(loop.length/2)];if(inPoly((a[0]+b[0])/2,(a[1]+b[1])/2,fp))ribbon(paths,[a,[(a[0]+b[0])/2+(r()-.5)*10,(a[1]+b[1])/2+(r()-.5)*10],b],2,pathC,false);
    furnish([...loop,loop[0]],fp,2.2);}
  // the real footpaths: paved ones pale, dirt trails brown; benches and lamps along the ones in parks
  {const RP=PK.filter(g=>g.rp).map(g=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of g.p){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}return{fp:flat(g.p),x0,x1,z0,z1};});
    for(const pth of MAP.paths||[]){ribbon(paths,pth.p,pth.w,pth.s?dirtC:pathC,false);const [mx,mz]=pth.p[pth.p.length>>1];
      const park=RP.find(b=>mx>b.x0&&mx<b.x1&&mz>b.z0&&mz<b.z1&&inPoly(mx,mz,b.fp));if(park&&!pth.s)furnish(pth.p,park.fp,pth.w);}}

  // play equipment, each piece standing at (x,z) and turned to ry
  const Y=C3(.95,.75,.15),B=C3(.15,.4,.85),Rd=C3(.85,.2,.18),S=C3(.6,.62,.65),K=C3(.1,.1,.1),Gn=C3(.2,.62,.32),Wd=C3(.55,.38,.24);
  const SURF={rubber:C3(.55,.25,.22),sand:C3(.86,.78,.6),woodchips:C3(.56,.4,.27),grass:null};
  const Pf=(x,z,ry)=>(u,v)=>[x+cos(ry)*u-sin(ry)*v,z+sin(ry)*u+cos(ry)*v];
  const bar=(G,a,b,y,col,t)=>{const dx=b[0]-a[0],dz=b[1]-a[1];gbBox(G,(a[0]+b[0])/2,y,(a[1]+b[1])/2,hypot(dx,dz),t||.1,t||.1,-atan2(dz,dx),col);};
  const KIT={
    st:(G,x,z,ry)=>{const P=Pf(x,z,ry);for(const [u,v] of[[-1.25,-1.25],[1.25,-1.25],[-1.25,1.25],[1.25,1.25]]){const q=P(u,v);gbBox(G,q[0],0,q[1],.15,2.6,.15,-ry,B);}
      gbBox(G,x,1.4,z,2.8,.12,2.8,-ry,Y);gbBox(G,x,2.6,z,3,.5,3,-ry,Rd);
      const a0=P(1.25,0),a1=P(4.85,0),sx=-sin(ry)*.5,sz=cos(ry)*.5;G.quad([a0[0]+sx,1.4,a0[1]+sz],[a0[0]-sx,1.4,a0[1]-sz],[a1[0]-sx,.2,a1[1]-sz],[a1[0]+sx,.2,a1[1]+sz],[cos(ry)*.32,.95,sin(ry)*.32],Y);
      for(let k=0;k<5;k++){const q=P(-1.25-.3,-.9+k*.45);gbBox(G,q[0],.28*k+.1,q[1],.5,.06,.3,-ry,S);}addCircle(x,z,2);},
    sl:(G,x,z,ry)=>{const P=Pf(x,z,ry);for(const v of[-.4,.4]){const q=P(-1.6,v);gbBox(G,q[0],0,q[1],.1,2,.1,-ry,S);}
      const a0=P(-1.5,0),a1=P(1.8,0),sx=-sin(ry)*.4,sz=cos(ry)*.4;G.quad([a0[0]+sx,1.8,a0[1]+sz],[a0[0]-sx,1.8,a0[1]-sz],[a1[0]-sx,.2,a1[1]-sz],[a1[0]+sx,.2,a1[1]+sz],[cos(ry)*.4,.92,sin(ry)*.4],Y);addCircle(x,z,1);},
    sw:(G,x,z,ry)=>{const P=Pf(x,z,ry);for(const u of[-3,3])for(const v of[-1.1,1.1]){const a=P(u,v),b=P(u,0);bar(G,a,b,0,S,.12);gbBox(G,a[0],0,a[1],.12,2.4,.12,-ry,S);}
      bar(G,P(-3.1,0),P(3.1,0),2.35,S,.12);for(const u of[-1.6,0,1.6]){const q=P(u,0);gbBox(G,q[0],.55,q[1],.5,.06,.25,-ry,K);for(const d of[-.22,.22]){const c=P(u+d,0);gbBox(G,c[0],.6,c[1],.025,1.75,.025,-ry,S);}}
      for(const u of[-3,3])addCircle(...P(u,0),.4);},
    cf:(G,x,z,ry)=>{const P=Pf(x,z,ry),c=[P(-1,-1),P(1,-1),P(1,1),P(-1,1)];for(const q of c)gbBox(G,q[0],0,q[1],.09,2,.09,-ry,Gn);
      for(const y of[.7,1.35,1.95])for(let i=0;i<4;i++)bar(G,c[i],c[(i+1)%4],y,y>1.9?Gn:B,.07);addCircle(x,z,1.4);},
    sp:(G,x,z,ry)=>{const P=Pf(x,z,ry),q=P(0,0);gbBox(G,q[0],0,q[1],.18,.45,.18,-ry,S);gbBox(G,q[0],.45,q[1],.9,.45,.32,-ry,[Rd,B,Gn,Y][floor(hsh(x,z)*4)]);addCircle(x,z,.5);},
    ss:(G,x,z,ry)=>{gbBox(G,x,0,z,.35,.5,.35,-ry,S);gbBox(G,x,.5,z,3.4,.08,.3,-ry,Y);const P=Pf(x,z,ry);for(const u of[-1.4,1.4]){const q=P(u,0);gbBox(G,q[0],.58,q[1],.06,.3,.4,-ry,Rd);}addCircle(x,z,.4);},
    rb:(G,x,z,ry)=>{polyInto(G,circ(x,z,1.2,1.2,12),.32,0,Rd);gbBox(G,x,0,z,.3,.32,.3,0,S);for(let k=0;k<4;k++){const a=k*PI/2+ry,q=[x+cos(a)*.9,z+sin(a)*.9];gbBox(G,q[0],.32,q[1],.06,.6,.06,0,Y);}addCircle(x,z,1.3);},
    ph:(G,x,z,ry)=>{gbBox(G,x,0,z,1.8,1.4,1.6,-ry,Wd);gbBox(G,x,1.4,z,2,.25,1.8,-ry,Rd);addCircle(x,z,1.1);},
    bb:(G,x,z,ry)=>{gbBox(G,x,.3,z,3,.12,.15,-ry,Wd);const P=Pf(x,z,ry);for(const u of[-1.3,1.3]){const q=P(u,0);gbBox(G,q[0],0,q[1],.15,.3,.15,-ry,Wd);}},
    zw:(G,x,z,ry)=>{const P=Pf(x,z,ry),a=P(-10,0),b=P(10,0);gbBox(G,a[0],0,a[1],.2,3,.2,0,S);gbBox(G,b[0],0,b[1],.2,2.4,.2,0,S);
      const dx=b[0]-a[0],dz=b[1]-a[1],L=hypot(dx,dz);G.quad([a[0],3,a[1]],[b[0],2.4,b[1]],[b[0],2.43,b[1]],[a[0],3.03,a[1]],[-dz/L,0,dx/L],K);addCircle(...a,.3);addCircle(...b,.3);},
    ap:(G,x,z,ry)=>{gbBox(G,x,.3,z,1.2,1,.1,-ry,B);const P=Pf(x,z,ry);for(const u of[-.6,.6]){const q=P(u,0);gbBox(G,q[0],0,q[1],.1,1.4,.1,-ry,S);}},
  };
  // playgrounds: the real ones, on their real ground (woodchips, sand or rubber); the mapped equipment where it's mapped,
  // otherwise a climbing frame with a slide and a swing set, fitted inside
  for(const pg of MAP.playgrounds||[]){const [cx,cz]=pg.c,G=playG(cx,cz),ry=pg.p?domAng(pg.p):hsh(cx,cz)*6.28,col=SURF[pg.sf]===undefined?SURF.woodchips:SURF[pg.sf];
    const P=pg.p||circ(cx,cz,7.5,6.5);ntAdd(P);if(col)polyInto(surf,P,0,1/3,col);const fp=flat(P),inP=(x,z)=>inPoly(x,z,fp);
    if(pg.eq){for(const [k,x,z] of pg.eq){if(k==='sd'){polyInto(surf,circ(x,z,2.4,2.4,12),0,1/3,SURF.sand);continue;}if(k==='wp'){polyInto(surf,circ(x,z,4,4,16),0,1/3,C3(.55,.72,.85));for(let q=0;q<3;q++){const a=q*2.1;gbBox(G,x+cos(a)*2,0,z+sin(a)*2,.25,1.6,.25,0,B);}continue;}
      (KIT[k]||KIT.cf)(G,x,z,ry+(k==='sw'||k==='zw'?0:hsh(x,z)*.6-.3));}continue;}
    const Q=Pf(cx,cz,ry),fits=(pts)=>pts.every(([u,v])=>{const q=Q(u,v);return inP(q[0],q[1])&&!solidAt(q[0],1,q[1]);});
    if(fits([[-3,-5],[6,-5],[6,4],[-3,4]])){const a=Q(-1,1.6),b=Q(1.5,-3.2);KIT.st(G,a[0],a[1],ry);KIT.sw(G,b[0],b[1],ry);const c=Q(-2.5,-1);KIT.sp(G,c[0],c[1],ry);}
    else if(fits([[-2,-2],[5,-2],[5,2],[-2,2]])){KIT.st(G,cx,cz,ry);}
    else{for(const u of[-1,1]){const q=Q(u,0);if(inP(q[0],q[1]))KIT.sp(G,q[0],q[1],ry);}}
    for(let k=0;k<2;k++){const q=Q(9+k*3,5);if(pg.p&&inP(q[0],q[1])&&!solidAt(q[0],1,q[1])){picnic.push({x:q[0],z:q[1],m:mat4(q[0],0,q[1],ry)});addCircle(q[0],q[1],1);}}}
  // dog parks: packed-earth ground behind a black chain-link fence with posts every 3 m
  for(const p of MAP.dogParks||[]){polyInto(surf,p,0,1/3,C3(.58,.47,.34));const [cx,cz]=polyCen(p),G=playG(cx,cz);
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],L=hypot(b[0]-a[0],b[1]-a[1]);if(L<.5)continue;bar(G,a,b,1.15,K,.05);bar(G,a,b,.05,K,.05);
      const n=ceil(L/3);for(let k=0;k<n;k++){const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n;gbBox(G,x,0,z,.07,1.2,.07,0,K);}
      const dx=(b[0]-a[0])/L,dz=(b[1]-a[1])/L;G.quad([a[0],.1,a[1]],[b[0],.1,b[1]],[b[0],1.15,b[1]],[a[0],1.15,a[1]],[dz,0,-dx],C3(.25,.27,.27));}}
  // running tracks: eight red lanes with white lines, around the field inside
  for(const p0 of MAP.tracks||[]){const p=ccw(p0),inset=4.6;ntAdd(p);ribbon(track,smooth(ringOff(p,-inset)),8.8,C3(.72,.3,.24),true);
    for(let k=0;k<=8;k++)ribbon(trackL,smooth(ringOff(p,-.6-k*1.1)),.07,WHITE,true);}
  // outdoor pools: water inside a concrete deck
  for(const p0 of MAP.pools||[]){const p=ccw(p0);ntAdd(ringOff(p,1.6));polyInto(poolW,p,.04,1/4);capRing(deck,ringOff(p,1.6),p,0,C3(.85,.84,.8));}
  // golf: greens with a flag, fairway sand traps
  for(const g of MAP.green.filter(q=>q.g)){const ar=abs(polyArea(g.p)),fp=flat(g.p),[cx,cz]=polyCen(g.p),r=mkRng(floor(cx+cz));let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of g.p){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}
    const n=min(18,floor(ar/18000)+2);for(let k=0,t=0;k<n&&t<n*20;t++){const x=rr(x0,x1),z=rr(z0,z1);if(!inPoly(x,z,fp)||!inPoly(x+20,z,fp)||!inPoly(x-20,z,fp))continue;k++;
      const gr=10+r()*6;polyInto(greenG,Array.from({length:20},(_,i)=>[x+cos(i/20*2*PI)*gr*(1+.15*sin(i*1.7)),z+sin(i/20*2*PI)*gr*.8]),0,1/6,C3(1.15,1.3,.95));flags.push({x,z,m:mat4(x+gr*.3,0,z,0)});
      for(let s=0;s<2;s++){const a=r()*6.3,bx=x+cos(a)*(gr+5),bz=z+sin(a)*(gr+5),br=3+r()*3;polyInto(sandG,Array.from({length:14},(_,i)=>[bx+cos(i/14*2*PI)*br*1.4,bz+sin(i/14*2*PI)*br*(.7+.2*sin(i*2.1))]),0,1/3,WHITE);}}}
  addDecal(surf.geo(),decalMat({map:noiseTexture('#c8c0b4',150,230,1,[1,1,1]),vertexColors:true,roughness:1},1.12),1.12);
  if(!track.empty){addDecal(track.geo(),decalMat({map:noiseTexture('#d8d0cc',190,240,1,[1,1,1]),vertexColors:true,roughness:.85},1.13),1.13);addDecal(trackL.geo(),decalMat({vertexColors:true,roughness:.8},1.14),1.14);}
  if(!deck.empty){addDecal(deck.geo(),decalMat({map:PV.map,vertexColors:true,roughness:.8},1.14),1.14);const w=new THREE.Mesh(poolW.geo(),waterMat.clone());w.material.color.set(0x2a8fb0);w.material.metalness=.3;w.receiveShadow=true;scene.add(w);}
  const pathTex=noiseTexture('#b8b0a3',120,200,1,[1,.97,.92]);
  {const m=addDecal(paths.geo(),decalMat({map:pathTex,vertexColors:true,roughness:.9},1.1),1.1);m.frustumCulled=true;}
  addDecal(greenG.geo(),decalMat({map:grassTex,vertexColors:true,roughness:.9},1.1),1.1);
  addDecal(sandG.geo(),decalMat({map:noiseTexture('#d9c79c',170,240,1,[1,.95,.8]),roughness:1},1.15),1.15);
  for(const g of play.values()){const m=new THREE.Mesh(g.gb.geo(),plainMat);m.castShadow=m.receiveShadow=true;scene.add(m);CULL.push({o:m,x:g.x,z:g.z,r2:900*900});}
  const wood=new THREE.MeshStandardMaterial({color:0x7a5236,roughness:.8}),iron=new THREE.MeshStandardMaterial({color:0x2b2e30,roughness:.5,metalness:.6});
  chunkedInstanced(...prop('painted_wooden_bench',mergeGeometries([new THREE.BoxGeometry(1.8,.06,.45).translate(0,.45,0),new THREE.BoxGeometry(1.8,.4,.06).translate(0,.7,-.22),new THREE.BoxGeometry(.08,.45,.45).translate(-.8,.22,0),new THREE.BoxGeometry(.08,.45,.45).translate(.8,.22,0)]),wood),benches,true,350);
  chunkedInstanced(...prop('street_lamp_01',mergeGeometries([new THREE.CylinderGeometry(.06,.09,4.2,6).translate(0,2.1,0),new THREE.SphereGeometry(.22,10,8).translate(0,4.3,0)]),iron),lampsP,true,REAL?260:450);
  chunkedInstanced(mergeGeometries([new THREE.BoxGeometry(1.9,.07,.8).translate(0,.76,0),new THREE.BoxGeometry(1.9,.05,.3).translate(0,.45,.6),new THREE.BoxGeometry(1.9,.05,.3).translate(0,.45,-.6),new THREE.BoxGeometry(.08,.76,1.4).translate(-.8,.38,0),new THREE.BoxGeometry(.08,.76,1.4).translate(.8,.38,0)]),wood,picnic,true,350);
  chunkedInstanced(mergeGeometries([new THREE.CylinderGeometry(.025,.025,2.3,5).translate(0,1.15,0),new THREE.BoxGeometry(.03,.4,.6).translate(0,2.05,.3)]),new THREE.MeshStandardMaterial({color:0xe8303f,roughness:.6}),flags,true,700);
}

/* --- detailed trees (near level of detail): a branching trunk and limbs, ~50 leaf clusters at the twig ends, soft rounded shading,
   light shining through the leaves against the sun, and wind sway. Three variants; the old card trees take over beyond TREE_NEAR. --- */
const TREE_NEAR=230,WIND={value:0};
function detailedTrees(list,barkMat){const r=mkRng(777),rv=(a,b)=>a+r()*(b-a);
  // leaf texture: hundreds of serrated leaves on twigs, lighter on top, transparent between
  const S=512,lc=cv(S),g=lc.getContext('2d');
  for(let k=0;k<900;k++){const an=r()*6.283,rd=Math.pow(r(),.55)*230,x=256+cos(an)*rd,y=256+sin(an)*rd,top=1-(y/S),v=r();
    const sz=7+r()*9,rot=r()*6.283;g.save();g.translate(x,y);g.rotate(rot);
    g.fillStyle=`rgb(${(30+v*45+top*40)|0},${(62+v*70+top*60)|0},${(20+v*30+top*14)|0})`;
    g.beginPath();g.moveTo(-sz,0);g.quadraticCurveTo(0,-sz*.62,sz,0);g.quadraticCurveTo(0,sz*.62,-sz,0);g.fill();
    g.strokeStyle='rgba(20,35,12,.35)';g.lineWidth=.8;g.beginPath();g.moveTo(-sz,0);g.lineTo(sz,0);g.stroke();g.restore();}
  g.strokeStyle='rgba(60,45,30,.8)';g.lineWidth=2;for(let k=0;k<14;k++){const an=r()*6.283;g.beginPath();g.moveTo(256,256);g.lineTo(256+cos(an)*rv(80,200),256+sin(an)*rv(80,200));g.stroke();}
  const lt=new THREE.CanvasTexture(lc);lt.colorSpace=THREE.SRGBColorSpace;lt.anisotropy=8;
  const leafMat=new THREE.MeshStandardMaterial({map:lt,alphaTest:.5,roughness:.75,side:THREE.DoubleSide,vertexColors:true});
  leafMat.onBeforeCompile=sh=>{sh.uniforms.uWind=WIND;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
      {vec2 ph=vec2(0.);
      #ifdef USE_INSTANCING
      ph=instanceMatrix[3].xz;
      #endif
      float k=max(position.y-2.5,0.)*.03;transformed.x+=sin(uWind*1.7+ph.x*.3+position.y*.4)*k*(.6+uAtB.y);transformed.z+=cos(uWind*1.3+ph.y*.3+position.x*.5)*k*(.6+uAtB.y);}`);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform vec4 uAtB;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      {vec3 vd=normalize(vFogW-cameraPosition);float bk=pow(max(dot(vd,uAtA.xyz),0.),4.);totalEmissiveRadiance+=diffuseColor.rgb*vec3(.9,1.,.5)*bk*1.6*uAtB.z*(1.-uAtB.w*.8);}`).replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=.3+.7*uAtB.z;');};
  leafMat.customProgramCacheKey=()=>'leafD';
  const variants=[];
  for(let vi=0;vi<3;vi++){const bark=[],leaves=[],H=rv(3,3.8),crownR=rv(3.2,4.2),crownH=rv(4.5,6);
    const cyl=(a,b,r0,r1,seg)=>{const d=b.clone().sub(a),L=d.length(),c=new THREE.CylinderGeometry(r1,r0,L,seg,1,true);c.translate(0,L/2,0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));c.translate(a.x,a.y,a.z);bark.push(c.toNonIndexed());};
    const tips=[];
    const grow=(p,dir,len,rad,depth)=>{const q=p.clone().addScaledVector(dir,len);cyl(p,q,rad,rad*.68,depth>1?6:4);
      if(depth>=3||rad<.035){tips.push(q);return;}
      const n=depth===0?rv(3,5)|0:2+(r()<.5?1:0);
      for(let k=0;k<n;k++){const az=(k/n+r()*.3)*6.283,el=depth===0?rv(.35,.75):rv(.15,.9);
        const nd=new THREE.Vector3(cos(az)*sin(el),cos(el),sin(az)*sin(el)).lerp(dir,.35).normalize();grow(q,nd,len*rv(.55,.75),rad*.62,depth+1);}
      if(depth>0)tips.push(q);};
    // trunk with a slight lean, then limbs
    const top=new THREE.Vector3(rv(-.25,.25),H,rv(-.25,.25));cyl(new THREE.Vector3(0,-.2,0),top,.26,.19,8);
    grow(top,new THREE.Vector3(0,1,0),rv(2,2.6),.19,0);
    // leaf clusters: at every tip, plus fill to round out the crown
    const ctr=new THREE.Vector3(0,H+crownH*.5,0);
    const pts=tips.slice();for(let k=0;k<26;k++){const a=r()*6.283,u=rv(-.6,1),rr2=Math.sqrt(1-u*u)*crownR*rv(.5,.95);pts.push(new THREE.Vector3(cos(a)*rr2,ctr.y+u*crownH*.5,sin(a)*rr2));}
    for(const p of pts){const sz=rv(1.8,2.8);for(let k=0;k<3;k++){const q=new THREE.PlaneGeometry(sz,sz).toNonIndexed();q.rotateX(rv(-1.2,1.2));q.rotateY(r()*6.283);q.translate(p.x,p.y,p.z);
      // normals point out of the crown so it shades like a soft round mass; inner/lower clusters get darker vertex colour (self-shadowing)
      const P=q.attributes.position,N=q.attributes.normal,cols=new Float32Array(P.count*3),nv=new THREE.Vector3();
      for(let i=0;i<P.count;i++){nv.set(P.getX(i)-ctr.x,(P.getY(i)-ctr.y)*1.3+1.2,P.getZ(i)-ctr.z);const rad=nv.length();nv.normalize();N.setXYZ(i,nv.x,nv.y,nv.z);
        const ao=clamp(.45+.55*Math.hypot(P.getX(i),P.getZ(i))/crownR,.4,1)*clamp(.65+.35*(P.getY(i)-H)/crownH,.55,1.05);cols[i*3]=cols[i*3+1]=cols[i*3+2]=ao;}
      q.setAttribute('color',new THREE.BufferAttribute(cols,3));leaves.push(q);}}
    const bg=mergeGeometries(bark);const lg=mergeGeometries(leaves);variants.push({bg,lg});}
  // the near trees by variant; scale so the crown sits roughly where the old canopy was
  const items=[[],[],[]];for(const t of list){const h=hsh(t.x*1.3,t.z*.7),vi=floor(h*3),y=t.y||0,g2=.75+hsh(t.x,t.z)*.4;
    items[vi].push({x:t.x,z:t.z,m:mat4(t.x,y,t.z,hsh(t.z,t.x)*6,t.s*.95),c:C3(g2*.92,g2,g2*.78)});}
  for(let vi=0;vi<3;vi++){chunkedInstanced(variants[vi].bg,barkMat,items[vi].map(o=>({x:o.x,z:o.z,m:o.m})),true,TREE_NEAR);chunkedInstanced(variants[vi].lg,leafMat,items[vi],true,TREE_NEAR);}
}
/* --- street furniture, trees and signals --- */
const trunkM=[],lampItems=[],bulbM=[],poolM=[],binM=[],hydM=[],TREES=[];
const okSpot=(x,z)=>walkable(x,z)&&!solidAt(x,1,z);
for(const e of EDGES){
  if(!e.ai||e.c==='living_street')continue;const A=NODES[e.a],B=NODES[e.b],s0=A.trim+5,s1=e.L-B.trim-5;if(s1<s0)continue;
  for(const sd of[1,-1]){let alt=(e.a*7+(sd>0?1:0))%2;
    for(let s=s0+rr(0,6);s<s1;s+=rr(9,15)){if(R()<.32)continue;edgePt(e,s,_lp);const off=(e.hw+1.4)*sd,x=_lp.x-_lp.tz*off,z=_lp.z+_lp.tx*off;if(!okSpot(x,z))continue;TREES.push({x,z,s:rr(.8,1.15)});addCircle(x,z,.3);}
    for(let s=s0+(alt?16:0);s<s1;s+=34){edgePt(e,s,_lp);const off=(e.hw+.6)*sd,x=_lp.x-_lp.tz*off,z=_lp.z+_lp.tx*off;if(!okSpot(x,z))continue;
      const dx=_lp.tz*sd,dz=-_lp.tx*sd,ry=atan2(dx,dz);lampItems.push({x,z,m:mat4(x,0,z,ry)});bulbM.push({x,z,m:mat4(x+dx*2.1,7.28,z+dz*2.1,ry)});poolM.push(mat4(x+dx*2.1,.05,z+dz*2.1,0,20,1,20));addCircle(x,z,.2);}
    for(let s=s0+rr(10,60);s<s1;s+=rr(90,140)){edgePt(e,s,_lp);const off=(e.hw+.9)*sd,x=_lp.x-_lp.tz*off,z=_lp.z+_lp.tx*off;if(!okSpot(x,z))continue;
      if(R()<.5){hydM.push({x,z,m:mat4(x,0,z,R()*6)});addCircle(x,z,.2);}else{binM.push({x,z,m:mat4(x,0,z,R()*6)});addCircle(x,z,.3);}}
  }
}
// trees mapped one by one in OpenStreetMap stand where they really are; parks get made-up ones only to make up the rest
{const T=MAP.trees||[];for(let i=0;i<T.length;i+=2){const x=T[i],z=T[i+1];if(solidAt(x,1,z))continue;TREES.push({x,z,s:.9+hsh(x,z)*.6});if(walkable(x,z))addCircle(x,z,.35);}}
for(const g of MAP.green){if(g.k===2)continue;const ar=abs(polyArea(g.p));if(ar<(g.k?250:600))continue;const n=(g.rt||0)>=20?0:min(g.k?150:6,floor(ar/(g.k?240:700)))-(g.rt||0),fp=flat(g.p);if(n<=0)continue; // 20+ mapped trees: someone surveyed this park, trust it
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of g.p){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}
  for(let k=0,t=0;k<n&&t<n*4;t++){const x=rr(x0,x1),z=rr(z0,z1);if(!inPoly(x,z,fp)||solidAt(x,1,z)||ntHit(x,z))continue;k++;TREES.push({x,z,s:rr(.9,1.6)});if(walkable(x,z))addCircle(x,z,.35);}}
const islandTrees=[];
for(const p of MAP.islands){const ar=abs(polyArea(p)),n=min(1400,floor(ar/1400)),fp=flat(p);let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of p){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}
  for(let k=0,t=0;k<n&&t<n*5;t++){const x=rr(x0,x1),z=rr(z0,z1);if(!inPoly(x,z,fp))continue;k++;islandTrees.push({x,z,s:rr(1,1.7),y:.45});}}
{
  const parts=[new THREE.CylinderGeometry(.13,.26,2.9,6,1,true)];
  for(let k=0;k<3;k++)parts.push(new THREE.CylinderGeometry(.04,.1,2.2,4,1,true).translate(0,1.1,0).rotateZ(rr(.45,.85)).rotateY(k*2.09+R()).translate(0,.9,0));
  const trunkGeo=mergeGeometries(parts),trunkMat=REAL?new THREE.MeshStandardMaterial({map:(()=>{const t=realTex('bark_brown_02',1);t.repeat.set(1,2.5);return t;})(),normalMap:(()=>{const t=realTex('bark_brown_02',1,'nor');t.repeat.set(1,2.5);return t;})(),color:0xb8a898,roughness:1}):new THREE.MeshStandardMaterial({color:0x3d2e22,roughness:1});
  const lc=cv(512),g=lc.getContext('2d');g.fillStyle='#1d3d17';g.beginPath();g.arc(256,256,80,0,7);g.fill();
  for(let k=0;k<5200;k++){const an=R()*6.283,rd=Math.pow(R(),.6)*236,v=R()*(1-rd/330);g.fillStyle=`rgb(${24+v*62|0},${54+v*98|0},${16+v*40|0})`;g.beginPath();g.ellipse(256+cos(an)*rd,256+sin(an)*rd,3+R()*5,1.5+R()*2.5,R()*3.14,0,6.3);g.fill();}
  const lt=new THREE.CanvasTexture(lc);lt.colorSpace=THREE.SRGBColorSpace;lt.anisotropy=4;
  const cp=[];
  for(let k=0;k<13;k++){const sz=rr(2,3),q=new THREE.PlaneGeometry(sz,sz).toNonIndexed();q.rotateX(rr(-1.3,1.3));q.rotateY(R()*6.283);const an=R()*6.283,rd=rr(.15,1.2);q.translate(cos(an)*rd,rr(-.8,1),sin(an)*rd);cp.push(q);}
  const core=new THREE.IcosahedronGeometry(.95,0),cu=core.attributes.uv;for(let k=0;k<cu.count;k++)cu.setXY(k,.5,.5);cp.push(core.toNonIndexed());
  const cg=mergeGeometries(cp.map(q=>q.index?q.toNonIndexed():q)),cpp=cg.attributes.position,cn=cg.attributes.normal,nv=new THREE.Vector3();
  for(let k=0;k<cpp.count;k++){nv.set(cpp.getX(k),cpp.getY(k)+.7,cpp.getZ(k)).normalize();cn.setXYZ(k,nv.x,nv.y,nv.z);}
  const leafMat=new THREE.MeshStandardMaterial({map:lt,alphaTest:.45,roughness:.9,side:THREE.DoubleSide});
  const farCanopy=new THREE.IcosahedronGeometry(2.1,0),farMat=new THREE.MeshStandardMaterial({color:0x2c5223,roughness:1,flatShading:true});
  const treeItems=(list,trunkOnly)=>list.map(t=>{const y=t.y||0,g2=.7+hsh(t.x,t.z)*.4;return{x:t.x,z:t.z,m:trunkOnly?mat4(t.x,y+1.4*t.s,t.z,hsh(t.z,t.x)*6,t.s):mat4(t.x,y+4.3*t.s,t.z,hsh(t.z,t.x)*6,t.s*1.1,t.s,t.s*1.1),c:trunkOnly?null:C3(g2*.9,g2,g2*.8)};});
  chunkedInstanced(trunkGeo,trunkMat,treeItems(TREES,true),false,380,TREE_NEAR);
  chunkedInstanced(cg,leafMat,treeItems(TREES,false),false,480,TREE_NEAR);
  detailedTrees(TREES,trunkMat);
  chunkedInstanced(farCanopy,farMat,treeItems(islandTrees,false),false,6000);
  chunkedInstanced(trunkGeo,trunkMat,treeItems(islandTrees,true),false,6000);
}
// hydro poles: cedar poles with a crossarm, insulators and the odd transformer down one side of residential streets, strung with sagging wires
{const hp=[],wires=new Map(),r=mkRng(4242),T=300;
  const wAt=(x,z)=>{const k=floor(x/T)+','+floor(z/T);let w=wires.get(k);if(!w)wires.set(k,w={a:[],x:(floor(x/T)+.5)*T,z:(floor(z/T)+.5)*T});return w.a;};
  for(const e of EDGES){if(!e.ai)continue;const res=/^(residential|unclassified)$/.test(e.c),ter=e.c==='tertiary';if(!res&&!ter)continue;
    const A=NODES[e.a],B=NODES[e.b],s0=A.trim+3,s1=e.L-B.trim-3;if(s1-s0<20)continue;const sd=e.a%2?1:-1,step=(s1-s0)/max(1,round((s1-s0)/36));let prev=null;
    for(let s=s0;s<=s1+.01;s+=step){edgePt(e,s,_lp);const off=(e.hw+.75)*sd,x=_lp.x-_lp.tz*off,z=_lp.z+_lp.tx*off;
      if(!okSpot(x,z)){prev=null;continue;}const ry=atan2(_lp.tx,_lp.tz),h=10.5+r()*1.2;
      hp.push({x,z,m:mat4(x,0,z,ry,1,h/11,1),c:C3(.8+r()*.25,.75+r()*.2,.7+r()*.15),tr:r()<.18});addCircle(x,z,.2);
      // wire attachment points: three on the crossarm, one telecom cable lower down
      const cx=cos(ry),cz=-sin(ry),pts=[[-1.05,h-.75],[0,h-.55],[1.05,h-.75],[0,h-3.4]].map(([o,y])=>[x+cx*o,y,z+cz*o]);
      if(prev){const L=wAt(x,z);for(let k=0;k<4;k++){const a=prev[k],b=pts[k],len=hypot(b[0]-a[0],b[2]-a[2]),sag=.012*len+(k===3?.25:.1);
        for(let i=0;i<8;i++){const t0=i/8,t1=(i+1)/8,P=t=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t)-sag*4*t*(1-t),lerp(a[2],b[2],t)];L.push(...P(t0),...P(t1));}}}
      prev=pts;}}
  const pole=new THREE.CylinderGeometry(.12,.17,11,7).translate(0,5.5,0),arm=new THREE.BoxGeometry(2.5,.12,.12).translate(0,10.2,0),
    ins=[-1.05,0,1.05].map(o=>new THREE.CylinderGeometry(.05,.06,.22,6).translate(o,10.37,0));
  const brace=[-1,1].map(sx=>new THREE.BoxGeometry(.05,.9,.05).rotateZ(sx*.75).translate(sx*.35,9.85,0));
  const poleGeo=mergeGeometries([pole,arm,...brace].map(q=>q.index?q.toNonIndexed():q)),insGeo=mergeGeometries(ins.map(q=>q.toNonIndexed()));
  const wood=new THREE.MeshStandardMaterial({color:0x6b5a48,roughness:.95,map:REAL&&RT.bark_brown_02?(()=>{const t=realTex('bark_brown_02',1);t.repeat.set(.3,3);return t;})():null});
  chunkedInstanced(poleGeo,wood,hp,true,600);
  chunkedInstanced(insGeo,new THREE.MeshStandardMaterial({color:0x8a9590,roughness:.4}),hp.map(o=>({x:o.x,z:o.z,m:o.m})),false,250);
  const trn=hp.filter(o=>o.tr);chunkedInstanced(new THREE.CylinderGeometry(.32,.32,1.1,10).translate(.45,8.2,0),new THREE.MeshStandardMaterial({color:0x5d6563,roughness:.5,metalness:.4}),trn.map(o=>({x:o.x,z:o.z,m:o.m})),true,350);
  const wm=new THREE.LineBasicMaterial({color:0x111214,transparent:true,opacity:.85});
  for(const w of wires.values()){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(w.a,3));const l=new THREE.LineSegments(g,wm);scene.add(l);CULL.push({o:l,x:w.x,z:w.z,r2:420*420});}}
{const pole=new THREE.CylinderGeometry(.07,.11,7.4,6).translate(0,3.7,0),arm=new THREE.BoxGeometry(.1,.1,2.4).translate(0,7.35,1.1);
 chunkedInstanced(mergeGeometries([pole,arm]),new THREE.MeshStandardMaterial({color:0x2c2f33,roughness:.6,metalness:.6}),lampItems,true,700);}
chunkedInstanced(...prop('metal_trash_can',mergeGeometries([new THREE.CylinderGeometry(.27,.23,.86,8,1,true).translate(0,.43,0),new THREE.CylinderGeometry(.17,.29,.12,8).translate(0,.92,0)]),new THREE.MeshStandardMaterial({color:0x26382d,roughness:.5,metalness:.5,side:THREE.DoubleSide})),binM,true,260);
chunkedInstanced(...prop('fire_hydrant',mergeGeometries([new THREE.CylinderGeometry(.1,.12,.55,7,1,true).translate(0,.275,0),new THREE.SphereGeometry(.105,7,4).translate(0,.56,0),new THREE.CylinderGeometry(.045,.045,.34,5,1,true).rotateZ(PI/2).translate(0,.38,0)]),new THREE.MeshStandardMaterial({color:0xb3221a,roughness:.45,metalness:.3,side:THREE.DoubleSide})),hydM,true,260);
const bulbMat=new THREE.MeshStandardMaterial({color:0x222222,emissive:0xffd9a0,emissiveIntensity:0});
chunkedInstanced(new THREE.BoxGeometry(.3,.1,.6),bulbMat,bulbM,false,700);
const poolMat=new THREE.MeshBasicMaterial({map:radialTexture([[0,'rgba(255,205,140,1)'],[.35,'rgba(255,190,120,.45)'],[1,'rgba(255,180,100,0)']]),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
const poolMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-PI/2),poolMat,max(1,poolM.length));poolMesh.count=poolM.length;poolM.forEach((m,k)=>poolMesh.setMatrixAt(k,m));poolMesh.visible=false;poolMesh.renderOrder=60;scene.add(poolMesh);
// traffic signals + Toronto street-name blades
const sigMats=[new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial()];
const SIGCOL=[C3(1.6,.06,.05),C3(1.6,1,.05),C3(.1,1.5,.35)];
const lightState=axis=>{const ph=(__late.G.sigT+(axis?12:0))%24;return ph<10?2:ph<12?1:0;};
{
  const pm=[],lm=[[],[]],blades=[];
  for(const n of NODES){if(!n.sig)continue;for(const i of n.e){const e=EDGES[i];if(!e.ai)continue;const fa=e.a===n.i,s=fa?min(e.L,n.trim+.6):max(0,e.L-n.trim-.6);edgePt(e,s,_lp);
    const ux=fa?_lp.tx:-_lp.tx,uz=fa?_lp.tz:-_lp.tz,x=_lp.x+uz*(e.hw+.7),z=_lp.z-ux*(e.hw+.7);
    if(!walkable(x,z))continue;pm.push({x,z,m:mat4(x,0,z)});lm[abs(ux)>abs(uz)?1:0].push({x,z,m:mat4(x,4.7,z)});addCircle(x,z,.18);
    if(e.short)blades.push({x:x-uz*1.05,z:z+ux*1.05,tx:ux,tz:uz,name:e.short});}}
  chunkedInstanced(new THREE.CylinderGeometry(.08,.1,4.4,5,1,true).translate(0,2.2,0),new THREE.MeshStandardMaterial({color:0x222426,roughness:.6,metalness:.5}),pm,true,420);
  const lg=new THREE.BoxGeometry(.42,.95,.42);for(const k of[0,1])chunkedInstanced(lg,sigMats[k],lm[k],false,600);
  // street names go into atlases of up to 512 blades each (4 x 128 cells of 512 x 64 px)
  const allNames=[...new Set(blades.map(b=>b.name))],PER=512,cols=4;
  for(let a0=0;a0<allNames.length;a0+=PER){const names=allNames.slice(a0,a0+PER),idx=new Map(names.map((n,k)=>[n,k])),rows=ceil(names.length/cols),ac=cv(2048,max(64,rows*64)),ag=ac.getContext('2d');
  names.forEach((nm,k)=>{const x=(k%cols)*512,y=floor(k/cols)*64;ag.fillStyle='#1b3a8a';ag.fillRect(x,y,512,64);ag.strokeStyle='#fff';ag.lineWidth=4;ag.strokeRect(x+5,y+5,502,54);
    ag.fillStyle='#fff';ag.textAlign='center';ag.textBaseline='middle';let fs=40;ag.font=`700 ${fs}px Inter, Helvetica, Arial, sans-serif`;while(ag.measureText(nm).width>470&&fs>18){fs-=2;ag.font=`700 ${fs}px Inter, Helvetica, Arial, sans-serif`;}ag.fillText(nm,x+256,y+34);});
  const at=new THREE.CanvasTexture(ac);at.colorSpace=THREE.SRGBColorSpace;at.anisotropy=8;
  const gb=new GB();
  for(const b of blades){const k=idx.get(b.name);if(k===undefined)continue;const u0=(k%cols)/cols,u1=u0+1/cols,v1=1-floor(k/cols)/rows,v0=v1-1/rows,rx=-b.tz,rz=b.tx,y0=3.35,y1=3.6,hl=1.05;
    const A=[b.x-b.tx*hl,y0,b.z-b.tz*hl],B=[b.x+b.tx*hl,y0,b.z+b.tz*hl],C=[B[0],y1,B[2]],D=[A[0],y1,A[2]];
    gb.quad(A,B,C,D,[rx,0,rz],WHITE,[u0,v0],[u1,v0],[u1,v1],[u0,v1]);gb.quad(B,A,D,C,[-rx,0,-rz],WHITE,[u0,v0],[u1,v0],[u1,v1],[u0,v1]);}
  if(!gb.empty)scene.add(new THREE.Mesh(gb.geo(),new THREE.MeshStandardMaterial({map:at,roughness:.5})));}
}

/* --- named places --- */
function placeName(x,z){const r=nearestEdge(x,z,45);if(!r)return zoneAt(x,z)?.id==='downtown'?'Downtown Toronto':hood(x,z);const A=r.e.short;let best='',bd=70;
  for(const n of[NODES[r.e.a],NODES[r.e.b]]){const d=hypot(n.x-x,n.z-z);if(d<bd)for(const i of n.e){const o=EDGES[i].short;if(o&&o!==A){best=o;bd=d;break;}}}
  return A?(best?A+' & '+best:A):(best||'Downtown Toronto');}
// outside downtown: the nearest of these neighbourhood centres names the area
const HOODS=(()=>{const F=MAP.frame,KX=111320*cos(F.lat0*PI/180),KY=110540,r=F.rotDeg*PI/180,c=cos(r),s=sin(r),
  P=(lat,lon)=>{const x=(lon-F.lon0)*KX,z=-(lat-F.lat0)*KY;return[x*c-z*s,x*s+z*c];};
  return [['Riverdale',43.672,-79.352],['The Danforth',43.679,-79.347],['Greektown',43.678,-79.355],['Pape Village',43.690,-79.345],['East York',43.693,-79.330],
    ['Woodbine Heights',43.694,-79.314],['Leaside',43.708,-79.368],['Thorncliffe Park',43.705,-79.347],['Flemingdon Park',43.717,-79.334],['Don Valley',43.688,-79.362],
    ['Don Mills',43.737,-79.345],['Banbury-Don Mills',43.741,-79.362],['Parkview Hills',43.704,-79.318],['Victoria Village',43.728,-79.313],['Bridle Path',43.728,-79.377],
    ['Sunnybrook',43.720,-79.365],['Rosedale',43.680,-79.380],['Summerhill',43.684,-79.392],['Yorkville',43.671,-79.392],['The Annex',43.670,-79.405],['Deer Park',43.690,-79.395],
    ['Forest Hill',43.694,-79.414],['Davisville',43.699,-79.395],['Yonge-Eglinton',43.707,-79.399],['Lawrence Park',43.723,-79.398],['Hoggs Hollow',43.744,-79.405],
    ['York Mills',43.746,-79.385],['Bayview Village',43.770,-79.385],['Lansing',43.757,-79.418],['North York Centre',43.768,-79.413],['Willowdale',43.776,-79.402],['Newtonbrook',43.789,-79.418]]
    .map(([n,a,b])=>[n,...P(a,b)]);})();
function hood(x,z){
  if(z>1560&&onIsland(x,z))return __late.isleName(x,z);
  if(z>1560&&onWater(x,z))return z<2600||(x>-1100&&x<1150&&z<3150)?'Toronto Harbour':'Lake Ontario';
  if(zoneAt(x,z)?.id!=='downtown'){let best='Toronto',bd=1e18;for(const[n,hx,hz]of HOODS){const d=(hx-x)**2+(hz-z)**2;if(d<bd){bd=d;best=n;}}return best;}
  if(z>1250)return x>650?'East Bayfront':'Harbourfront';
  if(z>720){if(x<-1000)return 'CityPlace';if(x<-305)return 'Railway Lands';if(x<301)return 'South Core';return 'St. Lawrence';}
  if(z>40){if(x<-1127)return 'King West';if(x<-305)return 'Entertainment District';if(x<301)return 'Financial District';return z>300?'Old Town':'St. Lawrence';}
  if(z>-420){if(x<-1127)return 'Kensington Market';if(x<-700)return 'Chinatown';if(x<-305)return 'Grange Park';if(x<84)return 'Civic Centre';if(x<301)return 'Downtown Yonge';return x<820?'Garden District':'Moss Park';}
  if(z>-1010){if(x<-1127)return 'Kensington Market';if(x<-700)return 'Chinatown';if(x<84)return 'Discovery District';if(x<301)return 'Bay Street Corridor';return x<820?'Garden District':'Cabbagetown';}
  if(x<-305)return 'University of Toronto';if(x<84)return "Queen's Park";if(x<450)return 'Bay Street Corridor';return 'Church-Wellesley';}
function curbSpot(x,z,side){ // point by the kerb of the nearest street; side: 'walk' = sidewalk, 'park' = parking lane
  let r=nearestEdge(x,z,120);
  if(!r){let bn=null,bd=1e9;for(const n of nodesNear(x,z,500)){const d=hypot(n.x-x,n.z-z);if(d<bd&&n.e.some(i=>EDGES[i].ai)){bd=d;bn=n;}}if(!bn)return null;const e0=EDGES[bn.e.find(i=>EDGES[i].ai)];r={e:e0,s:e0.a===bn.i?e0.L*.3:e0.L*.7};}
  const e=r.e,s=clamp(r.s,NODES[e.a].trim+8,max(NODES[e.a].trim+8,e.L-NODES[e.b].trim-8));edgePt(e,s,_lp);
  const sd=((x-_lp.x)*-_lp.tz+(z-_lp.z)*_lp.tx)>=0?1:-1,off=(side==='walk'?e.hw+2.2:e.hw-1.25)*sd;
  return{x:_lp.x-_lp.tz*off,z:_lp.z+_lp.tx*off,th:atan2(_lp.tx,_lp.tz)+(sd<0&&!e.ow?PI:0),e,sd};}
const START=(()=>{const N=LM['Nathan Phillips Square'],tx=N?N.c[0]:-35,tz=N?max(...N.p.map(q=>q[1]))-4:20;
  const car=curbSpot(tx,tz,'park'),walk=curbSpot(tx,tz,'walk');return{cx:car.x,cz:car.z,cth:car.th,px:walk.x,pz:walk.z};})();
const SPOTS={police:(()=>{const s=curbSpot(60,-985,'walk');return[s.x,s.z];})(),hospital:(()=>{const s=curbSpot(-285,-800,'walk');return[s.x,s.z];})()};
function garageSpots(){return[[-1060,560],[760,240],[200,-600],[5250,-5350],[3300,-2600],[1500,-12600]].map(([x,z])=>{const s=curbSpot(x,z,'park');return[s.x,s.z];});}

/* --- post-processing: bloom + a gentle colour grade --- */
const composer=new EffectComposer(renderer);const renderPass=new RenderPass(scene,camera);composer.addPass(renderPass);
// ambient occlusion (N8AO): soft contact shadows where walls meet the street, under awnings, between buildings — High quality only
let aoPass=null;if(N8AOPass){aoPass=new N8AOPass(scene,camera,innerWidth,innerHeight);Object.assign(aoPass.configuration,{aoRadius:3.2,distanceFalloff:1.2,intensity:2.2,halfRes:true,aoSamples:12,denoiseSamples:8,denoiseRadius:10,gammaCorrection:false,screenSpaceRadius:false,transparencyAware:false}); // transparencyAware re-renders the whole city: ~7 ms for no visible gain here
  aoPass.setQualityMode&&aoPass.setQualityMode('Performance');aoPass.configuration.halfRes=true;aoPass.configuration.transparencyAware=false;composer.insertPass(aoPass,1);renderPass.enabled=false;} // N8AO draws the scene itself
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.4,.55,1.4);composer.addPass(bloom);
// sun shafts: march from each pixel toward the sun through the depth buffer; open sky along the way scatters light into haze (only with AO, which owns the depth)
const shafts=new ShaderPass({uniforms:{tDiffuse:{value:null},tDepth:{value:null},uSun:{value:new THREE.Vector2(.5,.5)},uStr:{value:0},uCol:{value:new THREE.Color()},uAsp:{value:1}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D tDiffuse,tDepth;uniform vec2 uSun;uniform float uStr,uAsp;uniform vec3 uCol;varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);if(uStr<.001){gl_FragColor=c;return;}
      vec2 dl=(vUv-uSun)/40.*.85;vec2 uv=vUv-dl*fract(sin(dot(vUv,vec2(12.9898,78.233)))*43758.5453);float dec=1.,acc=0.;
      for(int i=0;i<40;i++){uv-=dl;if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)break;float sky=step(.99995,texture2D(tDepth,uv).r);vec2 q=(uv-uSun)*vec2(uAsp,1.);acc+=sky*exp(-dot(q,q)*9.)*dec;dec*=.97;}
      c.rgb+=uCol*acc/40.*uStr;gl_FragColor=c;}`});
composer.addPass(shafts);
const _sv=new THREE.Vector3(),_cf=new THREE.Vector3();
function stepShafts(){const d=aoPass&&aoPass.enabled&&aoPass.beautyRenderTarget&&aoPass.beautyRenderTarget.depthTexture,sd=skyU.uSunDir.value;
  camera.getWorldDirection(_cf);const facing=smooth(-.1,.6,_cf.dot(sd)),k=(1-night)*smooth(-.02,.08,sinE)*(1-WX.ovc*.9)*facing*(__gs.IN?0:1);
  shafts.uniforms.uStr.value=d?k*(.5+(1-ATM.B[2])*.6):0;if(!d||k<.001)return;shafts.uniforms.tDepth.value=d;
  _sv.copy(sd).multiplyScalar(1000).add(camera.position).project(camera);shafts.uniforms.uSun.value.set(_sv.x*.5+.5,_sv.y*.5+.5);shafts.uniforms.uAsp.value=camera.aspect;
  shafts.uniforms.uCol.value.copy(skyU.uSun.value).multiplyScalar(.9);}
composer.addPass(new OutputPass());
const grade=new ShaderPass({uniforms:{tDiffuse:{value:null},uT:{value:0}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D tDiffuse;uniform float uT;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 col=c.rgb;float l=dot(col,vec3(.299,.587,.114));
    col+=(fract(sin(dot(vUv*vec2(1.7,1.3)+uT,vec2(12.9898,78.233)))*43758.5453)-.5)*.022*(1.2-l);
    col=mix(vec3(l),col,1.1);col=(col-.5)*1.05+.5;col+=vec3(-.012,.003,.02)*(1.-l)+vec3(.018,.006,-.014)*l;vec2 d=vUv-.5;col*=1.-.32*dot(d,d)*1.8;gl_FragColor=vec4(clamp(col,0.,1.),c.a);}`});composer.addPass(grade);
addEventListener('resize',()=>composer.setSize(innerWidth,innerHeight));
function setPR(v){renderer.setPixelRatio(v);composer.setPixelRatio(v);}
function renderFrame(){if(__gs.qual>0){stepShafts();grade.uniforms.uT.value=(grade.uniforms.uT.value+.137)%10;bloom.threshold=lerp(1.5,.8,night);bloom.strength=lerp(.22,.7,night);composer.render();}else renderer.render(scene,camera);}
function updateWorldLights(dt){
  facMats.forEach((m,k)=>m.emissiveIntensity=night*(k===6?.7:1.4));for(const k in facVar)facVar[k].emissiveIntensity=night*1.4;for(const k in lmMats)lmMats[k].emissiveIntensity=night*(k==STY.RTH?.9:k==STY.GALL?1.1:1.4);LMM.glass.emissiveIntensity=night*.8;for(const m of __late.MARQ)m.emissiveIntensity=.35+night*1.1;for(const m of SIGNMATS)m.emissiveIntensity=.08+night*1.1;if(clockMat)clockMat.emissiveIntensity=.05+night*.9;
  bbTimer+=dt;if(bbTimer>7){bbTimer=0;bbTex.offset.y=(bbTex.offset.y+.25)%1;}
  bbMat.color.setScalar(1.1+night*1.4);
  const hue=(__late.G.sigT*.04)%1;cnMat.emissive.setHSL(hue,.85,.5).multiplyScalar(night*.55);
  if(signMat){signMat.emissive.setHSL((hue+.5)%1,.8,.6);signMat.emissiveIntensity=.15+night*2.4;}
  if(cnLights){cnLights.emissive.setHSL(hue,.9,.5).multiplyScalar(night*.45);}
  if(cnTip){const on=(__late.G.sigT%1.6)<.8;cnTip.material.color.setRGB(on?(1.5+night*3):.15,on?.05:0,on?.05:0);}
  cullTick();
}

await stage(.7,'Parking cars');
export { LM, PROPS, SIGCOL, SPOTS, START, STRM, WIND, aoPass, bulbMat, cellDist, clockMat, clockT, curbSpot, drawClock, garageSpots, hood, lightState, placeName, poolMat, poolMesh, renderFrame, renderPass, setPR, sigMats, streamTick, updateWorldLights, volsOf };
