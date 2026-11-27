// Six City — harbour. One of the game's modules; they load in numbered order (src/game/index.js).
import './18-menu.js';
import * as THREE from 'three';
import * as HR from '../harbour.js';
import { __gs, __late, later } from './shared.js';
import { $, C3, PI, TEST, abs, atan2, camera, ceil, clamp, cos, exp, floor, groundH, hypot, max, min, mkRng, rnd, rpick, scene, sign, sin, wrap } from './01-core.js';
import { WX, night } from './02-sky.js';
import { GB, _m, addCircle, flat, hAdd, onIsland, onWater, solidAt, walkable } from './04-world.js';
import { crash, drive } from './06-cars.js';
import { beacon, calmPed, emit, peds, placePed } from './07-people.js';
import { G, K, flash, player } from './08-input.js';
import { WANT, addHeat, copShot, wLvl } from './10-police.js';
import { releasePed } from './12-story.js';
import { HOUSES } from './13-homes.js';
later({BOATS:()=>BOATS,HB:()=>HB,boardBoat:()=>boardBoat,boardFerry:()=>boardFerry,dockSpot:()=>dockSpot,isleName:()=>isleName,leaveBoat:()=>leaveBoat,mkBoat:()=>mkBoat,nearBoat:()=>nearBoat,offWater:()=>offWater,rmBoat:()=>rmBoat}); // for earlier modules, read when called

/* ============================== harbour: boats, the Toronto Island ferries, the islands ==============================
   Ferry timetables live in src/harbour.js (unit-tested). The lake is a 4 m grid (LK, next to the walk grid): boats go
   anywhere that is neither mainland nor island, harbour slips included. The islands are walkable, with beaches, the
   Ward's Island cottages, a fairground on Centre Island and Gibraltar Point Lighthouse. Steal a boat from a marina
   (F), or take a ferry from the foot of Bay Street (E, $9). Wanted on the water? The Marine Unit comes after you. */
const WATER_Y=-.9;
function rayTo(x,z,dx,dz,test,maxD=3000){const L=hypot(dx,dz)||1;dx/=L;dz/=L;for(let s=0;s<maxD;s+=2){const px=x+dx*s,pz=z+dz*s;if(test(px,pz))return{x:px,z:pz,s};}return null;}
function spiral(x,z,test,maxR=200,step=3){if(test(x,z))return{x,z};for(let r=step;r<=maxR;r+=step){const n=max(8,ceil(2*PI*r/step));for(let k=0;k<n;k++){const a=k/n*2*PI,px=x+cos(a)*r,pz=z+sin(a)*r;if(test(px,pz))return{x:px,z:pz};}}return null;}
const isleOK=(x,z)=>onIsland(x,z)&&onIsland(x+5,z)&&onIsland(x-5,z)&&onIsland(x,z+5)&&onIsland(x,z-5)&&!solidAt(x,1,z); // a few metres inland
const openWater=(x,z,r)=>{if(!onWater(x,z))return false;for(let k=0;k<8;k++){const a=k/8*2*PI;if(!onWater(x+cos(a)*r,z+sin(a)*r))return false;}return true;};
function isleName(x,z){if(x<-1050&&z<2480)return 'Billy Bishop Airport';if(x<-1050)return "Hanlan's Point";if(x>1150&&z<2900&&x<1500&&z>2560)return "Ward's Island";if(x>700&&z<3150)return x>1150?"Ward's Island":'Algonquin Island';return 'Centre Island';}

// --- hulls: lofted stations from transom to bow, V bottom, a stripe along the topsides
function fq(gb,a,b,c,d,hint,col){const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2];let n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];const L=hypot(...n)||1;n=n.map(v=>v/L);
  if(n[0]*hint[0]+n[1]*hint[1]+n[2]*hint[2]<0)n=n.map(v=>-v);gb.quad(a,b,c,d,n,col);}
function hullGB(gb,L,W,H,side,deck,bot,stripe){
  const N=14,S=[];
  for(let i=0;i<=N;i++){const u=i/N,z=-L/2+u*L,t=max(0,(u-.45)/.55),w=W/2*Math.pow(max(0,cos(t*PI/2)),.6),yd=H*(1+.16*t*t),yc=H*(.3+.45*t*t),yk=H*.72*t*t;
    S.push({DL:[-w,yd,z],SL:[-w*.97,yd-H*.18,z],CL:[-w*.9,yc,z],K:[0,yk,z],CR:[w*.9,yc,z],SR:[w*.97,yd-H*.18,z],DR:[w,yd,z]});}
  for(let i=0;i<N;i++){const a=S[i],b=S[i+1];
    fq(gb,a.DL,a.DR,b.DR,b.DL,[0,1,0],deck);
    fq(gb,a.DL,b.DL,b.SL,a.SL,[-1,0,0],stripe);fq(gb,a.SL,b.SL,b.CL,a.CL,[-1,0,0],side);fq(gb,a.CL,b.CL,b.K,a.K,[-1,-1,0],bot);
    fq(gb,a.DR,b.DR,b.SR,a.SR,[1,0,0],stripe);fq(gb,a.SR,b.SR,b.CR,a.CR,[1,0,0],side);fq(gb,a.CR,b.CR,b.K,a.K,[1,-1,0],bot);}
  const t=S[0],B=[0,0,-1];gb.tri(t.K,t.CL,t.DL,B,side);gb.tri(t.K,t.DL,t.DR,B,side);gb.tri(t.K,t.DR,t.CR,B,side);}
