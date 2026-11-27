// Six City — world. One of the game's modules; they load in numbered order (src/game/index.js).
import './03-textures.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { __gs, __late, later } from './shared.js';
import { C3, EDGES, MAP, MAXANISO, NODES, PI, PLAY, R, REAL, REAL_SIZE, TEST, abs, camera, ceil, clamp, cos, cv, floor, hypot, lerp, max, min, mkRng, realGround, realTex, realWall, round, rr, scene, sin, sqrt, stage } from './01-core.js';
import { night } from './02-sky.js';
import { FVAR, SHOPS, SHOPV, facadeTextures, facadeVariant, noiseTexture, normalFromHeight, paverTexture, shopTextures, speckle, strH, tex, waterNormal } from './03-textures.js';
later({onIsland:()=>onIsland}); // for earlier modules, read when called

/* ============================== world (built from OpenStreetMap data) ============================== */
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_v=new THREE.Vector3(),_s=new THREE.Vector3(),ONE=new THREE.Vector3(1,1,1),YAX=new THREE.Vector3(0,1,0),XAX=new THREE.Vector3(1,0,0);
const WHITE=C3(1,1,1),UP=[0,1,0];
const mat4=(x,y,z,ry,sx,sy,sz)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(YAX,ry||0),new THREE.Vector3(sx||1,sy||sx||1,sz||sx||1));
function instanced(geo,mat,mats,cols,shadow){
  const im=new THREE.InstancedMesh(geo,mat,max(1,mats.length));im.count=mats.length;
  mats.forEach((m,k)=>{im.setMatrixAt(k,m);if(cols)im.setColorAt(k,cols[k]);});
  im.castShadow=!!shadow;im.receiveShadow=true;im.computeBoundingSphere();scene.add(im);return im;
}
const CULL=[];
function cullTick(){const cx=camera.position.x,cz=camera.position.z;for(const q of CULL){const dx=q.x-cx,dz=q.z-cz,d2=dx*dx+dz*dz;q.o.visible=d2<q.r2&&d2>=(q.rmin2||0);}}
const CH_SIZE=300;
function chunkedInstanced(geo,mat,items,shadow,radius,rmin){ // items: {x,z,m,c}; rmin: only drawn beyond this (far level of detail)
  const groups=new Map();
  for(const it of items){const k=floor(it.x/CH_SIZE)+','+floor(it.z/CH_SIZE);let L=groups.get(k);if(!L)groups.set(k,L=[]);L.push(it);}
  for(const [k,L] of groups){const im=instanced(geo,mat,L.map(i=>i.m),L[0].c?L.map(i=>i.c):null,shadow);
    const [i,j]=k.split(',').map(Number);if(radius)CULL.push({o:im,x:(i+.5)*CH_SIZE,z:(j+.5)*CH_SIZE,r2:radius*radius,rmin2:(rmin||0)**2});}
}

/* --- geometry helpers --- */
function inPoly(px,pz,p){let c=false;const n=p.length>>1;for(let i=0,j=n-1;i<n;j=i++){const ax=p[i*2],az=p[i*2+1],bx=p[j*2],bz=p[j*2+1];if((az>pz)!==(bz>pz)&&px<(bx-ax)*(pz-az)/(bz-az)+ax)c=!c;}return c;}
const flat=p=>{const a=new Float32Array(p.length*2);p.forEach((q,i)=>{a[i*2]=q[0];a[i*2+1]=q[1];});return a;};
const polyArea=p=>{let a=0;for(let i=0;i<p.length;i++){const q=p[i],r=p[(i+1)%p.length];a+=q[0]*r[1]-r[0]*q[1];}return a/2;};
const polyCen=p=>{let x=0,z=0;for(const q of p){x+=q[0];z+=q[1];}return[x/p.length,z/p.length];};
const hsh=(x,z)=>{const s=sin(x*12.9898+z*78.233)*43758.5453;return s-floor(s);};
const cumOf=p=>{const c=[0];for(let k=1;k<p.length;k++)c.push(c[k-1]+hypot(p[k][0]-p[k-1][0],p[k][1]-p[k-1][1]));return c;};
function cutLine(p,cum,a,b){
  const at=s=>{let k=1;while(k<cum.length-1&&cum[k]<s)k++;const t=(s-cum[k-1])/((cum[k]-cum[k-1])||1);return[p[k-1][0]+(p[k][0]-p[k-1][0])*t,p[k-1][1]+(p[k][1]-p[k-1][1])*t];};
  const out=[at(a)];for(let k=1;k<p.length-1;k++)if(cum[k]>a&&cum[k]<b)out.push(p[k]);out.push(at(b));return out;}
function offsetLine(p,off){ // mitred parallel polyline, positive = right of travel direction
  const n=p.length,out=[];
  for(let i=0;i<n;i++){let tx=0,tz=0;
    if(i>0){const dx=p[i][0]-p[i-1][0],dz=p[i][1]-p[i-1][1],l=hypot(dx,dz)||1;tx+=dx/l;tz+=dz/l;}
    if(i<n-1){const dx=p[i+1][0]-p[i][0],dz=p[i+1][1]-p[i][1],l=hypot(dx,dz)||1;tx+=dx/l;tz+=dz/l;}
    const tl=hypot(tx,tz)||1;tx/=tl;tz/=tl;const rx=-tz,rz=tx;let sc=1;
    if(i>0&&i<n-1){const dx=p[i+1][0]-p[i][0],dz=p[i+1][1]-p[i][1],l=hypot(dx,dz)||1;sc=1/max(.5,(-dz/l)*rx+(dx/l)*rz);}
    out.push([p[i][0]+rx*off*sc,p[i][1]+rz*off*sc]);}
  return out;}
function hull(pts){pts=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lo=[],up=[];
  for(const p of pts){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}
  for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}
  up.pop();lo.pop();return lo.concat(up);}
function nrmOf(a,b,c,ref){ // unit normal of triangle, flipped to agree with ref
  const e1x=b[0]-a[0],e1y=b[1]-a[1],e1z=b[2]-a[2],e2x=c[0]-a[0],e2y=c[1]-a[1],e2z=c[2]-a[2];
  let x=e1y*e2z-e1z*e2y,y=e1z*e2x-e1x*e2z,z=e1x*e2y-e1y*e2x;const l=hypot(x,y,z)||1;x/=l;y/=l;z/=l;
  if(x*ref[0]+y*ref[1]+z*ref[2]<0){x=-x;y=-y;z=-z;}return[x,y,z];}
class GB{ // simple non-indexed geometry builder
  constructor(){this.p=[];this.n=[];this.u=[];this.c=[];}
  tri(a,b,c,n,col,ua,ub,uc){
    const e1x=b[0]-a[0],e1y=b[1]-a[1],e1z=b[2]-a[2],e2x=c[0]-a[0],e2y=c[1]-a[1],e2z=c[2]-a[2];
    if((e1y*e2z-e1z*e2y)*n[0]+(e1z*e2x-e1x*e2z)*n[1]+(e1x*e2y-e1y*e2x)*n[2]<0){let t=b;b=c;c=t;t=ub;ub=uc;uc=t;}
    const P=this.p,N=this.n,U=this.u,C=this.c;
    P.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);
    for(let k=0;k<3;k++){N.push(n[0],n[1],n[2]);C.push(col.r,col.g,col.b);}
    U.push(ua?ua[0]:0,ua?ua[1]:0,ub?ub[0]:0,ub?ub[1]:0,uc?uc[0]:0,uc?uc[1]:0);}
  quad(a,b,c,d,n,col,ua,ub,uc,ud){this.tri(a,b,c,n,col,ua,ub,uc);this.tri(a,c,d,n,col,ua,uc,ud);}
  get empty(){return this.p.length===0;}
  geo(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.u,2));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));g.computeBoundingSphere();return g;}
}
function polyInto(gb,p,y,uvs,col){ // flat polygon, facing up
  if(p.length<3)return;let faces;
  try{faces=THREE.ShapeUtils.triangulateShape(p.map(q=>new THREE.Vector2(q[0],q[1])),[]);}catch(e){return;}
  for(const f of faces){const a=p[f[0]],b=p[f[1]],c=p[f[2]];
    gb.tri([a[0],y,a[1]],[b[0],y,b[1]],[c[0],y,c[1]],UP,col||WHITE,[a[0]*uvs,a[1]*uvs],[b[0]*uvs,b[1]*uvs],[c[0]*uvs,c[1]*uvs]);}}
function stripInto(gb,p,hw,y,v0,col){ // road-like ribbon; u: 0 left .. 1 right, v: metres/12
  if(p.length<2)return;const cum=cumOf(p),L=offsetLine(p,-hw),Rr=offsetLine(p,hw);
  for(let i=0;i<p.length-1;i++){const va=(v0+cum[i])/12,vb=(v0+cum[i+1])/12;
    gb.quad([L[i][0],y,L[i][1]],[Rr[i][0],y,Rr[i][1]],[Rr[i+1][0],y,Rr[i+1][1]],[L[i+1][0],y,L[i+1][1]],UP,col||WHITE,[0,va],[1,va],[1,vb],[0,vb]);}}
// flat ground layers are drawn as decals: no depth writes, pulled toward the camera so they never flicker
function decalMat(o,layer){return new THREE.MeshStandardMaterial(Object.assign({roughness:.9,polygonOffset:true,polygonOffsetFactor:-layer,polygonOffsetUnits:-4*layer,depthWrite:false},o));}
function addDecal(geo,mat,layer){const m=new THREE.Mesh(geo,mat);m.renderOrder=layer*10;m.receiveShadow=true;scene.add(m);return m;}

/* --- street graph --- */
const abbrev=n=>(n||'').replace(/\bStreet\b/,'St').replace(/\bAvenue\b/,'Ave').replace(/\bBoulevard\b/,'Blvd').replace(/\bRoad\b/,'Rd').replace(/\bDrive\b/,'Dr').replace(/\bCrescent\b/,'Cres').replace(/\bPlace\b/,'Pl').replace(/\bLane\b/,'Ln').replace(/\bSquare\b/,'Sq').replace(/\bTerrace\b/,'Terr').replace(/\bCourt\b/,'Ct').replace(/\bCircle\b/,'Cir').replace(/ East$/,' E').replace(/ West$/,' W').replace(/ North$/,' N').replace(/ South$/,' S');
const hkey=(i,j)=>i*65536+j;
const NK=100,nodeHash=new Map();
NODES.forEach((n,i)=>{n.i=i;const k=hkey(floor(n.x/NK),floor(n.z/NK));let L=nodeHash.get(k);if(!L)nodeHash.set(k,L=[]);L.push(n);});
for(const e of EDGES){
  e.cum=cumOf(e.p);e.L=e.cum[e.cum.length-1];
  const per=e.ow?e.l:max(1,e.l/2);
  e.lo=e.ow?max(0,e.l*3.3/2-1.65):max(1.65,per*3.3-1.65);if(e.lo>e.hw-1.1)e.lo=max(0,e.hw-1.7);
  e.tlo=e.ow?0:min(1.65,e.hw-1.2);e.pk=(2*e.hw-e.l*3.3)/2;e.short=abbrev(e.n);
}
for(const n of NODES){
  n.deg=n.e.length;
  n.trim=n.deg>=3?max(...n.e.map(i=>EDGES[i].hw))+1.2:0;
  n.sig=n.deg>=3&&n.e.filter(i=>/primary|secondary|tertiary|trunk/.test(EDGES[i].c)&&EDGES[i].ai).length>=2;
}
function edgePt(e,s,o){s=clamp(s,0,e.L);const c=e.cum,p=e.p;let k=1;while(k<c.length-1&&c[k]<s)k++;
  const a=p[k-1],b=p[k],l=(c[k]-c[k-1])||1,t=(s-c[k-1])/l;o.x=a[0]+(b[0]-a[0])*t;o.z=a[1]+(b[1]-a[1])*t;o.tx=(b[0]-a[0])/l;o.tz=(b[1]-a[1])/l;return o;}
const _lp={x:0,z:0,tx:0,tz:0},_lq={x:0,z:0,tx:0,tz:0};
const EK=50,EH=new Map();
EDGES.forEach((e,ei)=>{for(let k=1;k<e.p.length;k++){const a=e.p[k-1],b=e.p[k];
  for(let i=floor((min(a[0],b[0])-25)/EK);i<=floor((max(a[0],b[0])+25)/EK);i++)for(let j=floor((min(a[1],b[1])-25)/EK);j<=floor((max(a[1],b[1])+25)/EK);j++){const kk=hkey(i,j);let L=EH.get(kk);if(!L)EH.set(kk,L=[]);L.push(ei,k);}}});
function nearestEdge(x,z,maxd,only){ // only: optional edge filter
  maxd=maxd||40;const rc=max(0,ceil((maxd-25)/EK)),ci=floor(x/EK),cj=floor(z/EK);let best=null,bd=maxd;
  for(let di=-rc;di<=rc;di++)for(let dj=-rc;dj<=rc;dj++){const L=EH.get(hkey(ci+di,cj+dj));
  if(L)for(let q=0;q<L.length;q+=2){const e=EDGES[L[q]],k=L[q+1];if(only&&!only(e))continue;const a=e.p[k-1],b=e.p[k],dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz||1;
    const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/l2,0,1),px=a[0]+dx*t,pz=a[1]+dz*t,d=hypot(x-px,z-pz);
    if(d<bd){bd=d;const l=sqrt(l2);best={e,s:e.cum[k-1]+t*l,d,x:px,z:pz,tx:dx/l,tz:dz/l};}}}
  return best;}
function nodesNear(x,z,r){const out=[];for(let i=floor((x-r)/NK);i<=floor((x+r)/NK);i++)for(let j=floor((z-r)/NK);j<=floor((z+r)/NK);j++){const L=nodeHash.get(hkey(i,j));if(L)for(const n of L)if(hypot(n.x-x,n.z-z)<=r)out.push(n);}return out;}

