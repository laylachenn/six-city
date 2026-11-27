// Six City — interiors. One of the game's modules; they load in numbered order (src/game/index.js).
import './13-homes.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { __gs, __late, later } from './shared.js';
import { $, MAP, PI, R, abs, atan2, camera, clamp, cos, cv, floor, groundH, hypot, max, min, mkRng, pick, renderer, rnd, round, rpick, rr, scene, sign, sin, wrap } from './01-core.js';
import { hemi, sun } from './02-sky.js';
import { SHOPV, speckle } from './03-textures.js';
import { BRAND, HK, MeshBag, ONE, PO, SH, SIGNMATS, STX, _e, _m, _q, _s, _v, addCircle, flat, hAdd, hkey, inPoly, nearestEdge, polyArea, polyCen, pushOut, solidAt, walkable } from './04-world.js';
import { clockT, curbSpot, streamTick, volsOf } from './05-landmarks.js';
import { CT, SLOTS, rmCar } from './06-cars.js';
import { beacon, emit, peds, placePed } from './07-people.js';
import { G, flash, player, toggleCar } from './08-input.js';
import { WANT, wLvl } from './10-police.js';
import { MS, SAVE } from './11-missions.js';
import { PANEL, closePanel } from './13-homes.js';
later({DOOR:()=>DOOR,exitInterior:()=>exitInterior,inWalk:()=>inWalk,raiseAlarm:()=>raiseAlarm,solDel:()=>solDel,stepInPed:()=>stepInPed}); // for earlier modules, read when called

/* ============================== interiors ============================== */
// Walk into a landmark: every door marker leads to a hand-built interior modelled on the real place. Interiors are built
// one at a time out past the edge of the map (like GTA's interiors) — except the CN Tower, whose elevator takes you up
// to the real LookOut level, 343 m above the city you were just walking around in.
const INO=[26000,26000];
const ISOL=[];
function solReg(o,x0,z0,x1,z1){o.ins=1;for(let i=floor((x0-3)/HK);i<=floor((x1+3)/HK);i++)for(let j=floor((z0-3)/HK);j<=floor((z1+3)/HK);j++){const k=hkey(i,j);let L=SH.get(k);if(!L)SH.set(k,L=[]);L.push(o);ISOL.push([L,o]);}}
function solPoly(pts,h){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of pts){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}const o={p:flat(pts),x0,x1,z0,z1,h:h??60};solReg(o,x0,z0,x1,z1);return o;}
function solAdd(x0,z0,x1,z1,h){if(x0>x1)[x0,x1]=[x1,x0];if(z0>z1)[z0,z1]=[z1,z0];return solPoly([[x0,z0],[x1,z0],[x1,z1],[x0,z1]],h);}
function solCirc(x,z,r){const o={c:1,x,z,r};solReg(o,x-r,z-r,x+r,z+r);return o;}
function solDel(o){for(const [L,q] of ISOL)if(q===o){const i=L.indexOf(o);if(i>=0)L.splice(i,1);}}
function solClear(){for(const [L,o] of ISOL){const i=L.indexOf(o);if(i>=0)L.splice(i,1);}ISOL.length=0;}

// --- interior materials: canvas textures made on first use; IMTM = metres covered by one texture repeat
const ITX={},IMT={},IMTM={};
function itex(key,W,H,draw){if(ITX[key])return ITX[key];const c=cv(W,H),g=c.getContext('2d');draw(g,W,H);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return ITX[key]=t;}
const grid=(g,W,n,col,lw)=>{g.strokeStyle=col;g.lineWidth=lw;for(let k=0;k<=W;k+=W/n){g.beginPath();g.moveTo(k,0);g.lineTo(k,W);g.moveTo(0,k);g.lineTo(W,k);g.stroke();}};
const veins=(g,W,n,col)=>{g.strokeStyle=col;for(let k=0;k<n;k++){g.lineWidth=rr(.4,2.2);g.beginPath();let x=R()*W,y=R()*W;g.moveTo(x,y);for(let s=0;s<7;s++){x+=rr(-70,70);y+=rr(-70,70);g.lineTo(x,y);}g.stroke();}};
const IMDEF={
  marble:[4,()=>({map:itex('marble',512,512,(g,W)=>{g.fillStyle='#ebe5d8';g.fillRect(0,0,W,W);speckle(g,W,5000,180,240,.18);veins(g,W,16,'rgba(130,118,104,.28)');grid(g,W,2,'rgba(95,85,75,.35)',2);}),roughness:.16,metalness:.05})],
  marbleRose:[4,()=>({map:itex('marbleRose',512,512,(g,W)=>{g.fillStyle='#d9c3b6';g.fillRect(0,0,W,W);speckle(g,W,5000,160,230,.2);veins(g,W,14,'rgba(120,80,70,.25)');grid(g,W,2,'rgba(90,60,55,.4)',2);}),roughness:.2})],
  checker:[2,()=>({map:itex('checker',256,256,(g,W)=>{for(let i=0;i<4;i++)for(let j=0;j<4;j++){g.fillStyle=(i+j)%2?'#2a2826':'#e9e2d4';g.fillRect(i*64,j*64,64,64);}speckle(g,W,2500,120,220,.15);}),roughness:.22})],
  wood:[3,()=>({map:itex('wood',512,512,(g,W)=>{for(let y=0;y<W;y+=32){let x=-R()*200;while(x<W){const L=rr(140,300),v=R();g.fillStyle=`rgb(${118+v*40|0},${78+v*26|0},${46+v*18|0})`;g.fillRect(x,y,L,31);g.fillStyle='rgba(40,22,10,.5)';g.fillRect(x,y,2,32);x+=L;}
    g.fillStyle='rgba(40,22,10,.35)';g.fillRect(0,y+31,W,1.5);}for(let k=0;k<900;k++){g.fillStyle=`rgba(60,34,16,${R()*.15})`;g.fillRect(R()*W,R()*W,rr(20,80),1);}}),roughness:.45})],
  oak:[3,()=>({map:itex('oak',512,512,(g,W)=>{g.fillStyle='#4a2e1a';g.fillRect(0,0,W,W);for(let k=0;k<1800;k++){g.fillStyle=`rgba(${R()<.5?30:110},${R()<.5?16:70},10,.12)`;g.fillRect(R()*W,R()*W,1.5,rr(10,60));}
    for(const [x,y,w,h] of[[24,24,208,208],[280,24,208,208],[24,280,208,208],[280,280,208,208]]){g.strokeStyle='rgba(20,10,4,.65)';g.lineWidth=6;g.strokeRect(x,y,w,h);g.strokeStyle='rgba(160,110,70,.35)';g.lineWidth=2;g.strokeRect(x+8,y+8,w-16,h-16);}}),roughness:.55})],
  carpetRed:[2,()=>({map:itex('carpetRed',256,256,(g,W)=>{g.fillStyle='#7d1620';g.fillRect(0,0,W,W);speckle(g,W,6000,40,120,.2);g.strokeStyle='rgba(212,170,80,.35)';g.lineWidth=3;for(let k=0;k<4;k++){g.beginPath();g.arc(64+(k%2)*128,64+(k>>1)*128,34,0,7);g.stroke();}}),roughness:.95})],
  carpetGreen:[2,()=>({map:itex('carpetGreen',256,256,(g,W)=>{g.fillStyle='#1f4d33';g.fillRect(0,0,W,W);speckle(g,W,6000,30,110,.2);}),roughness:.95})],
  carpetBlue:[2,()=>({map:itex('carpetBlue',256,256,(g,W)=>{g.fillStyle='#283a62';g.fillRect(0,0,W,W);speckle(g,W,6000,30,110,.2);g.fillStyle='rgba(255,255,255,.05)';for(let k=0;k<8;k++)g.fillRect(0,k*32,W,3);}),roughness:.95})],
  terrazzo:[4,()=>({map:itex('terrazzo',512,512,(g,W)=>{g.fillStyle='#cfccc4';g.fillRect(0,0,W,W);for(let k=0;k<9000;k++){const c=pick(['#8f8a80','#efece6','#a7a091','#6e6a63','#b9a58e']);g.fillStyle=c;g.beginPath();g.arc(R()*W,R()*W,rr(.6,3.2),0,7);g.fill();}grid(g,W,2,'rgba(70,70,70,.3)',2);}),roughness:.3})],
  concrete:[6,()=>({map:itex('concrete',512,512,(g,W)=>{g.fillStyle='#a7a39b';g.fillRect(0,0,W,W);speckle(g,W,14000,110,200,.22);for(let y=0;y<W;y+=21){{const v=R()<.5?70:215;g.fillStyle=`rgba(${v},${v},${v-6},.08)`;}g.fillRect(0,y,W,21);g.fillStyle='rgba(60,58,52,.25)';g.fillRect(0,y,W,1);}
    for(let x=0;x<W;x+=128){g.fillStyle='rgba(50,50,48,.3)';g.beginPath();g.arc(x+64,40,3,0,7);g.arc(x+64,256+40,3,0,7);g.fill();}}),roughness:.9})],
  concretePol:[6,()=>({map:itex('concretePol',512,512,(g,W)=>{g.fillStyle='#b7b3ab';g.fillRect(0,0,W,W);speckle(g,W,9000,140,210,.2);grid(g,W,2,'rgba(80,78,74,.25)',1.5);}),roughness:.25})],
  brick:[3,()=>({map:itex('brickI',512,512,(g,W)=>{g.fillStyle='#d8d0c2';g.fillRect(0,0,W,W);for(let y=0;y<W;y+=16)for(let x=((y/16)%2)*24-24;x<W;x+=48){const v=R();g.fillStyle=`rgb(${140+v*50|0},${62+v*30|0},${46+v*22|0})`;g.fillRect(x+1.5,y+1.5,45,13);}}),roughness:.9})],
  stone:[6,()=>({map:itex('stoneI',512,512,(g,W)=>{g.fillStyle='#cfc2a8';g.fillRect(0,0,W,W);speckle(g,W,12000,150,225,.18);for(let y=0;y<W;y+=64){g.fillStyle='rgba(90,75,55,.4)';g.fillRect(0,y,W,2);for(let x=((y/64)%2)*64;x<W;x+=128)g.fillRect(x,y,2,64);}}),roughness:.8})],
  coffer:[5,()=>({map:itex('coffer',512,512,(g,W)=>{g.fillStyle='#d9ceb6';g.fillRect(0,0,W,W);for(let i=0;i<4;i++)for(let j=0;j<4;j++){const x=i*128,y=j*128;g.fillStyle='#b7a98d';g.fillRect(x+14,y+14,100,100);g.fillStyle='#c9bc9f';g.fillRect(x+26,y+26,76,76);g.fillStyle='#e8dcc0';g.fillRect(x+44,y+44,40,40);g.fillStyle='#a88f52';g.beginPath();g.arc(x+64,y+64,8,0,7);g.fill();}}),roughness:.7})],
  plaster:[1,()=>({color:0xeeebe4,roughness:.85})],
  white:[1,()=>({color:0xf6f5f2,roughness:.6})],
  black:[1,()=>({color:0x18191c,roughness:.5})],
  navy:[1,()=>({color:0x1d2a4a,roughness:.6})],
  cream:[1,()=>({color:0xe8dcc0,roughness:.7})],
  ivory:[1,()=>({color:0xddd0b0,roughness:.75})],
  gold:[1,()=>({color:0xd9a93e,roughness:.28,metalness:1})],
  silver:[1,()=>({color:0xe0e2e6,roughness:.15,metalness:1})],
  steel:[1,()=>({color:0x9ea3a8,roughness:.35,metalness:.85})],
  brass:[1,()=>({color:0xb08d48,roughness:.35,metalness:.9})],
  darkwood:[1,()=>({color:0x3b2416,roughness:.5})],
  velvet:[1,()=>({map:itex('velvet',256,256,(g,W)=>{for(let x=0;x<W;x++){const v=.55+.45*sin(x/W*PI*12);g.fillStyle=`rgb(${120*v+40|0},${12*v+6|0},${20*v+10|0})`;g.fillRect(x,0,1,W);}}),roughness:.9})],
  seatRed:[1,()=>({color:0x8e1b24,roughness:.85})],
  red:[1,()=>({color:0xc4302b,roughness:.6})],
  seatBlue:[1,()=>({color:0x1b3d8f,roughness:.75})],
  seatGrey:[1,()=>({color:0x59606b,roughness:.8})],
  glass:[1,()=>({color:0xbcd6e0,roughness:.05,metalness:.3,transparent:true,opacity:.22,depthWrite:false})],
  glassLit:[1,()=>({color:0xdfeaf2,emissive:0xd9ecff,emissiveIntensity:1.1,roughness:.2})],
  lamp:[1,()=>({color:0xfff2d0,emissive:0xffe2a8,emissiveIntensity:2.2})],
  screen:[1,()=>({color:0x111,emissive:0xffffff,emissiveIntensity:1})],
  green:[1,()=>({color:0x2f6b33,roughness:.8})],
  leaf:[1,()=>({color:0x3f7d36,roughness:.8,side:THREE.DoubleSide})],
  bark:[1,()=>({color:0x6b5137,roughness:.95})],
  ice:[1,()=>({map:rinkTex(),roughness:.12,metalness:.05})],
  turf:[8,()=>({map:itex('turf',256,256,(g,W)=>{for(let k=0;k<8;k++){g.fillStyle=k%2?'#3d7d34':'#478c3b';g.fillRect(0,k*32,W,32);}speckle(g,W,4000,30,120,.12);}),roughness:.9})],
  dirt:[4,()=>({map:itex('dirt',256,256,(g,W)=>{g.fillStyle='#a8714a';g.fillRect(0,0,W,W);speckle(g,W,7000,90,180,.25);}),roughness:1})],
  sand:[6,()=>({map:itex('sand',256,256,(g,W)=>{g.fillStyle='#c9b48a';g.fillRect(0,0,W,W);speckle(g,W,7000,140,230,.25);}),roughness:1})],
  books:[2,()=>({map:itex('books',512,512,(g,W)=>{g.fillStyle='#4a3424';g.fillRect(0,0,W,W);for(let y=0;y<W;y+=128){g.fillStyle='#2f2015';g.fillRect(0,y+118,W,10);let x=4;while(x<W-6){const w=rr(8,20),h=rr(80,112);g.fillStyle=`hsl(${R()*360|0},${30+R()*40|0}%,${22+R()*35|0}%)`;g.fillRect(x,y+118-h,w,h);g.fillStyle='rgba(255,230,160,.35)';g.fillRect(x,y+118-h+10,w,3);x+=w+1;}}}),roughness:.85})],
  boxes:[1,()=>({map:itex('deposit',256,256,(g,W)=>{g.fillStyle='#6d5a33';g.fillRect(0,0,W,W);for(let y=0;y<W;y+=32)for(let x=0;x<W;x+=64){g.fillStyle='#c9a45a';g.fillRect(x+2,y+2,60,28);g.fillStyle='#3b2f17';g.beginPath();g.arc(x+32,y+16,4,0,7);g.fill();}}),roughness:.35,metalness:.85})],
  water:[1,()=>({color:0x0d4a6e,roughness:.1,metalness:.2,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false})],
};
function IMAT(k){if(!IMT[k]){if(!IMDEF[k]&&k.startsWith("c#"))IMDEF[k]=[1,()=>({color:k.slice(1),roughness:.6})];if(!IMDEF[k])throw new Error("no interior material "+k);const [tm,f]=IMDEF[k];IMTM[k]=tm;IMT[k]=new THREE.MeshStandardMaterial(Object.assign({side:THREE.DoubleSide},f()));}return IMT[k];}
function uvScale(geo,w,h,k){IMAT(k);const tm=IMTM[k];if(tm>1){const u=geo.attributes.uv;for(let i=0;i<u.count;i++)u.setXY(i,u.getX(i)*w/tm,u.getY(i)*h/tm);}return geo;}
function rinkTex(){return itex('rink',1024,512,(g,W,H)=>{ // NHL rink markings, 61 m x 26 m
  g.fillStyle='#f4f8fb';g.fillRect(0,0,W,H);speckle(g,W,3000,200,255,.25);const sx=W/61,sy=H/26,X=m=>m*sx,Y=m=>m*sy;
  g.fillStyle='#c8102e';g.fillRect(X(30.2),0,X(.6),H);g.fillStyle='#003e98';g.fillRect(X(22.2),0,X(.6),H);g.fillRect(X(38.2),0,X(.6),H);
  g.fillStyle='#c8102e';g.fillRect(X(3.9),0,X(.12),H);g.fillRect(X(57),0,X(.12),H);
  g.strokeStyle='#003e98';g.lineWidth=4;g.beginPath();g.arc(X(30.5),Y(13),Y(4.5),0,7);g.stroke();
  g.strokeStyle='#c8102e';for(const [x,z] of[[10,7],[10,19],[51,7],[51,19]]){g.beginPath();g.arc(X(x),Y(z),Y(4.5),0,7);g.stroke();g.fillStyle='#c8102e';g.beginPath();g.arc(X(x),Y(z),5,0,7);g.fill();}
  g.fillStyle='rgba(80,140,230,.55)';g.beginPath();g.arc(X(4),Y(13),Y(1.8),-PI/2,PI/2);g.fill();g.beginPath();g.arc(X(57),Y(13),Y(1.8),PI/2,PI*1.5);g.fill();
  g.font='bold 60px Inter, Arial';g.fillStyle='rgba(0,62,152,.75)';g.textAlign='center';g.fillText('TORONTO',X(30.5),Y(13)+20);});}