function boxGB(gb,x,y,z,w,h,d,col,noBottom=true){const x0=x-w/2,x1=x+w/2,y1=y+h,z0=z-d/2,z1=z+d/2;
  gb.quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],[0,1,0],col);
  gb.quad([x0,y,z1],[x1,y,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],col);gb.quad([x0,y,z0],[x1,y,z0],[x1,y1,z0],[x0,y1,z0],[0,0,-1],col);
  gb.quad([x1,y,z0],[x1,y,z1],[x1,y1,z1],[x1,y1,z0],[1,0,0],col);gb.quad([x0,y,z0],[x0,y,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0],col);
  if(!noBottom)gb.quad([x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1],[0,-1,0],col);}
const BT=[
  {name:'Speedboat',kind:'speed',L:6.4,W:2.3,H:1.05,accel:10,maxSpeed:32,grip:1.7,wr:.3,draft:.35},
  {name:'Cabin Cruiser',kind:'cruiser',L:9.6,W:3.1,H:1.35,accel:5.5,maxSpeed:21,grip:1.3,wr:.3,draft:.5},
  {name:'Police Boat',kind:'police',L:8.4,W:2.8,H:1.25,accel:9.5,maxSpeed:30,grip:1.6,wr:.3,draft:.45},
  {name:'Ferry',kind:'ferry',L:30,W:10,H:2.2,deck:4.85}];
const BOATCOL=[0xb8202c,0x1c4f9c,0x1d7a5a,0xe0a020,0x222428,0x7a2a8c,0x2a8fbf];
function boatGeo(T,colHex){
  const gb=new GB(),col=new THREE.Color(colHex),W=C3(.94,.94,.92),cream=C3(.86,.82,.74),dark=C3(.07,.09,.11),glass=C3(.12,.18,.24),bot=C3(.45,.08,.07),H=T.H,L=T.L;
  if(T.kind==='speed'){hullGB(gb,L,T.W,H,col,cream,dark,W);
    boxGB(gb,0,H,.5,1.0,.75,.7,W);fq(gb,[-1,H+.75,.86],[1,H+.75,.86],[.9,H+1.25,.55],[-.9,H+1.25,.55],[0,.5,1],glass); // console + windscreen
    boxGB(gb,-.5,H,-.5,.55,.45,.55,dark);boxGB(gb,.5,H,-.5,.55,.45,.55,dark);boxGB(gb,0,H,-2.1,T.W*.78,.42,.7,dark);
    boxGB(gb,0,H*.25,-L/2-.25,.45,H+.6,.5,dark);}
  else if(T.kind==='cruiser'){hullGB(gb,L,T.W,H,W,cream,bot,col);
    boxGB(gb,0,H,.6,T.W*.74,1.15,4.2,W);boxGB(gb,0,H+.45,.6,T.W*.745,.42,4.21,glass);
    boxGB(gb,0,H+1.15,.2,T.W*.6,.06,2.6,cream);for(const sx of[-1,1])boxGB(gb,sx*T.W*.3,H+1.15,.2,.05,.55,2.6,W);
    boxGB(gb,0,H*.55,-L/2-.4,T.W*.8,.1,.8,cream);boxGB(gb,0,H,-2.9,T.W*.7,.4,.9,dark);}
  else if(T.kind==='police'){hullGB(gb,L,T.W,H,C3(.06,.12,.3),C3(.2,.22,.25),dark,W);
    boxGB(gb,0,H,.3,T.W*.72,1.25,3.4,W);boxGB(gb,0,H+.55,.3,T.W*.725,.45,3.41,glass);boxGB(gb,0,H+1.25,.3,1.2,.12,.4,dark);
    boxGB(gb,0,H*.25,-L/2-.25,.55,H+.6,.6,dark);}
  else{ // the ferry: double-ended, an enclosed main deck, an open upper deck with benches and a wheelhouse at each end
    const D=T.deck,cab=D-H;hullGB(gb,L*.5,T.W,H,W,C3(.55,.5,.42),bot,C3(.12,.3,.6));
    // the loft above tapers to a bow; mirror it so both ends are bows
    const g2=new GB();hullGB(g2,L*.5,T.W,H,W,C3(.55,.5,.42),bot,C3(.12,.3,.6));
    for(let i=0;i<gb.p.length;i+=3)gb.p[i+2]+=L*.25;for(let i=0;i<g2.p.length;i+=3){g2.p[i+2]=-g2.p[i+2]-L*.25;g2.p[i]=-g2.p[i];}
    gb.p.push(...g2.p);gb.n.push(...g2.n.map((v,i)=>i%3===1?v:-v));gb.u.push(...g2.u);gb.c.push(...g2.c);
    boxGB(gb,0,H,0,T.W*.86,cab,L*.7,W);boxGB(gb,0,H+cab*.38,0,T.W*.865,cab*.4,L*.7+.02,glass);
    boxGB(gb,0,D-.05,0,T.W*.96,.12,L*.86,C3(.62,.58,.5));
    for(const sx of[-1,1]){boxGB(gb,sx*T.W*.47,D,0,.06,1.0,L*.86,W);for(let z=-L*.42;z<=L*.42;z+=2.4)boxGB(gb,sx*T.W*.47,D,z,.08,1.0,.08,W);}
    for(const sz of[-1,1]){boxGB(gb,0,D,sz*L*.43,T.W*.96,1.0,.06,W);boxGB(gb,0,D,sz*L*.33,3.2,2.3,2.6,W);boxGB(gb,0,D+1.2,sz*L*.33,3.21,.8,2.61,glass);boxGB(gb,0,D+2.3,sz*L*.33,3.6,.12,3.0,C3(.12,.3,.6));}
    for(let z=-L*.22;z<=L*.22;z+=2.2)for(const sx of[-1,1])boxGB(gb,sx*2.4,D,z,2.6,.45,.5,C3(.42,.26,.14));}
  return gb.geo();}
const boatMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.45,metalness:.08,side:THREE.DoubleSide});

const BOATS=[],HB={t:rnd()*2000,F:[],cop:null,near:null,visit:[],props:[]};
function mkBoat(ti,x,z,th,col){const T=BT[ti],g=new THREE.Group(),m=new THREE.Mesh(boatGeo(T,col??rpick(BOATCOL)),boatMat);m.castShadow=true;g.add(m);scene.add(g);
  const b={boat:true,T,x,z,y:WATER_Y,th,vx:0,vz:0,w:0,steer:0,spin:0,roll:0,pitch:0,speed:0,thr:0,slip:0,hp:T.kind==='police'?140:100,mode:'moored',g,seed:rnd()*9,color:new THREE.Color(col??0xffffff)};
  if(T.kind==='police'){const mk=c=>{const l=new THREE.Mesh(new THREE.BoxGeometry(.5,.22,.3),new THREE.MeshBasicMaterial({color:c}));g.add(l);return l;};b.la=mk(0xff0000);b.lb=mk(0x0040ff);b.la.position.set(-.35,T.H+1.45,.3);b.lb.position.set(.35,T.H+1.45,.3);}
  BOATS.push(b);return b;}
function rmBoat(b){scene.remove(b.g);b.g.traverse(o=>{if(o.geometry)o.geometry.dispose();});const k=BOATS.indexOf(b);if(k>=0)BOATS.splice(k,1);}

// a mooring: water deep enough for the hull, with a quay or beach you can step onto within a few metres
// the hull's probe points (bow, stern, beam, quarters): how many are over land
function hullHits(x,z,th,T,m=1){const fx=sin(th),fz=cos(th),rx=fz,rz=-fx,h=T.L*.46*m,s=T.W*.46*m;let n=0;
  for(const[o,l]of[[h,0],[-h,0],[0,s],[0,-s],[h*.55,s*.8],[h*.55,-s*.8],[-h*.8,s],[-h*.8,-s]])if(!onWater(x+fx*o+rx*l,z+fz*o+rz*l))n++;return n;}
function dockSpot(x,z,ti){const T=BT[ti];let th=0;
  const s=spiral(x,z,(px,pz)=>{if(!onWater(px,pz))return false;let best=-1,bl=1e9;
    for(let k=0;k<16;k++){const a=k/16*2*PI,r=rayTo(px,pz,cos(a),sin(a),walkable,T.W/2+4);if(r&&r.s<bl){bl=r.s;best=a;}}
    if(best<0)return false;const t0=atan2(cos(best),sin(best))+PI/2; // lie alongside the quay, the whole hull afloat with room to spare
    let bestT=null,room=T.L*2; // of the ways the hull fits, point the bow at the most open water
    for(const t of[t0,t0+PI,t0+PI/2,t0-PI/2]){if(hullHits(px,pz,t,T,1.25))continue;const r=rayTo(px,pz,sin(t),cos(t),(x,z)=>!onWater(x,z),250),d=r?r.s:250;if(d>room){room=d;bestT=t;}}
    if(bestT===null)return false;th=bestT;return true;},260,2);
  return s?{x:s.x,z:s.z,th}:null;}
const MARINAS=[[-420,1500,0],[-560,1490,1],[-930,1520,0],[-1450,1500,1],[-1520,1500,0],[-2050,1560,0],[420,1440,0],[930,1400,1],[300,1450,2],[1260,2700,0],[960,3010,1],[-620,3150,0],[-1290,2360,0]];
for(const[x,z,ti]of MARINAS){const s=dockSpot(x,z,ti);if(s){const b=mkBoat(ti,s.x,s.z,s.th,ti===2?0xffffff:undefined);b.home=s;}}

// --- ferries: three slips at the foot of Bay Street (the real Jack Layton Ferry Terminal), one route each
const TERM={x:118,z:1288},FROUTES=[["Hanlan's Point",-1249,2296,-48,190],['Centre Island',118,3256,0,0],["Ward's Island",1361,2663,48,95]];
const dockMat=new THREE.MeshStandardMaterial({color:0x7a6650,roughness:.9});
function dockAt(x,z,th){const m=new THREE.Mesh(new THREE.BoxGeometry(12,1.4,10),dockMat);m.position.set(x,-.55,z);m.rotation.y=th;scene.add(m);}
for(const[name,tx,tz,dx,off]of FROUTES){const T=BT[3];
  const sh=rayTo(TERM.x+dx,TERM.z,0,1,(x,z)=>onWater(x,z)&&onWater(x,z+6));if(!sh)continue;
  let ux=tx-sh.x,uz=tz-sh.z;const ul=hypot(ux,uz);ux/=ul;uz/=ul;
  const ih=rayTo(sh.x+ux*20,sh.z+uz*20,ux,uz,(x,z)=>!onWater(x,z));if(!ih)continue;
  const A=[sh.x+ux*(T.L/2+4),sh.z+uz*(T.L/2+4)],B=[ih.x-ux*(T.L/2+4),ih.z-uz*(T.L/2+4)];
  const gA=spiral(sh.x-ux*5,sh.z-uz*5,(x,z)=>walkable(x,z)&&!solidAt(x,1,z),40,2)||{x:sh.x-ux*5,z:sh.z-uz*5};
  const gB=spiral(ih.x+ux*7,ih.z+uz*7,(x,z)=>walkable(x,z)&&!solidAt(x,1,z),40,2)||{x:ih.x+ux*7,z:ih.z+uz*7};
  const r=HR.makeRoute(name,A,B,off),g=new THREE.Group(),m=new THREE.Mesh(boatGeo(T,0xffffff),boatMat);m.castShadow=true;g.add(m);scene.add(g);
  for(const[e,gt]of[['A',gA],['B',gB]]){const bc=beacon(0x3fe0ff,2.2,8);bc.position.set(gt.x,groundH(gt.x,gt.z),gt.z);bc.visible=true;scene.add(bc);}
  dockAt(sh.x+ux*2,sh.z+uz*2,r.th);dockAt(ih.x-ux*2,ih.z-uz*2,r.th);
  HB.F.push({r,g,gate:{A:gA,B:gB},dest:{A:'Jack Layton Ferry Terminal',B:name},f:HR.ferryAt(r,HB.t),T});}