/* --- floating building parts: OpenStreetMap often maps a tower as 3D parts that start above the ground (min_height)
   without mapping the floors underneath, and the outline that would have filled them in is dropped. Those parts hung in
   the air as a few loose walls. Any raised part with nothing at all under it is stood on the ground (and made solid), unless
   it is a bridge / canopy or a street runs under it. Archways, skyways and real overhangs stay up; addVol gives them an underside. --- */
{const V=MAP.vols,GS=50,G=new Map(),gk=(i,j)=>i+','+j;
 const bbox=p=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of p){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}return[x0,x1,z0,z1];};
 V.forEach(v=>{const [x0,x1,z0,z1]=bbox(v.p);v._f=flat(v.p);for(let i=floor(x0/GS);i<=floor(x1/GS);i++)for(let j=floor(z0/GS);j<=floor(z1/GS);j++){const k=gk(i,j);let L=G.get(k);if(!L)G.set(k,L=[]);L.push(v);}});
 // a street runs under it when the street's centre line passes through the footprint (same test the map builder uses for archways)
 const RG=new Map(),RK=40;for(const e of EDGES)for(let k=1;k<e.p.length;k++){const a=e.p[k-1],b=e.p[k],L=hypot(b[0]-a[0],b[1]-a[1]);
   for(let d=0;d<=L;d+=2.5){const x=a[0]+(b[0]-a[0])*d/(L||1),z=a[1]+(b[1]-a[1])*d/(L||1),kk=gk(floor(x/RK),floor(z/RK));let Q=RG.get(kk);if(!Q)RG.set(kk,Q=[]);Q.push(x,z);}}
 const roadHits=v=>{const [x0,x1,z0,z1]=bbox(v.p);let n=0;for(let i=floor(x0/RK);i<=floor(x1/RK);i++)for(let j=floor(z0/RK);j<=floor(z1/RK);j++){const Q=RG.get(gk(i,j));if(Q)for(let k=0;k<Q.length;k+=2)if(inPoly(Q[k],Q[k+1],v._f))n++;}return n;};
 let grounded=0;
 for(const v of V.filter(v=>v.b>2&&v.k!=='bridge'&&v.k!=='roof'&&v.k!=='carport').sort((a,b)=>a.b-b.b)){
   const n=v.p.length;let cx=0,cz=0;for(const q of v.p){cx+=q[0];cz+=q[1];}cx/=n;cz/=n;
   const pts=[[cx,cz],...v.p.map(q=>[q[0]*.8+cx*.2,q[1]*.8+cz*.2])].filter(q=>inPoly(q[0],q[1],v._f));if(!pts.length)continue;
   if(roadHits(v)>=2)continue;
   let sup=0;for(const [x,z] of pts)if((G.get(gk(floor(x/GS),floor(z/GS)))||[]).some(u=>u!==v&&u.b<v.b-.5&&inPoly(x,z,u._f)))sup++;
   if(sup/pts.length>=.5)continue;
   v.b=0;grounded++;if(!v.f)MAP.solids.push({p:v.p,h:v.h,n:v.n});}
 // the base under a tower (70 m+) must stream with the tower: towers stay loaded out to ~4.6 km but ordinary tiles drop at
 // ~1.65 km, which left distant towers hovering over the gap where their podium used to be
 for(const v of V){if(v.h<70||v.b<=2)continue;const [x0,x1,z0,z1]=bbox(v.p),cx=(x0+x1)/2,cz=(z0+z1)/2;
   for(const [x,z] of [[cx,cz],...v.p.map(q=>[q[0]*.8+cx*.2,q[1]*.8+cz*.2])])for(const u of G.get(gk(floor(x/GS),floor(z/GS)))||[])if(u!==v&&u.h<70&&u.b<v.b&&inPoly(x,z,u._f))u.tb=1;}
 // overlapping parts that share an outer wall: OSM maps a complex as an outline (or podium) plus parts drawn right on its
 // edge, e.g. the Sheraton Centre's 146 m tower stands on the 20 m podium's Queen St edge. Two walls in the same plane
 // z-fight and flash as the camera moves. The lower of the two is pulled 10 cm inward so the taller wall is always in front.
 const sgn=p=>{let s=0;for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length];s+=a[0]*c[1]-c[0]*a[1];}return s;};
 const inset=(p,d)=>{const n=p.length,s=sgn(p)>0?1:-1,N=[];
   for(let i=0;i<n;i++){const a=p[i],c=p[(i+1)%n],L=hypot(c[0]-a[0],c[1]-a[1])||1;N.push([-s*(c[1]-a[1])/L,s*(c[0]-a[0])/L]);}
   return p.map((q,i)=>{const n1=N[(i+n-1)%n],n2=N[i],dt=n1[0]*n2[0]+n1[1]*n2[1],k=dt>-.6?d/(1+dt):d;return[q[0]+(n1[0]+n2[0])*k,q[1]+(n1[1]+n2[1])*k];});};
 // walls with (tx,tz) = edge direction and o = which side faces out (polygon winding)
 const wallsOf=v=>{const p=v.p,n=p.length,o=sgn(p)>0?1:-1,W=[];for(let i=0;i<n;i++){const a=p[i],c=p[(i+1)%n],L=hypot(c[0]-a[0],c[1]-a[1]);if(L>=.5)W.push({a,c,L,tx:(c[0]-a[0])/L,tz:(c[1]-a[1])/L,o});}return W;};
 const shared=(A,B)=>{const WA=A._w||(A._w=wallsOf(A)),WB=B._w||(B._w=wallsOf(B));
   for(const a of WA)for(const b of WB){const dot=a.tx*b.tx+a.tz*b.tz;
     if(abs(dot)<.9998||dot*a.o*b.o<0)continue;                 // parallel, and facing the same way (back-to-back walls are hidden)
     const d1=(b.a[0]-a.a[0])*-a.tz+(b.a[1]-a.a[1])*a.tx,d2=(b.c[0]-a.a[0])*-a.tz+(b.c[1]-a.a[1])*a.tx;if(abs(d1)>.08||abs(d2)>.08)continue; // same line
     const s1=(b.a[0]-a.a[0])*a.tx+(b.a[1]-a.a[1])*a.tz,s2=(b.c[0]-a.a[0])*a.tx+(b.c[1]-a.a[1])*a.tz;
     if(min(a.L,max(s1,s2))-max(0,min(s1,s2))>=.5)return true;}return false;};
 const seen=new Set(),over=new Map();V.forEach((v,i)=>{v._i=i;v._a=abs(sgn(v.p));});
 const lower=(A,B)=>A.h<B.h||(A.h===B.h&&(A._a<B._a||(A._a===B._a&&A._i<B._i)));
 for(const L of G.values())for(let i=0;i<L.length;i++)for(let j=i+1;j<L.length;j++){const A=L[i],B=L[j];if(A.skip||B.skip)continue;
   const k=A._i<B._i?A._i*1e6+B._i:B._i*1e6+A._i;if(seen.has(k))continue;seen.add(k);
   if(min(A.h,B.h)-max(A.b,B.b)<.5||!shared(A,B))continue;
   const [lo,hi]=lower(A,B)?[A,B]:[B,A];let q=over.get(lo);if(!q)over.set(lo,q=[]);q.push(hi);}
 // a part under a part that was itself pulled in goes 10 cm further, so podium-under-tower-under-... never lines up again
 const lvl=new Map();for(const v of[...over.keys()].sort((a,b)=>lower(a,b)?1:-1)){let m=0;for(const u of over.get(v))m=max(m,lvl.get(u)||0);lvl.set(v,m+1);}
 const pull=[...lvl.keys()];for(const v of pull)v.p=inset(v.p,.1*lvl.get(v));
 for(const v of V){delete v._f;delete v._w;delete v._i;delete v._a;}
 if(TEST)console.log('floating building parts grounded:',grounded,'· coplanar walls pulled in:',pull.length);}

/* --- collision: building footprints + round props, in a spatial hash --- */
const HK=40,SH=new Map();
function hAdd(o,x0,z0,x1,z1){for(let i=floor(x0/HK);i<=floor(x1/HK);i++)for(let j=floor(z0/HK);j<=floor(z1/HK);j++){const k=hkey(i,j);let L=SH.get(k);if(!L)SH.set(k,L=[]);L.push(o);}}
for(const s of MAP.solids){if(!s.p)s.p=MAP.vols[s.v].p;const p=flat(s.p);let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of s.p){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}
  hAdd({p,x0,x1,z0,z1,h:s.h},x0-3,z0-3,x1+3,z1+3);}
function addCircle(x,z,r){hAdd({c:1,x,z,r},x-r-3,z-r-3,x+r+3,z+r+3);}
function solidAt(x,y,z){const L=SH.get(hkey(floor(x/HK),floor(z/HK)));if(!L)return false;
  for(const o of L){if(o.c||y>o.h||x<o.x0||x>o.x1||z<o.z0||z>o.z1||(__gs.IN&&__gs.IN.real&&!o.ins))continue;if(inPoly(x,z,o.p))return true;}return false;}
const PO={x:0,z:0,nx:0,nz:0};
function pushOut(px,pz,r){
  const L=SH.get(hkey(floor(px/HK),floor(pz/HK)));let hit=false;
  if(L)for(const o of L){
    if(__gs.IN&&__gs.IN.real&&!o.ins)continue; // up on the CN Tower deck only the deck's own walls count
    if(o.c){const dx=px-o.x,dz=pz-o.z,rs=r+o.r,d2=dx*dx+dz*dz;if(d2<rs*rs&&d2>1e-8){const d=sqrt(d2);PO.nx=dx/d;PO.nz=dz/d;px+=PO.nx*(rs-d);pz+=PO.nz*(rs-d);hit=true;}continue;}
    if(px<o.x0-r||px>o.x1+r||pz<o.z0-r||pz>o.z1+r)continue;
    const p=o.p,n=p.length>>1;let best=1e18,bx=0,bz=0;
    for(let i=0;i<n;i++){const ax=p[i*2],az=p[i*2+1],j=(i+1)%n,dx=p[j*2]-ax,dz=p[j*2+1]-az,l2=dx*dx+dz*dz||1;
      let t=((px-ax)*dx+(pz-az)*dz)/l2;t=t<0?0:t>1?1:t;const qx=ax+dx*t,qz=az+dz*t,d2=(px-qx)*(px-qx)+(pz-qz)*(pz-qz);if(d2<best){best=d2;bx=qx;bz=qz;}}
    const ins=inPoly(px,pz,p),d=sqrt(best);if(!ins&&d>=r)continue;
    let nx=(px-bx)/(d||1),nz=(pz-bz)/(d||1);if(ins){nx=-nx;nz=-nz;}
    const pen=ins?d+r:r-d;px+=nx*pen;pz+=nz*pen;PO.nx=nx;PO.nz=nz;hit=true;
  }
  PO.x=px;PO.z=pz;return hit;
}