// --- interior builder: everything is in metres relative to the interior's origin
class IB{
  constructor(name,o={}){this.name=name;this.g=new THREE.Group();this.mb=new MeshBag();this.walk=[];this.walkFn=null;this.spots={};this.peds=[];this.loot=[];this.cases=[];this.ticks=[];
    this.floorY=o.floorY||0;this.ox=o.ox??INO[0];this.oz=o.oz??INO[1];this.ceil=o.ceil||99;this.tmp=[];this.yaw=0;}
  P(x,z){return[this.ox+x,this.oz+z];}
  add(geo,mat,x,y,z,ry,sx,sy,sz){this.mb.add(geo,typeof mat==='string'?IMAT(mat):mat,this.ox+x,this.floorY+y,this.oz+z,ry,sx,sy,sz);return this;}
  own(mesh,x,y,z){mesh.position.set(this.ox+x,this.floorY+y,this.oz+z);this.g.add(mesh);return mesh;}
  flat(x0,z0,x1,z1,y,mat,down){const w=x1-x0,d=z1-z0,geo=new THREE.PlaneGeometry(w,d);uvScale(geo,w,d,mat);geo.rotateX(down?PI/2:-PI/2);return this.add(geo,mat,(x0+x1)/2,y,(z0+z1)/2);}
  wall(ax,az,bx,bz,y0,y1,mat,solid=true){const dx=bx-ax,dz=bz-az,L=hypot(dx,dz);if(L<.01)return this;const geo=new THREE.PlaneGeometry(L,y1-y0);uvScale(geo,L,y1-y0,mat);
    geo.rotateY(-atan2(dz,dx));this.add(geo,mat,(ax+bx)/2,(y0+y1)/2,(az+bz)/2);
    if(solid&&y0<2){const nx=-dz/L*.2,nz=dx/L*.2;solPoly([[this.ox+ax+nx,this.oz+az+nz],[this.ox+bx+nx,this.oz+bz+nz],[this.ox+bx-nx,this.oz+bz-nz],[this.ox+ax-nx,this.oz+az-nz]],this.floorY+y1);}return this;}
  // rectangular room with floor, ceiling and walls; gaps: {n|s|e|w:[[a,b],...]} openings along that wall
  room(x0,z0,x1,z1,h,floor,wallM,ceil,gaps={},walk=true){this.flat(x0,z0,x1,z1,0,floor);if(ceil)this.flat(x0,z0,x1,z1,h,ceil,true);
    const seg=(side,ax,az,bx,bz)=>{const G=(gaps[side]||[]).slice().sort((p,q)=>p[0]-q[0]),horiz=az===bz;let a=horiz?ax:az;
      const pt=t=>horiz?[t,az]:[ax,t];for(const [g0,g1] of G){if(g0>a){const p=pt(a),q=pt(g0);this.wall(p[0],p[1],q[0],q[1],0,h,wallM);}
        const p=pt(g0),q=pt(g1);this.wall(p[0],p[1],q[0],q[1],min(h,(gaps.top||4)),h,wallM,false);a=g1;}
      const end=horiz?bx:bz;if(end>a){const p=pt(a),q=pt(end);this.wall(p[0],p[1],q[0],q[1],0,h,wallM);}};
    seg('s',x0,z0,x1,z0);seg('n',x0,z1,x1,z1);seg('w',x0,z0,x0,z1);seg('e',x1,z0,x1,z1);if(walk)this.walk.push([x0+.05,z0+.05,x1-.05,z1-.05]);return this;}
  box(x,y,z,w,h,d,mat,solid,ry){const geo=new THREE.BoxGeometry(w,h,d);if(IMTM[mat]>1||IMDEF[mat]?.[0]>1)uvScale(geo,max(w,d),h,mat);this.add(geo,mat,x,y+h/2,z,ry||0);
    if(solid&&y<1.8){if(!ry)solAdd(this.ox+x-w/2,this.oz+z-d/2,this.ox+x+w/2,this.oz+z+d/2,this.floorY+y+h);else{const c=cos(ry),s=sin(ry),P=(a,b)=>[this.ox+x+a*c+b*s,this.oz+z-a*s+b*c];solPoly([P(-w/2,-d/2),P(w/2,-d/2),P(w/2,d/2),P(-w/2,d/2)],this.floorY+y+h);}}return this;}
  cyl(x,y,z,r0,r1,h,mat,solid,seg){this.add(new THREE.CylinderGeometry(r1,r0,h,seg||16),mat,x,y+h/2,z);if(solid&&y<1.8)solCirc(this.ox+x,this.oz+z,max(r0,r1));return this;}
  spot(k,x,z){this.spots[k]=[this.ox+x,this.oz+z];return this;}
  ped(x,z,role,o={}){this.peds.push(Object.assign({x:this.ox+x,z:this.oz+z,role,th:o.th??rnd()*6.28},o,{area:o.area?[this.ox+o.area[0],this.oz+o.area[1],this.ox+o.area[2],this.oz+o.area[3]]:null}));return this;}
  crowd(n,area,role='visitor'){for(let k=0;k<n;k++)this.ped(rr(area[0],area[2]),rr(area[1],area[3]),role,{area});return this;}
  exit(x,z,yaw){this.spot('exit',x,z);this.spawn=[this.ox+x-sin(yaw)*-2.2,this.oz+z+cos(yaw)*2.2];this.spawn=[this.ox+x+sin(yaw)*2.4,this.oz+z+cos(yaw)*2.4];this.yaw=yaw;return this;}
  text(txt,x,y,z,ry,w,h,bg,fg,font,glow){const c=cv(1024,max(64,round(1024*h/w))),g=c.getContext('2d');if(bg){g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);}g.fillStyle=fg||'#fff';g.textAlign='center';g.textBaseline='middle';
    const lines=txt.split('\n');let fs=c.height/(lines.length*1.3);g.font=`${font||'800'} ${fs}px Inter, Arial, sans-serif`;while(lines.some(l=>g.measureText(l).width>c.width*.92)&&fs>8){fs-=3;g.font=`${font||'800'} ${fs}px Inter, Arial, sans-serif`;}
    lines.forEach((l,k)=>g.fillText(l,c.width/2,c.height/2+(k-(lines.length-1)/2)*fs*1.2));
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;const m=new THREE.MeshStandardMaterial({map:t,transparent:!bg,alphaTest:bg?0:.4,emissive:0xffffff,emissiveMap:t,emissiveIntensity:glow??.25,roughness:.6,side:THREE.DoubleSide});
    this.tmp.push(t,m);const me=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);me.rotation.y=ry||0;return this.own(me,x,y,z);}
  picture(c,x,y,z,ry,w,h,frame){const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.MeshStandardMaterial({map:t,roughness:.7});this.tmp.push(t,m);
    const me=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);me.rotation.y=ry||0;this.own(me,x,y,z);
    if(frame){const nx=sin(ry||0),nz=cos(ry||0);this.add(new THREE.BoxGeometry(w+.3,h+.3,.08),frame,x-nx*.05,y-(h+.3)/2,z-nz*.05,ry||0);}return me;}
  tick(f){this.ticks.push(f);return this;}
  finish(){this.mb.into(this.g,false);this.g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;if(o.isInstancedMesh)o.frustumCulled=false;}});return this;}
}

// --- props shared between interiors
function lining(b,x0,z0,x1,z1,h,mat){x0+=.04;z0+=.04;x1-=.04;z1-=.04;b.wall(x0,z0,x1,z0,0,h,mat,false).wall(x0,z1,x1,z1,0,h,mat,false).wall(x0,z0,x0,z1,0,h,mat,false).wall(x1,z0,x1,z1,0,h,mat,false);}
function column(b,x,z,r,h,mat,cap){b.cyl(x,0,z,r*1.25,r*1.25,.5,cap||mat,true,20).cyl(x,.5,z,r,r*.92,h-1.1,mat,true,20).add(new THREE.BoxGeometry(r*2.8,.6,r*2.8),cap||mat,x,h-.3,z);}
function bench(b,x,z,ry,len=2.4,mat='darkwood'){b.box(x,.42,z,len,.08,.5,mat,false,ry).box(x,0,z,.08,.42,.4,'black',false,ry);const c=cos(ry),s=sin(ry);for(const k of[-1,1])b.box(x+c*k*len*.4,0,z-s*k*len*.4,.08,.42,.42,'black',true,ry);}
function plant(b,x,z,s=1){b.cyl(x,0,z,.32*s,.4*s,.7*s,'black',true,12);for(let k=0;k<5;k++)b.add(new THREE.IcosahedronGeometry(.45*s,0),'leaf',x+rr(-.3,.3)*s,.9*s+rr(0,.9)*s,z+rr(-.3,.3)*s);}
function palm(b,x,z,h){for(let k=0;k<8;k++)b.add(new THREE.CylinderGeometry(.2-.01*k,.24-.01*k,h/8,8),'bark',x+sin(k*.3)*.3,h/8*k+h/16,z);
  for(let k=0;k<9;k++){const a=k/9*2*PI,fr=new THREE.PlaneGeometry(.9,3.6);fr.translate(0,1.8,0);fr.rotateX(-1.1);fr.rotateY(a);b.add(fr,'leaf',x+sin(.7)*.3,h,z);}solCirc(b.ox+x,b.oz+z,.35);}
function chandelier(b,x,y,z,r=1.4){b.add(new THREE.TorusGeometry(r,.06,6,28).rotateX(PI/2),'brass',x,y,z);b.cyl(x,y,z,.03,.03,8,'black');for(let k=0;k<12;k++){const a=k/12*2*PI;b.add(new THREE.SphereGeometry(.12,8,6),'lamp',x+cos(a)*r,y+.18,z+sin(a)*r);}b.add(new THREE.SphereGeometry(.35,12,8),'lamp',x,y-.3,z);}
function showcase(b,x,z,w=1.6,d=1,item){b.box(x,0,z,w,.95,d,'darkwood',true).add(new THREE.BoxGeometry(w-.1,.8,d-.1),'glass',x,1.35,z);if(item)item(x,1.05,z);}
const ART=[];
function artCanvas(k){if(ART[k])return ART[k];const c=cv(512,384),g=c.getContext('2d'),r=mkRng(k*977+5);const sky=g.createLinearGradient(0,0,0,384); // a Group-of-Seven style landscape
  const pal=[['#f2c27a','#e57e4f'],['#9cc8e6','#e9f1f4'],['#e8a3a6','#f6d6a4'],['#7fa3c9','#c9d7e8']][k%4];sky.addColorStop(0,pal[0]);sky.addColorStop(1,pal[1]);g.fillStyle=sky;g.fillRect(0,0,512,384);
  for(let l=0;l<3;l++){g.fillStyle=['#5a6f8a','#3e5a52','#2c3d2e'][l];g.beginPath();g.moveTo(0,384);let y=180+l*55;for(let x=0;x<=512;x+=32){y+=(r()-.5)*40;g.lineTo(x,y);}g.lineTo(512,384);g.fill();}
  g.fillStyle='#2b5c7a';g.fillRect(0,300,512,84);for(let k2=0;k2<5;k2++){const x=r()*512,h=90+r()*120;g.strokeStyle='#1a1d16';g.lineWidth=5;g.beginPath();g.moveTo(x,384);g.lineTo(x+(r()-.5)*30,384-h);g.stroke();
    g.fillStyle='#1f3b22';for(let t=0;t<6;t++){g.beginPath();g.ellipse(x+(r()-.5)*40,384-h+t*14,30-t*3,6,(r()-.5)*.6,0,7);g.fill();}}
  for(let k2=0;k2<600;k2++){g.fillStyle=`rgba(${r()*255|0},${r()*255|0},${r()*200|0},.08)`;g.fillRect(r()*512,r()*384,6,3);}return ART[k]=c;}
function painting(b,x,y,z,ry,w,h,k){return b.picture(artCanvas(k),x,y,z,ry,w,h,'gold');}
function person(b,x,z,mat,ry=0){b.cyl(x,0,z,.22,.2,.9,mat,true).cyl(x,.9,z,.26,.22,.7,mat).add(new THREE.SphereGeometry(.16,10,8),mat,x,1.8,z);}
// a hanging/mounted skeleton built along a spine curve: pts = [[along, height, thickness], ...]
function skeleton(b,x,y,z,ry,pts,o={}){const c=cos(ry),s=sin(ry),P=(u,v,w)=>[x+u*c+w*s,y+v,z-u*s+w*c];
  for(let i=0;i<pts.length-1;i++){const [u0,v0,t0]=pts[i],[u1,v1]=pts[i+1],L=hypot(u1-u0,v1-v0),a=atan2(v1-v0,u1-u0);const geo=new THREE.BoxGeometry(L*.8,t0,t0);geo.rotateZ(a);geo.rotateY(ry);const m=P((u0+u1)/2,(v0+v1)/2,0);b.add(geo,'ivory',m[0],m[1],m[2]);
    if(o.ribs&&i>=o.ribs[0]&&i<=o.ribs[1]){const r=o.rib*(1-abs(i-(o.ribs[0]+o.ribs[1])/2)/((o.ribs[1]-o.ribs[0])/2+1)*.5);const rib=new THREE.TorusGeometry(r,t0*.18,4,14,PI*1.25);rib.rotateZ(PI*.9);rib.rotateY(ry+PI/2);const q=P(u0,v0-r*.9,0);b.add(rib,'ivory',q[0],q[1],q[2]);}}
  for(const [u,v,len,sp] of o.legs||[])for(const sd of[-1,1]){const q=P(u,v,sd*sp);b.add(new THREE.CylinderGeometry(.12*len/3,.09*len/3,v,8),'ivory',q[0],v/2-.0+0,q[2]);}
  if(o.skull){const [u,v,l]=o.skull,q=P(u,v,0);const sk=new THREE.BoxGeometry(l,l*.45,l*.4);sk.rotateY(ry);b.add(sk,'ivory',q[0],q[1],q[2]);const jaw=new THREE.BoxGeometry(l*.9,l*.12,l*.32);jaw.rotateZ(-.2);jaw.rotateY(ry);b.add(jaw,'ivory',q[0],q[1]-l*.32,q[2]);}}
function stepsRing(b,cx,cz,R0,rows,dz,dy,mat,ow,od,seg=64,arc=2*PI,a0=0,sx=1){ // tiered seating around an ellipse/circle
  for(let k=0;k<rows;k++){const r=R0+k*dz,y=k*dy;for(let i=0;i<seg;i++){const a=a0+(i+.5)/seg*arc,L=r*arc/seg*1.02,geo=new THREE.BoxGeometry(L,dy+.05,dz);geo.rotateY(-a+PI/2);b.add(geo,i%2?mat:mat,cx+cos(a)*r*sx,y+dy/2,cz+sin(a)*r);}}}
function shopfront(b,x0,z,x1,y,ry){const L=x1-x0,n=max(1,round(L/6.5)),m0=floor(R()*8);const geo=new THREE.PlaneGeometry(L,4.4),u=geo.attributes.uv;for(let i=0;i<u.count;i++){u.setX(i,(m0+u.getX(i)*n)/8);u.setY(i,1-(1-u.getY(i))/SHOPV);}geo.rotateY(ry||0);b.mb.add(geo,shopMatI(),b.ox+(x0+x1)/2,b.floorY+y+2.2,b.oz+z);}
let _shopMatI=null;const shopMatI=()=>_shopMatI||(_shopMatI=new THREE.MeshStandardMaterial({map:STX.map,emissive:0xffffff,emissiveMap:STX.emis,emissiveIntensity:.6,roughness:.5}));