// --- the islands: beaches, the Ward's Island cottages, a fairground, Gibraltar Point Lighthouse
function addBoxSolid(x,z,w,d,th,h){const c=cos(th),s=sin(th),P=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b])=>[x+a*c+b*s,z-a*s+b*c]);
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of P){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}hAdd({p:flat(P),x0,x1,z0,z1,h},x0-3,z0-3,x1+3,z1+3);}
{ // Ward's Island cottages: small clapboard houses in pastel paint, gable roofs
  const gb=new GB(),PAINT=[C3(.95,.86,.6),C3(.62,.8,.86),C3(.92,.7,.7),C3(.75,.86,.62),C3(.95,.95,.92),C3(.8,.72,.9)],roofC=C3(.3,.28,.3),R0=mkRng(77),spots=[];
  for(let t=0;t<600&&spots.length<22;t++){const x=1130+R0()*440,z=2600+R0()*380;if(!isleOK(x,z)||spots.some(s=>hypot(s.x-x,s.z-z)<15)||HOUSES.some(h=>h.island&&hypot(h.at[0]-x,h.at[1]-z)<14))continue;spots.push({x,z,th:floor(R0()*4)*PI/2+(R0()-.5)*.2});}
  for(const s of spots){const w=5+R0()*2,d=6+R0()*2,h=2.8,c=PAINT[floor(R0()*PAINT.length)],cs=cos(s.th),sn=sin(s.th),P=(a,y,b)=>[s.x+a*cs+b*sn,.45+y,s.z-a*sn+b*cs];
    const q=(a,b,c2,d2,n,col)=>{const r=v=>[v[0]*cs+v[2]*sn,v[1],-v[0]*sn+v[2]*cs];gb.quad(P(...a),P(...b),P(...c2),P(...d2),r(n),col);};
    q([-w/2,0,-d/2],[w/2,0,-d/2],[w/2,h,-d/2],[-w/2,h,-d/2],[0,0,-1],c);q([-w/2,0,d/2],[w/2,0,d/2],[w/2,h,d/2],[-w/2,h,d/2],[0,0,1],c);
    q([w/2,0,-d/2],[w/2,0,d/2],[w/2,h,d/2],[w/2,h,-d/2],[1,0,0],c);q([-w/2,0,-d/2],[-w/2,0,d/2],[-w/2,h,d/2],[-w/2,h,-d/2],[-1,0,0],c);
    gb.tri(P(-w/2,h,-d/2),P(w/2,h,-d/2),P(0,h+1.8,-d/2),[-sn,0,-cs],c);gb.tri(P(-w/2,h,d/2),P(w/2,h,d/2),P(0,h+1.8,d/2),[sn,0,cs],c);
    q([-w/2-.3,h-.1,-d/2-.3],[0,h+1.8,-d/2-.3],[0,h+1.8,d/2+.3],[-w/2-.3,h-.1,d/2+.3],[-.7,.7,0],roofC);q([w/2+.3,h-.1,-d/2-.3],[0,h+1.8,-d/2-.3],[0,h+1.8,d/2+.3],[w/2+.3,h-.1,d/2+.3],[.7,.7,0],roofC);
    q([-.6,0,d/2+.01],[.6,0,d/2+.01],[.6,2,d/2+.01],[-.6,2,d/2+.01],[0,0,1],C3(.35,.22,.15));
    addBoxSolid(s.x,s.z,w,d,s.th,5);}
  const m=new THREE.Mesh(gb.geo(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,side:THREE.DoubleSide}));m.castShadow=m.receiveShadow=true;scene.add(m);}
{ // beach umbrellas and towels a little way up from the south shore
  const R0=mkRng(91),items=[];
  for(let x=-1700;x<=1000;x+=34){const sh=rayTo(x,4380,0,-1,(px,pz)=>onIsland(px,pz),1800);if(!sh)continue;for(let k=0;k<3;k++){const px=x+(R0()-.5)*24,pz=sh.z-12-R0()*14;if(isleOK(px,pz))items.push({x:px,z:pz,c:new THREE.Color().setHSL(R0(),.75,.55),a:R0()*6});}}
  const can=new THREE.InstancedMesh(new THREE.ConeGeometry(1.5,.55,8,1,true),new THREE.MeshStandardMaterial({roughness:.8,side:THREE.DoubleSide}),items.length),
    pole=new THREE.InstancedMesh(new THREE.CylinderGeometry(.035,.035,2.3,5),new THREE.MeshStandardMaterial({color:0xdddddd,metalness:.4,roughness:.4}),items.length),
    towel=new THREE.InstancedMesh(new THREE.BoxGeometry(.9,.02,1.8),new THREE.MeshStandardMaterial({roughness:1}),items.length);
  items.forEach((it,i)=>{_m.makeRotationY(it.a);_m.setPosition(it.x,.45+2.25,it.z);can.setMatrixAt(i,_m);can.setColorAt(i,it.c);_m.setPosition(it.x,.45+1.15,it.z);pole.setMatrixAt(i,_m);
    _m.setPosition(it.x+cos(it.a)*1.3,.46,it.z+sin(it.a)*1.3);towel.setMatrixAt(i,_m);towel.setColorAt(i,new THREE.Color().setHSL((it.a*.3)%1,.6,.6));});
  for(const im of[can,pole,towel]){im.castShadow=true;scene.add(im);}}
{ // Gibraltar Point Lighthouse (1808): a tapering six-sided stone tower with a red lantern room
  const s=spiral(-1760,3960,isleOK,400,4);if(s){const g=new THREE.Group(),stone=new THREE.MeshStandardMaterial({color:0xcfc6b2,roughness:.95}),red=new THREE.MeshStandardMaterial({color:0xa8261c,roughness:.6});
    const add=(geo,mat,y)=>{const m=new THREE.Mesh(geo,mat);m.position.y=y;m.castShadow=true;g.add(m);return m;};
    add(new THREE.CylinderGeometry(1.9,2.7,20,6),stone,10);add(new THREE.CylinderGeometry(2.5,2.5,.35,6),stone,20.2);
    add(new THREE.CylinderGeometry(1.35,1.35,2.2,8),new THREE.MeshStandardMaterial({color:0x223038,roughness:.1,metalness:.6}),21.5);
    HB.lamp=add(new THREE.SphereGeometry(.7,10,8),new THREE.MeshStandardMaterial({color:0xfff0c0,emissive:0xffd070,emissiveIntensity:0}),21.5);
    add(new THREE.ConeGeometry(1.6,1.5,8),red,23.35);add(new THREE.CylinderGeometry(1.4,1.4,.25,8),red,22.7);
    g.position.set(s.x,.45,s.z);scene.add(g);addCircle(s.x,s.z,2.9);HB.light={x:s.x,z:s.z};}}
{ // a small fairground near the Centre Island ferry dock: a Ferris wheel and a carousel
  const F=HB.F.find(q=>q.r.name==='Centre Island');const c0=F?[F.gate.B.x+sin(F.r.th)*70,F.gate.B.z+cos(F.r.th)*70]:[118,3330];
  const s=spiral(c0[0],c0[1],(x,z)=>isleOK(x,z)&&isleOK(x+12,z)&&isleOK(x-12,z)&&isleOK(x,z+30),220,4);
  if(s){const steel=new THREE.MeshStandardMaterial({color:0xe8e8ea,metalness:.5,roughness:.4}),R=10,wheel=new THREE.Group(),g=new THREE.Group();g.position.set(s.x,.45,s.z);g.rotation.y=PI/2;scene.add(g);
    for(const sx of[-1.1,1.1]){const rim=new THREE.Mesh(new THREE.TorusGeometry(R,.14,6,48),steel);rim.position.x=sx;rim.rotation.y=PI/2;wheel.add(rim);
      for(let k=0;k<12;k++){const sp=new THREE.Mesh(new THREE.BoxGeometry(.08,R,.08),steel);sp.position.set(sx,sin(k/12*2*PI)*R/2,cos(k/12*2*PI)*R/2);sp.rotation.x=-k/12*2*PI;wheel.add(sp);}
      for(const lz of[-1,1]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.2,R+2.6,.2),steel);leg.position.set(sx*1.3,(R+1.3)/2,lz*3.2);leg.rotation.x=lz*.3;g.add(leg);}}
    const cars=[];for(let k=0;k<12;k++){const c=new THREE.Mesh(new THREE.BoxGeometry(1.8,1.3,1.3),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(k/12,.7,.55),roughness:.6}));wheel.add(c);cars.push(c);}
    wheel.position.y=R+1.5;g.add(wheel);addCircle(s.x,s.z,3.5);HB.wheel={wheel,cars,R};
    const cx=s.x,cz=s.z+22,car=new THREE.Group();car.position.set(cx,.45,cz);scene.add(car);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(6,6,.5,24),new THREE.MeshStandardMaterial({color:0xc9a227,metalness:.4,roughness:.5}));base.position.y=.25;car.add(base);
    const spin=new THREE.Group();car.add(spin);const roof=new THREE.Mesh(new THREE.ConeGeometry(6.6,2.6,24),new THREE.MeshStandardMaterial({color:0xd8343c,roughness:.6}));roof.position.y=4.7;spin.add(roof);
    for(let k=0;k<12;k++){const a=k/12*2*PI,p=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,3.4,5),steel);p.position.set(cos(a)*4.6,2.2,sin(a)*4.6);spin.add(p);
      const h=new THREE.Mesh(new THREE.BoxGeometry(.35,.7,1.3),new THREE.MeshStandardMaterial({color:k%2?0xffffff:0x6b4a2e,roughness:.5}));h.position.set(cos(a)*4.6,1.4,sin(a)*4.6);h.rotation.y=-a;spin.add(h);}
    addCircle(cx,cz,6.4);HB.carousel=spin;HB.fair={x:s.x,z:s.z};}}