await stage(.38,'Mapping sidewalks');
/* --- where you can stand: land minus harbour slips, inside the play area --- */
const WR=4,WX0=PLAY.x0-40,WZ0=PLAY.z0-40,WW=ceil((PLAY.x1-PLAY.x0+80)/WR),WHh=ceil((PLAY.z1-PLAY.z0+80)/WR),WALK=new Uint8Array(WW*WHh);
function rasterPoly(p,val){for(let j=0;j<WHh;j++){const z=WZ0+(j+.5)*WR,xs=[];
  for(let i=0,k=p.length-1;i<p.length;k=i++){const a=p[i],b=p[k];if((a[1]>z)!==(b[1]>z))xs.push(a[0]+(z-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
  xs.sort((a,b)=>a-b);for(let q=0;q+1<xs.length;q+=2){const i0=max(0,ceil((xs[q]-WX0)/WR-.5)),i1=min(WW-1,floor((xs[q+1]-WX0)/WR-.5));for(let i=i0;i<=i1;i++)WALK[j*WW+i]=val;}}}
rasterPoly(MAP.land,1);for(const p of MAP.landExtra||[])rasterPoly(p,1);
/* --- the harbour: a 4 m grid over the lake, islands (walkable) and mainland (with the slips cut out later), for boats --- */
const LK={x0:-3000,z0:700,x1:3100,z1:4400,R:4};LK.W=ceil((LK.x1-LK.x0)/LK.R);LK.H=ceil((LK.z1-LK.z0)/LK.R);
const ISLE=new Uint8Array(LK.W*LK.H),LAND=new Uint8Array(LK.W*LK.H);
function lkRaster(g,p,val){for(let j=0;j<LK.H;j++){const z=LK.z0+(j+.5)*LK.R,xs=[];
  for(let i=0,k=p.length-1;i<p.length;k=i++){const a=p[i],b=p[k];if((a[1]>z)!==(b[1]>z))xs.push(a[0]+(z-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
  xs.sort((a,b)=>a-b);for(let q=0;q+1<xs.length;q+=2){const i0=max(0,ceil((xs[q]-LK.x0)/LK.R-.5)),i1=min(LK.W-1,floor((xs[q+1]-LK.x0)/LK.R-.5));for(let i=i0;i<=i1;i++)g[j*LK.W+i]=val;}}}
for(const p of MAP.islands)lkRaster(ISLE,p,1);lkRaster(LAND,MAP.land,1);for(const p of MAP.landExtra||[])lkRaster(LAND,p,1);__gs.ISLE_ON=true;
const lkI=(x,z)=>x<LK.x0||x>=LK.x1||z<LK.z0||z>=LK.z1?-1:floor((z-LK.z0)/LK.R)*LK.W+floor((x-LK.x0)/LK.R);
function onIsland(x,z){const i=lkI(x,z);return i>=0&&ISLE[i]===1;}
function onWater(x,z){if(x<LK.x0+30||x>LK.x1-30||z>LK.z1-30)return false;const i=lkI(x,z);return i>=0&&!ISLE[i]&&!LAND[i];}
const ZONES=MAP.zones||[{id:'downtown',name:'Downtown',...PLAY}];
const zoneAt=(x,z,m=0)=>ZONES.find(Z=>x>Z.x0-m&&x<Z.x1+m&&z>Z.z0-m&&z<Z.z1+m);
function walkable(x,z){if(__gs.IN)return __late.inWalk(x,z); // inside a building: its own floor plan
  if(z>1560&&onIsland(x,z))return true;
  if(x<PLAY.x0||x>PLAY.x1||z<PLAY.z0||z>PLAY.z1)return false;const i=floor((x-WX0)/WR),j=floor((z-WZ0)/WR);return WALK[j*WW+i]===1;}
const BASINS=MAP.basins.filter(b=>{const c=polyCen(b);return walkable(c[0],c[1]);});
for(const b of BASINS){rasterPoly(b,0);lkRaster(LAND,b,0);lkRaster(ISLE,b,0);} // slips and the island lagoons are water

/* --- ground, lake, islands --- */
const PV=REAL?{map:realTex('concrete_pavement',3/REAL_SIZE.concrete_pavement),nrm:realTex('concrete_pavement',3/REAL_SIZE.concrete_pavement,'nor')}:paverTexture();PV.map.repeat.set(REAL?3/1.8:1,REAL?3/1.8:1);PV.nrm.repeat.copy(PV.map.repeat);
const waterMat=new THREE.MeshStandardMaterial({color:0x0d3a4c,roughness:.14,metalness:.75,normalMap:waterNormal(),normalScale:new THREE.Vector2(.22,.22)});
waterMat.normalMap.repeat.set(420,420);waterMat.normalMap.anisotropy=MAXANISO;
{const m=new THREE.Mesh(new THREE.PlaneGeometry(24000,24000).rotateX(-PI/2),waterMat);m.position.y=-.9;scene.add(m);}
// open ground is lawn; the dense cores (Financial District to the Annex, Yonge & Eglinton, North York Centre) are paved
const PAVED=[[-1250,-2350,1250,1400],[350,-6450,850,-5850],[1050,-13300,1800,-12100]];
let landMat=null;
{ // seawall along the shoreline
  const gb=new GB(),p=MAP.land,sgn=polyArea(p)>0?1:-1,col=C3(.55,.54,.5),S0=MAP.scene;
  for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length];if(a[1]<=S0.z0+1&&c[1]<=S0.z0+1)continue;if(abs(a[0]-c[0])<.01&&(abs(a[0]-S0.x0)<1||abs(a[0]-S0.x1)<1))continue;
    const dx=c[0]-a[0],dz=c[1]-a[1],L=hypot(dx,dz)||1,n=[sgn*dz/L,0,-sgn*dx/L];gb.quad([a[0],-1.8,a[1]],[c[0],-1.8,c[1]],[c[0],.02,c[1]],[a[0],.02,a[1]],n,col);}
  const m=new THREE.Mesh(gb.geo(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9}));scene.add(m);}
// grass: blades, clover, dry patches and worn soil, 8 m tile (the big parks are further broken up by a low-frequency patch map)
const grassTex=(()=>{const S=512,c=cv(S),g=c.getContext('2d');/*lawn*/g.fillStyle='#4f6e33';g.fillRect(0,0,S,S);
  for(let k=0;k<40;k++){const x=R()*S,y=R()*S,r=rr(30,140),gr=g.createRadialGradient(x,y,0,x,y,r),dry=R()<.4;gr.addColorStop(0,dry?'rgba(140,130,70,.28)':'rgba(40,70,25,.3)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;for(const dx of[-S,0,S])for(const dy of[-S,0,S]){g.save();g.translate(dx,dy);g.fillRect(x-r,y-r,2*r,2*r);g.restore();}}
  for(let k=0;k<52000;k++){const v=R(),x=R()*S,y=R()*S;g.strokeStyle=`rgba(${60+v*70|0},${90+v*70|0},${35+v*35|0},${.35+R()*.4})`;g.lineWidth=1;g.beginPath();g.moveTo(x,y);g.lineTo(x+rr(-1.5,1.5),y-rr(2,5));g.stroke();}
  for(let k=0;k<500;k++){g.fillStyle=R()<.5?'rgba(235,235,215,.5)':'rgba(240,220,90,.45)';g.fillRect(R()*S,R()*S,1.6,1.6);}
  return tex(c,true,1);})(),grassMat=realGround(decalMat({map:grassTex,vertexColors:true,roughness:.95},1),'leafy_grass',.85,false,true);
{const gb=new GB();polyInto(gb,MAP.land,0,1/8);for(const p of MAP.landExtra||[])polyInto(gb,p,0,1/8);
  landMat=new THREE.MeshStandardMaterial({map:grassTex,roughness:.95,color:0xe6ecdc});
  landMat.onBeforeCompile=sh=>{sh.uniforms.pav={value:PV.map};sh.uniforms.rects={value:PAVED.map(r=>new THREE.Vector4(...r))};
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vWp;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWp=(modelMatrix*vec4(transformed,1.)).xz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vWp;uniform sampler2D pav;uniform vec4 rects[3];
float hs(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}`)
      .replace('#include <map_fragment>',`float pv=0.,dm=1e9;for(int k=0;k<3;k++){vec4 r=rects[k];vec2 d=max(r.xy-vWp,vWp-r.zw);dm=min(dm,max(d.x,d.y));}if(dm<90.)pv=1.-smoothstep(-40.,40.,dm+(vn(vWp/55.)-.5)*90.);
vec4 gC=texture2D(map,vMapUv);vec4 pC=texture2D(pav,vWp/${REAL?'1.8':'4.'})*vec4(1.05,1.03,1.,1.)*1.25;diffuseColor*=mix(gC,pC,pv);`);};
  realGround(landMat,'leafy_grass',.85,false,true);const m=new THREE.Mesh(gb.geo(),landMat);m.receiveShadow=true;scene.add(m);}
// sidewalks along every street: wide paving on main streets, a grass boulevard between kerb and walk on residential ones
{const tiles=new Map(),T=600,gbAt=p=>{const i=floor(p[0][0]/T),j=floor(p[0][1]/T),k=i+','+j;let g=tiles.get(k);if(!g)tiles.set(k,g={gb:new GB(),x:(i+.5)*T,z:(j+.5)*T});return g.gb;},col=C3(1,1,1);const walk=(p,hw,res)=>{const gb=gbAt(p);const off=res?hw+1.4:hw+.05,w=res?1.7:max(2.8,min(4.5,hw*.45+1.5));
    for(const sd of[1,-1]){const q=offsetLine(p,sd*(off+w/2)),L=offsetLine(p,sd*off),Rr=offsetLine(p,sd*(off+w)),cum=cumOf(q);
      for(let i=0;i<q.length-1;i++){const va=cum[i]/3,vb=cum[i+1]/3,ua=0,ub=w/3;gb.quad([L[i][0],0,L[i][1]],[Rr[i][0],0,Rr[i][1]],[Rr[i+1][0],0,Rr[i+1][1]],[L[i+1][0],0,L[i+1][1]],UP,col,[ua,va],[ub,va],[ub,vb],[ua,vb]);}}};
  for(const e of EDGES){if(/^motorway|_link$/.test(e.c))continue;walk(e.p,e.hw,/^(residential|unclassified|living_street)$/.test(e.c));}
  for(const r of MAP.sceneRoads)if(r.hw<8)walk(r.p,r.hw,r.l<=2);
  const wm=decalMat({map:PV.map,normalMap:PV.nrm,color:0xe8e5de,roughness:.8},1.2);if(REAL)wm.color.setScalar(1.45);for(const t of tiles.values()){const m=addDecal(t.gb.geo(),wm,1.2);CULL.push({o:m,x:t.x,z:t.z,r2:1300*1300});}}
{const gb=new GB(),sand=new GB(),S=C3(.86,.78,.6);
  for(const p of MAP.islands){polyInto(gb,p,.45,1/8,C3(.95,1,.9));const sg=polyArea(p)>0?1:-1;
    for(let i=0;i<p.length;i++){const a=p[i],c=p[(i+1)%p.length],dx=c[0]-a[0],dz=c[1]-a[1],L=hypot(dx,dz)||1;sand.quad([a[0],-1.4,a[1]],[c[0],-1.4,c[1]],[c[0],.46,c[1]],[a[0],.46,a[1]],[sg*dz/L,0,-sg*dx/L],S);}}
  scene.add(new THREE.Mesh(gb.geo(),new THREE.MeshStandardMaterial({map:grassTex,vertexColors:true,roughness:1})));
  scene.add(new THREE.Mesh(sand.geo(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));}
{const gb=new GB(),cols=[C3(1.05,1.05,1),C3(.95,1,.92),C3(1.1,1.18,.95)];for(const g of MAP.green)polyInto(gb,g.p,0,1/8,cols[g.k]);addDecal(gb.geo(),grassMat,1);}
{const gb=new GB();for(const p of MAP.railLand)polyInto(gb,p,0,1/4);addDecal(gb.geo(),decalMat({map:noiseTexture('#6f665b',70,140,1,[1,.95,.85])},1),1);}
{const gb=new GB();for(const z of MAP.plazas)polyInto(gb,z.p,0,1/3);addDecal(gb.geo(),decalMat({map:PV.map,normalMap:PV.nrm,color:0xf0ece4,roughness:.75},1.5),1.5);}
{const gb=new GB();for(const b of BASINS)polyInto(gb,b,0,1);const wm=waterMat.clone();Object.assign(wm,{polygonOffset:true,polygonOffsetFactor:-1.5,polygonOffsetUnits:-6,depthWrite:false});addDecal(gb.geo(),wm,1.5);}

/* --- roads --- */
function asphaltBase(g,W,H,dens){g.fillStyle='#2c2d30';g.fillRect(0,0,W,H);
  for(let k=0;k<W*H/dens;k++){const v=24+R()*48|0;g.fillStyle=`rgba(${v},${v},${v},.3)`;g.fillRect(R()*W,R()*H,1+R()*1.5,1+R()*1.5);}
  for(let k=0;k<8;k++){g.fillStyle=`rgba(20,20,22,${.04+R()*.08})`;g.beginPath();g.ellipse(R()*W,R()*H,10+R()*40,6+R()*24,R()*3,0,7);g.fill();}}
const RTX=new Map();
function roadTex(ow,lanes,Wm){
  const key=ow+'|'+lanes+'|'+Wm;if(RTX.has(key))return RTX.get(key);
  const W=256,H=512,c=cv(W,H),g=c.getContext('2d'),px=W/Wm,py=H/12;
  asphaltBase(g,W,H,10);
  const lanesW=min(Wm,lanes*3.3),st=(Wm-lanesW)/2;
  g.fillStyle='rgba(16,16,18,.18)';for(let k=0;k<lanes;k++){const c0=(st+k*3.3+.6)*px,c1=(st+k*3.3+2.2)*px;g.fillRect(c0,0,.6*px,H);g.fillRect(c1,0,.6*px,H);}
  g.fillStyle='rgba(12,12,14,.5)';g.fillRect(0,0,.3*px,H);g.fillRect(W-.3*px,0,.3*px,H);
  const lw=max(2,.12*px),dash=x=>{g.fillStyle='rgba(236,236,230,.88)';g.fillRect(x-lw/2,0,lw,3*py);g.fillRect(x-lw/2,6*py,lw,3*py);},line=(x,col)=>{g.fillStyle=col;g.fillRect(x-lw/2,0,lw,H);};
  if(!ow&&lanes>=2){const cx=W/2;line(cx-.13*px,'#d9b23c');line(cx+.13*px,'#d9b23c');for(let k=1;k<lanes/2;k++){dash(cx-k*3.3*px);dash(cx+k*3.3*px);}}
  else for(let k=1;k<lanes;k++)dash((st+k*3.3)*px);
  const t=tex(c,true);t.wrapS=THREE.ClampToEdgeWrapping;RTX.set(key,t);return t;}
{
  const groups=new Map(),gbFor=k=>{let g=groups.get(k);if(!g)groups.set(k,g=new GB());return g;},keyOf=(ow,l,hw)=>ow+'|'+l+'|'+max(4,round(hw*2));
  for(const e of EDGES){const A=NODES[e.a],B=NODES[e.b],ta=min(A.trim,e.L*.5),tb=min(B.trim,e.L*.5);if(e.L-ta-tb<.4)continue;
    stripInto(gbFor(keyOf(e.ow,e.l,e.hw)),(ta||tb)?cutLine(e.p,e.cum,ta,e.L-tb):e.p,e.hw,0,ta);}
  for(const r of MAP.sceneRoads)stripInto(gbFor(keyOf(r.ow,r.l,r.hw)),r.p,r.hw,0,0);
  for(const [k,gb] of groups){const [ow,l,W]=k.split('|').map(Number);addDecal(gb.geo(),realGround(decalMat({map:roadTex(ow,l,W),roughness:.88},2),'asphalt_02',.9,true),2);}
}
const plainAsphalt=(()=>{const c=cv(256,256);asphaltBase(c.getContext('2d'),256,256,8);return tex(c,true);})();
{ // intersections
  const gb=new GB();
  for(const n of NODES){if(!n.trim)continue;const pts=[[n.x,n.z]];
    for(const i of n.e){const e=EDGES[i],s=e.a===n.i?min(n.trim,e.L):max(0,e.L-n.trim);edgePt(e,s,_lp);
      pts.push([_lp.x-_lp.tz*e.hw,_lp.z+_lp.tx*e.hw],[_lp.x+_lp.tz*e.hw,_lp.z-_lp.tx*e.hw]);}
    const h=hull(pts);for(let k=1;k<h.length-1;k++){const a=h[0],b=h[k],c=h[k+1];gb.tri([a[0],0,a[1]],[b[0],0,b[1]],[c[0],0,c[1]],UP,WHITE,[a[0]/10,a[1]/10],[b[0]/10,b[1]/10],[c[0]/10,c[1]/10]);}}
  addDecal(gb.geo(),realGround(decalMat({map:plainAsphalt,roughness:.9},3),'asphalt_02',.9,true),3);
}
// ground kept clear of made-up park trees: lots, playgrounds, pools, track fields
const NT=new Map(),NTK=100;
function ntAdd(p){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const q of p){x0=min(x0,q[0]);x1=max(x1,q[0]);z0=min(z0,q[1]);z1=max(z1,q[1]);}const o={fp:flat(p),x0:x0-2,x1:x1+2,z0:z0-2,z1:z1+2};
  for(let i=floor(o.x0/NTK);i<=floor(o.x1/NTK);i++)for(let j=floor(o.z0/NTK);j<=floor(o.z1/NTK);j++){const k=i+','+j;let L=NT.get(k);if(!L)NT.set(k,L=[]);L.push(o);}}
function ntHit(x,z){for(const o of NT.get(floor(x/NTK)+','+floor(z/NTK))||[])if(x>o.x0&&x<o.x1&&z>o.z0&&z<o.z1&&inPoly(x,z,o.fp))return true;return false;}
// parking lots (OpenStreetMap): asphalt, painted stall lines where the lot is laid out, wheel stops at the head of each stall
{const tiles=new Map(),T=600,at=(x,z)=>{const i=floor(x/T),j=floor(z/T),k=i+','+j;let g=tiles.get(k);if(!g)tiles.set(k,g={a:new GB(),l:new GB(),x:(i+.5)*T,z:(j+.5)*T});return g;};
  const W=C3(.92,.92,.88),Y=C3(.9,.75,.2),SW=2.7,SD=5.4,lw=.11;
  for(const L of MAP.lots||[]){const [cx,cz]=polyCen(L.p),g=at(cx,cz);ntAdd(L.p);polyInto(g.a,L.p,0,1/10,C3(1.12,1.12,1.1));if(!L.s)continue;
    for(const [x,z,th] of L.s){const fx=sin(th),fz=cos(th),sx=fz,sz=-fx; // forward (into the aisle) and sideways
      for(const sd of[-1,1]){const ox=x+sx*sd*SW/2,oz=z+sz*sd*SW/2,a=[ox-fx*SD/2,oz-fz*SD/2],b=[ox+fx*SD/2,oz+fz*SD/2];
        g.l.quad([a[0]-sx*lw,0,a[1]-sz*lw],[a[0]+sx*lw,0,a[1]+sz*lw],[b[0]+sx*lw,0,b[1]+sz*lw],[b[0]-sx*lw,0,b[1]-sz*lw],UP,W);}
      const bx=x-fx*(SD/2-.45),bz=z-fz*(SD/2-.45);g.l.quad([bx-sx*.8-fx*.1,0,bz-sz*.8-fz*.1],[bx+sx*.8-fx*.1,0,bz+sz*.8-fz*.1],[bx+sx*.8+fx*.1,0,bz+sz*.8+fz*.1],[bx-sx*.8+fx*.1,0,bz-sz*.8+fz*.1],UP,Y);}}
  const am=realGround(decalMat({map:plainAsphalt,vertexColors:true,roughness:.9},1.15),'asphalt_02',.9,true),lm=decalMat({vertexColors:true,roughness:.7},1.17);
  for(const t of tiles.values()){const m=addDecal(t.a.geo(),am,1.15);CULL.push({o:m,x:t.x,z:t.z,r2:2400*2400});if(!t.l.empty){const n=addDecal(t.l.geo(),lm,1.17);CULL.push({o:n,x:t.x,z:t.z,r2:700*700});}}}
{ // zebra crosswalks + stop lines at signalised intersections
  const zc=cv(64,8),zg=zc.getContext('2d');zg.fillStyle='#f2f2ee';zg.fillRect(0,0,30,8);
  const zt=new THREE.CanvasTexture(zc);zt.wrapS=zt.wrapT=THREE.RepeatWrapping;zt.colorSpace=THREE.SRGBColorSpace;
  const gb=new GB(),o0={},o1={},W=[.2,.5];
  for(const n of NODES){if(!n.sig)continue;for(const i of n.e){const e=EDGES[i];if(e.hw<3.5||e.L<n.trim+9)continue;
    const fa=e.a===n.i,s0=fa?n.trim+.3:e.L-n.trim-.3,s1=fa?n.trim+3.3:e.L-n.trim-3.3;edgePt(e,s0,o0);edgePt(e,s1,o1);const hw=e.hw-.3,w=hw*2;
    gb.quad([o0.x-o0.tz*hw,0,o0.z+o0.tx*hw],[o0.x+o0.tz*hw,0,o0.z-o0.tx*hw],[o1.x+o1.tz*hw,0,o1.z-o1.tx*hw],[o1.x-o1.tz*hw,0,o1.z+o1.tx*hw],UP,WHITE,[0,0],[w,0],[w,1],[0,1]);
    if(!fa&&e.ow)continue;if(fa&&e.ow)continue; // one-way streets: skip the stop line on the exit side
    const sA=fa?n.trim+3.9:e.L-n.trim-3.9,sB=fa?n.trim+4.4:e.L-n.trim-4.4;edgePt(e,sA,o0);edgePt(e,sB,o1);
    const sd=fa?-1:1; // incoming lanes are right of travel toward the node
    const q=(o,f)=>[o.x-o.tz*f*sd,0,o.z+o.tx*f*sd];gb.quad(q(o0,0),q(o0,hw),q(o1,hw),q(o1,0),UP,WHITE,W,W,W,W);}}
  addDecal(gb.geo(),decalMat({map:zt,alphaTest:.5,roughness:.6},4),4);
}
{ // streetcar and railway tracks, overhead wires
  const gb=new GB(),wire=[];
  for(const l of MAP.tram){for(const off of[-.75,.75])stripInto(gb,offsetLine(l,off),.035,0,0);for(let k=1;k<l.length;k++)wire.push(l[k-1][0],5.9,l[k-1][1],l[k][0],5.9,l[k][1]);}
  for(const l of MAP.rail)for(const off of[-.72,.72])stripInto(gb,offsetLine(l,off),.04,0,0);
  addDecal(gb.geo(),decalMat({color:0x55585c,metalness:.6,roughness:.45,envMapIntensity:.4},5),5);
  const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(wire,3));
  scene.add(new THREE.LineSegments(wg,new THREE.LineBasicMaterial({color:0x111214,transparent:true,opacity:.75})));
}

/* --- Gardiner Expressway (elevated) --- */
{
  const deck=new GB(),top=new Map(),cols=[],C=C3(.62,.61,.58);
  for(const g of MAP.gardiner){if(!g.el||g.p.length<2)continue;const hw=max(5.2,g.l*3.5/2+.9),y=11,L=offsetLine(g.p,-hw),Rr=offsetLine(g.p,hw);
    const key=g.l+'|'+round(hw*2);let tg=top.get(key);if(!tg)top.set(key,tg=new GB());stripInto(tg,g.p,hw,y+.03,0);
    for(let i=0;i<g.p.length-1;i++){const a=L[i],b=L[i+1],c=Rr[i],d=Rr[i+1];
      deck.quad([a[0],y-1.4,a[1]],[c[0],y-1.4,c[1]],[d[0],y-1.4,d[1]],[b[0],y-1.4,b[1]],[0,-1,0],C);
      for(const [p0,p1] of[[a,b],[c,d]]){const dx=p1[0]-p0[0],dz=p1[1]-p0[1],l=hypot(dx,dz)||1,mx=(p0[0]+p1[0])/2,mz=(p0[1]+p1[1])/2,cx=(g.p[i][0]+g.p[i+1][0])/2,cz=(g.p[i][1]+g.p[i+1][1])/2;
        let n=[dz/l,0,-dx/l];if(n[0]*(mx-cx)+n[2]*(mz-cz)<0)n=[-n[0],0,-n[2]];deck.quad([p0[0],y-1.4,p0[1]],[p1[0],y-1.4,p1[1]],[p1[0],y+1.05,p1[1]],[p0[0],y+1.05,p0[1]],n,C);}}
    const cum=cumOf(g.p);for(let s=14;s<cum[cum.length-1]-5;s+=32){let k=1;while(k<cum.length-1&&cum[k]<s)k++;const t=(s-cum[k-1])/((cum[k]-cum[k-1])||1),x=g.p[k-1][0]+(g.p[k][0]-g.p[k-1][0])*t,z=g.p[k-1][1]+(g.p[k][1]-g.p[k-1][1])*t;
      cols.push(mat4(x,0,z,0,1,1,1));if(x>PLAY.x0&&x<PLAY.x1&&z>PLAY.z0&&z<PLAY.z1)addCircle(x,z,1.1);}}
  const dm=new THREE.Mesh(deck.geo(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}));dm.castShadow=dm.receiveShadow=true;scene.add(dm);
  for(const [k,gb] of top){const [l,W]=k.split('|').map(Number);const m=new THREE.Mesh(gb.geo(),new THREE.MeshStandardMaterial({map:roadTex(1,l,W),roughness:.88}));m.receiveShadow=true;scene.add(m);}
  instanced(new THREE.CylinderGeometry(.9,1.05,9.6,12).translate(0,4.8,0),new THREE.MeshStandardMaterial({color:0x9c9a94,roughness:.85}),cols,null,true);
}

/* --- buildings: every OpenStreetMap footprint / 3D part, extruded with its real height and roof shape --- */
const STY={GLASS:0,STONE:1,BRICK:2,CONDO:3,DARK:4,GOLD:5,SHOP:6,PLAIN:7,CN:8,AWN:9,
  ARCH:10,CRYS:11,RIB:12,CHGL:13,SHARP:14,RTH:15,TITAN:16,GALL:17,BRUT:18,ROOF:19,STAD:20}; // 10+: landmark facades (see landmarkTextures)
// texture tile size in metres [width, height] for the facade styles that carry a window texture
const FTILE={0:[48,62.4],1:[48,57.6],2:[48,52.8],3:[48,47.2],4:[48,62.4],5:[48,62.4],10:[48,67.2],11:[40,40],12:[24,24],13:[48,59.2],16:[24,24],17:[48,24],18:[48,48],19:[8,8],20:[32,40]};
const AWNPAL=[0x2f5d46,0xc9853a,0x6f9a58,0x5b1f24,0xb3261e,0x1d2b45,0x161616,0x7d1f2f,0x2f5e5e,0xd8cfb8,0x8a2b2b,0x3b6e8f];
function addAwnings(key,a,c,tx,tz,n,b,L,typeAt,nb,awnAt){ // 3D fabric awnings over the bays whose shop has one
  const g=bgb(key,STY.AWN),bw=L/nb;
  for(let j=0;j<nb;j++){if(typeAt(j)<0)continue;const ac=awnAt?awnAt(j):SHOPS[typeAt(j)].awn;if(!ac)continue;const s0=j*bw+.35,s1=(j+1)*bw-.35;if(s1-s0<2.4)continue;
    const col=new THREE.Color(ac),P=(s,o,y)=>[a[0]+tx*s+n[0]*o,b+y,a[1]+tz*s+n[2]*o],y0=3.25,y1=2.72,out=1.35,sl=[n[0]*.37,.93,n[2]*.37];
    const A=P(s0,.02,y0),B=P(s1,.02,y0),C=P(s1,out,y1),D=P(s0,out,y1),u1=(s1-s0)/.5;
    g.quad(A,B,C,D,sl,col,[0,0],[u1,0],[u1,1],[0,1]);g.quad(D,C,P(s1,out,y1-.28),P(s0,out,y1-.28),n,col,[0,0],[u1,0],[u1,.3],[0,.3]);
    g.tri(A,D,P(s0,out,y1-.28),[-tx,0,-tz],col,[0,0],[1,1],[1,.7]);g.tri(B,C,P(s1,out,y1-.28),[tx,0,tz],col,[0,0],[1,1],[1,.7]);}}
const FH=[3.9,3.6,3.3,2.95,3.9,3.9];
const TINTS=[[C3(.86,.93,.98),C3(.86,.96,.92),C3(.95,.95,.97),C3(.76,.82,.9),C3(.8,.82,.85),C3(1,.97,.92)],
  [C3(1,1,1),C3(.92,.86,.78),C3(.8,.83,.87),C3(.97,.92,.82),C3(.72,.72,.74),C3(1.08,1.02,.92)],
  [C3(1,1,1),C3(.82,.7,.62),C3(1.15,.98,.82),C3(1.45,1.28,.92),C3(1.75,1.72,1.66),C3(.72,.76,.86),C3(1.1,1.05,.95),C3(.95,.8,.75)],
  [C3(1,1,1),C3(.9,1,1.05),C3(1,1,.95),C3(.85,.92,1)],[C3(1,1,1),C3(.9,.85,.8)],[C3(1,1,1)]];
const HOUSEK=new Set(['house','semidetached_house','terrace','detached','residential_house','bungalow']);
const parseCol=s=>{if(!s)return null;const c=new THREE.Color();if(/^[0-9a-f]{6}$/.test(s))s='#'+s;if(/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s))return c.setStyle(s);const k=s.replace(/grey/g,'gray');return THREE.Color.NAMES[k]!==undefined?c.setHex(THREE.Color.NAMES[k]).convertSRGBToLinear():null;};
// landmark facades: each is a full PBR set (colour, roughness/metal, night windows, relief) tiled like the generic facades
function texSet(W,H,fn,str){const ca=cv(W,H),ce=cv(W,H),ch=cv(W,H),co=cv(W,H),a=ca.getContext('2d'),e=ce.getContext('2d'),h=ch.getContext('2d'),o=co.getContext('2d');
  e.fillStyle='#000';e.fillRect(0,0,W,H);h.fillStyle='#c8c8c8';h.fillRect(0,0,W,H);o.fillStyle='rgb(255,235,0)';o.fillRect(0,0,W,H);
  fn(a,e,h,o,W,H);return{map:tex(ca,true),orm:tex(co,false),emis:tex(ce,true),nrm:normalFromHeight(ch,str||2.2)};}
const ORM=(r,m)=>`rgb(255,${r*255|0},${m*255|0})`;
const litWin=(e,x,y,w,h,p)=>{if(R()<p){const b=rr(.45,1),warm=R()<.75;e.fillStyle=warm?`rgb(${255*b|0},${200*b|0},${130*b|0})`:`rgb(${200*b|0},${222*b|0},${255*b|0})`;e.fillRect(x,y,w,h);}};
function landmarkTextures(){
  const T={};
  // 10 · Romanesque / Gothic stone: coursed ashlar, round-arched windows with voussoirs, a string course every floor (cell 3 m x 4.2 m)
  T[STY.ARCH]=texSet(1024,1024,(a,e,h,o)=>{const cs=64;
    a.fillStyle='#c4b49c';a.fillRect(0,0,1024,1024);speckle(a,1024,26000,120,210,.16);
    for(let y=0;y<1024;y+=11){a.fillStyle='rgba(70,55,40,.32)';a.fillRect(0,y,1024,1.4);h.fillStyle='#9a9a9a';h.fillRect(0,y,1024,1.4);
      for(let x=((y/11)%2)*14;x<1024;x+=28){a.fillRect(x,y,1.3,11);if(R()<.35){a.fillStyle=`rgba(${R()<.5?255:60},${R()<.5?220:40},180,.07)`;a.fillRect(x,y,28,11);a.fillStyle='rgba(70,55,40,.32)';}}}
    for(let j=0;j<16;j++)for(let i=0;i<16;i++){const x=i*cs,y=j*cs,ww=26,cx=x+cs/2,top=y+14,bot=y+56,rx=ww/2,ry=rx*3/4.2;
      // string course at the floor line
      a.fillStyle='#d8cbb5';a.fillRect(x,y+cs-5,cs,5);h.fillStyle='#e8e8e8';h.fillRect(x,y+cs-5,cs,5);
      // voussoirs + window
      a.fillStyle='#ddd0b8';a.beginPath();a.ellipse(cx,top+ry,rx+5,ry+5,0,PI,0);a.lineTo(cx+rx+5,bot);a.lineTo(cx-rx-5,bot);a.fill();
      a.fillStyle='rgba(80,62,45,.5)';for(let k=0;k<=8;k++){const t=PI+k/8*PI;a.fillRect(cx+cos(t)*(rx+2.5)-.6,top+ry+sin(t)*(ry+2.5)-.6,1.4,1.4);}
      const v=R();a.fillStyle=`rgb(${38+v*20|0},${44+v*20|0},${52+v*22|0})`;a.beginPath();a.ellipse(cx,top+ry,rx,ry,0,PI,0);a.lineTo(cx+rx,bot);a.lineTo(cx-rx,bot);a.fill();
      a.fillStyle='#cfc2aa';a.fillRect(cx-1,top,2,bot-top);a.fillRect(cx-rx,top+ry+10,ww,2);a.fillRect(cx-rx-4,bot,ww+8,4);
      h.fillStyle='#3a3a3a';h.beginPath();h.ellipse(cx,top+ry,rx,ry,0,PI,0);h.lineTo(cx+rx,bot);h.lineTo(cx-rx,bot);h.fill();
      o.fillStyle=ORM(.08,.9);o.fillRect(cx-rx,top,ww,bot-top);
      if(R()<.36){e.save();e.beginPath();e.ellipse(cx,top+ry,rx,ry,0,PI,0);e.lineTo(cx+rx,bot);e.lineTo(cx-rx,bot);e.clip();litWin(e,cx-rx,top,ww,bot-top,1);e.restore();}}
  },2.4);
  // 11 · ROM Crystal: brushed aluminium bands broken by slanting glass slashes
  T[STY.CRYS]=texSet(1024,1024,(a,e,h,o)=>{
    for(let y=0;y<1024;y+=16){const v=R()*14;a.fillStyle=`rgb(${184+v|0},${188+v|0},${192+v|0})`;a.fillRect(0,y,1024,16);a.fillStyle='rgba(90,95,100,.6)';a.fillRect(0,y,1024,1.5);h.fillStyle='#8a8a8a';h.fillRect(0,y,1024,1.5);}
    o.fillStyle=ORM(.38,.85);o.fillRect(0,0,1024,1024);
    for(let k=0;k<9;k++){const x=R()*1024,y=R()*1024,L=rr(260,620),an=rr(-.7,.7)+(R()<.5?0:PI/2*.0),w=rr(10,26);
      for(const dx of[-1024,0,1024])for(const dy of[-1024,0,1024]){a.save();a.translate(x+dx,y+dy);a.rotate(an);a.fillStyle='#1b232b';a.fillRect(-L/2,-w/2,L,w);a.fillStyle='rgba(140,170,190,.35)';a.fillRect(-L/2,-w/2,L,2);a.restore();
        e.save();e.translate(x+dx,y+dy);e.rotate(an);e.fillStyle='rgb(255,226,170)';e.globalAlpha=.8;e.fillRect(-L/2,-w/2,L,w);e.restore();
        o.save();o.translate(x+dx,y+dy);o.rotate(an);o.fillStyle=ORM(.05,1);o.fillRect(-L/2,-w/2,L,w);o.restore();
        h.save();h.translate(x+dx,y+dy);h.rotate(an);h.fillStyle='#555';h.fillRect(-L/2,-w/2,L,w);h.restore();}}
  },1.6);
  // 12 · City Hall's precast concrete shells: closely spaced vertical ribs, no windows
  T[STY.RIB]=texSet(512,512,(a,e,h,o)=>{a.fillStyle='#dcd9d1';a.fillRect(0,0,512,512);speckle(a,512,9000,150,215,.2);
    for(let x=0;x<512;x+=16){const g=a.createLinearGradient(x,0,x+16,0);g.addColorStop(0,'rgba(60,58,52,.22)');g.addColorStop(.35,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(60,58,52,.05)');a.fillStyle=g;a.fillRect(x,0,16,512);
      const hg=h.createLinearGradient(x,0,x+16,0);hg.addColorStop(0,'#666');hg.addColorStop(.4,'#eee');hg.addColorStop(1,'#999');h.fillStyle=hg;h.fillRect(x,0,16,512);}
    o.fillStyle=ORM(.9,0);o.fillRect(0,0,512,512);
    for(let y=0;y<512;y+=79){a.fillStyle='rgba(70,66,60,.25)';a.fillRect(0,y,512,1.5);}
  },3);
  // 13 · City Hall's inner faces: tall narrow windows between thin white concrete mullions (1.5 m bays)
  T[STY.CHGL]=texSet(1024,1024,(a,e,h,o)=>{const cw=32,chh=64;a.fillStyle='#e9e7e1';a.fillRect(0,0,1024,1024);o.fillStyle=ORM(.85,0);o.fillRect(0,0,1024,1024);h.fillStyle='#e0e0e0';h.fillRect(0,0,1024,1024);
    for(let j=0;j<16;j++)for(let i=0;i<32;i++){const x=i*cw,y=j*chh,v=R();a.fillStyle=`rgb(${34+v*18|0},${52+v*18|0},${60+v*20|0})`;a.fillRect(x+4,y+6,cw-8,chh-17);
      a.fillStyle='rgba(150,180,190,.3)';a.fillRect(x+4,y+6,cw-8,3);o.fillStyle=ORM(.06,1);o.fillRect(x+4,y+6,cw-8,chh-17);h.fillStyle='#555';h.fillRect(x+4,y+6,cw-8,chh-17);litWin(e,x+4,y+6,cw-8,chh-17,.3);}
  },2);
  // 14 · Sharp Centre "tabletop": white skin with a scatter of black pixels and a few windows (one 9 m storey band, 40 m wide)
  T[STY.SHARP]=texSet(1024,256,(a,e,h,o)=>{a.fillStyle='#f1f1ee';a.fillRect(0,0,1024,256);o.fillStyle=ORM(.55,.1);o.fillRect(0,0,1024,256);
    for(let k=0;k<170;k++){const s=[6,9,13,18,26][floor(R()*5)],x=floor(R()*1024/6)*6,y=floor(R()*256/6)*6,w=s*(R()<.5?1:2);a.fillStyle='#121212';a.fillRect(x,y,w,s);}
    for(let k=0;k<14;k++){const x=R()*980,y=rr(60,170),w=rr(30,90),hh=rr(16,40);a.fillStyle='#29323a';a.fillRect(x,y,w,hh);o.fillStyle=ORM(.06,1);o.fillRect(x,y,w,hh);litWin(e,x,y,w,hh,.7);}
  },.8);
  // 15 · Roy Thomson Hall: diamond lattice of blue-grey glass on a silver frame
  T[STY.RTH]=texSet(512,512,(a,e,h,o)=>{a.fillStyle='#c9ced2';a.fillRect(0,0,512,512);o.fillStyle=ORM(.3,.9);o.fillRect(0,0,512,512);h.fillStyle='#eee';h.fillRect(0,0,512,512);
    const n=4,s=512/n;for(let j=-1;j<=n;j++)for(let i=-1;i<=n;i++)for(const off of[0,.5]){const cx=(i+off)*s,cy=(j+off)*s,r=s/2-4,v=R();
      const path=g=>{g.beginPath();g.moveTo(cx,cy-r);g.lineTo(cx+r,cy);g.lineTo(cx,cy+r);g.lineTo(cx-r,cy);g.closePath();};
      a.fillStyle=`rgb(${78+v*22|0},${90+v*22|0},${104+v*22|0})`;path(a);a.fill();o.fillStyle=ORM(.05,1);path(o);o.fill();h.fillStyle='#888';path(h);h.fill();
      e.fillStyle=`rgba(255,${200+v*30|0},140,${.35+v*.4})`;path(e);e.fill();}
  },1.4);
  // 16 · AGO's blue titanium cladding: overlapping shingles that catch the light differently
  T[STY.TITAN]=texSet(512,512,(a,e,h,o)=>{for(let y=0;y<512;y+=32)for(let x=((y/32)%2)*24;x<560;x+=48){const v=R();a.fillStyle=`rgb(${62+v*22|0},${110+v*30|0},${178+v*30|0})`;a.fillRect(x-24,y,46,30);
      a.fillStyle='rgba(20,40,80,.35)';a.fillRect(x-24,y+28,46,2);h.fillStyle=`rgb(${150+v*80|0},${150+v*80|0},${150+v*80|0})`;h.fillRect(x-24,y,46,30);}
    o.fillStyle=ORM(.3,.95);o.fillRect(0,0,512,512);},1.2);
  // 17 · AGO Galleria Italia: Douglas-fir ribs behind the billowing glass wall on Dundas
  T[STY.GALL]=texSet(1024,512,(a,e,h,o)=>{const g=a.createLinearGradient(0,0,0,512);g.addColorStop(0,'#9fb6c4');g.addColorStop(1,'#5d7282');a.fillStyle=g;a.fillRect(0,0,1024,512);o.fillStyle=ORM(.06,1);o.fillRect(0,0,1024,512);
    for(let x=0;x<1024;x+=43){a.fillStyle='#9a6a3e';a.fillRect(x,0,9,512);a.fillStyle='rgba(255,220,170,.25)';a.fillRect(x,0,2,512);o.fillStyle=ORM(.7,0);o.fillRect(x,0,9,512);h.fillStyle='#fff';h.fillRect(x,0,9,512);e.fillStyle='rgba(255,190,120,.55)';e.fillRect(x+9,0,34,512);}
    for(let y=0;y<512;y+=85){a.fillStyle='rgba(220,225,230,.7)';a.fillRect(0,y,1024,3);}
  },1.2);
  // 18 · board-formed concrete (Moriyama's Science Centre, Robarts): heavy horizontal formwork, deep-set ribbon windows
  T[STY.BRUT]=texSet(1024,1024,(a,e,h,o)=>{a.fillStyle='#a9a59c';a.fillRect(0,0,1024,1024);speckle(a,1024,30000,120,200,.2);o.fillStyle=ORM(.92,0);o.fillRect(0,0,1024,1024);
    for(let y=0;y<1024;y+=16){const v=R()*16;a.fillStyle=`rgba(${80+v|0},${78+v|0},${72+v|0},.18)`;a.fillRect(0,y,1024,2);h.fillStyle='#9a9a9a';h.fillRect(0,y,1024,2);}
    for(let j=0;j<4;j++){const y=j*256+150;a.fillStyle='#1e2328';a.fillRect(0,y,1024,46);a.fillStyle='rgba(0,0,0,.35)';a.fillRect(0,y-10,1024,10);h.fillStyle='#303030';h.fillRect(0,y,1024,46);o.fillStyle=ORM(.08,1);o.fillRect(0,y,1024,46);
      for(let x=0;x<1024;x+=64){a.fillStyle='#6d6a64';a.fillRect(x,y,4,46);litWin(e,x+4,y,60,46,.35);}}
  },2.6);
  // 19 · flat roofs: tar-and-gravel / membrane with seams, drains and weathering streaks (8 m tile)
  T[STY.ROOF]=texSet(512,512,(a,e,h,o)=>{a.fillStyle='#8d8b86';a.fillRect(0,0,512,512);speckle(a,512,26000,90,190,.35);o.fillStyle=ORM(.96,0);o.fillRect(0,0,512,512);
    for(let k=0;k<26;k++){const g=a.createRadialGradient(R()*512,R()*512,0,R()*512,R()*512,rr(30,120));{const v=R()<.5?40:200;g.addColorStop(0,`rgba(${v},${v},${v-4},.12)`);}g.addColorStop(1,'rgba(0,0,0,0)');a.fillStyle=g;a.fillRect(0,0,512,512);}
    for(let y=0;y<512;y+=64){a.fillStyle='rgba(50,48,45,.35)';a.fillRect(0,y,512,2);h.fillStyle='#e6e6e6';h.fillRect(0,y,512,3);}
    a.fillStyle='#3a3a3a';a.beginPath();a.arc(256,256,7,0,7);a.fill();h.fillStyle='#555';h.beginPath();h.arc(256,256,7,0,7);h.fill();},1.2);
  // 20 · Rogers Centre: white precast panels between deep structural ribs, dark concourse openings, a blue band under the roof (32 m x 40 m tile)
  T[STY.STAD]=texSet(1024,1280,(a,e,h,o,W,H)=>{a.fillStyle='#dcdcd8';a.fillRect(0,0,W,H);speckle(a,W,22000,170,235,.18);o.fillStyle=ORM(.8,0);o.fillRect(0,0,W,H);h.fillStyle='#bcbcbc';h.fillRect(0,0,W,H);
    const y=m=>H-m/40*H; // metres up the wall -> pixels
    for(const [m0,m1] of[[4.5,7],[15,17.5],[26,28.5]]){a.fillStyle='#24272b';a.fillRect(0,y(m1),W,y(m0)-y(m1));h.fillStyle='#4a4a4a';h.fillRect(0,y(m1),W,y(m0)-y(m1));o.fillStyle=ORM(.3,.1);o.fillRect(0,y(m1),W,y(m0)-y(m1));
      for(let x=0;x<W;x+=21){a.fillStyle='rgba(255,255,255,.1)';a.fillRect(x,y(m1),2,y(m0)-y(m1));}if(m0===4.5)for(let x=0;x<W;x+=64)litWin(e,x+6,y(m1),52,y(m0)-y(m1),.6);}
    for(let x=0;x<W;x+=256){const g=a.createLinearGradient(x,0,x+64,0);g.addColorStop(0,'#c9c9c4');g.addColorStop(.5,'#f2f2ee');g.addColorStop(1,'#b5b5b0');a.fillStyle=g;a.fillRect(x,0,64,H);
      const hg=h.createLinearGradient(x,0,x+64,0);hg.addColorStop(0,'#888');hg.addColorStop(.5,'#fff');hg.addColorStop(1,'#888');h.fillStyle=hg;h.fillRect(x,0,64,H);}
    for(let m=0;m<40;m+=3.5){a.fillStyle='rgba(90,90,85,.25)';a.fillRect(0,y(m),W,2);}
    a.fillStyle='#1d5fd1';a.fillRect(0,y(33),W,y(31.6)-y(33));e.fillStyle='rgba(60,130,255,.6)';e.fillRect(0,y(33),W,y(31.6)-y(33));},2.4);
  return T;
}
// named buildings whose real materials the generic rules would get wrong: [style, wall tint, roof colour, {rs, lean}]
const COPPER=C3(.1,.24,.17),SLATE=C3(.06,.065,.07),SANDST=C3(1.02,.8,.7);
function lmStyle(v){
  const n=v.n;if(!n)return null;
  if(n==='Old City Hall')return[STY.ARCH,SANDST,v.b>=70?COPPER:C3(.09,.12,.11)];
  if(n==='Ontario Legislative Building')return[STY.ARCH,C3(1.02,.74,.66),SLATE,{rs:v.rs===4?3:v.rs}];
  if(/^(University College|Hart House|Knox College|Trinity College|Victoria College|Wycliffe College|Soldiers' Tower)$/.test(n))return[STY.ARCH,C3(.98,.95,.88),SLATE];
  if(n==='Royal Ontario Museum')return v.col==='#c0c0c0'?[STY.CRYS,C3(1.05,1.05,1.06),C3(.62,.64,.66),{lean:.1}]:[STY.ARCH,C3(1.08,.95,.8),null];
  if(n==='Art Gallery of Ontario')return v.col==='#add8e6'?[STY.GALL,WHITE,C3(.5,.6,.68)]:v.col==='#1e90ff'?[STY.TITAN,WHITE,C3(.12,.3,.62)]:[STY.STONE,C3(1.3,1.3,1.28),null];
  if(/Royal York/.test(n))return[STY.STONE,C3(1.18,1.08,.94),COPPER];
  if(/^St\.? Lawrence (Market|Hall)/.test(n))return v.col==='#4169e1'||v.col==='#ff8c00'?[STY.BRICK,null,C3(.33,.35,.37)]:null;
  if(n==='Rogers Centre')return[STY.STAD,WHITE,C3(.72,.73,.75)];
  if(n==='Toronto City Hall')return[STY.STONE,C3(1.3,1.3,1.27),C3(.42,.43,.42)];
  if(n==='Ontario Science Centre')return[STY.BRUT,C3(1.05,1.03,.98),C3(.42,.42,.4),{h:v.p.length>40?14:max(v.h,9)}]; // Moriyama's board-formed concrete
  if(n==='Robarts Library')return[STY.BRUT,C3(.98,.96,.92),C3(.4,.4,.38)];
  if(n==='Hockey Hall of Fame'||n==='Bank of Montreal (old building)')return[STY.ARCH,C3(.9,.9,.88),COPPER];
  if(n==='John Street Roundhouse')return[STY.ARCH,C3(1.1,.62,.5),C3(.25,.22,.2),{h:9}];
  if(n==='Massey Hall')return[STY.ARCH,C3(1.15,.68,.58),SLATE,{h:22,rs:0}];
  if(n==='Osgoode Hall')return[STY.ARCH,C3(1.05,1.02,.95),SLATE];
  if(n==='Maple Leaf Gardens')return[STY.BRICK,C3(1.6,1.45,1.05),C3(.5,.5,.48)];
  if(n==="Ripley's Aquarium of Canada")return[STY.PLAIN,C3(.85,.88,.9),C3(.15,.32,.55)];
  if(n==='Kiln Building'||/^Gooderham (Court|Condominiums)$|^The Cooperage$/.test(n))return[STY.ARCH,C3(1.08,.66,.52),SLATE];
  if(/church|cathedral|chapel/.test(v.k||''))return[STY.ARCH,(parseCol(v.col)||C3(.85,.8,.74)).clone().multiplyScalar(1.15),SLATE];
  return null;
}
// the Distillery District's Victorian brick industrial buildings (mostly unnamed in the data)
const distillery=(v,cx,cz)=>cx>1650&&cx<1870&&cz>655&&cz<805&&v.h<26?[STY.ARCH,C3(1.08,.64,.5).multiplyScalar(.9+hsh(cx,cz)*.2),SLATE]:null;
// OpenStreetMap colours are often pure web colours ("blue", "red"): pull them most of the way to grey so they read as glass / brick / stone
function desat(c,k){const l=c.r*.3+c.g*.59+c.b*.11;return new THREE.Color(lerp(l,c.r,1-k),lerp(l,c.g,1-k),lerp(l,c.b,1-k));}
// roughly when a building went up: its mapped start date, else by district — the old city is Victorian / Edwardian,
// south East York and Leaside interwar, Don Mills, Thorncliffe and North York postwar. 0 pre-1915 · 1 interwar · 2 postwar · 3 recent
function eraOf(v,cx,cz){if(v.yr)return v.yr<1915?0:v.yr<1946?1:v.yr<1986?2:3;
  if(cx>-2900&&cx<3050&&cz>-3150&&cz<1560)return 0;return cx>1500&&cz>-5200&&cz<-1500?1:2;}
// a 1960s-70s slab apartment block: a long thin plain box, 8 to 40 storeys, standing on the ground (newer condos sit on podiums and have busier footprints)
function slabOf(v,p,ar,cz){
  if(v.b>1||v.h<24||v.h>125||p.length>8||ar<450||ar>4500||(v.yr&&v.yr>1990)||(!v.yr&&cz>700))return false;
  const k=v.k||'yes';if(!/^(apartments|residential|dormitory|yes)$/.test(k)||(k==='yes'&&cz>-1200))return false;
  let el=0,ei=0;for(let i=0;i<p.length;i++){const l=hypot(p[(i+1)%p.length][0]-p[i][0],p[(i+1)%p.length][1]-p[i][1]);if(l>el){el=l;ei=i;}}
  const A=p[ei],B=p[(ei+1)%p.length],tx=(B[0]-A[0])/el,tz=(B[1]-A[1])/el;let u0=1e9,u1=-1e9,w0=1e9,w1=-1e9;
  for(const q of p){const u=(q[0]-A[0])*tx+(q[1]-A[1])*tz,w=(q[0]-A[0])*tz-(q[1]-A[1])*tx;u0=min(u0,u);u1=max(u1,u);w0=min(w0,w);w1=max(w1,w);}
  return(u1-u0)/max(1,w1-w0)>2.1;}
// the kind of Toronto building this is: vict / inter / post / modern houses, main-street shop rows, slab blocks, old / post / modern low-rise
function archOf(v,p,ar,cx,cz){const era=eraOf(v,cx,cz),low=v.h-v.b<25;
  if(HOUSEK.has(v.k))return['vict','inter','post','modern'][era];
  if(slabOf(v,p,ar,cz))return'slab';
  if(low&&v.sf&&v.b<.5&&era<=1)return'main';
  return low?['old','old','post','modern'][era]:'';}
// [style, wall tint, facade variant]: a variant left undefined is picked at random among the style's designs
function pickStyle(v,ar,hx,arch){
  const n=v.n||'',k=v.k||'',h=v.h;
  if(n==='CN Tower')return[STY.CN,null];
  if(v.part==='column'||ar<22||(h-v.b)<2.5)return[STY.PLAIN,null];
  const col=parseCol(v.col);
  if(/Toronto[- ]Dominion|^TD |TD Centre|TD Bank|TD North|TD South|TD West/.test(n))return[STY.DARK,null];
  if(/Royal Bank Plaza/.test(n))return[STY.GOLD,null];
  if(/Ontario Science Cent/.test(n))return[STY.STONE,C3(1.02,1,.95)]; // Moriyama's raw concrete
  if(/Aga Khan Museum|Ismaili Cent/.test(n))return[STY.STONE,C3(1.55,1.55,1.52)]; // white granite
  if(/First Canadian Place/.test(n))return[STY.STONE,C3(1.4,1.4,1.38)];
  if(/^Scotia Plaza/.test(n))return[STY.DARK,C3(3.2,1.1,1)]; // red granite with dark glass
  const old=arch==='vict'||arch==='main'||arch==='old',low=h-v.b<25,resi=/apartments|residential|hotel|dormitory/.test(k);
  const wallT=()=>{if(!col)return null;const c=desat(col,.55),l=c.r*.3+c.g*.59+c.b*.11;return c.multiplyScalar(min(2.6,.75/max(l,.08)));};
  // the mapped wall material wins over every guess
  switch(v.m){
    case'brick':return arch==='slab'?[STY.CONDO,null,3]:[STY.BRICK,wallT(),arch==='post'?3:old?(/industrial|warehouse|commercial/.test(k)?2:1):arch==='inter'?0:undefined];
    case'stone':return[STY.STONE,wallT(),old||arch==='inter'||h<30?1:0];
    case'concrete':return arch==='slab'?[STY.CONDO,wallT(),3]:[STY.STONE,wallT(),2];
    case'glass':{let t=null;if(col){const c=desat(col,.93),l=c.r*.3+c.g*.59+c.b*.11;t=c.multiplyScalar(min(2.6,.55/max(l,.08)));}
      return h>=35&&resi?[STY.CONDO,null]:[h>=35&&hx>.78?STY.DARK:STY.GLASS,t];}
    case'metal':return[STY.GLASS,wallT(),2];
    case'plaster':case'wood':return[STY.STONE,wallT()||C3(1.22,1.2,1.12),0];
  }
  if(arch==='slab')return[STY.CONDO,null,3];
  if(col){const c=desat(col,h>=35?.93:.55),l=c.r*.3+c.g*.59+c.b*.11;return[h>=35?STY.GLASS:STY.STONE,c.multiplyScalar(min(2.6,(h>=35?.55:.75)/max(l,.08)))];}
  if(arch==='vict')return[STY.BRICK,null,hx<.85?1:0];   // bay-and-gable: red brick, tall arched windows
  if(arch==='inter')return[STY.BRICK,null,hx<.8?0:1];   // 1920s-40s: plain red brick
  if(arch==='post')return HOUSEK.has(k)?[STY.BRICK,null,hx<.7?3:0]:hx<.6?[STY.BRICK,null,3]:[STY.STONE,null,2]; // buff brick, aluminium sliders, precast
  if(HOUSEK.has(k))return[STY.BRICK,null,0];
  if(arch==='main')return hx<.5?[STY.BRICK,null,1]:hx<.75?[STY.BRICK,null,hx<.62?2:0]:[STY.STONE,null,1]; // Queen / College / Danforth shop rows
  if(/university|school|college|civic|public|government|townhall|train_station|hospital|museum/.test(k))return[STY.STONE,null,old?1:undefined];
  if(arch==='old'&&!/office/.test(k))return hx<.42?[STY.BRICK,null,/industrial|warehouse|commercial/.test(k)?2:1]:hx<.6?[STY.BRICK,null,0]:hx<.8?[STY.STONE,null,1]:[STY.STONE,null,0];
  if(h>=40){if(resi||hx<.45)return[STY.CONDO,null];return[hx<.72?STY.GLASS:STY.DARK,null];}
  if(h>=18){if(/apartments|residential/.test(k))return[hx<.5?STY.CONDO:STY.STONE,null];if(/office|commercial/.test(k))return[hx<.55?STY.GLASS:STY.STONE,null];return[hx<.45?STY.BRICK:STY.STONE,null];}
  return[hx<.68?STY.BRICK:STY.STONE,null];
}
// one wall of shopfronts, 6.5 m bays; bays with a real (OpenStreetMap) shop show its window display and its name
function shopWall(key,v,i,a,c,tx,tz,nrm,b,L){const nb=max(1,round(L/6.5)),bw=L/nb,bays=new Array(nb).fill(null);
  if(v.sh)for(const s of v.sh.filter(s=>s[0]===i).sort((p,q)=>p[1]-q[1])){let j=min(nb-1,floor(s[1]*nb));for(let k=0;k<nb&&bays[j];k++)j=(j+1)%nb;if(!bays[j])bays[j]=s;}
  const span=v.sh&&v.sh.find(s=>s[0]===i&&s[5]);if(span)bays.fill(span);
  const typeAt=j=>bays[j]?bays[j][3]:-1;addAwnings(key,a,c,tx,tz,nrm,b,L,typeAt,nb,j=>{const S=bays[j];if(!S)return null;const h=strH((S[2]||'')+'awn');const base=SHOPS[S[3]].awn;if(!base&&h<.6)return null;if(h<.18)return null;return AWNPAL[floor(h*97)%AWNPAL.length];});const g=bgb(key,STY.SHOP),empty=[];
  for(let j=0;j<nb;j++){const s0=j*bw,s1=s0+bw,P=(s,y,o=0)=>[a[0]+tx*s+nrm[0]*o,b+y,a[1]+tz*s+nrm[2]*o],t=typeAt(j),u1=(t+1)/8,u0=t/8;
    if(t<0){empty.push([s0,s1]);continue;}
    {const rt=bays[j]?floor(strH(bays[j][2]||'')*SHOPV):0,v0=1-(rt+1)/SHOPV,v1=v0+SHOPH/4.4/SHOPV;g.quad(P(s0,0),P(s1,0),P(s1,SHOPH),P(s0,SHOPH),nrm,WHITE,[u1,v0],[u0,v0],[u0,v1],[u1,v1]);}
    const S=bays[j];if(!S)continue;if(!span||j===0){const r=signCell(S[2],S[4],t);let m=bw*.06,q0=s0,q1=s1;if(span){const sw=min(L*.9,9);q0=(L-sw)/2;q1=q0+sw;m=0;}const s0_=s0,s1_=s1;{const s0=q0,s1=q1;
    bgb(key,'sg'+r.pg).quad(P(s0+m,SHOPH-.96,.03),P(s1-m,SHOPH-.96,.03),P(s1-m,SHOPH-.18,.03),P(s0+m,SHOPH-.18,.03),nrm,WHITE,[r.u1,r.v0],[r.u0,r.v0],[r.u0,r.v1],[r.u1,r.v1]);}}
    (__gs.BCH.shops||(__gs.BCH.shops=[])).push({x:a[0]+tx*(s0+bw/2)+nrm[0]*1.3,z:a[1]+tz*(s0+bw/2)+nrm[2]*1.3,ax:a[0]+tx*s0,az:a[1]+tz*s0,bx:a[0]+tx*s1,bz:a[1]+tz*s1,n:S[2],k:t,sub:S[4],nx:nrm[0],nz:nrm[2]});}
  return empty;}
// shop names are painted into per-tile sign atlases: 1024x1024 pages of 2 x 16 signs
const BRAND=[[/^Tim Hortons/i,'#c8102e','#fff'],[/^Starbucks/i,'#00704a','#fff'],[/^McDonald/i,'#da291c','#ffc72c'],[/^Shoppers Drug Mart/i,'#e31837','#fff'],[/^LCBO/i,'#1c4f3a','#fff'],[/^Subway/i,'#008c15','#ffc600'],
  [/^Pizza Pizza/i,'#f26b21','#fff'],[/^Rexall/i,'#0c4da2','#fff'],[/^Second Cup/i,'#5c1f2b','#fff'],[/^A&W/i,'#f47a20','#4b2a14'],[/^Popeyes/i,'#f25c05','#fff'],[/^Metro$/i,'#d6001c','#fff'],[/^No Frills/i,'#ffe600','#d71920'],
  [/^Loblaws/i,'#d6001c','#fff'],[/^Winners/i,'#1d1d1b','#e2001a'],[/^Indigo/i,'#2b2a29','#fff'],[/^Uniqlo/i,'#e60012','#fff'],[/^lululemon/i,'#d22030','#fff'],[/^Apple/i,'#f4f4f4','#111'],[/^Dollarama/i,'#00a14b','#ffde00'],
  [/^TD|^Toronto-Dominion/i,'#00a650','#fff'],[/^RBC|^Royal Bank/i,'#005daa','#ffd200'],[/^Scotiabank/i,'#ec111a','#fff'],[/^CIBC/i,'#c41f3e','#fff'],[/^BMO|^Bank of Montreal/i,'#0079c1','#fff'],[/^Circle K|^Mac's/i,'#e4002b','#fff'],[/^7-Eleven/i,'#008163','#fff'],
  [/^Burger King/i,'#f5ebdc','#d62300'],[/^Wendy/i,'#e2203d','#fff'],[/^KFC/i,'#a3080c','#fff'],[/^Chipotle/i,'#441500','#fff'],[/^Booster Juice/i,'#f7a600','#fff'],[/^The Beer Store/i,'#00438f','#ffd200'],[/^Sobeys/i,'#00843d','#fff'],[/^FreshCo/i,'#7ab51d','#fff']];
const SIGNPAL=[['#1f3b2e','#f3e7c9'],['#f2e6cf','#7a4a1e'],['#f7f1ea','#3e6b3a'],['#121214','#e8d9b0'],['#5b1f24','#f1e4c8'],['#ffffff','#1b6b3a'],['#1a1a1c','#ffffff'],['#1f4e8c','#ffffff']];
function signCell(name,sub,kind){const S=__gs.BCH.signs||(__gs.BCH.signs=[]);let pg=S[S.length-1];if(!pg||pg.n>=32){pg={c:cv(1024,1024),n:0};S.push(pg);}
  const k=pg.n++,col=k&1,row=k>>1,x=col*512,y=row*64,g=pg.c.getContext('2d'),br=BRAND.find(q=>q[0].test(name)),hx=hsh(name.length*3.1,name.charCodeAt(0)||1),pal=SIGNPAL[kind];
  const bg=br?br[1]:hx<.5?pal[0]:['#14204a','#2b2b2b','#7a1f1f','#f4efe6','#0f4c45','#3d2b52'][floor(hx*12)%6],fg=br?br[2]:hx<.5?pal[1]:(bg==='#f4efe6'?'#222':'#fff');
  g.fillStyle=bg;g.fillRect(x+2,y+2,508,60);g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=3;g.strokeRect(x+3,y+3,506,58);g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';
  const serif=kind===1||kind===3||kind===4;let fs=sub?34:40;const font=()=>`${serif?'700':'800'} ${fs}px ${serif?'Georgia, "Times New Roman", serif':'Inter, Helvetica, Arial, sans-serif'}`;g.font=font();
  while(g.measureText(name).width>480&&fs>18){fs-=2;g.font=font();}g.fillText(name,x+256,y+(sub?25:33),488);if(sub){g.font='700 12px Inter, Arial, sans-serif';g.globalAlpha=.85;g.fillText(sub,x+256,y+51);g.globalAlpha=1;}
  return{pg:S.length-1,u0:x/1024+.002,u1:(x+512)/1024-.002,v1:1-y/1024-.002,v0:1-(y+64)/1024+.002};}
__gs.BCH=new Map();__gs.LODF=false;let SHOPH=4.4; // BCH: geometry being built (one tile / landmark at a time); LODF: building the lighter far version
function bgb(key,st){let m=__gs.BCH.get(key);if(!m)__gs.BCH.set(key,m=new Map());let g=m.get(st);if(!g)m.set(st,g=new GB());return g;}
// miter-offset a closed footprint ring: d > 0 pushes it outward (the footprints wind so that [dz,-dx] is the outward normal)
function ringOff(p,d){const n=p.length,N=[];for(let i=0;i<n;i++){const a=p[i],c=p[(i+1)%n],L=hypot(c[0]-a[0],c[1]-a[1])||1;N.push([(c[1]-a[1])/L,-(c[0]-a[0])/L]);}
  return p.map((q,i)=>{const n1=N[(i+n-1)%n],n2=N[i];let mx=n1[0]+n2[0],mz=n1[1]+n2[1];const ml=hypot(mx,mz);if(ml<1e-3)return[q[0]+n2[0]*d,q[1]+n2[1]*d];mx/=ml;mz/=ml;const k=min(3,1/max(.33,mx*n2[0]+mz*n2[1]));return[q[0]+mx*d*k,q[1]+mz*d*k];});}
// a vertical band between two rings (y0..y1), facing outward when out=true
function band(g,A,B,y0,y1,col,out){const n=A.length;for(let i=0;i<n;i++){const j=(i+1)%n,a=A[i],c=A[j],L=hypot(c[0]-a[0],c[1]-a[1]);if(L<.05)continue;const nx=(c[1]-a[1])/L,nz=-(c[0]-a[0])/L,s=out?1:-1;
  g.quad([a[0],y0,a[1]],[c[0],y0,c[1]],[(B||A)[j][0],y1,(B||A)[j][1]],[(B||A)[i][0],y1,(B||A)[i][1]],[nx*s,0,nz*s],col);}}
function capRing(g,O,I,y,col,down){const n=O.length;for(let i=0;i<n;i++){const j=(i+1)%n;g.quad([O[i][0],y,O[i][1]],[O[j][0],y,O[j][1]],[I[j][0],y,I[j][1]],[I[i][0],y,I[i][1]],down?[0,-1,0]:UP,col);}}
const CAPS=[C3(.42,.43,.45),C3(.78,.75,.7),C3(.72,.66,.58),C3(.85,.86,.86),C3(.12,.12,.13),C3(.4,.36,.28)];
// the things that make a box read as a building: parapet, cornice, base course, rooftop plant
function roofDetail(key,v,p,b,h,ar,st,tint,hx,cx,cz,shopF){
  if(p.length>48)return;const g=bgb(key,STY.PLAIN),old=st===STY.BRICK||st===STY.STONE||st===STY.ARCH,tall=h-b>40;
  const cap=(st<6?CAPS[st]:st===STY.ARCH?C3(.8,.74,.64):C3(.6,.6,.6)).clone().multiply(tint.clone().lerp(WHITE,.5)).multiplyScalar(.8);
  const wallC=st===STY.BRICK?C3(.42,.22,.16).multiply(tint):st===STY.GLASS||st===STY.DARK||st===STY.GOLD||st===STY.CONDO?C3(.26,.27,.29):cap.clone().multiplyScalar(.9);
  const pH=tall?1.2:old?.9:.8,O=ringOff(p,0),I=ringOff(p,-.25),Ot=ringOff(p,.06);
  band(g,O,null,h,h+pH,wallC,true);band(g,I,null,h,h+pH,wallC.clone().multiplyScalar(.75),false);band(g,Ot,null,h+pH,h+pH+.12,cap,true);capRing(g,Ot,I,h+pH+.12,cap);
  if(old&&h-b<45){const C=ringOff(p,.3),y0=h-.5;band(g,O,C,y0-.22,y0,cap.clone().multiplyScalar(.85),true);band(g,C,null,y0,y0+.4,cap,true);capRing(g,C,O,y0+.4,cap,false);}
  if(!shopF&&h-b>8){const B0=ringOff(p,.07);band(g,B0,null,b,b+.75,cap.clone().multiplyScalar(.55),true);capRing(g,B0,p,b+.75,cap.clone().multiplyScalar(.6));}
  // rooftop plant: HVAC units, a stair / lift penthouse on mid-rises, a timber water tank on some old brick ones
  const fp=flat(I),r=mkRng(floor(hx*1e6)),inside=(x,z,s)=>inPoly(x,z,fp)&&inPoly(x+s,z,fp)&&inPoly(x-s,z,fp)&&inPoly(x,z+s,fp)&&inPoly(x,z-s,fp);
  const steel=C3(.4,.41,.42),dark=C3(.2,.21,.22);let n=ar>150?min(5,1+floor(ar/350)):0;
  for(let k=0,t=0;k<n&&t<n*6;t++){const x=cx+(r()-.5)*sqrt(ar)*.7,z=cz+(r()-.5)*sqrt(ar)*.7,w=1.2+r()*1.6,d=1+r()*1.2;if(!inside(x,z,max(w,d)*.8))continue;k++;
    __late.gbBox(g,x,h,z,w,.9+r()*.5,d,r()*.2,steel);__late.gbBox(g,x+w*.25,h+1.2,z,.5,.08,.5,0,dark);}
  if(h-b>14&&ar>250&&r()<.75){const w=3+r()*2.5,d=3+r()*2;if(inside(cx,cz,max(w,d)*.7)){__late.gbBox(g,cx,h,cz,w,2.8,d,0,cap.clone().multiplyScalar(.92));__late.gbBox(g,cx,h+2.8,cz,w+.2,.18,d+.2,0,cap);}}
  if(st===STY.BRICK&&h>12&&h<45&&ar>200&&r()<.18){const x=cx+(r()-.5)*4,z=cz+(r()-.5)*4;if(inside(x,z,2.6)){const wood=C3(.36,.25,.17);
    for(let k=0;k<4;k++){const a=k*PI/2+PI/4;__late.gbBox(g,x+cos(a)*1.4,h,z+sin(a)*1.4,.18,3.2,.18,0,dark);}
    const R0=1.9,K=12;for(let k=0;k<K;k++){const a0=k/K*2*PI,a1=(k+1)/K*2*PI,P=(a,y)=>[x+cos(a)*R0,y,z+sin(a)*R0],m=(a0+a1)/2;g.quad(P(a0,h+3.2),P(a1,h+3.2),P(a1,h+6.4),P(a0,h+6.4),[cos(m),0,sin(m)],wood);
      g.tri(P(a0,h+6.4),P(a1,h+6.4),[x,h+7.6,z],[cos(m),.8,sin(m)],wood.clone().multiplyScalar(.8));}}}
}
// one textured wall quad from a to c (2D points) between heights y0a..y1a at a and y0c..y1c at c; T = [tile w, tile h] or none
function wallQ(g,a,c,y0,y1a,y1c,nrm,tint,T,dist,u0,v0,ta,tc){
  const A=[a[0],y0,a[1]],B=[c[0],y0,c[1]],Cc=tc||[c[0],y1c,c[1]],D=ta||[a[0],y1a,a[1]];
  if(!T){g.quad(A,B,Cc,D,nrm,tint);return;}
  const L=hypot(c[0]-a[0],c[1]-a[1]),ua=u0+dist/T[0],ub=u0+(dist+L)/T[0];
  g.quad(A,B,Cc,D,nrm,tint,[ua,v0+y0/T[1]],[ub,v0+y0/T[1]],[ub,v0+y1c/T[1]],[ua,v0+y1a/T[1]]);}
// --- street-level detail (near tiles only): what makes a wall read as a particular kind of Toronto building up close.
// Houses get a front door, a porch and (Victorian ones) a two-storey bay window on the wall that faces their street; old brick gets
// downspouts and a fire escape round the back; postwar walk-ups get window air conditioners; condos and slab blocks get balcony slabs.
// Window-aligned pieces follow the facade's cell grid (T, u0, vF: the same mapping wallQ used for this building's walls).
const DOORC=[C3(.05,.16,.09),C3(.3,.05,.05),C3(.04,.04,.05),C3(.06,.09,.19),C3(.28,.17,.1),C3(.5,.48,.44)];
const METAL=C3(.07,.07,.075),CONC=C3(.56,.55,.52),TRIM=C3(.82,.8,.75),ACC=C3(.78,.78,.76);
function wallDetail(key,v,D){
  const {p,b,wt,st,vsel,wst,wtint,rc,hx,shopF,T,vF,u0,fh,nfl,fbase,arch}=D,n=p.length,g=bgb(key,STY.PLAIN),r=mkRng(floor(hx*1e6)+7),house=HOUSEK.has(v.k),H=wt-b;
  const E=[];let dist=hx*40;
  for(let i=0;i<n;i++){const a=p[i],c=p[(i+1)%n],dx=c[0]-a[0],dz=c[1]-a[1],L=hypot(dx,dz);if(L<.01)continue;E.push({i,a,L,tx:dx/L,tz:dz/L,nx:dz/L,nz:-dx/L,dist,shop:!!shopF&&shopF[i]==='1'});dist+=L;}
  const P=(e,s,o,y)=>[e.a[0]+e.tx*s+e.nx*o,y,e.a[1]+e.tz*s+e.nz*o];
  // a box against wall e: s0..s1 along it, o0..o1 out from it, y0..y1 (the face against the wall is left out)
  const slab=(e,s0,s1,o0,o1,y0,y1,col)=>{const A=(s,o,y)=>P(e,s,o,y),N=[e.nx,0,e.nz],Tn=[e.tx,0,e.tz];
    g.quad(A(s0,o0,y1),A(s1,o0,y1),A(s1,o1,y1),A(s0,o1,y1),UP,col);g.quad(A(s0,o0,y0),A(s1,o0,y0),A(s1,o1,y0),A(s0,o1,y0),[0,-1,0],col);
    g.quad(A(s0,o1,y0),A(s1,o1,y0),A(s1,o1,y1),A(s0,o1,y1),N,col);
    g.quad(A(s0,o0,y0),A(s0,o1,y0),A(s0,o1,y1),A(s0,o0,y1),[-Tn[0],0,-Tn[2]],col);g.quad(A(s1,o0,y0),A(s1,o1,y0),A(s1,o1,y1),A(s1,o0,y1),Tn,col);
    if(o0>.01)g.quad(A(s0,o0,y0),A(s1,o0,y0),A(s1,o0,y1),A(s0,o0,y1),[-N[0],0,-N[2]],col);};
  const onWall=(e,s0,s1,y0,y1,o,col)=>g.quad(P(e,s0,o,y0),P(e,s1,o,y0),P(e,s1,o,y1),P(e,s0,o,y1),[e.nx,0,e.nz],col);
  const fr=v.fr!==undefined?E.find(e=>e.i===v.fr):null;
  // ---- houses: door, porch or stoop, bay window
  if(house&&fr&&!fr.shop&&fr.L>=4&&H>=2.6){const e=fr,L=e.L,side=hsh(cx0(p),2.7)<.5,ds=L<5.5?L*.5:side?L*.27:L*.73,old=arch==='vict'||arch==='inter';
    const porch=old&&L>=4.5&&r()<.8,y0=b+(porch?.45:.28),dw=.95,dh=2.15;
    onWall(e,ds-dw/2-.12,ds+dw/2+.12,y0,y0+dh+(arch==='vict'?.55:.12),.025,TRIM);
    onWall(e,ds-dw/2,ds+dw/2,y0,y0+dh,.04,DOORC[floor(hsh(hx*91,3.3)*DOORC.length)]);
    if(arch==='vict')onWall(e,ds-dw/2,ds+dw/2,y0+dh+.08,y0+dh+.45,.04,C3(.1,.12,.14)); // transom light
    if(porch){const pw=min(3.4,L*.46),pd=1.9,s0=clamp(ds,pw/2+.1,L-pw/2-.1),ph=b+2.95,post=TRIM;
      slab(e,s0-pw/2,s0+pw/2,0,pd,b,b+.45,C3(.4,.37,.33));
      for(const k of[-1,1]){const sp=s0+k*(pw/2-.1);slab(e,sp-.07,sp+.07,pd-.17,pd-.03,b+.45,ph,post);
        const a0=min(sp,s0+k*.6),a1=max(sp,s0+k*.6);slab(e,a0,a1,pd-.13,pd-.07,b+1.3,b+1.36,post);slab(e,a0,a1,pd-.13,pd-.07,b+.5,b+.55,post);}
      slab(e,s0-pw/2-.12,s0+pw/2+.12,0,pd+.12,ph,ph+.16,rc.clone().multiplyScalar(.9));
      slab(e,s0-.55,s0+.55,pd,pd+.5,b,b+.22,CONC);}
    else slab(e,ds-.7,ds+.7,0,.55,b,b+.25,CONC);
    if(arch==='vict'&&L>=5.5&&H>=fh*1.2){const bw=min(3.2,L*.42),bs=clamp(side?L*.73:L*.27,bw/2+.15,L-bw/2-.15),dep=.75,bh=min(H-.35,fh*min(2,nfl)),a1=bs-bw/2,a2=bs+bw/2,ch=.55;
      const pts=[[a1,0],[a1+ch,dep],[a2-ch,dep],[a2,0]].map(([s_,o])=>{const q=P(e,s_,o,0);return[q[0],q[2]];}),gw=bgb(key,wst);let du=e.dist+a1;
      for(let k=0;k<3;k++){const A=pts[k],C=pts[k+1],dx=C[0]-A[0],dz=C[1]-A[1],l=hypot(dx,dz);wallQ(gw,A,C,b,b+bh,b+bh,[dz/l,0,-dx/l],wtint,T,du,u0,vF);du+=l;}
      slab(e,a1-.08,a2+.08,0,dep+.1,b+bh,b+bh+.16,TRIM.clone().multiplyScalar(.85));}}
  // ---- downspouts at the ends of the walls of low brick and stone buildings
  if(H>3&&H<26&&(st===STY.BRICK||st===STY.STONE)&&n<=12){const dc=[C3(.22,.22,.23),C3(.7,.69,.66),C3(.28,.2,.15)][floor(hx*31)%3];let k=0;
    for(const e of house&&fr?[fr]:E){if(e.L<3||e.shop)continue;for(const s_ of house?[.16,e.L-.16]:[e.L-.25]){if(k>=(house?2:4))break;slab(e,s_-.05,s_+.05,.02,.12,b,wt-.05,dc);k++;}}}
  // ---- fire escape on old brick: on the back wall (or the longest wall when the street side is unknown)
  if(!house&&st===STY.BRICK&&(vsel===1||vsel===2||arch==='main')&&H>=7&&H<=30&&nfl>=2&&r()<.6){
    let e=null;if(fr){let bd=.2;for(const q of E){const d=q.nx*fr.nx+q.nz*fr.nz;if(!q.shop&&q.L>=5&&d<bd){bd=d;e=q;}}}else for(const q of E)if(!q.shop&&q.L>=5&&(!e||q.L>e.L))e=q;
    if(e){const fw=2.6,s0=clamp(e.L*(.3+.4*r()),fw/2+.3,e.L-fw/2-.3),od=.95,ys=[];for(let k=fbase>b+.5?0:1;k<nfl;k++)ys.push(fbase+k*fh);
      for(let k=0;k<ys.length;k++){const y=ys[k],l=s0-fw/2,rt=s0+fw/2;
        slab(e,l,rt,0,od,y-.06,y,METAL);slab(e,l,rt,od-.04,od,y+.88,y+.93,METAL);slab(e,l,l+.04,0,od,y+.88,y+.93,METAL);slab(e,rt-.04,rt,0,od,y+.88,y+.93,METAL);
        for(let q=0;q<=5;q++){const x=l+q*fw/5;slab(e,max(l,x-.015),min(rt,x+.015),od-.03,od,y,y+.9,METAL);}
        if(k>0){const y1=ys[k-1],d=k%2?1:-1,sA=s0-d*(fw/2-.25),sB=s0+d*(fw/2-.25),q1=P(e,sA,.12,y),q2=P(e,sA,.72,y),q3=P(e,sB,.72,y1),q4=P(e,sB,.12,y1),nn=nrmOf(q1,q2,q3,UP);
          g.quad(q1,q2,q3,q4,nn,METAL);g.quad(q1,q2,q3,q4,[-nn[0],-nn[1],-nn[2]],METAL);}
        else for(const d of[-.22,.22]){const x=rt-.45+d;slab(e,x-.02,x+.02,.55,.62,max(b,y-2.1),y,METAL);}}}}
  // ---- window air conditioners on buff-brick walk-ups (and some old brick), sitting on a window sill
  const sill=st===STY.BRICK&&vsel===3?.25:st===STY.BRICK&&vsel===1?.19:-1;
  if(sill>0&&(arch==='post'||arch==='old'||arch==='main')&&!house&&H<40){let left=14;
    for(const e of E){if(e.shop||e.L<4)continue;const c0=ceil((u0+e.dist/T[0])*16-1e-6);
      for(let j=0;j<64;j++){const ci=c0+j,sx=((ci+.5)/16-u0)*T[0]-e.dist;if(sx>e.L-1.4)break;if(sx<1.4||(vsel===1&&((ci%16)+16)%16%4===3))continue;
        for(let k=0;k<nfl;k++){if(left<=0||r()>.07)continue;left--;const y=fbase+k*fh+fh*sill;slab(e,sx-.35,sx+.35,.01,.48,y,y+.44,ACC);onWall(e,sx-.3,sx+.3,y+.06,y+.38,.485,C3(.35,.35,.35));}}}}
  // ---- balconies: continuous concrete slabs with solid parapets on slab blocks, slabs with a thin glass-rail top on newer condos
  if(st===STY.CONDO&&H>9&&H<=110){const old=arch==='slab'||vsel===3;
    for(const e of E.filter(e=>!e.shop&&e.L>=10).sort((x,y)=>y.L-x.L).slice(0,2)){
      const w=min(6.5,e.L*.32),spans=old?[[e.L*.07,e.L*.93]]:hsh(e.a[0],e.a[1])<.5?[[e.L*.08,e.L*.08+w],[e.L*.92-w,e.L*.92]]:[[e.L/2-w/2,e.L/2+w/2]];
      for(let k=fbase>b+.5?0:1;k<nfl&&k<36;k++){const y=fbase+k*fh;if(y>wt-1.2)break;
        for(const [s0,s1] of spans){if(old){slab(e,s0,s1,0,1.4,y-.16,y,C3(.5,.49,.46));slab(e,s0,s1,1.3,1.4,y,y+1,C3(.47,.46,.43));}
          else{slab(e,s0,s1,0,1.5,y-.15,y,C3(.55,.55,.54));slab(e,s0,s1,1.46,1.5,y+1,y+1.05,METAL);}}}}}
}
const cx0=p=>{let x=0;for(const q of p)x+=q[0];return x/p.length;};
function addVol(v){
  const p=v.p,n=p.length;if(n<3||v.n==='CN Tower'||v.skip)return;
  const ar=abs(polyArea(p)),[cx,cz]=polyCen(p),hx=hsh(cx,cz);
  const far=!!v.f;
  if(far&&v.h<26)return;
  if(__gs.LODF&&!v.n&&(v.h<8||ar<40))return; // far tiles leave out (unnamed) sheds, garages and kiosks
  const LS=lmStyle(v)||distillery(v,cx,cz),opt=(LS&&LS[3])||{},arch=LS?'':archOf(v,p,ar,cx,cz);
  let [st,tint,vr]=LS?[LS[0],LS[1]]:pickStyle(v,ar,hx,arch);
  if(!tint)tint=st<6?TINTS[st][floor(hx*997)%TINTS[st].length]:st>=10?WHITE:st===STY.CN?C3(.92,.92,.9):(parseCol(v.col)||C3(.62,.6,.57));
  const key='k';
  let rs=opt.rs!==undefined?opt.rs:v.rs,b=v.b,h=opt.h||v.h,rh=v.rh||0;
  if(b>.3&&st!==STY.CN){ // raised parts (skyways, archways over a street, overhangs) get an underside so they read as solid, not loose walls
    let faces;try{faces=THREE.ShapeUtils.triangulateShape(p.map(q=>new THREE.Vector2(q[0],q[1])),[]);}catch(e){faces=[];}
    const ug=bgb(key,STY.PLAIN),uc=(parseCol(v.col)||C3(.5,.49,.47)).clone().multiplyScalar(.55);
    for(const f of faces){const a=p[f[0]],b2=p[f[1]],c=p[f[2]];ug.tri([a[0],b,a[1]],[b2[0],b,b2[1]],[c[0],b,c[1]],[0,-1,0],uc);}}
  if((rs===1||rs===2)&&n!==4)rs=3;
  if(!rs&&HOUSEK.has(v.k)&&n===4&&h<16&&!far)rs=1;
  let rmax=0;for(const q of p)rmax=max(rmax,hypot(q[0]-cx,q[1]-cz));
  let sh=0;if(n===4)sh=min(hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]),hypot(p[2][0]-p[1][0],p[2][1]-p[1][1]));
  // v.rr: colour sampled from the city's aerial photo, which is sunlit and hazy; halving it and restoring some saturation gives the roof's own colour
  const rc=(LS&&LS[2])||(v.rr?desat(parseCol(v.rcol),-.4).multiplyScalar(.5):parseCol(v.rcol))||(HOUSEK.has(v.k)?C3(.17,.16,.16):st===STY.CN?C3(.85,.85,.85):C3(.3,.3,.31).multiplyScalar(.8+hx*.5));
  const T=FTILE[st],u0=floor(hx*16)/16,v0=floor((hx*7.31)%1*16)/16;
  const nv=!LS&&FVAR[st]?FVAR[st]:0,vsel=nv?(vr!==undefined?min(vr,nv):floor(hsh(cz*1.37+3.1,cx*.71)*(nv+1))):0,wst=vsel?st+100*vsel:st,wtint=vsel?tint.clone().lerp(WHITE,.6):tint; // one of several facade designs per style
  if(rs===6&&h-b>1){ // skillion: the longest edge is the eave and the roof rises away from it (OSM gives no direction here)
    let ei=0,el=0;for(let i=0;i<n;i++){const l=hypot(p[(i+1)%n][0]-p[i][0],p[(i+1)%n][1]-p[i][1]);if(l>el){el=l;ei=i;}}
    const A=p[ei],ex=(p[(ei+1)%n][0]-A[0])/el,ez=(p[(ei+1)%n][1]-A[1])/el,dl=q=>abs((q[0]-A[0])*ez-(q[1]-A[1])*ex);
    let dm=0;for(const q of p)dm=max(dm,dl(q));
    rh=min(rh||min((h-b)*.4,dm*.5),(h-b)*.95);
    const lean=opt.lean||0,yt=q=>h-rh+rh*(dm>.01?dl(q)/dm:1),top=q=>{const y=yt(q),f=lean*(y-b)/max(1,h-b);return[q[0]+(q[0]-cx)*f,y,q[1]+(q[1]-cz)*f];};
    const g=bgb(key,wst),tops=p.map(top);let dist=hx*40;
    for(let i=0;i<n;i++){const a=p[i],c=p[(i+1)%n],L=hypot(c[0]-a[0],c[1]-a[1]);if(L<.01)continue;
      const ta=tops[i],tc=tops[(i+1)%n],nrm=nrmOf([a[0],b,a[1]],[c[0],b,c[1]],tc,[(c[1]-a[1])/L,0,-(c[0]-a[0])/L]);
      wallQ(g,a,c,b,ta[1],tc[1],nrm,tint,T,dist,u0,v0,ta,tc);dist+=L;}
    let faces;try{faces=THREE.ShapeUtils.triangulateShape(p.map(q=>new THREE.Vector2(q[0],q[1])),[]);}catch(e){faces=[];}
    const rg=bgb(key,lean?st:STY.PLAIN);
    const tu=T?T[0]:1,tv=T?T[1]:1;
    for(const f of faces){const a=tops[f[0]],b2=tops[f[1]],c=tops[f[2]];rg.tri(a,b2,c,nrmOf(a,b2,c,UP),lean?tint:rc,[a[0]/tu,a[2]/tv],[b2[0]/tu,b2[2]/tv],[c[0]/tu,c[2]/tv]);}
    return;}
  if(rs===1||rs===2)rh=rh||sh*.42;else if(rs===3)rh=rh||rmax*.8;else if(rs===4||rs===5)rh=rh||rmax*(rs===4?.9:.55);else rh=0;
  rh=min(rh,(h-b)*(rs===3?.95:1));
  const wt=h-rh,shopF=(!far&&!__gs.LODF&&v.sf&&b<.5&&wt>3.6&&st!==STY.PLAIN&&st!==STY.CN)?v.sf:'';
  if(st===STY.CN&&b<1&&h>250){ // CN Tower shaft: taper the Y-shaped legs and core toward the top
    const C=MAP.landmarks.cn?MAP.landmarks.cn.c:[cx,cz],K=12,f=y=>1-.64*min(1,y/440),sp=(q,y)=>[C[0]+(q[0]-C[0])*f(y),y,C[1]+(q[1]-C[1])*f(y)],g=bgb(key,STY.CN);
    for(let k=0;k<K;k++){const y0=b+(h-b)*k/K,y1=b+(h-b)*(k+1)/K;
      for(let i=0;i<n;i++){const a0=sp(p[i],y0),c0=sp(p[(i+1)%n],y0),c1=sp(p[(i+1)%n],y1),a1=sp(p[i],y1),dx=c0[0]-a0[0],dz=c0[2]-a0[2],L=hypot(dx,dz)||1;g.quad(a0,c0,c1,a1,[dz/L,.08,-dx/L],tint);}}
    polyInto(g,p.map(q=>{const t=sp(q,h);return[t[0],t[2]];}),h,0,tint);return;}
  // whole storeys: stretch the window grid a little so the floors start on the shopfronts (or the ground) and the top one isn't cut off;
  // with a mapped storey count, exactly that many floors
  const shopAny=!!shopF&&shopF.includes('1'),fbase=b+(shopAny?min(4.4,wt-b):0);let TF=T,vF=v0,fh=T?T[1]/16:3.3,nfl=max(1,round((wt-b)/fh));
  if(T&&st<6&&wt-fbase>2){const fh0=T[1]/16,H=wt-fbase;nfl=v.lv?max(1,v.lv-(shopAny?1:0)):max(1,round(H/fh0));fh=H/nfl;
    if(fh<fh0*.8||fh>fh0*1.3){nfl=max(1,round(H/fh0));fh=clamp(H/nfl,fh0*.8,fh0*1.3);}TF=[T[0],fh*16];vF=v0-fbase/TF[1];}
  let dist=hx*40;
  for(let i=0;i<n;i++){
    const a=p[i],c=p[(i+1)%n],dx=c[0]-a[0],dz=c[1]-a[1],L=hypot(dx,dz);if(L<.01)continue;
    const SH_=min(4.4,wt-b),nrm=[dz/L,0,-dx/L],shop=shopF&&shopF[i]==='1',y0=shop?b+SH_:b;SHOPH=SH_;
    if(shop){const E=shopWall(key,v,i,a,c,dx/L,dz/L,nrm,b,L),tx_=dx/L,tz_=dz/L;for(const [s0,s1] of E)wallQ(bgb(key,wst),[a[0]+tx_*s0,a[1]+tz_*s0],[a[0]+tx_*s1,a[1]+tz_*s1],b,b+SH_,b+SH_,nrm,wtint,TF,dist+s0,u0,vF);}
    if(wt>y0+.05)wallQ(bgb(key,wst),a,c,y0,wt,wt,nrm,wtint,TF,dist,u0,vF);
    dist+=L;
  }
  if(!far&&!__gs.LODF&&!LS&&st<6&&TF)wallDetail(key,v,{p,b,wt,st,vsel,wst,wtint,rc,hx,shopF,T:TF,vF,u0,fh,nfl,fbase,arch});
  const rg=bgb(key,st===STY.CN?STY.CN:STY.PLAIN);
  if(!rs||rs===6||rh<.3){
    const flatOK=st!==STY.CN&&st!==STY.PLAIN&&!LS&&(h-b)>4&&ar>30;
    if(flatOK){polyInto(bgb(key,STY.ROOF),p,h,1/8,rc.clone().multiplyScalar(1.6));if(!far&&!__gs.LODF)roofDetail(key,v,p,b,h,ar,st,tint,hx,cx,cz,shopF);}
    else polyInto(rg,p,h,0,rc);return;}
  if(rs===3){for(let i=0;i<n;i++){const a=[p[i][0],wt,p[i][1]],c=[p[(i+1)%n][0],wt,p[(i+1)%n][1]],t=[cx,h,cz],m=[(a[0]+c[0])/2-cx,1,(a[2]+c[2])/2-cz];rg.tri(a,c,t,nrmOf(a,c,t,m),rc);}return;}
  if(rs===4||rs===5){const K=__gs.LODF?3:6;let prev=p.map(q=>[q[0],wt,q[1]]);
    for(let k=1;k<=K;k++){const t=k/K*PI/2,s=cos(t),y=wt+rh*sin(t),cur=p.map(q=>[cx+(q[0]-cx)*s,y,cz+(q[1]-cz)*s]);
      for(let i=0;i<n;i++){const a=prev[i],b2=prev[(i+1)%n],c=cur[(i+1)%n],d=cur[i],m=[(a[0]+b2[0])/2-cx,(1-s)*2+.1,(a[2]+b2[2])/2-cz],nm=nrmOf(a,b2,c,m);rg.quad(a,b2,c,d,nm,rc);}
      prev=cur;}return;}
  // gabled / hipped 4-corner roof: ridge along the long axis
  let q=p;if(hypot(p[1][0]-p[0][0],p[1][1]-p[0][1])<hypot(p[2][0]-p[1][0],p[2][1]-p[1][1]))q=[p[1],p[2],p[3],p[0]];
  const P=q.map(t=>[t[0],wt,t[1]]),mid=(a,b2)=>[(a[0]+b2[0])/2,h,(a[2]+b2[2])/2];
  let m1=mid(P[1],P[2]),m3=mid(P[3],P[0]);
  if(rs===2){const dx=m1[0]-m3[0],dz=m1[2]-m3[2],l=hypot(dx,dz)||1,ins=min(sh*.5,l*.45);m1=[m1[0]-dx/l*ins,h,m1[2]-dz/l*ins];m3=[m3[0]+dx/l*ins,h,m3[2]+dz/l*ins];}
  const ctr=[cx,0,cz],out=(a,b2)=>[(a[0]+b2[0])/2-ctr[0],.6,(a[2]+b2[2])/2-ctr[2]];
  rg.quad(P[0],P[1],m1,m3,nrmOf(P[0],P[1],m1,out(P[0],P[1])),rc);rg.quad(P[2],P[3],m3,m1,nrmOf(P[2],P[3],m3,out(P[2],P[3])),rc);
  const endG=rs===2?rg:bgb(key,STY.PLAIN),endC=rs===2?rc:C3(.5,.32,.25).multiply(tint);
  endG.tri(P[1],P[2],m1,nrmOf(P[1],P[2],m1,out(P[1],P[2])),endC);endG.tri(P[3],P[0],m3,nrmOf(P[3],P[0],m3,out(P[3],P[0])),endC);
}
const FT=[0,1,2,3,4,5].map(s=>facadeTextures(s)),STX=shopTextures(),LT=landmarkTextures();
const facMat=T=>new THREE.MeshStandardMaterial({map:T.map,normalMap:T.nrm,roughnessMap:T.orm,metalnessMap:T.orm,roughness:1,metalness:.85,envMapIntensity:.75,emissive:0xffffff,emissiveMap:T.emis,emissiveIntensity:0,vertexColors:true});
const facMats=[...FT,STX].map(facMat);
const lmMats={};for(const k in LT)lmMats[k]=facMat(LT[k]);
// windows with rooms behind them ("interior mapping"): every 3 m x 1-floor window cell gets a box room traced in the shader — floor, ceiling,
// side walls, a back wall with furniture, some blinds half down. Office curtain walls stay mirror-ish; brick/stone/condo windows are clear glass.
// Window reveals: on brick, stone and slab-block walls the glass sits uRev metres back. A ray that would reach the glass plane outside the
// opening has hit the side of the opening first, so it shows wall (shaded: dark soffit above, lit sill below). Weathering: dirt splashed up
// near the ground, streaks running down from the window sills, a broad mottle so big walls aren't one flat colour.
function facadeFX(mat,st,rev){const prev=mat.onBeforeCompile,tile=FTILE[st],vis=[.5,1,1,1,.32,.32][st],gm=[.55,0,0,.15,.7,.7][st],wx=[.35,1,1,.6,.25,.25][st];
  if(rev===undefined)rev=[0,.2,.22,.1,0,0][st];
  mat.onBeforeCompile=sh=>{if(prev)prev.call(mat,sh);sh.uniforms.uCell={value:new THREE.Vector4(tile[0]/16,tile[1]/16,vis,gm)};sh.uniforms.uRev={value:new THREE.Vector2(rev,wx)};
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
uniform vec4 uCell;uniform vec2 uRev;float fxH(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*45758.5453);}
float fxN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fxH(i),fxH(i+vec2(1,0)),f.x),mix(fxH(i+vec2(0,1)),fxH(i+vec2(1,1)),f.x),f.y);}
vec3 roomRad=vec3(0.),roomAlb=vec3(0.);float glassK=0.,roomShape=1.,revK=0.;`)
    .replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
{float gmask=1.-texture2D(roughnessMap,vRoughnessMapUv).r;
 float bl=smoothstep(.3,.45,dot(diffuseColor.rgb,vec3(.3,.59,.11)));
 vec3 dpx=dFdx(vFogW),dpy=dFdy(vFogW);vec3 wN=normalize(cross(dpx,dpy));if(dot(wN,cameraPosition-vFogW)<0.)wN=-wN;
 float camD=length(vFogW-cameraPosition),nearK=1.-smoothstep(90.,220.,camD);
 if(abs(wN.y)<.5&&uRev.y>0.){
  vec2 m=vMapUv*uCell.xy*16.;float tC=1./(uCell.y*16.);
  float mott=fxN(m*.17)*.6+fxN(m*.55+3.1)*.4;
  float g1=1.-texture2D(roughnessMap,vRoughnessMapUv+vec2(0.,.45*tC)).r,g2=1.-texture2D(roughnessMap,vRoughnessMapUv+vec2(0.,1.1*tC)).r;
  float streak=(1.-gmask)*max(g1,g2*.6)*(.45+.55*fxN(vec2(m.x*2.6,m.y*.35)))*nearK;
  float grime=(1.-smoothstep(.05,2.3,vFogW.y))*(.6+.4*fxN(vec2(m.x*.8,0.)));
  diffuseColor.rgb*=1.-uRev.y*clamp(.26*grime+.2*streak+(mott-.5)*.14,-.06,.4);}
 float rv=0.;
 if(gmask>.02&&abs(wN.y)<.5){
  vec3 T=normalize(cross(vec3(0.,1.,0.),wN));float sg=dot(dpx,T)*dFdx(vMapUv.x)+dot(dpy,T)*dFdy(vMapUv.x);T*=sg<0.?-1.:1.;
  vec2 cell=vMapUv*16.,id=floor(cell),f=fract(cell);float cw=uCell.x,ch=uCell.y,D=4.2;
  float h1=fxH(id),h2=fxH(id+17.3),h3=fxH(id+5.1),h4=fxH(id.yx+2.9);
  vec3 V=normalize(vFogW-cameraPosition),r=vec3(dot(V,T),V.y,max(-dot(V,wN),1e-3)),p0=vec3(f.x*cw,f.y*ch,0.);
  if(uRev.x>0.&&nearK>0.){vec2 off=clamp(r.xy*(uRev.x/max(r.z,.15)),-1.2,1.2)/(vec2(cw,ch)*16.);
   if(1.-texture2D(roughnessMap,vRoughnessMapUv+off).r<.5){rv=nearK;
    vec3 wc=texture2D(map,vMapUv+off).rgb;
    #ifdef USE_COLOR
    wc*=vColor.rgb;
    #endif
    float vy=abs(r.y)/(abs(r.x)+abs(r.y)+1e-3);diffuseColor.rgb=mix(diffuseColor.rgb,wc*mix(.55,r.y>0.?.36:.85,vy),rv);roughnessFactor=mix(roughnessFactor,.9,rv);}}
  float tx=abs(r.x)>1e-4?((r.x>0.?cw:0.)-p0.x)/r.x:1e5,ty=abs(r.y)>1e-4?((r.y>0.?ch:0.)-p0.y)/r.y:1e5,tz=D/r.z,t=min(min(tx,ty),tz);vec3 hp=p0+r*t;
  vec3 wall=mix(vec3(.62,.58,.52),vec3(.55,.6,.62),h2)*(.75+.35*h3),flr=mix(vec3(.32,.22,.15),vec3(.3,.3,.33),step(.5,h4)),ceil_=vec3(.78,.78,.76);
  vec3 alb;float shp;
  if(t==tz){alb=wall*.85;shp=.9;
    float fw=cw*(.2+.25*h1),fh=.55+.9*h2*h2;if(abs(hp.x-cw*(.3+.4*h3))<fw&&hp.y<fh)alb=mix(vec3(.12,.1,.09),vec3(.35,.28,.22),h4); // furniture against the back wall
    if(h1>.7&&hp.y>1.&&hp.y<1.9&&abs(hp.x-cw*.5)<.45)alb=vec3(.15,.2,.25)+h2*.3;}   // a picture / screen
  else if(t==ty){if(r.y<0.){alb=flr;shp=.8;}else{alb=ceil_;float lp=length(vec2(hp.x-cw*.5,(hp.z-D*.45)*.6));shp=1.+2.6*smoothstep(.55,.15,lp);}}
  else{alb=wall;shp=1.;}
  float depthF=mix(1.,.38,hp.z/D);
  float blind=h3<.3?.25+h2*.6:0.;float bnd=step(1.-blind,f.y)*step(.02,blind);   // blinds lowered from the top of the window
  float dist=length(vFogW-cameraPosition),far=smoothstep(140.,420.,dist);
  alb=mix(alb,vec3(.22,.21,.2),far);depthF=mix(depthF,.6,far);shp=mix(shp,1.,far);
  glassK=gmask*(1.-bl)*(1.-bnd)*(1.-rv);revK=rv;roomAlb=alb*depthF;roomShape=shp;
  metalnessFactor=mix(metalnessFactor,uCell.w,glassK);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.12,glassK);
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.76,.7)*(.85+.2*h1),gmask*bnd*(1.-bl)*(1.-rv));}}`)
    .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
totalEmissiveRadiance*=1.-revK;
if(glassK>0.){float day=uAtB.z*(1.-.45*uAtB.w);
  vec3 lit=totalEmissiveRadiance;
  roomRad=roomAlb*(day*vec3(.085,.085,.09)*mix(1.,roomShape,.3)+lit*roomShape*1.05+vec3(.003,.003,.004));
  totalEmissiveRadiance=mix(totalEmissiveRadiance,roomRad*uCell.z,glassK);}`);};
  mat.customProgramCacheKey=()=>'fx'+st+(prev?prev.toString().length:0);return mat;}