/* --- the interiors --- */
const THEMES={
  // a bank lobby with a teller line and, through the back, the vault — the heist target
  bank(d){const big=d.big,H=big?10:6.4,b=new IB(d.name,{ceil:H});
    b.room(-16,-11,16,9,H,'marble','plaster','plaster',{n:[[-2.2,2.2]],top:3.6});
    lining(b,-16,-11,16,9,1.3,'oak');
    b.box(-3,0,1.5,24,1.1,.9,'darkwood',true).box(-3,1.1,1.5,24.2,.08,1.05,'marbleRose').add(new THREE.BoxGeometry(24,1.4,.04),'glass',-3,1.9,1.15);
    for(let x=-14;x<=8;x+=4.4){b.box(x,1.18,1.15,.06,1.4,.06,'brass');b.text('TELLER',x+2.2,2.85,1.1,PI,1.5,.3,'#123','#e9d79a','700');}
    b.box(12.5,0,1.5,.3,1.1,.9,'darkwood',true);
    b.text(d.name.toUpperCase()+'\nEST. 1867',0,H-1.3,8.9,PI,10,1.6,'#16233f','#e9d79a','700',.4);
    for(const x of[-12,12])for(const z of[-7,-3])bench(b,x,z,0,2.6);for(const x of[-15,15])plant(b,x,-10,1.1);
    for(const x of[-10,0,10])chandelier(b,x,H-1,-4,1.1);
    if(big)for(const x of[-14,-7,7,14])column(b,x,-6,.5,H,'marble','cream');
    // vault corridor + vault room
    b.room(-2.2,9,2.2,13,3.8,'marble','plaster','plaster',{s:[[-2.2,2.2]],n:[[-2.2,2.2]]},true);
    b.room(-7,13,7,24,4.4,'concretePol','boxes','plaster',{s:[[-2.4,2.4]]},true);
    const vd=new THREE.Group(),door=new THREE.Mesh(new THREE.CylinderGeometry(2.1,2.1,.8,40),IMAT('steel'));door.rotation.x=PI/2;door.position.set(2.1,0,0);vd.add(door);
    for(let k=0;k<6;k++){const s=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,1.2,10),IMAT('silver'));s.rotation.x=PI/2;s.position.set(2.1+cos(k/6*2*PI)*1.4,sin(k/6*2*PI)*1.4,0);vd.add(s);}
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.7,.08,8,24),IMAT('brass'));wheel.position.set(2.1,0,-.5);vd.add(wheel);
    b.own(vd,-2.1,2.15,13);b.vault={g:vd,sol:solAdd(b.ox-2.4,b.oz+12.6,b.ox+2.4,b.oz+13.4,b.floorY+4),open:0};
    b.tick(dt=>{const v=b.vault;if(v.opening&&v.open<1){v.open=min(1,v.open+dt*.35);v.g.rotation.y=-v.open*1.8;}});
    for(const [x,z,gold] of[[-4.5,17,0],[4.5,17,1],[-4.5,21.5,1],[4.5,21.5,0],[0,22.5,1]].slice(0,big?5:3)){
      b.box(x,0,z,1.8,.8,1.1,'steel',true);const g=new THREE.Group();
      for(let i=0;i<(gold?10:8);i++){const m=new THREE.Mesh(gold?new THREE.BoxGeometry(.32,.14,.16):new THREE.BoxGeometry(.4,.2,.28),gold?IMAT('gold'):new THREE.MeshStandardMaterial({color:0x5f8f55,roughness:.8}));m.position.set((i%4-1.5)*.42,.88+floor(i/4)*.2,((i>>1)%2-.5)*.3);g.add(m);}
      b.own(g,x,0,z);b.loot.push({x:b.ox+x,z:b.oz+z,g,val:gold?9000:6000,got:false});}
    b.spot('drill',0,11.6).spot('teller',0,.2).spot('vaultdoor',0,12);
    b.ped(-9,2.8,'staff',{th:PI}).ped(-1,2.8,'staff',{th:PI}).ped(7,2.8,'staff',{th:PI}).ped(-13.5,-9,'guard',{th:0}).ped(5,8,'guard',{th:PI});if(big)b.ped(-5,8,'guard',{th:PI}).ped(13.5,-9,'guard',{th:0});
    b.crowd(4,[-13,-9,10,-1]);return b.exit(0,-10,0).finish();},
  // a Yorkville jewellery boutique: smash the cases
  jewel(d){const b=new IB(d.name,{ceil:4.4});b.room(-9,-6,9,7,4.4,'marbleRose','white','white');
    b.text(d.name.toUpperCase(),0,3.6,6.9,PI,8,.7,null,'#b8963c','300');for(const x of[-5,0,5])chandelier(b,x,3.6,.5,.7);
    b.box(0,0,5.2,10,1,1,'white',true);b.add(new THREE.BoxGeometry(17.8,2.6,.05),'silver',0,2.2,6.95);
    const gemM=[0xff4d6d,0x4dc3ff,0xe8f6ff,0x6dff9a,0xffd24d,0xc77dff].map(c=>new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.45,roughness:.05,metalness:.3}));
    let k=0;for(const x of[-6,-2,2,6])for(const z of[-2.2,1.6]){if(k>=8)break;b.box(x,0,z,2,.9,1,'white',true);const glass=new THREE.Mesh(new THREE.BoxGeometry(1.9,.5,.9),IMAT('glass'));b.own(glass,x,1.15,z);
      const gems=new THREE.Group();for(let i=0;i<7;i++){const m=new THREE.Mesh(new THREE.OctahedronGeometry(.07+rnd()*.05),gemM[(i+k)%6]);m.position.set((i-3)*.24,.98,(i%2-.5)*.25);gems.add(m);}b.own(gems,x,0,z);
      b.cases.push({x:b.ox+x,z:b.oz+z,glass,gems,broken:false,val:2500+floor(rnd()*2500)});k++;}
    b.ped(0,5.9,'staff',{th:PI}).ped(-7.5,-4.8,'guard',{th:.6});b.crowd(3,[-8,-5,8,4]);return b.exit(0,-5,0).finish();},
  // Royal Ontario Museum: the Crystal's slanted galleries, dinosaurs, the blue whale and the totem poles
  museum(d){const b=new IB(d.name,{ceil:16});b.room(-32,-22,32,22,16,'concretePol','white','white');
    for(const [x,z,ry,w] of[[-20,21.5,.2,14],[8,21.5,-.3,18],[31.5,0,PI/2+.25,16]]){const p=new THREE.PlaneGeometry(w,18);p.rotateX(-.28);p.rotateY(ry);b.add(p,'white',x,9,z);}
    for(let k=0;k<7;k++){const L=rr(14,30),geo=new THREE.BoxGeometry(L,.15,rr(.6,1.4));geo.rotateY(rr(-.8,.8));b.add(geo,'glassLit',rr(-22,22),15.9,rr(-16,16));}
    b.text('ROYAL ONTARIO MUSEUM',0,13,-21.9,0,22,1.6,null,'#222','300',.1);
    // T. rex and the long-necked Futalognkosaurus ("Dino") in the dinosaur gallery
    b.box(-16,0,-4,12,.6,5,'black',true);skeleton(b,-16,0,-4,0,[[-6,2.2,.35],[-4,2.6,.45],[-2,3.1,.6],[0,3.4,.7],[1.6,3.6,.6],[2.8,4.3,.45],[3.4,4.8,.4]],{ribs:[2,4],rib:.9,legs:[[0,3.2,3.4,.5]],skull:[4.2,4.8,1.4]});
    b.box(8,0,6,26,.6,6,'black',true);skeleton(b,8,0,6,0,[[-13,1.8,.3],[-9,3,.5],[-5,4.6,.8],[-1,5.4,1],[3,5.2,1],[6,6.8,.7],[8.5,9,.5],[10.5,11,.45],[12,12,.4]],{ribs:[2,5],rib:1.6,legs:[[-1,5,5,.9],[3.5,5,5,.9]],skull:[12.6,12,1.1]});
    // blue whale hung from the ceiling
    skeleton(b,6,11.5,-10,PI,[[-12,0,.4],[-8,.3,.7],[-4,.5,.9],[0,.4,1],[4,.2,1],[8,-.1,.8],[10,-.2,.6]],{ribs:[2,5],rib:1.5,skull:[12,-.2,3.6]});
    for(const x of[-2,14])b.cyl(x,11.5,-10,.02,.02,4.5,'black');
    // Haida and Nisga'a totem poles in the stairwell
    for(const [x,z] of[[-29,18],[-25.5,18]])for(let k=0;k<6;k++){const col=['#7a2c1e','#1f2d3a','#a8642c','#2f4a3c','#6b3a1f','#20262c'][k];b.add(new THREE.CylinderGeometry(.62,.66,2.4,14),new THREE.MeshStandardMaterial({color:col,roughness:.8}),x,1.2+k*2.4,z);
      b.add(new THREE.BoxGeometry(.5,.35,.3),'cream',x,1.7+k*2.4,z-.6);b.add(new THREE.BoxGeometry(1.8,.2,.4),'darkwood',x,2.2+k*2.4,z);}
    for(let k=0;k<6;k++)showcase(b,-24+k*8,-19.5,2.6,1.2,(x,y,z)=>b.add(new THREE.SphereGeometry(.22,10,8),k%2?'gold':'brass',x,y+.2,z));
    // the Ontario Sapphire in its own case under a spotlight
    b.box(24,0,-10,1.4,1.1,1.4,'black',true);const gc=new THREE.Mesh(new THREE.BoxGeometry(1.2,.9,1.2),IMAT('glass'));b.own(gc,24,1.55,-10);
    const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.26),new THREE.MeshStandardMaterial({color:0x2a5cff,emissive:0x1d48ff,emissiveIntensity:.9,roughness:.02,metalness:.2}));b.own(gem,24,1.5,-10);b.gem=gem;
    b.add(new THREE.CylinderGeometry(1.3,1.3,.02,32),'lamp',24,15.8,-10);b.text('THE ONTARIO SAPPHIRE\n563 carats',24,2.6,-11.2,0,2.4,.6,'#111','#d9c27a','600');
    b.tick((dt,t)=>{if(b.gem)b.gem.rotation.y=t*.8;});b.spot('gem',24,-11.4);
    b.ped(20,-15,'guard',{th:.6}).ped(-28,2,'guard',{th:-PI/2});b.crowd(8,[-28,-18,28,18]);return b.exit(0,-21,0).finish();},
  // Ontario Science Centre: board-formed concrete hall of hands-on exhibits
  science(d){const b=new IB(d.name,{ceil:13});b.room(-30,-20,30,20,13,'terrazzo','concrete','concrete');
    b.text('ONTARIO SCIENCE CENTRE',0,10.5,19.8,PI,20,1.6,null,'#ffcf3f','900',.5);
    // Foucault pendulum over its compass rose
    const rose=itex('rose',512,512,(g,W)=>{g.fillStyle='#1d2433';g.fillRect(0,0,W,W);g.strokeStyle='#d6b25a';g.lineWidth=3;for(let k=0;k<72;k++){const a=k/72*2*PI;g.beginPath();g.moveTo(256+cos(a)*(k%6?200:170),256+sin(a)*(k%6?200:170));g.lineTo(256+cos(a)*240,256+sin(a)*240);g.stroke();}g.beginPath();g.arc(256,256,244,0,7);g.stroke();});
    const rm=new THREE.Mesh(new THREE.CircleGeometry(4,48).rotateX(-PI/2),new THREE.MeshStandardMaterial({map:rose,roughness:.4}));b.own(rm,0,.02,0);b.cyl(0,0,0,4.3,4.3,.9,'brass',false,48);
    const pend=new THREE.Group(),wire=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,11.6,4),IMAT('steel'));wire.position.y=-5.8;const bob=new THREE.Mesh(new THREE.SphereGeometry(.38,20,14),IMAT('brass'));bob.position.y=-11.6;pend.add(wire,bob);b.own(pend,0,12.9,0);
    b.tick((dt,t)=>{pend.rotation.y=t*.05;pend.rotation.x=sin(t*2*PI/6.8)*.3;});
    // the Earth turning on its axis
    const earth=itex('earth',1024,512,(g,W,H)=>{g.fillStyle='#1f5d9e';g.fillRect(0,0,W,H);const r=mkRng(7);for(let k=0;k<26;k++){g.fillStyle=r()<.6?'#3f8a3a':'#a88a52';g.beginPath();g.ellipse(r()*W,H*.2+r()*H*.6,40+r()*120,20+r()*70,r()*3,0,7);g.fill();}g.fillStyle='#f2f6f8';g.fillRect(0,0,W,30);g.fillRect(0,H-36,W,36);});
    const globe=new THREE.Mesh(new THREE.SphereGeometry(3,40,24),new THREE.MeshStandardMaterial({map:earth,roughness:.5}));globe.rotation.z=.41;b.own(globe,-16,4.4,-8);b.cyl(-16,0,-8,.6,1.4,1.4,'steel',true);b.tick(dt=>globe.rotateY(dt*.25));
    // a rocket on the launch pad, a Van de Graaff dome and a tornado vortex
    b.cyl(18,0,10,1.1,1.1,9,'white',true,24).add(new THREE.ConeGeometry(1.1,2.6,24),'white',18,10.3,10);for(let k=0;k<4;k++){const f=new THREE.BoxGeometry(.1,2.4,1.4);f.translate(0,0,1.4);f.rotateY(k*PI/2);b.add(f,'navy',18,1.2,10);}
    b.text('USA\nCANADA',18,6,8.85,PI,1.2,1.2,null,'#c8102e','900');
    b.cyl(15,0,-10,.5,.35,3.2,'black',true).add(new THREE.SphereGeometry(1.2,24,16),'silver',15,4.2,-10);
    const bolts=new THREE.Mesh(new THREE.IcosahedronGeometry(1.7,1),new THREE.MeshBasicMaterial({color:0xa9c8ff,wireframe:true,transparent:true,opacity:.6}));b.own(bolts,15,4.2,-10);b.tick(()=>{bolts.visible=rnd()<.35;bolts.rotation.set(rnd()*6,rnd()*6,0);});
    const N=900,pts=new Float32Array(N*3);for(let k=0;k<N;k++){const y=rnd()*7,r=.3+y*.18;pts[k*3]=r;pts[k*3+1]=y;pts[k*3+2]=rnd()*6.28;}
    const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));const tor=new THREE.Points(pg,new THREE.PointsMaterial({color:0xdde6ee,size:.12,transparent:true,opacity:.7,depthWrite:false}));b.own(tor,-16,0,10);
    b.tick((dt,t)=>{const P=pg.attributes.position;for(let k=0;k<N;k++){const r=pts[k*3],y=pts[k*3+1],a=pts[k*3+2]+t*(3-y*.25);P.setXYZ(k,cos(a)*r,y,sin(a)*r);}P.needsUpdate=true;});b.cyl(-16,0,10,1.8,1.8,.3,'steel',true,32);
    for(let k=0;k<14;k++){const c=['#ff4f63','#3a8fd8','#ffcf3f','#3aa05a','#7a4fb0'][k%5];b.box(-24+(k%7)*1.6,0,15+floor(k/7)*1.8,1.2,rr(.6,2),1.2,new THREE.MeshStandardMaterial({color:c,roughness:.6}),true);}
    for(const [x,z,t] of[[0,-6,'FOUCAULT PENDULUM'],[-16,-12.5,'PLANET EARTH'],[18,6,'SPACE'],[15,-13,'VAN DE GRAAFF'],[-16,6,'TORNADO'],[-19,13,'KIDSPARK']])b.text(t,x,2.6,z,0,4,.5,'#1d2433','#fff','800');
    b.crowd(9,[-26,-16,26,16]);b.ped(2,-16,'staff',{th:0});return b.exit(0,-19,0).finish();},
  // Art Gallery of Ontario: Gehry's Galleria Italia, then a room of Canadian landscapes and the spiral stair
  gallery(d){const b=new IB(d.name,{ceil:9});b.room(-40,-6,40,6,9,'wood','white',null,{n:[[-6,6]],top:6});
    b.wall(-40,-6,40,-6,1,8.6,'glassLit',false);
    for(let x=-39;x<=39;x+=2.4){const rib=new THREE.TorusGeometry(6.2,.12,6,20,PI);rib.scale(1,.5,1);rib.rotateY(PI/2);b.add(rib,new THREE.MeshStandardMaterial({color:0xa8743f,roughness:.6}),x,6,0);}
    b.flat(-40,-6,40,6,9.1,'white',true);
    for(const x of[-28,-12,8,26]){b.box(x,0,2,1.6,1,1.6,'white',true);b.add(new THREE.SphereGeometry(.8,16,12).scale(1.2,1.5,.8),'brass',x,2.2,2);}
    for(const x of[-20,0,18])bench(b,x,-2,0,3);
    b.room(-16,6,16,26,6.5,'wood','white','white',{s:[[-6,6]]});
    let k=0;for(const [z,x0,x1,ry] of[[25.9,-14,14,PI]])for(let x=x0;x<=x1;x+=5.6)painting(b,x,3.2,z,ry,3.6,2.6,k++);
    for(let z=9;z<=23;z+=4.6){painting(b,-15.9,3.2,z,PI/2,3,2.2,k++);painting(b,15.9,3.2,z,-PI/2,3,2.2,k++);}
    for(let s=0;s<40;s++){const a=s*.42,y=s*.16;b.add(new THREE.BoxGeometry(1.4,.08,.5),new THREE.MeshStandardMaterial({color:0xa8743f,roughness:.6}),11+cos(a)*1,y+.1,21+sin(a)*1,-a);}b.cyl(11,0,21,.25,.25,6.5,'white',true);
    b.text('GALLERIA ITALIA',-30,7.5,5.9,PI,8,.8,null,'#444','300',.1);b.text('CANADIAN LANDSCAPES',0,5.5,25.8,PI,8,.6,null,'#333','600',.1);
    b.crowd(8,[-36,-4,36,4]);b.crowd(5,[-13,9,13,23]);b.ped(-36,3,'guard',{th:PI/2});return b.exit(-38,-3.5,PI/2).finish();},
  // Union Station's Great Hall: Tennessee marble, a coffered barrel vault, huge arched end windows
  station(d){const b=new IB(d.name,{ceil:27});b.room(-38,-12.5,38,12.5,15,'marbleRose','stone',null);
    const vault=new THREE.CylinderGeometry(12.5,12.5,76,40,1,true,0,PI);vault.rotateZ(PI/2);vault.rotateX(0);uvScale(vault,76,40,'coffer');
    const vu=vault.attributes.uv;for(let i=0;i<vu.count;i++)vu.setXY(i,vu.getX(i)*39/5,vu.getY(i)*76/5);b.add(vault,'coffer',0,15,0);
    for(const x of[-38,38]){const c=cv(512,512),g=c.getContext('2d');g.fillStyle='#d9ceb6';g.fillRect(0,0,512,512);
      for(const wx of[64,192,320,448]){g.fillStyle='#dbe8f2';g.beginPath();g.moveTo(wx-44,500);g.lineTo(wx-44,190);g.arc(wx,190,44,PI,0);g.lineTo(wx+44,500);g.fill();g.strokeStyle='#4a4236';g.lineWidth=4;for(let y=230;y<500;y+=38){g.beginPath();g.moveTo(wx-44,y);g.lineTo(wx+44,y);g.stroke();}g.beginPath();g.moveTo(wx,150);g.lineTo(wx,500);g.stroke();}
      const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.55,side:THREE.DoubleSide});b.tmp.push(t,m);
      const half=new THREE.Mesh(new THREE.CircleGeometry(12.5,40,0,PI),m),low=new THREE.Mesh(new THREE.PlaneGeometry(25,15),m);half.rotation.y=low.rotation.y=PI/2;b.own(half,x*.999,15,0);b.own(low,x*.999,7.5,0);}
    for(let x=-33;x<=33;x+=6)for(const z of[-11.6,11.6])column(b,x,z,.7,15,'stone','cream');
    for(let x=-30;x<=30;x+=10)b.box(x,0,11,6,1.2,1.4,'darkwood',true).add(new THREE.BoxGeometry(6,1.3,.05),'glass',x,1.85,10.4).text('TICKETS',x,3.3,10.3,PI,3,.5,'#1b2a1b','#e9d79a','700');
    const dep=cv(1024,512),dg=dep.getContext('2d');dg.fillStyle='#08090c';dg.fillRect(0,0,1024,512);dg.fillStyle='#ffb000';dg.font='bold 44px monospace';dg.fillText('DEPARTURES',30,60);dg.font='32px monospace';
    [['08:12','LAKESHORE WEST','3'],['08:20','VIA 52 OTTAWA','16'],['08:24','UP EXPRESS AIRPORT','UP'],['08:31','LAKESHORE EAST','6'],['08:40','BARRIE','9'],['08:47','VIA 61 MONTREAL','14'],['08:55','KITCHENER','4'],['09:02','STOUFFVILLE','11']].forEach((r,i)=>{dg.fillText(r[0],30,120+i*48);dg.fillText(r[1],190,120+i*48);dg.fillText(r[2].padStart(3),890,120+i*48);});
    b.picture(dep,0,7.5,-5,0,8,4);b.box(0,9.5,-5,8.4,.3,.3,'black');
    for(const x of[-26,-16,16,26])for(const z of[-4,2])bench(b,x,z,PI/2,3.2,'oak');
    const ck=new THREE.Mesh(new THREE.CircleGeometry(1,32),new THREE.MeshStandardMaterial({map:clockT,emissive:0xffffff,emissiveMap:clockT,emissiveIntensity:.3,transparent:true,alphaTest:.5}));b.own(ck,0,11,-12.3);
    b.text('UNION STATION',0,13.5,12.3,PI,16,1.3,null,'#6f6656','600',.15);b.text('GO TRANSIT  ·  VIA RAIL  ·  UP EXPRESS  ·  TTC',0,4.8,12.3,PI,14,.7,'#20482a','#fff','700',.4);
    b.crowd(14,[-34,-10,34,9]);return b.exit(0,-11.8,0).finish();},
  // Toronto City Hall: the council chamber inside the saucer
  council(d){const b=new IB(d.name,{ceil:12});const R=20;b.camR=R-.6;b.walkFn=(x,z)=>hypot(x-b.ox,z-b.oz)<R-.6;
    const fl=new THREE.CircleGeometry(R,64);fl.rotateX(-PI/2);b.add(fl,'carpetBlue',0,0,0);
    const wl=new THREE.CylinderGeometry(R,R,6,64,1,true);b.add(wl,'plaster',0,3,0);
    const dome=new THREE.SphereGeometry(R*1.05,64,16,0,2*PI,0,PI/2*.62);b.add(dome,'white',0,6-R*1.05*cos(PI/2*.62),0);
    for(let k=0;k<5;k++)b.add(new THREE.TorusGeometry(4+k*3.2,.08,6,64).rotateX(PI/2),'lamp',0,11.2-k*.9,0);
    for(let r=0;r<3;r++)for(let i=0;i<28;i++){const a=PI*.15+i/27*PI*1.7,rad=9+r*2.2,geo=new THREE.BoxGeometry(1.4,.8,.7);geo.rotateY(-a+PI/2);b.add(geo,'white',cos(a)*rad,.4+r*.35,sin(a)*rad);
      const ch=new THREE.BoxGeometry(.6,1,.6);ch.rotateY(-a+PI/2);b.add(ch,'seatGrey',cos(a)*(rad+.8),.5+r*.35,sin(a)*(rad+.8));}
    b.box(0,0,-7,6,1.3,1.6,'darkwood',true).box(0,1.3,-7,1.2,1.4,.7,'seatRed');b.text('CITY OF TORONTO',0,4.5,-19.6,0,10,1.2,null,'#1d2a4a','700',.1);
    for(let i=0;i<20;i++){const a=PI*.1+i/19*PI*.8,g=new THREE.BoxGeometry(2.2,.5,1.2);g.rotateY(-a+PI/2);b.add(g,'seatGrey',cos(a)*17.5,1.3,sin(a)*17.5);}
    b.crowd(5,[-12,-12,12,12]);for(let k=0;k<6;k++){const a=PI*.2+k*.25;b.ped(cos(a)*9.8,sin(a)*9.8,'stand',{th:atan2(-cos(a),-sin(a))});}
    return b.exit(0,R-1.4,PI).finish();},
  // Queen's Park: the Legislative Chamber — green carpet, government and opposition benches, the Speaker's throne
  legislature(d){const b=new IB(d.name,{ceil:15});b.room(-18,-11,18,11,15,'carpetGreen','plaster','coffer');
    lining(b,-18,-11,18,11,4.5,'oak');
    for(const z of[-11,11])for(let x=-14;x<=14;x+=5.6){const sgn=z<0?1:-1;b.add(new THREE.PlaneGeometry(2.4,4.6).rotateY(z<0?0:PI),'glassLit',x,10.2,z*.995);}
    for(const sd of[-1,1])for(let r=0;r<4;r++){b.box(-2,r*.32,sd*(3.2+r*1.4),22,.75,.7,'darkwood',true);b.box(-2,.75+r*.32,sd*(3.9+r*1.4),22,.9,.5,'green');}
    b.box(14,0,0,3,1,4,'darkwood',true).box(15.5,1,0,1,2.6,1.6,'oak').add(new THREE.BoxGeometry(1.4,.6,2.4),'oak',15.6,4.4,0);b.box(15.1,1,0,.6,1.2,1.1,'green');
    b.box(7,0,0,4,.9,1.6,'darkwood',true).cyl(7,.95,0,.06,.06,1.4,'gold').add(new THREE.CylinderGeometry(.06,.06,1.5,8).rotateZ(PI/2),'gold',7,1,0);
    for(const sd of[-1,1]){b.box(0,5.2,sd*9.5,32,.3,3,'darkwood');b.box(0,5.5,sd*8.05,32,1,.1,'oak');}
    for(const x of[-8,6])chandelier(b,x,11,0,1.6);b.text('ONTARIO',14,7,10.9,PI,6,.8,null,'#e9d79a','700',.2);
    b.ped(15.4,0,'stand',{th:-PI/2});b.ped(8.5,0,'stand',{th:-PI/2});for(let k=0;k<8;k++)b.ped(-12+k*3,(k%2?1:-1)*3.9,'stand',{th:k%2?PI:0});b.crowd(3,[-16,-2,4,2]);
    return b.exit(-16.8,0,PI/2).finish();},
  // Casa Loma's Great Hall: oak, a 60-foot beamed ceiling, the organ gallery, banners and armour
  castle(d){const b=new IB(d.name,{ceil:18});b.room(-12,-9,12,9,18,'wood','stone','darkwood');
    lining(b,-12,-9,12,9,6,'oak');
    for(let x=-10.5;x<=10.5;x+=3){b.box(x,16.5,0,.5,.8,18,'darkwood');const k=new THREE.BoxGeometry(.35,4,.35);b.add(k,'darkwood',x,15,0);}
    const lead=itex('lead',256,512,(g,W,H)=>{g.fillStyle='#cfe0e6';g.fillRect(0,0,W,H);g.strokeStyle='#3a3a36';g.lineWidth=3;for(let k=-H;k<W+H;k+=26){g.beginPath();g.moveTo(k,0);g.lineTo(k+H,H);g.moveTo(k,H);g.lineTo(k+H,0);g.stroke();}g.fillStyle='rgba(180,40,40,.6)';g.fillRect(W/2-30,30,60,60);});
    const lm=new THREE.MeshStandardMaterial({map:lead,emissive:0xffffff,emissiveMap:lead,emissiveIntensity:.6,side:THREE.DoubleSide});for(const x of[-6,0,6]){const w=new THREE.Mesh(new THREE.PlaneGeometry(3,9),lm);w.rotation.y=PI;b.own(w,x,10,8.95);}
    b.box(-11.4,0,0,1.2,4.2,5,'stone',true).box(-11,0,0,.4,2.4,2.8,'black');const fire=new THREE.Mesh(new THREE.ConeGeometry(.7,1.4,8),new THREE.MeshBasicMaterial({color:0xff8a2a}));b.own(fire,-10.9,.7,0);b.tick((dt,t)=>{fire.scale.set(1+sin(t*13)*.1,1+sin(t*9)*.18,1);});
    b.box(9,7,0,6,.4,16,'darkwood');b.box(6.1,7.4,0,.15,1,16,'oak');for(let k=0;k<17;k++)b.cyl(11.2,7.4,-7+k*.9,.18,.18,3+abs(8-k)*.35,'silver');
    for(const [x,c] of[[-7,'#8a1c22'],[-2.5,'#1d3d6b'],[2.5,'#2e5d32'],[7,'#b08d2e']]){const bn=new THREE.PlaneGeometry(1.6,4);b.add(bn,new THREE.MeshStandardMaterial({color:c,side:THREE.DoubleSide,roughness:.9}),x,13,-3);}
    for(const [x,z] of[[-10.8,-6],[-10.8,6],[10.8,-6.5],[10.8,6.5]])person(b,x,z,'steel');
    b.flat(-1.2,-9,1.2,7,.01,'carpetRed');for(const z of[-3,3])chandelier(b,0,12,z,1.8);
    b.text('CASA LOMA',0,7.2,-8.9,0,6,.8,null,'#e9d79a','700',.2);b.crowd(6,[-9,-7,7,7]);return b.exit(0,-8.2,0).finish();},
  // Eaton Centre galleria: three levels of shops under a glass vault, with Michael Snow's geese in flight
  mall(d){const L=d.small?45:70,b=new IB(d.name,{ceil:26});b.room(-L,-11,L,11,19,'terrazzo','plaster',null,{s:[[-4,4]],top:5});
    for(const z of[-11,11]){const ry=z<0?0:PI;for(let x=-L;x<L-1;x+=13){shopfront(b,x+.3,z*.995,x+12.7,0,ry);shopfront(b,x+.3,z*.995,x+12.7,6.5,ry);shopfront(b,x+.3,z*.995,x+12.7,13,ry);}}
    for(const y of[6.3,12.8])for(const sd of[-1,1]){b.box(0,y,sd*9,2*L,.4,4,'white');b.add(new THREE.BoxGeometry(2*L,1.1,.04),'glass',0,y+.95,sd*7);b.box(0,y+1.45,sd*7,2*L,.06,.1,'steel');}
    const vg=new THREE.CylinderGeometry(11,11,2*L,32,1,true,0,PI);vg.rotateZ(PI/2);b.add(vg,'glass',0,19,0);for(let x=-L;x<=L;x+=4){const r=new THREE.TorusGeometry(11,.1,4,24,PI);r.rotateY(PI/2);b.add(r,'steel',x,19,0);}
    const goose=mergeGeometries([new THREE.SphereGeometry(.35,8,6).scale(1,.6,1.8),new THREE.CylinderGeometry(.06,.08,.8,6).rotateX(-1.1).translate(0,.28,.75),new THREE.SphereGeometry(.12,6,5).translate(0,.55,1.1),
      new THREE.BoxGeometry(2.6,.04,.5).rotateZ(.18).translate(0,.08,0)].map(g=>g.index?g.toNonIndexed():g));
    const gm=new THREE.InstancedMesh(goose,new THREE.MeshStandardMaterial({color:0x5e5a52,roughness:.9}),60);for(let k=0;k<60;k++){const t=k/60,row=k%3;_m.compose(_v.set(-L+10+t*min(70,L*1.2)+row*1.5,17-t*7+sin(k)*1.2,(row-1)*(3+t*2)+rr(-.8,.8)),_q.setFromEuler(_e.set(-.25,PI/2,rr(-.2,.2))),_s.set(1,1,1));gm.setMatrixAt(k,_m);}
    b.own(gm,b.ox*0,0,0).position.set(b.ox,b.floorY,b.oz);
    for(const x of[-L*.6,L*.3]){const e=new THREE.BoxGeometry(12,.2,1.4);e.rotateZ(.5);b.add(e,'steel',x,3.2,0);b.box(x,0,0,10,1,1.6,'steel',true);}
    for(let x=-L+15;x<L-10;x+=22){plant(b,x,-4,1.3);bench(b,x+5,4,0,3);}
    b.text(d.name.toUpperCase(),0,5.5,-10.95,0,16,1.2,null,'#fff','800',.6);b.crowd(16,[-L+3,-9,L-3,9]);return b.exit(0,-10.3,0).finish();},
  // St. Lawrence Market: a long brick hall of stalls under steel arches
  market(d){const b=new IB(d.name,{ceil:15});b.room(-45,-15,45,15,7,'concretePol','brick',null);
    const roof=new THREE.CylinderGeometry(15,15,90,30,1,true,0,PI);roof.rotateZ(PI/2);roof.scale(1,.55,1);b.add(roof,'plaster',0,7,0);b.add(new THREE.BoxGeometry(90,.1,2.4),'glassLit',0,15.2,0);
    for(let x=-42;x<=42;x+=6){const a=new THREE.TorusGeometry(15,.16,6,24,PI);a.rotateY(PI/2);a.scale(1,.55,1);b.add(a,'steel',x,7,0);}
    const stripe=itex('stripes',128,32,(g)=>{for(let k=0;k<8;k++){g.fillStyle=k%2?'#fff':'#2f7d4c';g.fillRect(k*16,0,16,32);}});const awn=new THREE.MeshStandardMaterial({map:stripe,side:THREE.DoubleSide,roughness:.8});
    const NAMES=['CAROUSEL BAKERY · PEAMEAL BACON','FISH & SEAFOOD','CHEESE','FRESH PRODUCE','BUTCHER','DELI','BAKERY','FLOWERS','SPICES','COFFEE'];let n=0;
    for(const z of[-8,0,8])for(let x=-36;x<=36;x+=12){b.box(x,0,z,9,.95,2.6,'darkwood',true);b.box(x,.95,z,9,.05,2.6,'white');
      for(let i=0;i<14;i++)b.add(new THREE.BoxGeometry(.5,.25,.4),new THREE.MeshStandardMaterial({color:pick([0xd8342c,0x6fb33f,0xf19a2a,0xf2d03b,0xe9e2c9,0x8b4a2b]),roughness:.7}),x-4+(i%7)*1.3,1.1,z-.6+floor(i/7)*1.1);
      const aw=new THREE.Mesh(new THREE.PlaneGeometry(9.4,1.6),awn);aw.rotation.x=-1.1;b.own(aw,x,2.7,z-1.6);b.text(NAMES[n++%NAMES.length],x,3.6,z,0,6,.55,'#1d2a22','#f4e7c6','800');b.ped(x+rr(-2,2),z+1.5,'stand',{th:PI});}
    b.text('ST. LAWRENCE MARKET',0,5.5,14.9,PI,16,1.4,null,'#f4e7c6','800',.3);b.crowd(14,[-42,-13,42,13]);return b.exit(0,-14.3,0).finish();},
  // Scotiabank Arena: an NHL rink inside a two-level bowl with the scoreboard over centre ice
  arena(d){const b=new IB(d.name,{ceil:34}),W=30.5,D=13;b.walkFn=(x,z)=>{const lx=abs(x-b.ox),lz=abs(z-b.oz);if(lz>D-.5&&!(lx<2.4&&z-b.oz<-D+.5&&z-b.oz>-D-8))return false;if(lx>W-.5)return false;const cx=lx-(W-8.5),cz=lz-(D-8.5);return !(cx>0&&cz>0&&hypot(cx,cz)>8);};
    const ice=new THREE.PlaneGeometry(2*W,2*D);ice.rotateX(-PI/2);b.add(ice,'ice',0,0,0);
    const ring=(off,y0,h,mat)=>{const P=[];for(let k=0;k<64;k++){const a=k/64*2*PI,cx=sign(cos(a))*(W-8.5),cz=sign(sin(a))*(D-8.5);P.push([cx+cos(a)*(8.5+off),cz+sin(a)*(8.5+off)]);}
      for(let i=0;i<64;i++){const p=P[i],q=P[(i+1)%64],L=hypot(q[0]-p[0],q[1]-p[1]),geo=new THREE.BoxGeometry(L+.05,h,.25);geo.rotateY(-atan2(q[1]-p[1],q[0]-p[0]));b.add(geo,mat,(p[0]+q[0])/2,y0+h/2,(p[1]+q[1])/2);}};
    ring(0,0,1.05,'white');ring(0,0,.2,'gold');ring(0,1.05,1.8,'glass');
    for(let k=0;k<22;k++)ring(2+k*.85,k*.5,.55,k%2?'seatBlue':'white');for(let k=0;k<18;k++)ring(24+k*.9,13+k*.55,.6,'seatBlue');
    const sb=new THREE.Group(),sc=cv(512,256),sg=sc.getContext('2d');sg.fillStyle='#000';sg.fillRect(0,0,512,256);sg.fillStyle='#1b3d8f';sg.fillRect(0,0,512,60);sg.fillStyle='#fff';sg.font='900 46px Inter';sg.textAlign='center';sg.fillText('TORONTO  3 — 2  MONTRÉAL',256,44);sg.font='900 120px Inter';sg.fillStyle='#ffcf3f';sg.fillText('GOAL!',256,190);
    const st=new THREE.CanvasTexture(sc);st.colorSpace=THREE.SRGBColorSpace;const smat=new THREE.MeshBasicMaterial({map:st});b.tmp.push(st,smat);for(let k=0;k<4;k++){const p=new THREE.Mesh(new THREE.PlaneGeometry(k%2?5:9,4.5),smat);const a=k*PI/2;p.rotation.y=a;p.position.set(sin(a)*(k%2?4.6:2.6),0,cos(a)*(k%2?4.6:2.6));sb.add(p);}b.own(sb,0,22,0);
    b.box(0,24.5,0,9.4,.6,5.4,'black');b.flat(-60,-50,60,50,34,'black',true);for(let k=0;k<8;k++)b.add(new THREE.BoxGeometry(14,.2,.6),'lamp',-35+k*10,33.6,0);
    for(const sd of[-1,1]){b.box(sd*6,0,D+1.4,6,1,1.5,'seatGrey');}b.text(d.name.toUpperCase(),0,16,-40,0,30,3,null,'#fff','900',.5);
    for(let k=0;k<4;k++)b.ped(rr(-20,20),rr(-8,8),'visitor',{area:[-25,-10,25,10]});return b.exit(0,-D-3,0).finish();},
  // Rogers Centre: the ball field under the closed dome
  stadium(d){const b=new IB(d.name,{ceil:85}),R=92;b.camR=R+20;b.walkFn=(x,z)=>hypot(x-b.ox,z-b.oz)<R-1||(abs(x-b.ox)<3&&z-b.oz>R-2&&z-b.oz<R+8);
    const f=new THREE.CircleGeometry(R,72);f.rotateX(-PI/2);uvScale(f,2*R,2*R,'turf');b.add(f,'turf',0,0,0);
    const hp=[0,60];const inf=new THREE.CircleGeometry(38,48,PI*.25,PI*.5);inf.rotateX(-PI/2);b.add(inf,'dirt',hp[0],.02,hp[1]);
    const dia=new THREE.PlaneGeometry(27.4,27.4);dia.rotateX(-PI/2);dia.rotateY(PI/4);b.add(dia,'turf',0,.03,hp[1]-19.4);
    for(const [x,z] of[[0,0],[19.4,-19.4],[0,-38.8],[-19.4,-19.4]])b.box(hp[0]+x,0,hp[1]+z,.4,.1,.4,'white');b.cyl(0,0,hp[1]-18.4,2.7,2.7,.25,'dirt',false,24);
    for(const sd of[-1,1]){const l=new THREE.BoxGeometry(.12,.02,100);l.rotateY(sd*PI/4);b.add(l,'white',sd*35,.04,hp[1]-35);}
    const wall=new THREE.CylinderGeometry(R,R,3,72,1,true,PI*.5+.6,PI*2-1.2);b.add(wall,'navy',0,1.5,0);
    for(let k=0;k<26;k++){const geo=new THREE.CylinderGeometry(R+3+k*1.4,R+3+k*1.4,.7,72,1,true);b.add(geo,k%3?'seatBlue':'seatGrey',0,3+k*.8,0);const top=new THREE.RingGeometry(R+2.3+k*1.4,R+3+k*1.4+.01,72);top.rotateX(-PI/2);b.add(top,'seatBlue',0,3.35+k*.8,0);}
    for(let k=0;k<14;k++){const geo=new THREE.CylinderGeometry(R+42+k*1.2,R+42+k*1.2,.8,72,1,true);b.add(geo,'seatBlue',0,28+k*.9,0);}
    const H=54,r=R+60,Rs=(r*r+H*H)/(2*H),dm=new THREE.SphereGeometry(Rs,72,18,0,2*PI,0,Math.asin(r/Rs));b.add(dm,'plaster',0,86-Rs,0);
    const jt=cv(1024,384),jg=jt.getContext('2d');jg.fillStyle='#04060a';jg.fillRect(0,0,1024,384);jg.fillStyle='#1d5fd1';jg.fillRect(0,0,1024,90);jg.fillStyle='#fff';jg.font='900 64px Inter';jg.textAlign='center';jg.fillText('TORONTO  ·  BOTTOM 9TH',512,68);jg.font='900 150px Inter';jg.fillStyle='#ffcf3f';jg.fillText('HOME RUN!',512,270);
    b.picture(jt,0,30,-R-20,0,46,17);b.text(d.name.toUpperCase(),0,50,-R-25,0,60,6,null,'#fff','900',.6);
    b.crowd(5,[-30,10,30,60]);return b.exit(0,R+4,PI).finish();},
  // concert halls and theatres
  theatre(d){const v=d.variant||'',b=new IB(d.name,{ceil:15}),wallM=v==='rth'?'seatGrey':'velvet';b.room(-16,-14,16,19,15,'carpetRed',wallM,v==='rth'?'white':'oak');
    b.walk=[[-15.6,-13.6,15.6,9.5]];b.box(0,0,14.5,32,1.1,9,'darkwood',true);
    const cur=new THREE.PlaneGeometry(28,10);b.add(cur,'velvet',0,6.1,15.5);b.add(new THREE.BoxGeometry(32,1.6,.6),'gold',0,11.9,10.4);for(const sd of[-1,1])b.box(sd*15,0,10.4,2,12,.6,'gold');
    for(let r=0;r<15;r++){const z=-12+r*1.3,y=r*.12;for(let x=-14;x<=14;x+=.62){if(abs(x)<1)continue;b.add(new THREE.BoxGeometry(.52,.45,.5),v==='rth'?'seatBlue':'seatRed',x,y+.42,z);b.add(new THREE.BoxGeometry(.52,.7,.1),v==='rth'?'seatBlue':'seatRed',x,y+.9,z-.24);}}
    b.box(0,5.8,-9.5,32,.5,9,'darkwood');b.box(0,6.3,-5.1,32,1.1,.2,'gold');for(let r=0;r<6;r++)for(let x=-14;x<=14;x+=.62)b.add(new THREE.BoxGeometry(.52,.6,.5),v==='rth'?'seatBlue':'seatRed',x,6.6+r*.45,-6.2-r*1.3);
    if(v==='rth'||v==='massey')for(let k=0;k<31;k++)b.cyl(-9+k*.6,9,18.4,.17,.17,2.5+abs(15-k)*.18,'silver');chandelier(b,0,12.5,-2,2.2);
    b.text(d.name.toUpperCase(),0,13.4,10.1,PI,14,1,null,'#e9d79a','700',.3);b.crowd(5,[-12,-12,12,6]);
    for(let k=0;k<5;k++)b.ped(-6+k*3,13,'stand',{th:PI});return b.exit(0,-13.3,0).finish();},
  // Toronto Reference Library: terraced balconies around a soaring atrium, hanging greenery
  library(d){const b=new IB(d.name,{ceil:22}),v=d.variant;b.room(-22,-20,22,20,v==='osgoode'?14:22,v==='osgoode'?'checker':'wood','plaster',v==='osgoode'?'coffer':'glassLit');
    if(v==='osgoode'){for(let x=-18;x<=18;x+=6)for(const z of[-19.6,19.6])b.box(x,0,z,5,10,.8,'books',true);for(const x of[-21.6,21.6])for(let z=-16;z<=16;z+=6)b.box(x,0,z,.8,10,5,'books',true);
      for(let x=-15;x<=15;x+=7.5)column(b,x,0,.55,14,'white','gold');chandelier(b,0,11,0,2);}
    else for(let l=1;l<=4;l++){const y=l*4.4,ins=8+l*1.6,S=22;for(const [x0,z0,x1,z1] of[[-S,-S,S,-ins],[-S,ins,S,S],[-S,-ins,-ins,ins],[ins,-ins,S,ins]]){b.box((x0+x1)/2,y,(z0+z1)/2,x1-x0,.35,z1-z0,'white');}
      for(const [ax,az,bx,bz] of[[-ins,-ins,ins,-ins],[ins,-ins,ins,ins],[ins,ins,-ins,ins],[-ins,ins,-ins,-ins]]){const L=hypot(bx-ax,bz-az),g=new THREE.BoxGeometry(L,1.1,.08);g.rotateY(-atan2(bz-az,bx-ax));b.add(g,'white',(ax+bx)/2,y+.9,(az+bz)/2);
        for(let k=0;k<L;k+=1.6){const vine=new THREE.CylinderGeometry(.12,.04,rr(1.5,4),5);b.add(vine,'leaf',ax+(bx-ax)*k/L,y-1.2,az+(bz-az)*k/L);}}
      for(let x=-20;x<=20;x+=5)b.box(x,y+.35,-20.5+.6,4,2.6,.5,'books');}
    for(let x=-18;x<=18;x+=6)b.box(x,0,-19.4,5,2.6,.6,'books',true);
    for(let k=0;k<6;k++){const x=-10+(k%3)*10,z=(k<3?-4:4);b.box(x,0,z,4,.78,1.6,'darkwood',true);for(const s of[-1,1])b.box(x+s*1,0,z+s*1.3,.5,.9,.5,'green');b.add(new THREE.CylinderGeometry(.08,.12,.3,8),'brass',x,1,z);b.add(new THREE.SphereGeometry(.14,8,6),'lamp',x,1.2,z);}
    b.text(d.name.toUpperCase(),0,3.4,19.6,PI,16,1,null,'#333','600',.1);b.crowd(8,[-18,-16,18,16]);return b.exit(0,-19.2,0).finish();},
  // Ripley's Aquarium: Dangerous Lagoon — a moving walkway through an acrylic tunnel, sharks overhead
  aquarium(d){const b=new IB(d.name,{ceil:4}),L=40;b.walk.push([-2.3,-L,2.3,L]);b.fog=[0x0b4766,.03];
    b.flat(-2.6,-L,2.6,L,0,'concretePol');b.add(new THREE.BoxGeometry(1.4,.04,2*L),'black',0,.03,0);
    const tun=new THREE.CylinderGeometry(3.4,3.4,2*L,32,1,true,-PI/2,PI);tun.rotateX(PI/2);b.add(tun,'glass',0,0,0);
    const tank=new THREE.Mesh(new THREE.BoxGeometry(60,24,2*L+20),new THREE.MeshBasicMaterial({color:0x0d5577,side:THREE.BackSide,fog:true}));b.own(tank,0,4,0);
    const sand=new THREE.PlaneGeometry(60,2*L+20);sand.rotateX(-PI/2);b.add(sand,'sand',0,-1.5,0);
    for(let k=0;k<40;k++){const x=(rnd()<.5?-1:1)*rr(5,25),z=rr(-L,L);b.add(new THREE.DodecahedronGeometry(rr(.6,2.4)),'stone',x,-1.3,z);if(k%2)b.add(new THREE.ConeGeometry(.3,rr(1,3),6),new THREE.MeshStandardMaterial({color:pick([0xff6f61,0xffc04d,0xc77dff,0x5ee0c0])}),x+1,-.5,z);}
    const shark=mergeGeometries([new THREE.SphereGeometry(.5,12,8).scale(.8,.7,3.4),new THREE.ConeGeometry(.35,1,4).translate(0,.75,0),new THREE.BoxGeometry(.06,1.1,.7).translate(0,0,-1.9),new THREE.BoxGeometry(1.8,.06,.5).translate(0,-.15,.2)].map(g=>g.index?g.toNonIndexed():g));
    const sm=new THREE.InstancedMesh(shark,new THREE.MeshStandardMaterial({color:0x7a8a94,roughness:.6}),9);b.own(sm,0,0,0).position.set(b.ox,b.floorY,b.oz);
    const ray=new THREE.InstancedMesh(new THREE.CircleGeometry(1.1,4).scale(1.4,1,1).rotateX(-PI/2),new THREE.MeshStandardMaterial({color:0x4f5b55,side:THREE.DoubleSide}),5);b.own(ray,0,0,0).position.set(b.ox,b.floorY,b.oz);
    const fish=new THREE.InstancedMesh(new THREE.SphereGeometry(.12,6,4).scale(.5,1,1.6),new THREE.MeshStandardMaterial({color:0xffd24d,emissive:0x442200}),160);b.own(fish,0,0,0).position.set(b.ox,b.floorY,b.oz);
    b.tick((dt,t)=>{for(let k=0;k<9;k++){const a=t*.12*(k%2?1:-1)+k*.7,rx=7+k%3*3,rz=L*.8,y=3+k%4*1.4;_m.compose(_v.set(cos(a)*rx,y,sin(a)*rz),_q.setFromEuler(_e.set(0,(k%2?-1:1)*(a)+(k%2?0:PI),sin(t+k)*.1)),ONE);sm.setMatrixAt(k,_m);}sm.instanceMatrix.needsUpdate=true;
      for(let k=0;k<5;k++){const a=t*.08+k*1.3;_m.compose(_v.set(sin(a)*10,-.8+sin(t*.6+k)*.3,cos(a*1.3)*30),_q.setFromEuler(_e.set(sin(t*1.5+k)*.15,a,0)),ONE);ray.setMatrixAt(k,_m);}ray.instanceMatrix.needsUpdate=true;
      for(let k=0;k<160;k++){const g=k%4,a=t*(.4+g*.05)+k*.05;_m.compose(_v.set(-6-g*3+sin(a*2)*1.5+(k%7)*.3,1+g*1.2+(k%5)*.25,sin(a)*L*.7+(k%9)*.3),_q.setFromEuler(_e.set(0,cos(a)>0?0:PI,0)),ONE);fish.setMatrixAt(k,_m);}fish.instanceMatrix.needsUpdate=true;
      if(abs(player.x-b.ox)<.8&&!G.car)player.z+=dt*.8;});
    b.text('DANGEROUS LAGOON',0,2.9,-L+.5,0,4,.5,'#0b2233','#7fe0ff','800',.6);b.crowd(5,[-1.8,-L+3,1.8,L-3]);return b.exit(0,-L+1.2,0).finish();},
  // Hockey Hall of Fame: the Great Hall in the 1885 Bank of Montreal — stained-glass dome and the Stanley Cup
  hhof(d){const b=new IB(d.name,{ceil:15});const R=12;b.camR=R-.6;b.walkFn=(x,z)=>hypot(x-b.ox,z-b.oz)<R-.8;
    const fl=new THREE.CircleGeometry(R,8);fl.rotateX(-PI/2);b.add(fl,'checker',0,0,0);b.add(new THREE.CylinderGeometry(R,R,10,8,1,true),'oak',0,5,0);
    const sg=itex('stained',512,512,(g)=>{for(let k=0;k<64;k++){const a0=k/64*2*PI,a1=(k+1)/64*2*PI;for(let r=0;r<6;r++){g.fillStyle=`hsl(${(k*37+r*60)%360},60%,${45+r*5}%)`;g.beginPath();g.arc(256,256,256-r*40,a0,a1);g.arc(256,256,216-r*40,a1,a0,true);g.fill();}}g.strokeStyle='#222';g.lineWidth=3;for(let r=16;r<256;r+=40){g.beginPath();g.arc(256,256,r,0,7);g.stroke();}});
    const dm=new THREE.Mesh(new THREE.CircleGeometry(R,8),new THREE.MeshStandardMaterial({map:sg,emissive:0xffffff,emissiveMap:sg,emissiveIntensity:.8,side:THREE.DoubleSide}));dm.rotation.x=PI/2;b.own(dm,0,14.9,0);b.add(new THREE.CylinderGeometry(R,R,5,8,1,true),'cream',0,12.5,0);
    b.cyl(0,0,0,1.1,1.1,1,'darkwood',true,24);const cup=new THREE.LatheGeometry([[0,0],[.55,0],[.55,.12],[.48,.12],[.5,.3],[.42,.3],[.45,.5],[.36,.5],[.38,.7],[.3,.7],[.32,.9],[.12,.95],[.1,1.15],[.28,1.25],[.3,1.32],[0,1.3]].map(q=>new THREE.Vector2(q[0],q[1])),32);b.add(cup,'silver',0,1,0);
    b.text('THE STANLEY CUP',0,.55,-1.15,0,2,.35,'#222','#e9d79a','700');for(let k=0;k<8;k++){const a=(k+.5)/8*2*PI;if(k===2)continue;b.box(cos(a)*(R-1.3),0,sin(a)*(R-1.3),3.2,2.4,.9,'glass',true,-a+PI/2);
      for(let i=0;i<3;i++){const ax=cos(a)*(R-1.3)+sin(a)*(i-1)*.9,az=sin(a)*(R-1.3)-cos(a)*(i-1)*.9;b.add(new THREE.LatheGeometry([[0,0],[.15,0],[.08,.3],[.2,.6],[0,.6]].map(q=>new THREE.Vector2(q[0],q[1])),12),i%2?'gold':'silver',ax,1,az);}}
    b.text('HOCKEY HALL OF FAME',0,8,-R+.6,0,9,.9,null,'#e9d79a','700',.3);b.crowd(5,[-7,-7,7,7]);b.ped(-6,8,'guard',{th:PI});return b.exit(0,R-1.6,PI).finish();},
  // Allan Gardens Palm House: palms under the Victorian glass dome
  palmhouse(d){const b=new IB(d.name,{ceil:16});const R=15;b.camR=R-.6;b.walkFn=(x,z)=>hypot(x-b.ox,z-b.oz)<R-.6;
    const f=new THREE.CircleGeometry(R,40);f.rotateX(-PI/2);b.add(f,'dirt',0,0,0);const path=new THREE.RingGeometry(5,7.4,40);path.rotateX(-PI/2);b.add(path,'terrazzo',0,.02,0);
    b.add(new THREE.CylinderGeometry(R,R,5,40,1,true),'glass',0,2.5,0);b.add(new THREE.SphereGeometry(R,40,14,0,2*PI,0,PI/2),'glass',0,5,0);for(let k=0;k<20;k++){const a=k/20*PI,rib=new THREE.TorusGeometry(R,.07,4,30,PI);rib.rotateY(a);b.add(rib,'white',0,5,0);}
    const pond=new THREE.CircleGeometry(3.6,32);pond.rotateX(-PI/2);b.add(pond,'water',0,.05,0);b.cyl(0,0,0,3.8,3.8,.4,'stone',true,32);
    for(let k=0;k<9;k++){const a=k/9*2*PI;palm(b,cos(a)*10.5,sin(a)*10.5,rr(7,12));}for(let k=0;k<14;k++){const a=rnd()*6.28,r=rr(8.5,13.5),x=cos(a)*r,z=sin(a)*r;if(abs(x)<2.6&&z>0)continue;plant(b,x,z,rr(1,1.8));} // keep the entrance path clear
    for(const a of[.5,2.6,4.4])bench(b,cos(a)*6.2,sin(a)*6.2,-a+PI/2,2);b.crowd(5,[-6,-6,6,6]);return b.exit(0,R-1.2,PI).finish();},
  // civic centres and office towers: a lobby with reception and elevators
  lobby(d){const b=new IB(d.name,{ceil:10});b.room(-15,-12,15,12,10,'terrazzo','plaster','plaster');b.wall(-15,11.96,15,11.96,0,10,'marble',false);
    b.box(0,0,4,8,1.1,1.6,'darkwood',true).box(0,1.1,4,8.2,.06,1.7,'marble');for(let x=-11;x<=11;x+=4.4){b.add(new THREE.PlaneGeometry(2.2,3),'steel',x,1.5,11.9);b.text('▲▼',x,3.4,11.85,PI,.8,.4,'#111','#ffcf3f','900');}
    b.add(new THREE.TorusKnotGeometry(1.2,.35,80,10),'brass',-8,3,-4);b.cyl(-8,0,-4,1,1,1.2,'marble',true,24);for(const x of[-13,13])plant(b,x,-10,1.2);
    b.text(d.name.toUpperCase(),0,7.4,11.9,PI,16,1.1,null,'#24456e','800',.1);b.ped(0,5.2,'staff',{th:PI}).ped(12,-9,'guard',{th:0});b.crowd(6,[-12,-9,12,2]);return b.exit(0,-11.2,0).finish();},
  // Old City Hall / Hart House / University College: a Victorian hall with a grand stair and a great stained-glass window
  hall(d){const b=new IB(d.name,{ceil:17});b.room(-14,-11,14,11,17,'checker','stone','coffer');
    for(let k=0;k<10;k++)b.box(0,k*.4,5+k*.6,8,.4,.6,'marble',true);b.box(0,0,10,10,4,2,'marble',true);for(const sd of[-1,1])for(let k=0;k<8;k++)b.box(sd*(6+k*.6),4+k*.4,9.5-k*.0,.6,.4,3,'marble');
    for(const sd of[-1,1]){b.box(sd*4.1,.4,8,.12,1,6.2,'brass');}
    const sg=itex('window',512,768,(g,W,H)=>{g.fillStyle='#29324a';g.fillRect(0,0,W,H);for(let k=0;k<180;k++){g.fillStyle=`hsl(${pick([210,40,0,120,280])},55%,${35+R()*35}%)`;const x=R()*W,y=R()*H;g.beginPath();g.moveTo(x,y);g.lineTo(x+rr(20,60),y+rr(-20,20));g.lineTo(x+rr(0,40),y+rr(20,60));g.fill();}
      g.fillStyle='#f2e6c4';g.beginPath();g.arc(W/2,H*.38,70,0,7);g.fill();g.fillStyle='#8a1c22';g.fillRect(W/2-40,H*.48,80,200);g.strokeStyle='#111';g.lineWidth=6;for(let x=0;x<=W;x+=W/4){g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.stroke();}g.beginPath();g.arc(W/2,W/2,W/2-3,PI,0);g.stroke();});
    const wm=new THREE.Mesh(new THREE.PlaneGeometry(7,10.5),new THREE.MeshStandardMaterial({map:sg,emissive:0xffffff,emissiveMap:sg,emissiveIntensity:.75}));wm.rotation.y=PI;b.own(wm,0,10.6,10.95);
    for(let x=-11;x<=11;x+=5.5)for(const z of[-10.2,10.2])if(abs(x)>3)column(b,x,z,.5,17,'stone','cream');chandelier(b,0,12,-3,1.8);
    b.text(d.name.toUpperCase(),0,6,-10.95,0,12,1,null,'#e9d79a','700',.2);b.crowd(6,[-11,-9,11,3]);return b.exit(0,-10.2,0).finish();},
  // a real shop: chains get their real store design (colours, counters, menu boards, fixtures); independents get a fit-out for what they sell
  shop(d){const nm=d.name||'',sub=(d.sub||'').toUpperCase(),k=d.kind;
    const BR=[[/^McDonald/i,'mcd'],[/^Tim Hortons/i,'tims'],[/^Starbucks/i,'sbux'],[/^Second Cup|^Balzac|^Pilot Coffee|^Dark Horse|^Jimmy's Coffee|^Aroma|^Fahrenheit/i,'cafe'],
      [/^Shoppers Drug Mart|^Rexall|^Pharmasave|^Guardian|^I\.?D\.?A/i,'pharm'],[/^LCBO|^Wine Rack|^The Beer Store/i,'lcbo'],[/^Subway/i,'subway'],[/^Pizza Pizza|^Domino|^Pizza Hut|^Pizzaiolo|^Little Caesars|^Papa John/i,'pizza'],
      [/^(TD|TD Canada Trust|RBC|Royal Bank|Scotiabank|CIBC|BMO|Bank of Montreal|HSBC|National Bank|Tangerine|Desjardins)/i,'bank'],[/^7-Eleven|^Circle K|^Mac's|^Hasty Market|^Daisy Mart/i,'conv'],
      [/^Dollarama|^Dollar Tree|^Dollar Plus/i,'dollar'],[/^Metro$|^No Frills|^Loblaws|^Sobeys|^FreshCo|^Food Basics|^Farm Boy|^Whole Foods|^Longo|^T&T|^Rabba|^Fiesta Farms|^Galleria/i,'grocery'],
      [/^Burger King|^Wendy|^A&W|^Harvey|^Five Guys|^Popeyes|^KFC|^Mary Brown|^Chick-fil-A|^Shake Shack|^Taco Bell|^Chipotle|^Freshii|^Osmow/i,'qsr']];
    BR.unshift([/^Bullet Barn/i,'guns'],[/^Waffle Hut/i,'waffle']);
    let T=(BR.find(q=>q[0].test(nm))||[])[1];
    if(!T){if(/CONVENIENCE|KIOSK|NEWSAGENT|VARIETY/.test(sub))T='conv';else if(/SUPERMARKET|GROCERY|GREENGROCER|BUTCHER|DELI/.test(sub))T='grocery';else if(/HAIRDRESSER|BARBER/.test(sub))T='barber';
      else if(/BEAUTY|NAIL|COSMETICS/.test(sub))T='beauty';else if(/BANK|BUREAU/.test(sub))T='bank';else if(/SUSHI|JAPANESE|RAMEN/.test(sub))T='sushi';else if(/CHINESE|DIM SUM|VIETNAMESE|THAI|KOREAN|ASIAN/.test(sub))T='asian';
      else if(/PIZZA|ITALIAN/.test(sub))T='pizza';else if(/BURGER|CHICKEN|FAST FOOD|SANDWICH|SHAWARMA|KEBAB|MEXICAN|TACO/.test(sub))T='qsr';else if(/PUB|BAR|NIGHTCLUB|BREWERY/.test(sub))T='pub';
      else if(/SHOES/.test(sub))T='shoes';else if(/CANNABIS|E-CIGARETTE|TOBACCO/.test(sub))T='cannabis';else if(/ALCOHOL|WINE|BEVERAGES/.test(sub))T='lcbo';else if(/LAUNDRY|DRY CLEANING/.test(sub))T='laundry';
      else if(/OPTICIAN|DENTIST|CLINIC|DOCTORS|VETERINARY|HEARING/.test(sub))T='clinic';else if(/MOBILE PHONE|ELECTRONICS|COMPUTER/.test(sub))T='phone';else if(/BOOKS/.test(sub))T='books';
      else T=['cafe','bakery','florist','fashion','books','pharm','restaurant','general'][k];}
    const BIG={grocery:[9,22],pharm:[8,18],lcbo:[8,17],dollar:[7,16],mcd:[7,15],bank:[7,13]}[T]||[4.4,13],W=BIG[0],D=BIG[1],H=T==='grocery'||T==='lcbo'?5:3.9,b=new IB(nm,{ceil:H});
    const PAL={mcd:['#27251f','#ffbc0d','#4a463f','wood'],tims:['#c8102e','#ffffff','#5a3a24','wood'],sbux:['#00704a','#ffffff','#1e3932','wood'],pharm:['#ffffff','#d6001c','#e31837','terrazzo'],lcbo:['#1c4f3a','#ffffff','#7a5236','wood'],
      subway:['#008c15','#ffc600','#f4f0e6','terrazzo'],pizza:['#f26b21','#ffffff','#3a2a20','terrazzo'],conv:['#1f4e8c','#ffffff','#e8e6e0','terrazzo'],dollar:['#00a14b','#ffde00','#f2f2ee','terrazzo'],grocery:['#d6001c','#ffffff','#f4f4f0','terrazzo'],
      qsr:['#c8102e','#ffffff','#2b2b2b','terrazzo'],bank:['#00a650','#ffffff','#f2f0ea','marble'],barber:['#1d1d1d','#ffffff','#ece8e0','checker'],beauty:['#f4d6de','#3a2a30','#fbf7f5','marble'],sushi:['#1a1a1a','#f2e6d0','#c9b38f','wood'],asian:['#9a1b1f','#f5d98c','#f0e2c8','terrazzo'],
      pub:['#2a1d15','#e9d79a','#3b2a20','wood'],shoes:['#111','#fff','#f4f4f2','wood'],cannabis:['#1d1d1d','#cfe8d4','#f2f2ee','concretePol'],laundry:['#2b6cb0','#fff','#eef2f6','terrazzo'],clinic:['#ffffff','#1b6b3a','#f6f7f5','terrazzo'],
      phone:['#111','#fff','#f6f6f6','terrazzo'],books:['#5b1f24','#f1e4c8','#d9c7a8','wood'],cafe:['#1f3b2e','#f3e7c9','#e8dccb','wood'],bakery:['#f2e6cf','#7a4a1e','#f3e6cf','wood'],florist:['#f7f1ea','#3e6b3a','#eef2ea','wood'],
      fashion:['#121214','#e8d9b0','#f4f1ec','marble'],guns:['#8e1d1a','#f1ece2','#4a3b2e','concrete'],waffle:['#d9731f','#ffffff','#efe4c6','checker'],restaurant:['#2b1d17','#f3e7c9','#e9e0d2','wood'],general:['#1f4e8c','#fff','#eef0f2','terrazzo']}[T];
    const br=BRAND.find(q=>q[0].test(nm));if(br){PAL[0]=br[1];PAL[1]=br[2];}else if(T==='bank')PAL[0]='#24456e';
    IMDEF['sw_'+T]=[1,()=>({color:PAL[2],roughness:.8})];b.room(-W,-D/2,W,D/2,H,PAL[3],'sw_'+T,'plaster');
    const M=c=>{const key='c'+c;if(!IMDEF[key])IMDEF[key]=[1,()=>({color:c,roughness:.6})];return key;};
    b.text(nm,0,H-.8,D/2-.05,PI,min(2*W-1,8),.85,PAL[0],PAL[1],'800',.6);
    for(let z=-D/2+2;z<D/2-1;z+=2.6)for(const x of W>5?[-W/2,W/2]:[0])b.add(new THREE.BoxGeometry(1.2,.05,.6),'lamp',x,H-.03,z);
    const C=['#e8433a','#3a7bd5','#f2c14e','#58b368','#9b5de5','#f15bb5','#00bbf9','#ff8c42','#ffffff','#333333'].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.6}));
    const gondola=(x,z,len,rows=4,hgt=1.7,cols=C,ry=PI/2)=>{b.box(x,0,z,len,hgt,.6,'white',true,ry);const c=cos(ry),s=sin(ry);for(const f of[-1,1])for(let r=0;r<rows;r++){const y=.25+r*(hgt-.3)/rows;b.box(x+f*.32*s,y,z+f*.32*c,len,.03,.18,'steel',false,ry);
      for(let i=0;i<len/.26-1;i++){const o=-len/2+.2+i*.26;b.add(new THREE.BoxGeometry(.2,.24,.13),cols[(i*3+r*7+(f>0?4:0))%cols.length],x+o*c+f*.33*s,y+.15,z-o*s+f*.33*c,ry);}}};
    const wallShelf=(x,z0,z1,rows=5,hgt=2.2,cols=C)=>{const len=z1-z0,zc=(z0+z1)/2,sx=x>0?-1:1;b.box(x,0,zc,.45,hgt,len,'white',true);for(let r=0;r<rows;r++){const y=.25+r*(hgt-.3)/rows;for(let i=0;i<len/.26-1;i++)b.add(new THREE.BoxGeometry(.13,.24,.2),cols[(i*5+r*3)%cols.length],x+sx*.28,y+.15,z0+.2+i*.26);}};
    const fridge=(x,z0,z1)=>{const len=z1-z0;b.box(x,0,(z0+z1)/2,.7,2.1,len,'glassLit',true);for(let i=0;i<len/.9;i++)b.box(x+(x>0?-.36:.36),.1,z0+.45+i*.9,.02,1.9,.04,'steel');
      for(let r=0;r<4;r++)for(let i=0;i<len/.18-1;i++)b.add(new THREE.CylinderGeometry(.05,.05,.24,6),C[(i+r*3)%C.length],x+(x>0?-.2:.2),.35+r*.45,z0+.15+i*.18);};
    const counter=(x,z,len,top='marble',body='darkwood',ry=0)=>{b.box(x,0,z,len,1.05,.75,body,true,ry).box(x,1.05,z,len+.1,.05,.85,top,false,ry);b.box(x+len/2-.5,1.1,z,.4,.28,.35,'black',false,ry);b.add(new THREE.BoxGeometry(.38,.26,.03),'screen',x+len/2-.5,1.42,z+.08);};
    const menu=(x,z,w,lines,bg,fg,photos)=>{const c=cv(1024,round(1024*.5)),g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);const n=lines.length;
      for(let i=0;i<n;i++){const cx=(i+.5)*c.width/n;if(photos){g.fillStyle=photos[i%photos.length];g.beginPath();g.ellipse(cx,170,c.width/n*.32,90,0,0,7);g.fill();g.fillStyle='rgba(255,255,255,.25)';g.beginPath();g.ellipse(cx-20,140,c.width/n*.12,26,0,0,7);g.fill();}
        g.fillStyle=fg;g.font=`800 ${min(46,c.width/n/7)}px Inter, Arial`;g.textAlign='center';g.fillText(lines[i][0],cx,photos?330:150);g.font=`600 ${min(40,c.width/n/8)}px Inter, Arial`;g.fillText(lines[i][1],cx,photos?390:230);}
      const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.7});b.tmp.push(t,m);const me=new THREE.Mesh(new THREE.PlaneGeometry(w,w*.5),m);me.rotation.y=PI;b.own(me,x,2.55,z);};
    const table=(x,z,top='darkwood',seat='darkwood')=>{b.cyl(x,0,z,.05,.05,.74,'black',true,8).add(new THREE.CylinderGeometry(.42,.42,.04,18),top,x,.76,z);for(const s of[-1,1])b.box(x+s*.62,0,z,.42,.46,.42,seat,false).box(x+s*.82,.46,z,.06,.5,.42,seat);};
    const booth=(x,z,col)=>{b.box(x,0,z,1.6,.45,.55,col,true).box(x,.45,z-.25,1.6,.6,.12,col).box(x,0,z+1.5,1.6,.45,.55,col,true).box(x,.45,z+1.75,1.6,.6,.12,col).box(x,0,z+.75,1.3,.74,.7,'darkwood',true);};
    const kiosk=(x,z)=>{b.box(x,0,z,.6,.1,.4,'black',true).cyl(x,.1,z,.06,.06,1,'black').add(new THREE.BoxGeometry(.6,1,.06),'black',x,1.6,z).add(new THREE.BoxGeometry(.54,.92,.02),'screen',x,1.6,z-.04);};
    const donuts=(x,z,w)=>{b.box(x,0,z,w,1.5,.7,'darkwood',true);for(let r=0;r<4;r++)for(let i=0;i<w/.22-1;i++)b.add(new THREE.TorusGeometry(.07,.035,6,10).rotateX(PI/2),FOODM[i%5],x-w/2+.18+i*.22,1.55+r*.0,z-.2+r*.13);};
    const reg=(x,z)=>b.spot('register',x,z);
    const FOODM=[0xc98a4a,0xd8342c,0x6fb33f,0xf2d03b,0xf5c6d6].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.7}));
    switch(T){
      case 'mcd':{counter(0,D/2-2.6,2*W-3,'marble','c#27251f');menu(0,D/2-.1,2*W-2,[['Big Mac','$7.29'],['McNuggets','$6.49'],['Quarter Pounder','$7.79'],['McCafé','$2.19']],'#1b1b1b','#ffbc0d',['#c98a4a','#e0a050','#8b5a2b','#6b3a1f']);
        for(const x of[-W+.6,-W+1.6])kiosk(x,-1);const ar=b.text('M',W-.06,2.5,-2,-PI/2,1.6,1.6,null,'#ffbc0d','900',1);
        for(let z=-D/2+2;z<D/2-5;z+=2.6){booth(-W+1.4,z,M('#db0007'));booth(W-1.4,z,M('#3b3b3b'));}reg(0,D/2-3.6);break;}
      case 'tims':{counter(0,D/2-2.6,2*W-2.5,'marble',M('#5a3a24'));donuts(-W+1.6,D/2-1.2,2.4);menu(.8,D/2-.1,2*W-3,[['Double-Double','$2.29'],['Iced Capp','$3.79'],['Timbits (10)','$2.99'],['Farmer\'s Wrap','$4.49']],'#c8102e','#ffffff',['#7a4a26','#c9a074','#e0a050','#f2d2a0']);
        for(let z=-D/2+2;z<D/2-4.5;z+=2.2){table(-W/2,z,'darkwood',M('#c8102e'));table(W/2,z);}reg(0,D/2-3.6);break;}
      case 'sbux':{counter(-.5,D/2-2.6,2*W-2,'darkwood',M('#1e3932'));b.box(W-1.4,1.1,D/2-2.6,.9,.55,.6,'silver');b.box(-W+1.6,0,D/2-2.6,1.6,1.25,.75,'glassLit',true);
        menu(0,D/2-.1,2*W-2.5,[['Pike Place','$2.75'],['Caramel Macchiato','$5.75'],['Pink Drink','$5.95'],['Cake Pop','$3.25']],'#1e3932','#ffffff');
        b.text('★',0,3.1,-D/2+.06,0,1.2,1.2,null,'#00704a','900',.5);for(let z=-D/2+2;z<D/2-4.5;z+=2.2){table(-W/2,z);table(W/2,z);}b.box(0,0,-D/2+3,2.6,.95,1,'darkwood',true);reg(-.5,D/2-3.6);break;}
      case 'cafe':{counter(-1,D/2-2,2*W-3.5);b.box(-W+1,1.1,D/2-2,.7,.55,.5,'silver');menu(-.5,D/2-.1,2*W-3,[['ESPRESSO','3.25'],['LATTE','5.25'],['COLD BREW','4.75']],'#1d1d1d','#f3e7c9');for(const [x,z] of[[W/2,-3.5],[-W/2,-3.5],[W/2,0],[-W/2,.2]])table(x,z);reg(-1,D/2-3);break;}
      case 'pharm':{for(let x=-W+2.5;x<=W-2.5;x+=2.4)gondola(x,-1,D-7);wallShelf(-W+.3,-D/2+1,D/2-3);wallShelf(W-.3,-D/2+1,D/2-3,5,2.2,C.slice(5));b.box(0,0,D/2-1.5,2*W-2,1.1,.8,'white',true);
        b.text('PHARMACY',0,2.2,D/2-1.08,PI,3,.45,PAL[0],PAL[1],'800',.6);counter(-W+2.5,-D/2+2.2,2.4,'white','white');counter(W-2.5,-D/2+2.2,2.4,'white','white');b.text('BEAUTY BOUTIQUE',-W+.06,2.6,-D/2+4,PI/2,3.6,.5,'#111','#fff','600',.4);reg(-W+2.5,-D/2+3.2);break;}
      case 'lcbo':{for(const x of[-W+2.5,-W+5.1,W-5.1,W-2.5])gondola(x,0,D-8,5,1.8,[0x2e6b3a,0x6b2e2e,0xc9a46a,0x2a3d6b,0x8a1c2c,0xe8d9b0].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.15,metalness:.1})));fridge(W-.4,-D/2+1,D/2-1);
        b.text('VINTAGES',-W+.08,3,0,PI/2,4,.6,'#1c4f3a','#fff','700',.4);counter(-W+2,-D/2+2.2,2.6,'darkwood');counter(1,-D/2+2.2,2.6,'darkwood');reg(-W+2,-D/2+3.2);break;}
      case 'subway':{b.box(-W+.8,0,0,.9,1,D-5,M('#f4f0e6'),true);b.add(new THREE.BoxGeometry(.9,.3,D-5),'glass',-W+.8,1.25,0);for(let i=0;i<(D-6)/.4;i++)b.add(new THREE.BoxGeometry(.3,.05,.32),FOODM[(i+2)%5],-W+.8,1.02,-D/2+3+i*.4);
        menu(0,D/2-.1,2*W-1.5,[['Footlong','$11.99'],['6-inch','$7.99'],['Cookies','3 / $2.50']],'#008c15','#ffc600',['#c9a074','#e0b070']);for(let z=-D/2+2;z<2;z+=2.2)table(W/2,z);reg(-W+1.8,D/2-3);break;}
      case 'pizza':{counter(0,D/2-3,2*W-2,'steel','white');b.box(-W+1.5,0,D/2-1.2,2.2,1.6,1.4,'brick',true);b.add(new THREE.SphereGeometry(.5,12,8,0,PI*2,0,PI/2),'black',-W+1.5,1.6,D/2-1.2);
        b.box(W-1.4,1.1,D/2-3,1.4,.06,.9,'glass');for(let i=0;i<4;i++)b.add(new THREE.CylinderGeometry(.22,.22,.03,16),new THREE.MeshStandardMaterial({color:0xe0a050}),W-1.9+(i%2)*.6,1.12,D/2-3.2+floor(i/2)*.4);
        menu(0,D/2-.1,2*W-2,[['Slice','$3.99'],['Large Pepperoni','$15.99'],['Panzerotto','$9.49']],PAL[0],'#ffffff',['#e0a050','#c84a2a']);for(let z=-D/2+2;z<0;z+=2.2)table(0,z);reg(0,D/2-4);break;}
      case 'qsr':{counter(0,D/2-2.6,2*W-2,'steel',M(PAL[0]));menu(0,D/2-.1,2*W-1.5,[['Combo #1','$12.49'],['Combo #2','$13.29'],['Fries','$3.99']],'#151515',PAL[1]==='#ffffff'?'#ffffff':PAL[1],['#c98a4a','#e0a050','#f2d03b']);
        kiosk(-W+.6,-.5);for(let z=-D/2+2;z<D/2-4.5;z+=2.4){booth(-W+1.4,z,M(PAL[0]));table(W/2,z);}reg(0,D/2-3.6);break;}
      case 'bank':{counter(0,D/2-2.8,2*W-2,'marble','darkwood');b.add(new THREE.BoxGeometry(2*W-2,1.1,.04),'glass',0,1.7,D/2-3.15);for(let x=-W+2;x<W-1;x+=2.4)b.text('▲',x,2.5,D/2-3.2,PI,.3,.3,null,PAL[0],'900',.5);
        for(let i=0;i<3;i++){const z=-D/2+2+i*1.4;b.box(-W+.45,0,z,.8,1.8,.9,M(PAL[0]),true);b.add(new THREE.BoxGeometry(.04,.36,.5),'screen',-W+.86,1.3,z);}
        b.text(nm.toUpperCase(),0,3.3,D/2-.08,PI,6,.7,PAL[0],PAL[1],'800',.6);bench(b,W-1.5,-1,PI/2,2);plant(b,W-.8,-D/2+1);reg(0,D/2-3.6);break;}
      case 'conv':{for(const x of W>4.6?[-1.4,1.4]:[0])gondola(x,-1,D-7,4,1.5);fridge(W-.4,-D/2+1,D/2-2.5);wallShelf(-W+.3,-D/2+1,D/2-4,5,2,C);counter(-W+2,D/2-1.8,2.6,'white','white');
        b.box(-W+.5,1.1,D/2-1.8,.6,.8,.5,'glassLit');b.text('LOTTO 6/49',-W+2,2.6,D/2-.08,PI,1.8,.4,'#c8102e','#fff','800',.5);reg(-W+2,D/2-2.8);break;}
      case 'dollar':{for(let x=-W+2;x<=W-2;x+=2.2)gondola(x,-1,D-6,4,1.6,C);wallShelf(-W+.3,-D/2+1,D/2-3);wallShelf(W-.3,-D/2+1,D/2-3);counter(-W+2,D/2-1.6,2.4,'white',M('#00a14b'));counter(0,D/2-1.6,2.4,'white',M('#00a14b'));reg(-W+2,D/2-2.6);break;}
      case 'grocery':{for(let x=-W+2.6;x<=W-2.6;x+=2.6)gondola(x,1,D-9,4,1.7,C);fridge(-W+.4,-D/2+1,D/2-1);
        for(let i=0;i<3;i++){const x=-W+3+i*2.4;b.box(x,0,-D/2+3.5,1.8,.8,1.6,'darkwood',true);for(let q=0;q<20;q++)b.add(new THREE.SphereGeometry(.08,6,5),FOODM[i%5],x+rr(-.8,.8),.9,-D/2+3.5+rr(-.7,.7));}
        for(let i=0;i<3;i++)counter(-W+2+i*2.6,-D/2+1.4,1.6,'steel','white');b.text('PRODUCE',-W+3,3.6,-D/2+.08,0,4,.6,'#2e6b3a','#fff','700',.5);reg(-W+2,-D/2+2.4);break;}
      case 'barber':case 'beauty':{const n=floor((D-4)/2);for(let i=0;i<n;i++){const z=-D/2+2.5+i*2;b.add(new THREE.PlaneGeometry(1,1.3),'silver',W-.04,1.7,z,-PI/2);b.box(W-.4,0,z,.5,.9,1.1,'white',true);
          if(T==='barber'){b.cyl(W-1.4,0,z,.3,.25,.5,'steel',true,10).box(W-1.4,.5,z,.6,.15,.6,'black').box(W-1.1,.6,z,.12,.75,.6,'black');}else{b.box(W-1.6,0,z,.9,.75,.6,'white',true);b.box(W-2.3,0,z,.45,.48,.45,M('#f4d6de'));}}
        for(let z=-D/2+1.5;z<D/2-3;z+=1.2)b.box(-W+.4,0,z,.55,.45,.9,'black',true);if(T==='barber'){const pole=new THREE.CylinderGeometry(.09,.09,.8,12);b.add(pole,'red',-W+.15,1.8,D/2-1.4);}counter(-W+1.6,D/2-1.4,1.8,'white','white');reg(-W+1.6,D/2-2.4);break;}
      case 'sushi':case 'asian':{if(T==='sushi'){b.box(0,0,D/2-2.5,2*W-2,1.1,.6,'darkwood',true).box(0,1.1,D/2-2.5,2*W-1.8,.05,.8,'wood');for(let i=0;i<8;i++)b.add(new THREE.BoxGeometry(.12,.06,.06),FOODM[i%3],-W+1.5+i*.6,1.18,D/2-2.5);
          for(let x=-W+1.2;x<W-1;x+=.9)b.cyl(x,0,D/2-3.5,.18,.18,.75,'black',true,10);for(let z=-D/2+3;z<D/2-5;z+=2.2){table(-W/2-.4,z,'wood','wood');table(W/2+.4,z,'wood','wood');}}
        else{for(let z=-D/2+2;z<D/2-3;z+=2.6)for(const x of W>4.6?[-W/2,W/2]:[0]){b.cyl(x,0,z,.1,.1,.74,'black',true,8).add(new THREE.CylinderGeometry(.75,.75,.04,20),'white',x,.76,z);for(let s=0;s<5;s++){const a=s/5*2*PI;b.box(x+cos(a)*1,0,z+sin(a)*1,.4,.46,.4,'red');}}
          for(let i=0;i<4;i++)b.add(new THREE.SphereGeometry(.28,12,10).scale(1,1.2,1),new THREE.MeshStandardMaterial({color:0xd81e1e,emissive:0x661010}),-W+1.5+i*(2*W-3)/3,H-.8,0);counter(-W+1.8,D/2-1.5,2.4,'darkwood');}
        reg(T==='sushi'?0:-W+1.8,T==='sushi'?D/2-3.4:D/2-2.5);break;}
      case 'pub':case 'restaurant':{const pub=T==='pub';b.box(-W+.8,0,1,.7,1.1,D-6,'darkwood',true).box(-W+.8,1.1,1,.8,.05,D-5.9,pub?'darkwood':'marble');
        for(let i=0;i<14;i++)b.cyl(-W+.18,1.5+floor(i/7)*.5,-1.5+(i%7)*.7,.05,.05,.3,C[i%C.length]);
        if(pub){for(let i=0;i<5;i++)b.cyl(-W+1.05,1.15,-1+i*.35,.03,.03,.35,'brass');b.add(new THREE.BoxGeometry(.04,.7,1.2),'screen',-W+.06,2.6,-2);}
        for(let z=-D/2+2;z<=D/2-4;z+=1.6)b.cyl(-W+1.6,0,z,.18,.18,.75,'black',false,10);for(let z=-D/2+2;z<D/2-3;z+=2.3)table(W>4.6?W/2:1.4,z,pub?'darkwood':'white');
        for(let z=-D/2+2;z<D/2-1;z+=2.6)b.add(new THREE.SphereGeometry(.18,10,8),'lamp',W/2,2.8,z);reg(-W+1.2,-D/2+2.5);break;}
      case 'shoes':{for(const x of[-W+.3,W-.3]){b.box(x,0,0,.45,2.4,D-4,'white',true);for(let r=0;r<5;r++)for(let i=0;i<(D-5)/.45;i++)b.add(new THREE.BoxGeometry(.28,.12,.14),C[(i+r*3)%C.length],x+(x>0?-.3:.3),.4+r*.42,-D/2+2.5+i*.45);}
        for(let z=-2;z<=2;z+=2)b.box(0,0,z,2,.45,.8,'black',true);counter(0,D/2-1.6,2.6,'white','black');reg(0,D/2-2.6);break;}
      case 'cannabis':{for(let i=0;i<3;i++){const z=-D/2+3+i*2.6;b.box(-W+1.2,0,z,1.8,1,.6,'white',true);b.add(new THREE.BoxGeometry(1.8,.4,.6),'glass',-W+1.2,1.2,z);b.box(W-1.2,0,z,1.8,1,.6,'white',true);}
        b.add(new THREE.PlaneGeometry(2*W-1,1.4),'screen',0,2.4,D/2-.06,PI);counter(0,D/2-1.8,2*W-2.5,'white','black');reg(0,D/2-2.8);break;}
      case 'laundry':{for(const x of[-W+.5,W-.5])for(let i=0;i<(D-4)/.9;i++){const z=-D/2+2+i*.9;b.box(x,0,z,.8,.9,.85,'white',true);b.add(new THREE.CylinderGeometry(.28,.28,.02,16).rotateZ(PI/2),'glass',x+(x>0?-.41:.41),.55,z);}
        b.box(0,0,0,1.2,.9,4,'white',true);counter(0,D/2-1.6,2.4,'white','white');reg(0,D/2-2.6);break;}
      case 'clinic':{for(let z=-D/2+1.5;z<D/2-4;z+=.7)b.box(-W+.5,0,z,.55,.45,.6,'seatBlue',true);counter(0,D/2-2.4,2*W-3,'white','white');b.add(new THREE.BoxGeometry(2*W-3,.9,.04),'glass',0,1.6,D/2-2.75);plant(b,W-.8,-D/2+1);reg(0,D/2-3.3);break;}
      case 'phone':{for(let i=0;i<3;i++){const z=-D/2+3+i*2.8;b.box(0,0,z,2.4,.9,1,'white',true);for(let q=0;q<5;q++)b.add(new THREE.BoxGeometry(.08,.16,.02),'screen',-.9+q*.45,1,z);}
        b.add(new THREE.PlaneGeometry(2*W-1,1.2),'screen',0,2.5,D/2-.06,PI);counter(0,D/2-1.6,2.6,'white','white');reg(0,D/2-2.6);break;}
      case 'books':{for(const x of[-W+.3,W-.3])b.box(x,0,0,.5,2.6,D-2,'books',true);for(const z of[-3,.5])b.box(0,0,z,W>4.6?4:2.5,1.6,.8,'books',true);b.box(0,0,-D/2+2,2.4,.9,1.2,'darkwood',true);counter(-1,D/2-1.3,2.4);reg(-1,D/2-2.3);break;}
      case 'bakery':{counter(0,D/2-2.6,2*W-2,'marble','white');b.add(new THREE.BoxGeometry(2*W-2.2,.5,.6),'glass',0,1.35,D/2-2.6);for(let i=0;i<14;i++)b.add(new THREE.SphereGeometry(.12,8,6).scale(1.6,.8,1),FOODM[i%5],-W+1.5+i*(2*W-3)/14,1.2,D/2-2.6);
        wallShelf(-W+.3,-1,D/2-4,4,2,[new THREE.MeshStandardMaterial({color:0xc98a4a})]);table(1.6,-3.5);table(-1.6,-3.5);reg(0,D/2-3.6);break;}
      case 'florist':{for(let i=0;i<18;i++){const x=-W+1.5+(i%6)*(2*W-3)/5,z=-D/2+2.5+floor(i/6)*2.6,fc=pick([0xf15bb5,0xffd166,0xffffff,0xe63946,0xc77dff,0xff8fab]);b.cyl(x,0,z,.22,.18,.5,'steel');for(let q=0;q<7;q++)b.add(new THREE.SphereGeometry(.09,6,5),q%3?new THREE.MeshStandardMaterial({color:fc}):'leaf',x+rr(-.2,.2),.75+rr(0,.35),z+rr(-.2,.2));}
        fridge(W-.4,-D/2+1,1);counter(0,D/2-1.6,2.6,'darkwood');reg(0,D/2-2.6);break;}
      case 'fashion':{for(const x of[-W+.6,W-.6])for(let z=-D/2+2;z<D/2-3;z+=3){b.box(x,1.6,z,.05,.05,2.4,'steel');for(let i=0;i<9;i++)b.add(new THREE.BoxGeometry(.04,.9,.5),C[(i*2+(x>0?3:0))%C.length],x,1.12,z-1.1+i*.27);for(const s of[-1,1])b.cyl(x,0,z+s*1.15,.03,.03,1.6,'steel');}
        for(const z of[-1.5,1.5])person(b,z<0?-1.6:1.6,z,'white');b.add(new THREE.PlaneGeometry(1.4,2.2),'silver',W-.05,1.4,D/2-1.5,-PI/2);counter(0,D/2-1.4,2.4,'white','black');reg(0,D/2-2.4);break;}
      case 'guns':{counter(0,D/2-2,2*W-1.6,'glass','black');b.box(0,0,D/2-.2,2*W-.6,2.6,.12,'darkwood'); // pegboard of guns behind the counter
        for(let r=0;r<3;r++)for(let i=0;i<4;i++){const gi=[1,2,3,4,5,2][(i+r*2)%6];b.add(__late.GUNGEO[gi].clone(),__late.gunMat,-W+1.4+i*(2*W-2.8)/3,1.25+r*.55,D/2-.32,PI/2,1.7,1.7,1.7);}
        const AM=[0x6b6b3a,0xb08d48,0x5a3a24,0x2e4a2e].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.6}));gondola(0,-2,D-9,4,1.5,AM);wallShelf(-W+.3,-D/2+1.5,D/2-3.5,4,2,AM);
        b.text('BULLET BARN',0,3.1,D/2-.28,PI,4.5,.7,PAL[0],PAL[1],'900',.6);b.text('CASH ONLY · NO REFUNDS',W-.06,2.4,-1,-PI/2,3,.4,'#1d1d1d','#f1ece2','700',.4);reg(0,D/2-3);break;}
      case 'waffle':{counter(0,D/2-2.4,2*W-2,'white',M('#d9731f'));for(let x=-W+1.4;x<W-1;x+=.9)b.cyl(x,0,D/2-3.3,.18,.18,.75,'red',true,10);
        b.box(0,1.12,D/2-1.2,2*W-2,.06,.7,'steel');menu(0,D/2-.1,2*W-2,[['Waffle','$5.99'],['All-Star Breakfast','$10.99'],['Hash Browns','$3.49']],'#d9731f','#ffffff',['#d9a050','#e8c070','#c98a4a']);
        for(let z=-D/2+2;z<D/2-5.5;z+=2.4)booth(-W+1.2,z,M('#d9731f'));reg(0,D/2-3.4);break;}
      default:{for(const x of W>4.6?[-1.5,1.5]:[0])gondola(x,-1,D-7);counter(0,D/2-1.6,2.6);reg(0,D/2-2.6);}
    }
    b.T=T;
    const rg=b.spots.register;b.ped(rg[0]-b.ox,rg[1]-b.oz+1,'staff',{th:PI});b.crowd(T==='grocery'||T==='mcd'?5:T==='pub'||T==='restaurant'?4:2,[-W+1,-D/2+1.5,W-1,D/2-4]);return b.exit(0,-D/2+.8,0).finish();},
  // The Lucky Six: red carpet and gold, slot banks on the left, blackjack and roulette in the middle, the Lucky Wheel on a
  // stage at the back, the cashier's cage by the door. Dealers stand at their tables; armed guards watch the floor.
  casino(d){const b=new IB(d.name,{ceil:6.5}),W=22,D=15;
    IMDEF.felt=IMDEF.felt||[1,()=>({color:0x0e5a34,roughness:.95})];IMDEF.feltRed=IMDEF.feltRed||[1,()=>({color:0x7a1220,roughness:.95})];
    b.room(-W,-D,W,D,6.5,'carpetRed','navy','black');b.games=[];const game=(x,z,kind,label)=>b.games.push({x:b.ox+x,z:b.oz+z,kind,label});
    for(let x=-W+4;x<W;x+=6)for(let z=-D+4;z<D;z+=6)b.add(new THREE.BoxGeometry(1.6,.05,1.6),'lamp',x,6.45,z);
    for(const x of[-7,7])for(const z of[-8,0,8])column(b,x,z,.35,6.5,'gold','gold');
    b.text('THE LUCKY SIX',0,4.8,D-.08,PI,10,1.4,null,'#ffd23f','900',1.2);b.text('♠ ♥ ♦ ♣',0,3.7,D-.08,PI,4,.6,null,'#ff4fd8','900',1);
    // slot banks: one along the wall, a back-to-back pair in the aisle
    const slot=(x,z,f)=>{b.box(x,0,z,.8,1.7,.9,'black',true).add(new THREE.BoxGeometry(.04,.5,.6),'screen',x+f*.42,1.25,z).add(new THREE.BoxGeometry(.85,.08,.95),'gold',x,1.72,z);b.cyl(x+f*1,0,z,.2,.2,.6,'feltRed',false,10);};
    for(let z=-D+4;z<=D-4;z+=1.2){slot(-W+.6,z,1);slot(-W+6.2,z,-1);slot(-W+7,z,1);}
    for(let z=-D+4;z<=D-4;z+=3.6){game(-W+1.9,z,'slots','the slots');game(-W+4.9,z,'slots','the slots');game(-W+8.3,z,'slots','the slots');}
    // blackjack: half-moon felt with the round side toward the players, the dealer on the flat side
    for(const x of[-1,5,11]){const z=-4;b.cyl(x,0,z,.5,.5,.8,'darkwood',true,12);b.add(new THREE.CylinderGeometry(1.7,1.7,.12,28,1,false,PI/2,PI),'felt',x,.85,z);
      b.add(new THREE.CylinderGeometry(1.8,1.8,.08,28,1,true,PI/2,PI),'darkwood',x,.88,z);b.ped(x,z+.55,'staff',{th:PI});game(x,z-2.2,'blackjack','blackjack');
      for(let k=0;k<5;k++){const a=PI/2+PI*(k+.5)/5;b.cyl(x+sin(a)*2.3,0,z+cos(a)*2.3,.22,.22,.7,'feltRed',false,10);}}
    // roulette: a long layout with the wheel at the dealer's end
    for(const x of[1,9]){const z=6;b.box(x,0,z,4,.85,1.7,'darkwood',true).box(x,.85,z,3.8,.04,1.5,'felt');b.cyl(x+1.6,.9,z,.62,.62,.18,'darkwood',false,24).cyl(x+1.6,1.02,z,.5,.5,.04,'gold',false,24);
      b.text('0 00 1 2 3 4 5 6 7 8 9 10 11 12',x-.3,.91,z,0,2.8,.6,'#0e5a34','#fff','700',.3).rotation.x=-PI/2;b.ped(x+2.6,z,'staff',{th:-PI/2});game(x-.5,z-1.6,'roulette','roulette');}
    // the Lucky Wheel on its stage
    {const x=15,z=10;b.box(x,0,z,6,.4,4,'black',true);const c=cv(512,512),g=c.getContext('2d'),N=20;g.translate(256,256);
      for(let i=0;i<N;i++){const a0=i/N*2*PI,a1=a0+2*PI/N;g.fillStyle=i===10?'#ffd23f':i%2?'#c8102e':'#1d1d24';g.beginPath();g.moveTo(0,0);g.arc(0,0,250,a0,a1);g.closePath();g.fill();g.strokeStyle='#ffd23f';g.lineWidth=3;g.stroke();}
      g.fillStyle='#ffd23f';g.beginPath();g.arc(0,0,40,0,7);g.fill();const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.45});b.tmp.push(t,m);
      const wm=new THREE.Mesh(new THREE.CircleGeometry(2,48),m);wm.rotation.y=PI;b.wheel=b.own(wm,x,2.8,z+1.2);b.box(x,.4,z+1.35,.3,2.4,.2,'gold');b.text('▼',x,4.95,z+1.15,PI,.6,.5,null,'#ffd23f','900',1);
      b.text('LUCKY WHEEL',x,5.5,z+1.3,PI,3.6,.6,null,'#ff4fd8','900',1);game(x,z-2.6,'wheel','the Lucky Wheel');}
    // the cage by the door (it has a register: rob it at your peril)
    {const x=16,z=-11;b.box(x,0,z,6,1.1,.8,'darkwood',true).box(x,1.1,z,6.1,.05,.9,'marble');b.add(new THREE.BoxGeometry(6,1.3,.04),'glass',x,1.8,z-.35);
      b.box(x,0,z+2.6,6,3,.2,'darkwood',true);b.text('CASHIER',x,3.1,z-.42,PI,2.4,.5,'#1d1d24','#ffd23f','800',.8);b.spot('register',x,z-1.2);b.ped(x,z+.9,'staff',{th:PI});game(x+1.8,z-1.3,'cashier','the cashier');}
    for(const [x,z,th] of[[-3,-12,0],[13,-1,-PI/2],[-8,11,PI],[4,12,PI]])b.ped(x,z,'guard',{th});
    b.crowd(9,[-14,-12,13,12]);plant(b,-W+1,-D+1);plant(b,W-1,-D+1);
    return b.exit(0,-D+.8,0).finish();},
  // the CN Tower: the LookOut level inside the real pod, 343 m up
  cn(d){const L=MAP.landmarks.cn;const b=new IB(d.name,{ox:L.c[0],oz:L.c[1],floorY:343,ceil:6});b.real=true;b.camR=20;b.walkFn=(x,z)=>{const r=hypot(x-b.ox,z-b.oz);return r>6.6&&r<18.6;};b.camMax=3.2;
    const fl=new THREE.RingGeometry(6,20.6,64);fl.rotateX(-PI/2);b.add(fl,'carpetBlue',0,0,0);const gl=new THREE.RingGeometry(14.5,20.6,24,1,0,.9);gl.rotateX(-PI/2);b.add(gl,'glass',0,.02,0);
    const cl=new THREE.RingGeometry(6,21,64);cl.rotateX(PI/2);b.add(cl,'plaster',0,5.2,0);b.add(new THREE.CylinderGeometry(6.2,6.2,5.2,32,1,true),'concrete',0,2.6,0);solCirc(b.ox,b.oz,6.3);
    for(let k=0;k<4;k++){const a=k*PI/2+.3;b.add(new THREE.PlaneGeometry(1.8,2.6).rotateY(-a+PI/2),'steel',cos(a)*6.25,1.3,sin(a)*6.25);}
    for(let k=0;k<10;k++){const a=k/10*2*PI;if(k%3===0)bench(b,cos(a)*12,sin(a)*12,-a,2.2);else b.cyl(cos(a)*18.5,0,sin(a)*18.5,.15,.15,1.1,'black').add(new THREE.BoxGeometry(.5,.25,.3),'black',cos(a)*18.5,1.2,sin(a)*18.5);}
    b.text('LOOKOUT LEVEL · 346 m',cos(.3)*6.3,3.6,sin(.3)*6.3,-(.3)+PI/2,4,.5,'#c8102e','#fff','800',.5);b.text('GLASS FLOOR',cos(.45)*16,.05,sin(.45)*16,0,3,.6,null,'#fff','700',.6).rotation.x=-PI/2;
    for(let k=0;k<5;k++){const a=rnd()*6.28,r=rr(9,17);b.ped(cos(a)*r,sin(a)*r,'visitor',{area:[-17,-17,17,17]});}
    b.spot('exit',cos(.3)*7.4,sin(.3)*7.4);b.spawn=[b.ox+cos(.3)*9,b.oz+sin(.3)*9];b.yaw=-.3-PI/2;b.spots.photo=[b.ox+cos(.45)*16,b.oz+sin(.45)*16];return b.finish();},
};