// --- leaving the water: the boat stays where it is, you end up on foot (then whoever called moves you)
function offWater(){G.ride=null;if(G.car&&G.car.boat){const b=G.car;b.mode='free';b.vx=b.vz=b.w=0;G.car=null;player.hidden=false;}}
function boardBoat(b){if(b.T.kind==='police'){addHeat(1.5);b.wasCop=1;}if(b===HB.cop)HB.cop=null;b.mode='player';G.car=b;player.hidden=true;G.lastShore={x:player.x,z:player.z};}
function leaveBoat(){const b=G.car;if(hypot(b.vx,b.vz)>3){flash('Slow down to get out',1.2);return;}
  const s=spiral(b.x,b.z,(x,z)=>walkable(x,z)&&!solidAt(x,1,z),b.T.W/2+7,1);
  if(!s){flash('Get closer to the shore to get off',1.6);return;}
  player.x=s.x;player.z=s.z;player.y=groundH(s.x,s.z);player.vy=0;player.th=b.th;player.hidden=false;b.mode='free';G.car=null;}
function nearBoat(){let best=null,bd=6;for(const b of BOATS){if(b.mode==='police'||b.mode==='leave')continue;const d=hypot(b.x-player.x,b.z-player.z);if(d<bd){bd=d;best=b;}}return best;}