realWall(facMats[1],'white_sandstone_blocks_02',FTILE[1],.85);realWall(facMats[2],'red_brick_03',FTILE[2],1);realWall(facMats[3],'concrete_wall_008',FTILE[3],.45);
realWall(lmMats[STY.ARCH],'large_sandstone_blocks',FTILE[STY.ARCH],.8);for(const s of[STY.RIB,STY.BRUT,STY.STAD])realWall(lmMats[s],'concrete_wall_008',FTILE[s],.6);
for(let k=0;k<6;k++)facadeFX(facMats[k],k);
const facVar={};for(const st in FVAR)for(let vr=1;vr<=FVAR[st];vr++){const k=+st,m=facMat(facadeVariant(k,vr));
  if(k===2)realWall(m,'red_brick_03',FTILE[2],vr===3?.7:1);if(k===1)realWall(m,vr===1?'white_sandstone_blocks_02':'concrete_wall_008',FTILE[1],vr===1?.75:.5);if(k===3&&vr===3)realWall(m,'concrete_wall_008',FTILE[3],.4);
  facadeFX(m,k,k===3&&vr===3?.3:k===0?0:undefined);facVar[k+100*vr]=m;}
const plainMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:.05});
const awnMat=(()=>{const c=cv(64,8),g=c.getContext('2d');for(let k=0;k<4;k++){g.fillStyle=k%2?'#ffffff':'#d9d9d9';g.fillRect(k*16,0,16,8);}const t=tex(c,true);
  return new THREE.MeshStandardMaterial({map:t,vertexColors:true,roughness:.88,side:THREE.DoubleSide});})();
const cnMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:.15,emissive:0x000000});
const roofMat=REAL?new THREE.MeshStandardMaterial({map:realTex('gravel_concrete',8/REAL_SIZE.gravel_concrete),normalMap:realTex('gravel_concrete',8/REAL_SIZE.gravel_concrete,'nor'),roughness:.95,metalness:0,vertexColors:true}):new THREE.MeshStandardMaterial({map:LT[19].map,normalMap:LT[19].nrm,roughness:.95,metalness:0,vertexColors:true});
const STMAT=st=>st>=100?facVar[st]:st===19?roofMat:st<7?facMats[st]:st===7?plainMat:st===8?cnMat:st===9?awnMat:lmMats[st];
function meshesOf(bch,shadow){const out=[];
  if(bch.signs)for(const pg of bch.signs){const t=new THREE.CanvasTexture(pg.c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;pg.mat=new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:night*1.1+.08,roughness:.55,vertexColors:true});pg.c=null;SIGNMATS.add(pg.mat);}
  for(const m of bch.values())for(const [st,gb] of m){if(gb.empty)continue;const mat=typeof st==='string'?bch.signs[+st.slice(2)].mat:STMAT(st);const mesh=new THREE.Mesh(gb.geo(),mat);mesh.castShadow=shadow&&typeof st!=='string';mesh.receiveShadow=true;out.push(mesh);}return out;}