// --- doors: one per enterable landmark, on the wall that faces the nearest street
const DOORS=[];
function doorOn(name,theme,o={}){
  let p=null;if(o.at){let bd=1e9;for(const v of MAP.vols){if(v.b>1||v.h<4)continue;const c=polyCen(v.p),dd=hypot(c[0]-o.at[0],c[1]-o.at[1]);if(dd<bd&&dd<60){bd=dd;p=v.p;}}}
  else{let best=null;for(const n of[].concat(o.data||name)){for(const v of volsOf(n))if(v.b<1&&(!best||abs(polyArea(v.p))>abs(polyArea(best.p))))best=v;}if(best)p=best.p;}
  if(!p&&!o.at)return null;let at=null,n=[0,1],bd=1e9;
  if(p)for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length],L=hypot(c[0]-a[0],c[1]-a[1]);if(L<3)continue;let nx=(c[1]-a[1])/L,nz=-(c[0]-a[0])/L;if(polyArea(p)<0){nx=-nx;nz=-nz;}
    const mx=(a[0]+c[0])/2,mz=(a[1]+c[1])/2,qx=mx+nx*2.2,qz=mz+nz*2.2;if(!walkable(qx,qz)||solidAt(qx,1,qz))continue;const r=nearestEdge(qx,qz,90);const dd=(r?r.d:200)+(o.prefer?hypot(qx-o.prefer[0],qz-o.prefer[1])*3:0);if(dd<bd){bd=dd;at=[qx,qz];n=[nx,nz];}}
  if(!at){const c=o.at||polyCen(p),s=curbSpot(c[0],c[1],'walk');if(!s)return null;at=[s.x,s.z];}
  const d={id:o.id||theme,name,theme,at,n,big:o.big,variant:o.variant,small:o.small,hours:o.hours};DOORS.push(d);return d;}