// --- boat physics: car handling on loose grip, water drag, the hull may not touch land; bob, plane, lean into turns
function boatStep(c,dt){
  const T=c.T,sp=hypot(c.vx,c.vz),dr=exp(-dt*(c.thr?.12:.45));c.vx*=dr;c.vz*=dr;
  const fx=sin(c.th),fz=cos(c.th),rx=fz,rz=-fx,n=hullHits(c.x,c.z,c.th,T);
  // aground: bounce back, unless this move gets more of the hull off the land than before (so you can always back out)
  if(n&&c.px!==undefined&&n>=(c.hits||0)){c.x=c.px;c.z=c.pz;c.th=c.pth??c.th;c.vx*=-.3;c.vz*=-.3;c.w*=-.5;if(sp>3)crash(c,sp*.75);}else{c.px=c.x;c.pz=c.z;c.pth=c.th;c.hits=n;}
  for(const F of HB.F){const dx=c.x-F.f.x,dz=c.z-F.f.z,cs=cos(F.r.th),sn=sin(F.r.th),lx=dx*cs-dz*sn,lz=dx*sn+dz*cs,ex=F.T.W/2+T.W*.5,ez=F.T.L/2+T.L*.4;
    if(abs(lx)<ex&&abs(lz)<ez){const push=sign(lx||1)*ex-lx;c.x+=cs*push;c.z-=sn*push;const fv=F.f.v*(F.f.dir||0);const vn=c.vx*cs-c.vz*sn;if(vn*sign(lx||1)<0){c.vx-=cs*vn*1.3;c.vz+=sn*vn*1.3;if(abs(vn)>3)crash(c,abs(vn)+abs(fv)*.3);}}}
  const t=HB.t,wv=.045+WX.rain*.05,yaw=c.lth===undefined?0:wrap(c.th-c.lth)/max(dt,1e-3);c.lth=c.th;
  c.y=WATER_Y-T.draft+sin(t*1.4+c.seed)*wv+min(.22,sp*.011);
  c.pitch+=(-.09*clamp(sp/14,0,1)*(sp>24?.7:1)+sin(t*1.1+c.seed*2)*wv*.5-c.pitch)*min(1,dt*3);
  c.roll+=(clamp(-yaw*sp*.012,-.18,.18)+sin(t*.9+c.seed)*wv*.7-c.roll)*min(1,dt*3);
  if(sp>3&&(G.frame+(c.seed*10|0))%2===0&&hypot(c.x-__gs.FX,c.z-__gs.FZ)<260){const bx=c.x-fx*T.L*.5,bz=c.z-fz*T.L*.5,k=min(1,sp/25);
    for(const sd of[-1,1])emit(bx+rx*sd*T.W*.4,WATER_Y+.15,bz+rz*sd*T.W*.4,rx*sd*1.6-c.vx*.15,.5+k,rz*sd*1.6-c.vz*.15,.22+k*.3,.8+k*.6,.95,.35);}
}
function boatBump(a,b){const dx=b.x-a.x,dz=b.z-a.z,d=hypot(dx,dz)||1,R=(a.T.L+b.T.L)*.38;if(d>=R)return;const nx=dx/d,nz=dz/d,o=(R-d)/2;a.x-=nx*o;a.z-=nz*o;b.x+=nx*o;b.z+=nz*o;
  const rv=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;if(rv<0){a.vx+=nx*rv*.6;a.vz+=nz*rv*.6;b.vx-=nx*rv*.6;b.vz-=nz*rv*.6;if(-rv>3){crash(a,-rv);crash(b,-rv);}}}