const SIGNMATS=new Set();
// build a landmark's GB geometry (through bgb / addVol) into its own group
function lmMeshes(fn,g){const save=__gs.BCH;__gs.BCH=new Map();fn();const ms=meshesOf(__gs.BCH,true);__gs.BCH=save;g=g||new THREE.Group();for(const m of ms)g.add(m);return g;}
class MeshBag{ // merges three.js primitives per material so a landmark costs a handful of draw calls
  constructor(){this.m=new Map();}
  add(geo,mat,x,y,z,ry,sx,sy,sz){if(geo.index)geo=geo.toNonIndexed();for(const k of Object.keys(geo.attributes))if(k!=='position'&&k!=='normal'&&k!=='uv')geo.deleteAttribute(k);
    if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
    if(x!==undefined)geo.applyMatrix4(mat4(x,y,z,ry,sx,sy,sz));let L=this.m.get(mat);if(!L)this.m.set(mat,L=[]);L.push(geo);return this;}
  into(g,shadow=true){for(const [mat,L] of this.m){const m=new THREE.Mesh(mergeGeometries(L),mat);m.castShadow=shadow;m.receiveShadow=true;g.add(m);}return g;}
}

await stage(.5,'Raising landmarks');
export { BASINS, BRAND, CULL, FTILE, GB, HK, MeshBag, ONE, PO, PV, SH, SIGNMATS, STX, STY, UP, WHITE, XAX, YAX, ZONES, _e, _lp, _lq, _m, _q, _s, _v, addCircle, addDecal, addVol, archOf, bgb, capRing, chunkedInstanced, cnMat, cullTick, cumOf, cutLine, decalMat, edgePt, facMats, facVar, flat, grassTex, hAdd, hkey, hsh, inPoly, landMat, lmMats, lmMeshes, mat4, meshesOf, nearestEdge, nodesNear, nrmOf, ntAdd, ntHit, offsetLine, onIsland, onWater, parseCol, pickStyle, plainMat, polyArea, polyCen, polyInto, pushOut, ringOff, solidAt, walkable, wallQ, waterMat, zoneAt };