const DOOR={};
for(const [id,name,theme,o] of[
  ['rom','Royal Ontario Museum','museum',{prefer:[-380,-2015]}],['science','Ontario Science Centre','science'],['ago','Art Gallery of Ontario','gallery'],['union','Union Station','station',{prefer:[-35,738]}],
  ['cityhall','Toronto City Hall','council',{prefer:[-25,-110]}],['oldcityhall','Old City Hall','hall',{prefer:[110,25]}],['legislature','Ontario Legislative Building','legislature',{prefer:[-321,-1225]}],['casaloma','Casa Loma','castle'],
  ['eaton','Eaton Centre','mall',{data:'CF Toronto Eaton Centre'}],['market','St. Lawrence Market','market',{data:'St. Lawrence Market South'}],['arena','Scotiabank Arena','arena'],['rogers','Rogers Centre','stadium'],
  ['rth','Roy Thomson Hall','theatre',{variant:'rth'}],['massey','Massey Hall','theatre',{variant:'massey'}],['pow','Princess of Wales Theatre','theatre'],['danforth','The Danforth Music Hall','theatre'],['meridian','Meridian Hall','theatre',{data:['Meridian Hall','Meridian Arts Centre']}],
  ['library','Toronto Reference Library','library'],['osgoode','Osgoode Hall','library',{variant:'osgoode'}],['ripleys',"Ripley's Aquarium of Canada",'aquarium'],['hhof','Hockey Hall of Fame','hhof'],
  ['allan','Allan Gardens Conservatory','palmhouse'],['nycivic','North York Civic Centre','lobby'],['eycivic','East York Civic Centre','lobby'],['agakhan','Aga Khan Museum','gallery'],['harthouse','Hart House','hall'],['uc','University College','hall'],
  ['empress','Empress Walk','mall',{small:1}],['yongesheppard','Yonge Sheppard Centre','mall',{small:1}],['mlg','Maple Leaf Gardens','arena'],['brickworks','Evergreen Brick Works','market',{data:'Kiln Building'}],
  ['cn','CN Tower','cn',{at:MAP.landmarks.cn&&[MAP.landmarks.cn.c[0]+30,MAP.landmarks.cn.c[1]]}],
  ['lakeshore','Lakeshore Trust','bank',{at:[40,470]}],['bayst','Bay Street Reserve','bank',{at:[128,392],big:1}],['jewel','Bloor Diamonds','jewel',{at:[-30,-2042]}],
]){const d=doorOn(name,theme,Object.assign({id},o||{}));if(d)DOOR[id]=d;}
if(DOOR.cn){const L=MAP.landmarks.cn,s=curbSpot(L.c[0]+28,L.c[1]+6,'walk');if(s)DOOR.cn.at=[s.x,s.z];}
/* --- money spots: Bullet Barn, Waffle Hut and Six Gas are small buildings dropped onto real parking lots beside a main road;
   their doors lead into the shop interiors (theme 'shop'). Chop shops are drive-in markers where you sell the car you're in. */