// the Marine Unit: closes in, rams, and from three stars its officers shoot
function policeBoat(b,dt,lvl){
  const P=G.car&&G.car.boat?G.car:null,tx=P?P.x+P.vx*.8:__gs.FX,tz=P?P.z+P.vz*.8:__gs.FZ,dx=tx-b.x,dz=tz-b.z,d=hypot(dx,dz),leave=b.mode==='leave';
  let thr=leave?1:d>16?1:d>8?.35:0,st=clamp(wrap((leave?atan2(-dx,-dz):atan2(dx,dz))-b.th)*2,-1,1);
  const ax=b.x+sin(b.th)*22,az=b.z+cos(b.th)*22;if(!onWater(ax,az)){st=onWater(b.x+sin(b.th+.8)*22,b.z+cos(b.th+.8)*22)?1:-1;thr=.45;}
  b.thr=thr;drive(b,thr,st,false,dt);boatStep(b,dt);if(P)boatBump(b,P);
  if(!leave&&lvl>=3&&d<55&&WANT.shotCd<=0&&b.hp>0){copShot(b.x,b.y+2.4,b.z,.3,9);WANT.shotCd=.8;}
  if(b.hp<=0&&b.mode!=='wreck'){b.mode='wreck';}
}
function stepBoats(dt){
  const lvl=wLvl(),onBoat=G.car&&G.car.boat;
  if(onBoat&&WANT.state&&lvl>=2&&!HB.cop&&(HB.copCd=(HB.copCd||0)-dt)<=0){HB.copCd=6;
    for(let t=0;t<12;t++){const a=rnd()*2*PI,r=220+rnd()*120,x=__gs.FX+cos(a)*r,z=__gs.FZ+sin(a)*r;if(openWater(x,z,8)){HB.cop=mkBoat(2,x,z,atan2(__gs.FX-x,__gs.FZ-z),0xffffff);HB.cop.mode='police';flash('MARINE UNIT',1.6);break;}}}
  if(HB.cop&&HB.cop.mode==='police'&&(!WANT.state||!onBoat))HB.cop.mode='leave';
  for(let i=BOATS.length-1;i>=0;i--){const b=BOATS[i];if(b===G.car)continue;
    if(b.mode==='police'||b.mode==='leave'){policeBoat(b,dt,lvl);if(b.mode==='leave'&&hypot(b.x-__gs.FX,b.z-__gs.FZ)>420){if(HB.cop===b)HB.cop=null;rmBoat(b);}continue;}
    if(b.mode==='free'||b.mode==='wreck'){b.thr=0;drive(b,0,0,false,dt);boatStep(b,dt);if(b.mode==='free'&&hypot(b.vx,b.vz)<.2){b.vx=b.vz=b.w=0;b.mode='moored';}continue;}
    b.thr=0;boatStep(b,dt);}
}

// --- ferries: follow the timetable; board at a gate when one is in, ride on the upper deck, step off at the far end
function deckPos(F,lx,lz){const cs=cos(F.r.th),sn=sin(F.r.th);return{x:F.f.x+lx*cs+lz*sn,z:F.f.z-lx*sn+lz*cs};}
function boardFerry(F,end){
  if(G.cash<HR.FARE){flash('The ferry is $'+HR.FARE,1.6);return;}
  G.cash-=HR.FARE;const to=end==='A'?'B':'A';G.ride={F,to,lx:(rnd()-.5)*F.T.W*.5,lz:(to==='B'?1:-1)*F.T.L*(.12+rnd()*.12)};G.lastShore={x:player.x,z:player.z};
  player.th=F.r.th+(to==='B'?0:PI);__gs.camYaw=player.th;flash('FERRY TO '+F.dest[to].toUpperCase(),2.2);__late.click();}
function landFerry(skip){const R=G.ride,F=R.F,gt=F.gate[R.to];G.ride=null;
  const go=()=>{player.x=gt.x;player.z=gt.z;player.y=groundH(gt.x,gt.z);player.vy=0;__gs.FX=gt.x;__gs.FZ=gt.z;__late.camT.set(__gs.FX,1.6,__gs.FZ);flash(F.dest[R.to].toUpperCase(),2.4);for(const p of peds)if(p!==player&&!p.actor)placePed(p,12,160);};
  if(!skip){go();return;}G.busy=true;$('fade').style.opacity=1;setTimeout(()=>{go();$('fade').style.opacity=0;G.busy=false;},650);}
function stepRide(dt){const R=G.ride,F=R.F,p=deckPos(F,R.lx,R.lz);
  player.x=p.x;player.z=p.z;player.y=WATER_Y-.55+F.T.deck+.05;player.vy=0;player.amp*=.85;__gs.FX=p.x;__gs.FZ=p.z;G.focusSpeed=0;
  if(F.f.phase==='docked'&&F.f.at===R.to)landFerry(false);
  else if(K.Space&&!G.busy)landFerry(true);}
function stepHarbour(dt){
  HB.t+=dt;for(const F of HB.F)F.f=HR.ferryAt(F.r,HB.t);
  if(HB.cop&&HB.cop.mode==='police')G.copDist=min(G.copDist,hypot(HB.cop.x-__gs.FX,HB.cop.z-__gs.FZ)); // the Marine Unit's siren
  if(!G.car&&!G.ride)G.lastShore=walkable(player.x,player.z)?{x:player.x,z:player.z}:G.lastShore;
  HB.near=null;G.ferryHint='';
  if(G.ride)G.ferryHint='Riding to '+G.ride.F.dest[G.ride.to]+' · Space to skip the crossing';
  else if(!G.car&&!G.busy)for(const F of HB.F)for(const e of['A','B']){const gt=F.gate[e];if(hypot(player.x-gt.x,player.z-gt.z)>9)continue;const to=e==='A'?'B':'A';
    if(F.f.phase==='docked'&&F.f.at===e){HB.near={F,e};G.ferryHint=`Press E to board the ferry to ${F.dest[to]} ($${HR.FARE}) · leaves in ${HR.clock(F.f.wait)}`;}
    else G.ferryHint=`Ferry to ${F.dest[to]} · next one leaves in ${HR.clock(HR.nextDeparture(F.r,HB.t,e))}`;}
  stepIsleVisitors();}