const SPOTB=[],SBG=[]; // SPOTB: {name,at,col} for the map and minimap; SBG: the buildings, hidden when far away
const sbMats={};
function sbMat(k,o){return sbMats[k]||(sbMats[k]=new THREE.MeshStandardMaterial(o));}
function sbSign(lines,w,h,bg,fg,font){const c=cv(1024,max(64,round(1024*h/w))),g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';
  const L=lines.split('\n');L.forEach((l,k)=>{let fs=c.height/(L.length*1.35)*(k?.62:1);g.font=`${font||'900'} ${fs}px Inter, Arial, sans-serif`;while(g.measureText(l).width>c.width*.9&&fs>8){fs-=3;g.font=`${font||'900'} ${fs}px Inter, Arial, sans-serif`;}
    g.fillText(l,c.width/2,c.height*(k+.5)/L.length);});
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;const m=new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.3,roughness:.6});SIGNMATS.add(m);
  return new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);}
// a lot of the right size, next to a main road, near the target point (lots without painted stalls first)
function sbLot(tx,tz,minA){let best=null,bd=1e9;
  for(const L of MAP.lots||[]){if(L.used)continue;const a=abs(polyArea(L.p));if(a<minA||a>minA*8)continue;const [cx,cz]=polyCen(L.p),d=hypot(cx-tx,cz-tz)+(L.s?500:0);if(d>bd||d>2200)continue;
    const r=nearestEdge(cx,cz,40);if(!r||!/primary|secondary|tertiary|trunk/.test(r.e.c))continue;bd=d;best=L;}
  return best;}
// place a w×d footprint on the lot, facing the street, shrinking it until every corner sits inside the lot
function sbPlace(L,w,d){const P=flat(L.p),[cx,cz]=polyCen(L.p),s=curbSpot(cx,cz,'walk');if(!s)return null;let fx=s.x-cx,fz=s.z-cz;const fl=hypot(fx,fz)||1;fx/=fl;fz/=fl;
  const th=atan2(fx,fz),c=cos(th),sn=sin(th),W=(u,v,ox,oz)=>[ox+u*c+v*sn,oz-u*sn+v*c];
  for(const k of[1,.9,.8,.7])for(const sh of[0,-2,2,-4,4]){const ox=cx-fx*sh,oz=cz-fz*sh,hw=w*k/2,hd=d*k/2;
    if([[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd],[0,hd],[0,-hd],[hw,0],[-hw,0]].every(([u,v])=>{const q=W(u,v,ox,oz);return inPoly(q[0],q[1],P);}))
      return{x:ox,z:oz,th,k,fx,fz,W:(u,v)=>W(u*k,v*k,ox,oz)};}
  return null;}
function sbSolid(pl,u0,v0,u1,v1,h){const pts=[pl.W(u0,v0),pl.W(u1,v0),pl.W(u1,v1),pl.W(u0,v1)];let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of pts){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}
  hAdd({p:flat(pts),x0,x1,z0,z1,h},x0-3,z0-3,x1+3,z1+3);}