// --- island visitors: while you're out on the islands, some of the city's pedestrians are too
function stepIsleVisitors(){if(G.frame%30)return;
  const here=!__gs.IN&&__gs.FZ>1640&&!(walkable(__gs.FX,__gs.FZ)&&!onIsland(__gs.FX,__gs.FZ)),V=HB.visit;
  for(let i=V.length-1;i>=0;i--){const p=V[i];if(!here||!p.actor||!p.actor.isle||p.state==='dead'||p.state==='down'){if(p.actor&&p.actor.isle){releasePed(p);placePed(p,70,170);}V.splice(i,1);continue;}
    if(hypot(p.x-__gs.FX,p.z-__gs.FZ)>190){const s=isleSpot(50,150);if(s){p.actor.x=p.x=s.x;p.actor.z=p.z=s.z;p.y=groundH(s.x,s.z);}}
    else if(rnd()<.12){const a=rnd()*2*PI,x=p.actor.x+cos(a)*4,z=p.actor.z+sin(a)*4;if(isleOK(x,z)){p.actor.x=x;p.actor.z=z;}}}
  if(!here||V.length>=12)return; // the pool is small: leave the mainland its crowds
  const s=isleSpot(45,150);if(!s)return;
  for(let k=1;k<peds.length;k++){const p=peds[k];if(!calmPed(p)||hypot(p.x-__gs.FX,p.z-__gs.FZ)<60)continue;
    p.actor={x:s.x,z:s.z,th:rnd()*6,look:null,isle:1,walk:1};p.x=s.x;p.z=s.z;p.y=groundH(s.x,s.z);p.vx=p.vz=0;V.push(p);return;}}
function isleSpot(r0,r1){for(let t=0;t<14;t++){const a=rnd()*2*PI,r=r0+rnd()*(r1-r0),x=__gs.FX+cos(a)*r,z=__gs.FZ+sin(a)*r;if(isleOK(x,z))return{x,z};}return null;}
function syncHarbour(){
  const now=performance.now();
  for(const b of BOATS){const vis=hypot(b.x-camera.position.x,b.z-camera.position.z)<1600;b.g.visible=vis;if(!vis)continue;b.g.position.set(b.x,b.y,b.z);b.g.rotation.set(b.pitch,b.th,b.roll,'YXZ');
    if(b.la){const on=b.mode==='police'||(b===G.car&&WANT.state),f=(now/160|0)%2;b.la.material.color.setRGB(on&&f?3:.25,0,0);b.lb.material.color.setRGB(0,0,on&&!f?3:.3);}}
  for(const F of HB.F){const f=F.f;F.g.visible=hypot(f.x-camera.position.x,f.z-camera.position.z)<2600;F.g.position.set(f.x,WATER_Y-.55+sin(HB.t*.8+F.r.offset)*.05,f.z);F.g.rotation.set(0,F.r.th,sin(HB.t*.6+F.r.offset)*.008,'YXZ');
    if(f.v>2&&G.frame%2===0&&hypot(f.x-__gs.FX,f.z-__gs.FZ)<500){const fx=sin(F.r.th)*(f.dir||1),fz=cos(F.r.th)*(f.dir||1),bx=f.x-fx*15,bz=f.z-fz*15;for(const sd of[-1,1])emit(bx+fz*sd*4,WATER_Y+.2,bz-fx*sd*4,fz*sd*2,.6,-fx*sd*2,.5,1.3,.95,.35);}}
  if(HB.wheel){const a=HB.t*.12;HB.wheel.wheel.rotation.x=a;HB.wheel.cars.forEach((c,k)=>{const t=k/12*2*PI;c.position.set(0,sin(t)*HB.wheel.R-.9,cos(t)*HB.wheel.R);c.rotation.x=-a;});}
  if(HB.carousel)HB.carousel.rotation.y=HB.t*.5;
  if(HB.lamp)HB.lamp.material.emissiveIntensity=night>.05?3*night:0;
}
if(TEST){window.__HB=()=>({boats:BOATS.map(b=>({n:b.T.name,x:b.x|0,z:b.z|0,m:b.mode,th:+b.th.toFixed(2),hits:hullHits(b.x,b.z,b.th,b.T),v:+hypot(b.vx,b.vz).toFixed(1),thr:b.thr})),ferries:HB.F.map(F=>({name:F.r.name,len:F.r.len|0,A:F.r.a.map(v=>v|0),B:F.r.b.map(v=>v|0),gA:[F.gate.A.x|0,F.gate.A.z|0],gB:[F.gate.B.x|0,F.gate.B.z|0],
    clear:(()=>{let bad=0;for(let s=0;s<=F.r.len;s+=4){const u=s/F.r.len,x=F.r.a[0]+(F.r.b[0]-F.r.a[0])*u,z=F.r.a[1]+(F.r.b[1]-F.r.a[1])*u;for(const o of[-5,0,5])if(!onWater(x+cos(F.r.th)*o,z-sin(F.r.th)*o))bad++;}return bad;})(),f:F.f.phase})),
    light:HB.light,fair:HB.fair,visit:HB.visit.length,ride:!!G.ride,car:G.car&&G.car.T.name,cop:HB.cop&&HB.cop.mode,t:HB.t|0});
  window.__boat=i=>{const b=BOATS[i];player.x=b.x;player.z=b.z;boardBoat(b);return b.T.name;};
  window.__ferryGo=(i,e)=>{const F=HB.F[i],gt=F.gate[e];offWater();player.x=gt.x;player.z=gt.z;__gs.FX=gt.x;__gs.FZ=gt.z;
    const want=e==='A'?0:HR.DOCK_TIME+F.r.sail;HB.t+=((want-((HB.t+F.r.offset)%F.r.cycle))%F.r.cycle+F.r.cycle)%F.r.cycle+1;F.f=HR.ferryAt(F.r,HB.t);return F.f.phase+' '+F.f.at;};
  window.__cash=v=>{G.cash=v;};window.__heat=v=>{G.heat=v;};window.__look=(x,z,p)=>{__gs.camYaw=atan2(x-player.x,z-player.z);__gs.camPitch=p??.15;};
  window.__fboard=()=>{if(!HB.near)return 'no ferry here';boardFerry(HB.near.F,HB.near.e);return !!G.ride;};}

export { boatStep, boxGB, fq, nearBoat, offWater, spiral, stepBoats, stepHarbour, stepRide, syncHarbour };