function sbBox(g,w,h,d,mat,x,y,z,ry){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y+h/2,z);if(ry)m.rotation.y=ry;m.castShadow=m.receiveShadow=true;g.add(m);return m;}
function sbDoor(id,name,sub,pl,u,v,theme){const at=pl.W(u,v),d={id,name,theme:theme||'shop',kind:7,sub,at,n:[pl.fx,pl.fz]};DOORS.push(d);DOOR[id]=d;return d;}
function sbBuild(kind,id,tx,tz){
  const minA=kind==='casino'?1500:kind==='gas'?650:kind==='barn'?420:360,fp=kind==='casino'?[34,26]:kind==='gas'?[22,19]:kind==='barn'?[15,12]:[14,11.5];let L=null,pl=null;
  for(let n=0;n<8&&!pl;n++){L=sbLot(tx,tz,minA);if(!L)return;pl=sbPlace(L,fp[0],fp[1]);if(!pl)L.used=1;} // too oddly shaped: try the next lot
  if(!pl)return;
  L.used=1;const LP=flat(L.p);for(let i=SLOTS.length-1;i>=0;i--)if(inPoly(SLOTS[i].x,SLOTS[i].z,LP))SLOTS.splice(i,1);
  const g=new THREE.Group();g.position.set(pl.x,groundH(pl.x,pl.z),pl.z);g.rotation.y=pl.th;g.scale.setScalar(pl.k);scene.add(g);SBG.push({g,x:pl.x,z:pl.z});const k=pl.k;
  if(kind==='casino'){ // The Lucky Six: a dark box wrapped in gold, a neon sign and a lit entrance canopy
    const body=sbMat('czB',{color:0x1b1530,roughness:.5,metalness:.2}),gold=sbMat('czG',{color:0xd4af37,roughness:.3,metalness:1}),glass=sbMat('czGl',{color:0x2a1830,roughness:.08,metalness:.5,emissive:0xff9ad9,emissiveIntensity:.25});
    const lit=sbMat('czL',{color:0xffffff,emissive:0xffe2a8,emissiveIntensity:.7});SIGNMATS.add(lit);
    sbBox(g,30,10,19,body,0,0,-3.5);for(const y of[3.6,9.6])sbBox(g,30.3,.35,19.3,gold,0,y,-3.5);for(const u of[-14.9,14.9])sbBox(g,.4,10,.4,gold,u,0,6);
    sbBox(g,12,3.2,.1,glass,0,.2,6.02);sbBox(g,14,.5,4,body,0,4.3,8);sbBox(g,14.2,.15,4.2,gold,0,4.8,8);const cl=new THREE.Mesh(new THREE.PlaneGeometry(13.6,3.6),lit);cl.rotation.x=PI/2;cl.position.set(0,4.29,8);g.add(cl);
    for(const u of[-6.6,6.6]){sbBox(g,.35,4.3,.35,gold,u,0,9.7);addCircle(...pl.W(u,9.7),.3*k);}
    const sg=sbSign('THE LUCKY SIX\nCASINO · OPEN ALL NIGHT',16,3.4,'#1b1530','#ff4fd8');sg.position.set(0,6.9,6.05);sg.material.emissiveIntensity=1;g.add(sg);
    sbSolid(pl,-15,-13,15,6,10.4);sbDoor(id,'The Lucky Six','CASINO',pl,0,7.4,'casino');SPOTB.push({name:'The Lucky Six',at:pl.W(0,7.4),col:'#ff4fd8'});}
  else if(kind==='barn'){ // a red barn with a white-trimmed gable facing the street
    const red=sbMat('barnR',{color:0x8e1d1a,roughness:.8}),wh=sbMat('barnW',{color:0xf1ece2,roughness:.7}),roof=sbMat('barnRoof',{color:0x2e2f33,roughness:.7,metalness:.3});
    sbBox(g,14,4.2,10,red,0,0,-1);const sh=new THREE.Shape();sh.moveTo(-7.5,0);sh.lineTo(7.5,0);sh.lineTo(0,3.4);sh.closePath();
    const gab=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:10.8,bevelEnabled:false}).translate(0,4.2,-6.4),roof);gab.castShadow=true;g.add(gab);
    const tri=new THREE.Shape();tri.moveTo(-7,0);tri.lineTo(7,0);tri.lineTo(0,3.1);tri.closePath();const tm=new THREE.Mesh(new THREE.ShapeGeometry(tri),red);tm.position.set(0,4.2,4.42);g.add(tm);
    for(const [w,h,x,y] of[[14.2,.25,0,4.1],[.3,4.2,-6.95,0],[.3,4.2,6.95,0]])sbBox(g,w,h,.12,wh,x,y,4.05);
    sbBox(g,3.2,3,.1,wh,0,0,4.03);sbBox(g,2.9,2.7,.12,red,0,.05,4.06);for(const s of[-1,1]){const b=sbBox(g,.18,3.9,.06,wh,0,-.45,4.14);b.rotation.z=s*.82;}
    const sg=sbSign('BULLET BARN\nGUNS · AMMO · ARMOUR',7,1.7,'#f1ece2','#8e1d1a');sg.position.set(0,5.35,4.47);g.add(sg);
    sbSolid(pl,-7,-6,7,4,7.6);sbDoor(id,'Bullet Barn','GUN SHOP',pl,0,5.3);SPOTB.push({name:'Bullet Barn',at:pl.W(0,5.3),col:'#e0453a'});}
  else if(kind==='waffle'){ // a little roadside diner: cream walls, a wide window band and a pole sign
    const cream=sbMat('wfC',{color:0xefe4c6,roughness:.75}),band=sbMat('wfB',{color:0xd9731f,roughness:.6}),glass=sbMat('wfG',{color:0x1f2a33,roughness:.12,metalness:.4,emissive:0xffc77a,emissiveIntensity:.15}),dark=sbMat('wfD',{color:0x2b2b2e,roughness:.7});
    sbBox(g,13,3.6,8.5,cream,0,0,-.5);sbBox(g,13.4,.5,8.9,dark,0,3.6,-.5);sbBox(g,11,1.5,.08,glass,0,.95,3.76);sbBox(g,13.1,.4,.1,band,0,2.5,3.78);
    const sg=sbSign('WAFFLE HUT',8,1.2,'#d9731f','#ffffff');sg.position.set(0,3.1,3.82);g.add(sg);
    sbBox(g,.3,7,.3,dark,6,0,5.4);const ps=sbSign('WAFFLE HUT\nOPEN 24 HOURS',3.2,2,'#d9731f','#ffffff');ps.position.set(6,7.2,5.58);g.add(ps);const pb=ps.clone();pb.rotation.y=PI;pb.position.z=5.22;g.add(pb);
    sbSolid(pl,-6.5,-4.75,6.5,3.75,4.1);addCircle(...pl.W(6,5.4),.3*k);sbDoor(id,'Waffle Hut','DINER',pl,-4,5);SPOTB.push({name:'Waffle Hut',at:pl.W(-4,5),col:'#f2a33a'});}
  else{ // Six Gas: a kiosk at the back, a lit canopy over two pump islands, a price sign by the road
    const wh=sbMat('gsW',{color:0xf2f2ef,roughness:.6}),grn=sbMat('gsG',{color:0x1f8f5a,roughness:.5}),glass=sbMat('gsGl',{color:0x24323c,roughness:.1,metalness:.4,emissive:0xe8f4ff,emissiveIntensity:.2}),dark=sbMat('gsD',{color:0x2a2c30,roughness:.6});
    const lit=sbMat('gsL',{color:0xffffff,emissive:0xffffff,emissiveIntensity:.6});SIGNMATS.add(lit);
    sbBox(g,9,3.6,6,wh,0,0,-6.5);sbBox(g,9.2,.5,6.2,grn,0,3.6,-6.5);sbBox(g,6,2,.08,glass,-.6,.4,-3.46);
    const ks=sbSign('SIX GAS · 24/7',5,.5,'#1f8f5a','#ffffff');ks.position.set(0,3.85,-3.36);g.add(ks);
    sbBox(g,16,.7,9.5,wh,0,4.8,3.5);sbBox(g,16.1,.35,9.6,grn,0,5.15,3.5);const cl=new THREE.Mesh(new THREE.PlaneGeometry(15,8.8),lit);cl.rotation.x=PI/2;cl.position.set(0,4.79,3.5);g.add(cl);
    const cs=sbSign('SIX GAS',4,.6,'#1f8f5a','#ffffff');cs.position.set(0,5.1,8.27);g.add(cs);
    for(const u of[-4,4]){sbBox(g,.9,.2,5,dark,u,0,3.5);for(const v of[1.8,5.2]){sbBox(g,.7,1.7,.5,grn,u,.2,v);sbBox(g,.5,.4,.52,wh,u,1.3,v);addCircle(...pl.W(u,v),.5*k);}
      for(const v of[-.2,7.2])addCircle(...pl.W(u,v),.3*k);sbBox(g,.35,4.6,.35,wh,u,.2,-.2);sbBox(g,.35,4.6,.35,wh,u,.2,7.2);}
    sbBox(g,.3,5,.3,dark,9.5,0,8.5);const pr=sbSign('SIX GAS\nREGULAR 159.9',2.6,2.2,'#1f8f5a','#ffffff');pr.position.set(9.5,6,8.66);g.add(pr);const pb=pr.clone();pb.rotation.y=PI;pb.position.z=8.34;g.add(pb);addCircle(...pl.W(9.5,8.5),.3*k);
    sbSolid(pl,-4.5,-9.5,4.5,-3.5,4.1);sbDoor(id,'Six Gas','CONVENIENCE',pl,2.8,-2.3);SPOTB.push({name:'Six Gas',at:pl.W(2.8,-2.3),col:'#2fc3a0'});}
}
for(const [kind,id,x,z] of[
  ['casino','casino',-881,1110],
  ['barn','bbarn1',1950,250],['barn','bbarn2',2600,-10800],
  ['waffle','waffle1',-2300,-500],['waffle','waffle2',3500,-4200],['waffle','waffle3',700,-8200],
  ['gas','gas1',1500,-1600],['gas','gas2',-1900,-2600],['gas','gas3',4600,-6500],['gas','gas4',-400,-10600]])
  try{sbBuild(kind,id,x,z);}catch(e){console.warn('money spot',id,e);}
// chop shops: pull in, stop, and they buy whatever you're driving (not police cars). Each one wants one model extra badly.
const CHOPV=[1100,2600,1800,0,5600];
const CHOPS=[[2700,880],[-2550,-1500],[4200,-9300]].map(([x,z])=>{const s=curbSpot(x,z,'park');if(!s)return null;const b=beacon(0xff8a2a,3,10);b.position.set(s.x,0,s.z);b.visible=true;
  return{x:s.x,z:s.z,cd:0,want:rpick([0,1,2,4]),told:false};}).filter(Boolean);
for(const c of CHOPS)SPOTB.push({name:'Chop shop',at:[c.x,c.z],col:'#ff8a2a',chop:1});
function stepChop(dt){
  if(G.frame%30===0)for(const b of SBG)b.g.visible=!__gs.IN&&hypot(b.x-__gs.FX,b.z-__gs.FZ)<700;
  G.chopCd=(G.chopCd||0)-dt;const c=G.car;
  for(const s of CHOPS){const d=c?hypot(c.x-s.x,c.z-s.z):1e9;if(d>60)s.told=false;else if(c&&!s.told&&d<35){s.told=true;flash('CHOP SHOP — paying extra for a '+CT[s.want].name,2.4);}}
  if(!c||G.chopCd>0||c.boat||c.bike||c.T.tram)return;
  for(const s of CHOPS)if(hypot(c.x-s.x,c.z-s.z)<4.5&&hypot(c.vx,c.vz)<3){G.chopCd=5;
    if(wLvl()>0||WANT.state){flash('LOSE THE COPS FIRST',1.8);return;}
    if(MS){flash('FINISH YOUR JOB FIRST',1.8);return;}
    if(c.copCar||c.swat||c.wasCop){flash("TOO HOT — WE DON'T TOUCH COP CARS",2.2);return;}
    if(s.cd>performance.now()){flash('STILL STRIPPING THE LAST ONE — COME BACK LATER',2);return;}
    const base=CHOPV[c.ti]||1000,v=round(base*(.3+.7*clamp(c.hp,0,100)/100)*(c.ti===s.want?1.5:1)/10)*10;
    c.vx=c.vz=c.w=0;toggleCar();if(G.car)return;rmCar(c);G.cash+=v;s.cd=performance.now()+90000;s.want=rpick([0,1,2,4].filter(i=>i!==s.want));
    SAVE.stats.chopped=(SAVE.stats.chopped||0)+1;__late.feedEvt('chop');flash(`SOLD FOR $${v.toLocaleString()}`,2.4);__gs.saveGame();return;}
}
const doorRing=new THREE.Mesh(new THREE.RingGeometry(.75,1,32).rotateX(-PI/2),new THREE.MeshBasicMaterial({color:0xffd23f,transparent:true,opacity:.9,depthWrite:false,fog:false}));
const doorMarks=DOORS.map(d=>{const m=doorRing.clone();m.position.set(d.at[0],.06,d.at[1]);m.visible=false;scene.add(m);const bm=beacon(0xffd23f,.8,3.4);bm.position.set(d.at[0],0,d.at[1]);return{m,bm};});
const exitMark=doorRing.clone();exitMark.material=doorRing.material.clone();exitMark.material.color.set(0x45ff7a);exitMark.visible=false;scene.add(exitMark);
const lootMark=beacon(0xffd23f,.7,2.6);

// interior people: borrow pedestrians from the street and give them a job inside
function inPeds(list){let k=1;for(const s of list){while(k<peds.length&&peds[k].copPed)k++;if(k>=peds.length)break;const p=peds[k++];p.ins=s;p.x=s.x;p.z=s.z;p.y=__gs.IN.floorY;p.th=s.th;p.state='walk';p.mode='walk';p.hp=100;p.lie=0;p.hidden=false;p.talking=false;p.tx=p.x;p.tz=p.z;p.wt=rnd()*3;p.gcd=1+rnd();p.bled=false;p.vx=p.vz=p.vy=0;}}
function freeInPeds(){for(const p of peds)if(p.ins){p.ins=null;p.state='walk';if(!placePed(p,15,160))p.hidden=true;}}
const inWalk=(x,z)=>__gs.IN.walkFn?__gs.IN.walkFn(x,z):__gs.IN.walk.some(r=>x>__gs.IN.ox+r[0]&&x<__gs.IN.ox+r[2]&&z>__gs.IN.oz+r[1]&&z<__gs.IN.oz+r[3]);
function stepInPed(p,dt){const s=p.ins,fy=__gs.IN?__gs.IN.floorY:0;
  if(!__gs.IN)return false;if(p.state==='dead'){p.lie=min(PI/2,p.lie+dt*6);p.y=fy;p.amp=0;return true;}
  if(p.state==='down'){p.vy-=20*dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;if(p.y<=fy){p.y=fy;p.vy=0;p.vx*=.9;p.vz*=.9;}p.lie=min(PI/2,p.lie+dt*7);p.amp=0;p.timer-=dt;if(p.timer<=0)p.state='flee';return true;}
  p.lie=max(0,p.lie-dt*3);let sp=0,tx=p.tx,tz=p.tz;const dx=player.x-p.x,dz=player.z-p.z,dp=hypot(dx,dz);
  if(s.role==='guard'&&__gs.IN.alarm){p.th+=wrap(atan2(dx,dz)-p.th)*min(1,dt*8);if(dp>10){sp=3.2;tx=player.x;tz=player.z;}}
  else if(__gs.IN.alarm||p.state==='flee'){sp=4.6;if(hypot(p.tx-p.x,p.tz-p.z)<1||p.wt<=0){const a=atan2(-dx,-dz)+rr(-.8,.8);p.tx=p.x+sin(a)*8;p.tz=p.z+cos(a)*8;p.wt=2;}p.wt-=dt;if(dp>14){sp=0;p.lie=0;}}
  else if(s.role==='visitor'&&s.area){p.wt-=dt;if(p.wt<=0&&hypot(p.tx-p.x,p.tz-p.z)<.5){p.tx=rr(s.area[0],s.area[2]);p.tz=rr(s.area[1],s.area[3]);p.wt=rr(2,7);}if(hypot(p.tx-p.x,p.tz-p.z)>.5&&p.wt<=0||hypot(p.tx-p.x,p.tz-p.z)>.5&&p.wt<1)sp=p.walk*.75;}
  else p.th+=wrap((s.th??p.th)-p.th)*min(1,dt*4);
  if(sp>0){const ex=tx-p.x,ez=tz-p.z,ed=hypot(ex,ez);if(ed>.3){if(!(s.role==='guard'&&__gs.IN.alarm))p.th+=wrap(atan2(ex,ez)-p.th)*min(1,dt*8);const nx=p.x+ex/ed*sp*dt,nz=p.z+ez/ed*sp*dt;if(inWalk(nx,nz)){p.x=nx;p.z=nz;}else{p.tx=p.x;p.tz=p.z;p.wt=0;}}else sp=0;}
  if(pushOut(p.x,p.z,.32)){p.x=PO.x;p.z=PO.z;}p.y=fy;p.phase+=sp*dt*(sp>3?1.9:3.2);p.amp+=((sp>3?.95:sp>0?.5:0)-p.amp)*min(1,dt*8);return true;}
function raiseAlarm(stars,why){if(!__gs.IN||__gs.IN.alarm)return;if(/ROBB/.test(why||''))__late.feedEvt('alarm',{what:__gs.IN.name});__gs.IN.alarm=true;__gs.IN.stars=max(__gs.IN.stars||0,stars);__gs.IN.alarmT=0;flash(why||'ALARM!',2.2);__late.alarm(player.x,player.z,60);for(const p of peds)if(p.ins&&p.ins.role!=='guard'&&p.state!=='dead')p.state='flee';}

function enterInterior(d){
  if(G.busy||G.car)return;if(PANEL)closePanel();G.busy=true;$('fade').style.opacity=1;
  setTimeout(()=>{
    __gs.IN=THEMES[d.theme](d);__gs.IN.door=d;__gs.IN.alarm=false;__gs.IN.stars=0;__gs.IN.t=0;scene.add(__gs.IN.g);
    player.x=__gs.IN.spawn[0];player.z=__gs.IN.spawn[1];player.y=__gs.IN.floorY;player.vy=0;__gs.FX=player.x;__gs.FZ=player.z;player.th=__gs.IN.yaw;__gs.camYaw=__gs.IN.yaw;__gs.camPitch=.15;__late.camT.set(__gs.FX,__gs.IN.floorY+1.6,__gs.FZ);
    inPeds(__gs.IN.peds);G.wp=null;__gs.ROUTE=null;
    if(!__gs.IN.real){hemi.groundColor.setRGB(.5,.45,.4);}
    if(__gs.IN.fog){__gs.IN.fog0=[scene.fog.color.getHex(),scene.fog.density];}
    $('fade').style.opacity=0;G.busy=false;flash(d.name.toUpperCase(),2.2);
  },650);}
function exitInterior(now){
  if(!__gs.IN)return;__late.closeGame(true);const d=__gs.IN.door,I=__gs.IN,go=()=>{
    scene.remove(I.g);I.g.traverse(o=>{if(o.geometry)o.geometry.dispose();});for(const t of I.tmp)t.dispose();solClear();
    if(I.fog0){scene.fog.color.setHex(I.fog0[0]);scene.fog.density=I.fog0[1];}hemi.groundColor.setHex(0x3a332b);
    __gs.IN=null;freeInPeds();player.x=d.at[0]+d.n[0]*1.2;player.z=d.at[1]+d.n[1]*1.2;player.y=0;player.vy=0;__gs.FX=player.x;__gs.FZ=player.z;player.th=atan2(d.n[0],d.n[1]);__gs.camYaw=player.th;__late.camT.set(__gs.FX,1.6,__gs.FZ);streamTick(__gs.FX,__gs.FZ,true);
    if(I.alarm){G.heat=max(G.heat,(I.stars||2)+.2);G.evade=0;}};
  if(now){go();return;}if(G.busy)return;G.busy=true;$('fade').style.opacity=1;setTimeout(()=>{go();$('fade').style.opacity=0;G.busy=false;},650);}

function stepInteriors(dt){
  if(G.frame%10===0&&!__gs.IN)DOORS.forEach((d,i)=>{const dd=hypot(d.at[0]-__gs.FX,d.at[1]-__gs.FZ),dc=hypot(d.at[0]-camera.position.x,d.at[1]-camera.position.z);doorMarks[i].m.visible=dd<140;doorMarks[i].bm.visible=dd<140&&dc>4&&dd>3;});
  __late.stepCasinoHud();
  if(!__gs.IN){exitMark.visible=false;lootMark.visible=false;return;}
  __gs.IN.t+=dt;for(const f of __gs.IN.ticks)f(dt,__gs.IN.t);
  if(__gs.IN.fog){scene.fog.color.setHex(__gs.IN.fog[0]);scene.fog.density=__gs.IN.fog[1];}
  if(!__gs.IN.real){sun.intensity*=.25;hemi.intensity=1.15;hemi.color.setRGB(1,.96,.9);renderer.toneMappingExposure=1;}
  const ex=__gs.IN.spots.exit;exitMark.visible=true;exitMark.position.set(ex[0],__gs.IN.floorY+.06,ex[1]);
  const lt=__gs.IN.loot.find(l=>!l.got&&__gs.IN.lootOn);lootMark.visible=!!lt;if(lt)lootMark.position.set(lt.x,__gs.IN.floorY,lt.z);
  if(!__gs.IN.alarm&&__gs.IN.peds.length&&__late.ARM.flash>0&&__late.ARM.w>0)raiseAlarm(2,'SHOTS FIRED — ALARM!');
  if(!__gs.IN.alarm&&peds.some(p=>p.ins&&p.state==='dead'))raiseAlarm(2,'ALARM!');
  if(__gs.IN.alarm){__gs.IN.alarmT+=dt;if(__gs.IN.alarmT>25&&!__gs.IN.backup&&!__gs.IN.real){__gs.IN.backup=true;flash('POLICE INSIDE!',1.6);let n=0;for(const p of peds)if(!p.ins&&!p.copPed&&p!==player&&n<3){p.ins={role:'guard',th:0};p.x=ex[0]+rr(-1,1);p.z=ex[1]+rr(-1,1)+1;p.y=__gs.IN.floorY;p.hidden=false;p.state='walk';p.hp=100;p.lie=0;p.gcd=1.5;n++;}}}
  let hint='';const d=hypot(player.x-ex[0],player.z-ex[1]);if(d<3.2)hint=__gs.IN.real?'Press E to take the elevator down':'Press E to leave';
  for(const c of __gs.IN.cases)if(!c.broken&&hypot(player.x-c.x,player.z-c.z)<1.9){hint='Press E to smash the case';break;}
  {const gm=__late.nearGame();if(gm)hint=gm.kind==='cashier'?(__late.ARM.w>0?'Press E to rob the cage':'Press E for the cashier'):__late.ARM.w>0?'Put your weapon away to play':gm.kind==='wheel'?'Press E to spin the Lucky Wheel':'Press E to play '+gm.label;}
  {const rg=__gs.IN.spots.register;if(rg&&hypot(player.x-rg[0],player.z-rg[1])<2.2){
    if(__gs.IN.T==='guns')hint='Press E to buy weapons & armour';
    else if(__late.FOOD[__gs.IN.T]&&__late.ARM.w===0)hint=__gs.IN.robbed?'Press E to order food':'Press E to order food · pull out a gun to rob the register';
    else if(!__gs.IN.robbed)hint=__late.ARM.w>0?'Press E to rob the register':'Pull out a gun to rob the register';}}
  if(hint)G.lifeHint=hint;
}
// guards shoot back once the alarm is up
function stepGuards(dt){if(!__gs.IN||!__gs.IN.alarm||G.busy)return;
  for(const p of peds){if(!p.ins||p.ins.role!=='guard'||p.state==='dead'||p.state==='down')continue;p.gcd-=dt;const dx=player.x-p.x,dz=player.z-p.z,d=hypot(dx,dz);if(p.gcd>0||d>34)continue;p.gcd=.9+rnd()*.9;
    const a=__late._hd.set(p.x+sin(p.th)*.5,__gs.IN.floorY+1.4,p.z+cos(p.th)*.5),t=__late._hp.set(player.x+(rnd()-.5)*1.2,__gs.IN.floorY+1.2+(rnd()-.5)*.8,player.z+(rnd()-.5)*1.2);let clear=true;
    for(let s=1.5;s<d-1;s+=1.2)if(solidAt(a.x+dx/d*s,__gs.IN.floorY+1.3,a.z+dz/d*s)){clear=false;break;}if(!clear)continue;
    __late.tracer(a,t);__late.bang(.3);if(rnd()<.34){__late.hurt(7);G.hurtCd=.6;G.shake=max(G.shake,.25);__late.spray(player.x,__gs.IN.floorY+1.2,player.z,dx/d,dz/d,3);}}}
function smashCase(c){c.broken=true;c.glass.visible=false;c.gems.visible=false;__late.thud(.4);for(let k=0;k<14;k++)emit(c.x+rr(-.8,.8),__gs.IN.floorY+1.2,c.z+rr(-.4,.4),rr(-1.5,1.5),rr(.5,2.5),rr(-1.5,1.5),.08,.8,.95,.8);
  if(MS)MS.take=(MS.take||0)+c.val;else G.cash+=c.val;flash('+$'+c.val.toLocaleString(),1.2);if(!__gs.IN.alarm)raiseAlarm(MS?(MS.def.alarmStars||2):2,'ALARM!');}

export { DOOR, DOORS, SPOTB, enterInterior, exitInterior, inWalk, raiseAlarm, smashCase, stepChop, stepGuards, stepInteriors };
