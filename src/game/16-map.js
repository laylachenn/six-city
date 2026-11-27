// Six City — map. One of the game's modules; they load in numbered order (src/game/index.js).
import './15-casino.js';
import * as GG from '../gangs.js';
import { __gs, __late, later } from './shared.js';
import { $, EDGES, MAP, NODES, TEST, abs, atan2, canvas, clamp, cos, hypot, max, min, round, sin, wrap } from './01-core.js';
import { cumOf, cutLine, nearestEdge } from './04-world.js';
import { placeName } from './05-landmarks.js';
import { GARAGES } from './07-people.js';
import { G, player } from './08-input.js';
import { GIVERS, MS, SAVE, nextFor } from './11-missions.js';
import { BIZ, HOUSES, money } from './13-homes.js';
import { SPOTB } from './14-interiors.js';
later({BM:()=>BM,abLoad:()=>abLoad,closeMap:()=>closeMap,openMap:()=>openMap}); // for earlier modules, read when called

/* ============================== GPS routing + full-screen map ============================== */
// Dijkstra over the street graph (binary heap); one-way streets are respected when driving
function dijkstra(starts,oneway){
  const N=NODES.length,dist=new Float64Array(N).fill(Infinity),prev=new Int32Array(N).fill(-1),pe=new Int32Array(N).fill(-1),H=[];
  const push=(d,v)=>{H.push([d,v]);let i=H.length-1;while(i>0){const p=(i-1)>>1;if(H[p][0]<=H[i][0])break;[H[p],H[i]]=[H[i],H[p]];i=p;}};
  const pop=()=>{const t=H[0],l=H.pop();if(H.length){H[0]=l;let i=0;for(;;){const a=2*i+1,b=a+1;let m=i;if(a<H.length&&H[a][0]<H[m][0])m=a;if(b<H.length&&H[b][0]<H[m][0])m=b;if(m===i)break;[H[m],H[i]]=[H[i],H[m]];i=m;}}return t;};
  for(const [n,d] of starts){if(d<dist[n]){dist[n]=d;push(d,n);}}
  while(H.length){const [d,u]=pop();if(d>dist[u])continue;
    for(const ei of NODES[u].e){const e=EDGES[ei];if(!e.ai)continue;if(oneway&&e.ow&&e.a!==u)continue;const v=e.a===u?e.b:e.a,nd=d+e.L;if(nd<dist[v]){dist[v]=nd;prev[v]=u;pe[v]=ei;push(nd,v);}}}
  return{dist,prev,pe};
}
const edgeSub=(e,s0,s1)=>{ // points along edge e from distance s0 to s1 (either direction)
  if(abs(s1-s0)<.01)return[];const a=min(s0,s1),b=max(s0,s1),pts=cutLine(e.p,e.cum,a,b);return s0<=s1?pts:pts.reverse();};
__gs.ROUTE=null;
function computeRoute(){
  if(!G.wp){__gs.ROUTE=null;return;}
  const oneway=!!G.car,aiE=r=>r&&r.e.ai?r:null,from=aiE(nearestEdge(__gs.FX,__gs.FZ,80))||nearestEdge(__gs.FX,__gs.FZ,80),to=nearestEdge(G.wp.x,G.wp.z,260,e=>e.ai)||nearestEdge(G.wp.x,G.wp.z,600,e=>e.ai)||nearestEdge(G.wp.x,G.wp.z,260);
  if(!from||!to){__gs.ROUTE={pts:[[__gs.FX,__gs.FZ],[G.wp.x,G.wp.z]],steps:[],len:hypot(G.wp.x-__gs.FX,G.wp.z-__gs.FZ)};return;}
  const fe=from.e,starts=[];
  starts.push([fe.b,fe.L-from.s]);
  if(!oneway||!fe.ow)starts.push([fe.a,from.s]);
  const D=dijkstra(starts,oneway),te=to.e;
  const cand=[[te.a,to.s],[te.b,te.L-to.s]].filter(([n])=>!oneway||!te.ow||n===te.a);
  let best=null,bc=Infinity;for(const [n,add] of cand){const c=D.dist[n]+add;if(c<bc){bc=c;best=n;}}
  if(best===null||!isFinite(bc)){__gs.ROUTE={pts:[[__gs.FX,__gs.FZ],[G.wp.x,G.wp.z]],steps:[],len:hypot(G.wp.x-__gs.FX,G.wp.z-__gs.FZ)};return;}
  const chain=[];for(let v=best;v>=0&&D.pe[v]>=0;v=D.prev[v])chain.push(v);chain.reverse(); // nodes after the first
  let first=best;{let v=best;while(D.prev[v]>=0)v=D.prev[v];first=v;}
  const pts=[[__gs.FX,__gs.FZ]],legs=[];
  pts.push(...edgeSub(fe,from.s,first===fe.b?fe.L:0));legs.push({e:fe,at:pts.length-1});
  for(const v of chain){const e=EDGES[D.pe[v]],u=D.prev[v];legs.push({e,at:pts.length-1});pts.push(...edgeSub(e,u===e.a?0:e.L,u===e.a?e.L:0));}
  legs.push({e:te,at:pts.length-1});pts.push(...edgeSub(te,best===te.a?0:te.L,to.s),[G.wp.x,G.wp.z]);
  const cum=cumOf(pts),steps=[];
  const head=i=>{const a=pts[max(0,i-1)],b=pts[min(pts.length-1,i+1)];return atan2(b[0]-a[0],b[1]-a[1]);};
  let cur=legs[0].e.short;
  for(let k=1;k<legs.length;k++){const nm=legs[k].e.short;if(!nm||nm===cur)continue;const i=legs[k].at;
    const h0=atan2(pts[i][0]-pts[max(0,i-3)][0],pts[i][1]-pts[max(0,i-3)][1]),j=min(pts.length-1,i+3),h1=atan2(pts[j][0]-pts[i][0],pts[j][1]-pts[i][1]),d=wrap(h1-h0);
    steps.push({name:nm,at:cum[i],turn:abs(d)<.45?'straight':d<0?'right':'left'});cur=nm;}
  __gs.ROUTE={pts,steps,len:cum[cum.length-1],t:G.sigT};
}
const gpsEl=$('gps');
function stepGPS(dt){
  if(__gs.IN&&!__gs.IN.real){__gs.ROUTE=null;$('gps').style.display='none';return;}
  if(!G.wp){__gs.ROUTE=null;if(gpsEl.style.display!=='none')gpsEl.style.display='none';return;}
  G.routeT=(G.routeT||0)-dt;if(G.routeT<=0||!__gs.ROUTE){computeRoute();G.routeT=1.2;}
  if(!__gs.ROUTE)return;
  const nx=__gs.ROUTE.steps[0],fmt=m=>m>=1000?(m/1000).toFixed(1)+' km':max(10,round(m/10)*10)+' m',arrow={left:'↰',right:'↱',straight:'↑'};
  const html=(nx?`<b>${arrow[nx.turn]}</b> ${nx.turn==='straight'?'Continue onto':'Turn '+nx.turn+' onto'} <span>${nx.name}</span> · ${fmt(nx.at)}`:`<b>↑</b> Head to <span>${G.wp.name}</span>`)+`<i>${G.wp.name} · ${fmt(__gs.ROUTE.len)}</i>`;
  if(gpsEl.innerHTML!==html)gpsEl.innerHTML=html;if(gpsEl.style.display!=='block')gpsEl.style.display='block';
}
function setWaypointAt(x,z,name){const r=nearestEdge(x,z,120);G.wp={x,z,name:name||placeName(x,z)};G.routeT=0;__gs.ROUTE=null;}
// --- full-screen map (M) ---
const bigEl=$('bigmap'),bigC=$('bigc'),bg=bigC.getContext('2d');
const BM={open:false,cx:0,cz:0,s:.32,drag:null};
const PICKS=()=>{const L=[];const add=(n,c,a)=>{if(c)L.push([n,c[0],c[1],a]);};
  const h=HOUSES.find(q=>q.id===SAVE.home);if(h)add('🏠 Home',h.at,'Your places');
  for(const k in GIVERS)if(nextFor(k))add('★ '+GIVERS[k].name,GIVERS[k].at,'Your places');
  if(MS&&MS.tp)add('◎ Mission target',MS.tp,'Your places');
  for(const s of SPOTB)add(s.name,s.at,'Shops & services');
  for(const p of MAP.places||[])add(p.n,p.c,p.a);
  return L;};
function openMap(){BM.open=true;G.mapOpen=true;BM.cx=__gs.FX;BM.cz=__gs.FZ;bigEl.style.display='block';if(document.pointerLockElement)document.exitPointerLock();buildPicks();drawBigMap();}
function closeMap(noLock){$('addrq').blur();BM.open=false;G.mapOpen=false;bigEl.style.display='none';if(!TEST&&!noLock)canvas.requestPointerLock?.();}
function buildPicks(){let area='',html=G.wp?`<button data-t="wp" class="tpw">⤴ Teleport to waypoint</button>`:'';
  PICKS().forEach((p,i)=>{if(p[3]!==area){area=p[3];html+=`<div class="area">${area}</div>`;}html+=`<div class="row"><button data-i="${i}">${p[0]}</button><button class="tp" data-t="${i}" title="Teleport to ${p[0].replace(/"/g,'')}">⤴</button></div>`;});
  $('picks').innerHTML=html+(G.wp?'<button data-i="clear" class="clr">✕ Clear waypoint</button>':'');}
$('picks').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.t){if(b.dataset.t==='wp'){if(G.wp)__late.teleportTo(G.wp.x,G.wp.z,G.wp.name||'Waypoint');}else{const p=PICKS()[+b.dataset.t];__late.teleportTo(p[1],p[2],p[0].replace(/^[^A-Za-z]+/,''));}return;}
  if(b.dataset.i==='clear'){G.wp=null;__gs.ROUTE=null;}else{const p=PICKS()[+b.dataset.i];setWaypointAt(p[1],p[2],p[0].replace(/^[^A-Za-z]+/,''));computeRoute();BM.cx=(__gs.FX+p[1])/2;BM.cz=(__gs.FZ+p[2])/2;}buildPicks();drawBigMap();});
$('mapclose').addEventListener('click',closeMap);
// --- go to a real address: "160 Spadina Ave", "Queen & Spadina", "CN Tower", "Tim Hortons" (assets/addresses.json, loaded the first time you search)
const AB={data:null,loading:null,streets:null};
const ABBR={street:'st',avenue:'ave',av:'ave',road:'rd',boulevard:'blvd',drive:'dr',crescent:'cres',court:'ct',place:'pl',lane:'ln',square:'sq',terrace:'terr',parkway:'pkwy',circle:'circ',gardens:'gdns',east:'e',west:'w',north:'n',south:'s',saint:'st',mount:'mt'};
const TYPEW=new Set(['st','ave','rd','blvd','dr','cres','ct','pl','ln','sq','terr','pkwy','circ','gdns','way','gate','trail','e','w','n','s']);
const normT=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[.'’]/g,'').replace(/[^a-z0-9&]+/g,' ').trim().split(/\s+/).filter(Boolean).map(w=>ABBR[w]||w);
function abLoad(){if(AB.loading)return AB.loading;AB.loading=fetch('assets/addresses.json').then(r=>r.json()).then(d=>{AB.data=d;
  AB.streets=d.st.map(row=>{const parts=row.split('|'),name=parts[0];return{name,t:normT(name),list:parts.slice(1).map(q=>{const [n,x,z]=q.split(';');return{n,v:parseInt(n),x:+x,z:+z};})};});
  AB.shops=d.sh.map(row=>{const [n,x,z,ad]=row.split(';');return{n,t:normT(n),x:+x,z:+z,ad};});return d;});return AB.loading;}
// how well a street name matches the words typed: every core word must start a word of the name (in order); type words (St, Ave, W) only refine
function streetScore(t,q){const core=q.filter(w=>!TYPEW.has(w));if(!core.length)return 0;let i=0,s=0;
  for(const w of core){let hit=-1;for(let k=i;k<t.length;k++)if(t[k].startsWith(w)){hit=k;break;}if(hit<0)return 0;s+=t[hit]===w?3:1;i=hit+1;}
  for(const w of q)if(TYPEW.has(w)){s+=t.includes(w)?2:-1.5;}
  return s-.15*(t.filter(w=>!TYPEW.has(w)).length-core.length);}
function searchPlaces(qs){const out=[],q=normT(qs);if(!q.length)return out;const d2=(x,z)=>hypot(x-__gs.FX,z-__gs.FZ);
  // intersection: "Queen & Spadina", "yonge and dundas", "king at bay"
  const ix=qs.split(/\s*(?:&|\band\b|\bat\b|\/)\s*/i);
  if(ix.length===2&&ix[0]&&ix[1]){const a=normT(ix[0]),b=normT(ix[1]),seen=new Set();
    for(const n of NODES){const ns=new Set(n.e.map(k=>EDGES[k].n).filter(Boolean));if(ns.size<2)continue;let A=null,B=null;
      for(const nm of ns){const t=normT(nm);if(!A&&streetScore(t,a)>0)A=nm;else if(!B&&streetScore(t,b)>0)B=nm;}
      if(A&&B){const k=A+'|'+B;if(seen.has(k))continue;seen.add(k);out.push({label:`${A} & ${B}`,x:n.x,z:n.z,sc:90+(streetScore(normT(A),a)+streetScore(normT(B),b))*.5-d2(n.x,n.z)/1e4});}}}
  // house number + street
  const m=qs.trim().match(/^(\d+[a-z]?)(?:\s*[-–]\s*\d+)?\s+(.+)$/i);
  if(m&&AB.streets){const num=m[1].toLowerCase(),nv=parseInt(num),q2=normT(m[2]);
    const cands=AB.streets.map(s=>({s,sc:streetScore(s.t,q2)})).filter(c=>c.sc>0).sort((a,b)=>b.sc-a.sc).slice(0,4);
    for(const {s,sc} of cands){let hit=s.list.find(a=>a.n.toLowerCase()===num),approx=false;
      if(!hit){let bd=1e9;for(const a of s.list){if(isNaN(a.v)||(a.v%2)!==(nv%2))continue;const d=abs(a.v-nv);if(d<bd){bd=d;hit=a;}}approx=!!hit;if(hit&&bd>60)hit=null;}
      if(hit)out.push({label:`${approx?'≈ ':''}${hit.n} ${s.name}`,sub:approx?`closest number to ${m[1]} on this street`:'',x:hit.x,z:hit.z,sc:100+sc-(approx?5:0)});}}
  // a whole street
  if(!m&&AB.streets&&ix.length<2)for(const s of AB.streets){const sc=streetScore(s.t,q);if(sc>=q.filter(w=>!TYPEW.has(w)).length*2){const mid=s.list[s.list.length>>1];if(mid)out.push({label:s.name,sub:`${s.list.length} addresses`,x:mid.x,z:mid.z,sc:20+sc});}}
  // landmarks + doors + named shops / restaurants (nearest first)
  const has=(t)=>q.every(w=>t.some(x=>x.startsWith(w)));
  for(const p of MAP.places)if(has(normT(p.n)))out.push({label:p.n,sub:p.a,x:p.c[0],z:p.c[1],sc:80});
  if(AB.shops){const hits=AB.shops.filter(s=>has(s.t)).sort((a,b)=>d2(a.x,a.z)-d2(b.x,b.z)).slice(0,8);for(const s of hits)out.push({label:s.n,sub:(s.ad?s.ad+' · ':'')+(d2(s.x,s.z)/1000).toFixed(1)+' km away',x:s.x,z:s.z,sc:60-d2(s.x,s.z)/1e4});}
  const seen=new Set();return out.sort((a,b)=>b.sc-a.sc).filter(r=>{const k=round(r.x/12)+','+round(r.z/12);if(seen.has(k))return false;seen.add(k);return true;}).slice(0,12);}
let AQ=[];
function runSearch(){const qs=$('addrq').value,el=$('addrres');if(!qs.trim()){el.innerHTML='';return;}
  if(!AB.data){el.innerHTML='<div class="mh">Loading Toronto addresses…</div>';abLoad().then(runSearch).catch(()=>{el.innerHTML='<div class="mh">Couldn\'t load the address book.</div>';});return;}
  AQ=searchPlaces(qs);el.innerHTML=AQ.length?AQ.map((r,i)=>`<div class="row"><button data-a="${i}">${r.label.replace(/</g,'&lt;')}${r.sub?`<i>${r.sub}</i>`:''}</button><button class="tp" data-at="${i}" title="Teleport there">⤴</button></div>`).join('')
    :'<div class="mh">No match. Try “160 Spadina Ave”, “Queen &amp; Spadina” or a shop name — addresses cover downtown, midtown, East York and North York.</div>';}
$('addrq').addEventListener('input',()=>{clearTimeout(AB.t);AB.t=setTimeout(runSearch,160);});
$('addrq').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'&&AQ[0]){__late.teleportTo(AQ[0].x,AQ[0].z,AQ[0].label.replace(/^≈ /,''));}if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();$('addrq').blur();}});
$('addrres').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.at){const r=AQ[+b.dataset.at];__late.teleportTo(r.x,r.z,r.label.replace(/^≈ /,''));return;}
  const r=AQ[+b.dataset.a];setWaypointAt(r.x,r.z,r.label.replace(/^≈ /,''));computeRoute();BM.cx=r.x;BM.cz=r.z;buildPicks();drawBigMap();});

const toWorld=(px,py)=>[BM.cx+(px-bigC.width/2)/BM.s,BM.cz+(py-bigC.height/2)/BM.s];
bigC.addEventListener('mousedown',e=>{BM.drag={x:e.clientX,y:e.clientY,cx:BM.cx,cz:BM.cz,moved:false};});
addEventListener('mousemove',e=>{if(!BM.drag)return;const dx=e.clientX-BM.drag.x,dy=e.clientY-BM.drag.y;if(abs(dx)+abs(dy)>4)BM.drag.moved=true;BM.cx=BM.drag.cx-dx*devicePixelRatio/BM.s;BM.cz=BM.drag.cz-dy*devicePixelRatio/BM.s;drawBigMap();});
addEventListener('mouseup',e=>{if(!BM.drag)return;const d=BM.drag;BM.drag=null;if(!d.moved&&BM.open){const r=bigC.getBoundingClientRect(),[x,z]=toWorld((e.clientX-r.left)*devicePixelRatio,(e.clientY-r.top)*devicePixelRatio);
  if(G.wp&&hypot(G.wp.x-x,G.wp.z-z)*BM.s<24){G.wp=null;__gs.ROUTE=null;}else{setWaypointAt(x,z);computeRoute();}buildPicks();drawBigMap();}});
bigC.addEventListener('wheel',e=>{e.preventDefault();const r=bigC.getBoundingClientRect(),px=(e.clientX-r.left)*devicePixelRatio,py=(e.clientY-r.top)*devicePixelRatio,[wx,wz]=toWorld(px,py);
  BM.s=clamp(BM.s*(e.deltaY<0?1.18:1/1.18),.12,2.2);BM.cx=wx-(px-bigC.width/2)/BM.s;BM.cz=wz-(py-bigC.height/2)/BM.s;drawBigMap();},{passive:false});
function drawBigMap(){
  const W=bigC.width=round(bigC.clientWidth*devicePixelRatio),H=bigC.height=round(bigC.clientHeight*devicePixelRatio),s=BM.s,X=x=>(x-BM.cx)*s+W/2,Y=z=>(z-BM.cz)*s+H/2;
  bg.fillStyle='#86c3dd';bg.fillRect(0,0,W,H);
  bg.save();bg.translate(W/2,H/2);bg.scale(s,s);bg.translate(-BM.cx,-BM.cz);__late.drawMap(bg,BM.cx-W/2/s,BM.cz-H/2/s,BM.cx+W/2/s,BM.cz+H/2/s,s<.45);
  if(__gs.ROUTE){bg.lineCap='round';bg.lineJoin='round';bg.strokeStyle='rgba(255,255,255,.9)';bg.lineWidth=max(14,9/s*1.6);bg.beginPath();__gs.ROUTE.pts.forEach((q,i)=>i?bg.lineTo(q[0],q[1]):bg.moveTo(q[0],q[1]));bg.stroke();
    bg.strokeStyle='#8a5cff';bg.lineWidth=max(9,6/s*1.6);bg.stroke();}
  for(const t of __late.TURFS){const c=GG.crewOf(SAVE.turf[t.id]);if(!c)continue;bg.fillStyle=c.col;bg.globalAlpha=__late.TF.defend&&__late.TF.defend.t_===t?.34+.12*sin(performance.now()/200):.17;for(const[x,z]of t.cells)bg.fillRect(x,z,__late.TC,__late.TC);}bg.globalAlpha=1;
  bg.restore();
  const dpr=devicePixelRatio,dot=(x,z,col,r,lab)=>{bg.fillStyle=col;bg.beginPath();bg.arc(X(x),Y(z),r*dpr,0,7);bg.fill();bg.strokeStyle='#14204a';bg.lineWidth=2*dpr;bg.stroke();
    if(lab){bg.font=`800 ${12*dpr}px Inter, sans-serif`;bg.textAlign='left';bg.textBaseline='middle';bg.lineWidth=4*dpr;bg.strokeStyle='rgba(255,255,255,.9)';bg.strokeText(lab,X(x)+(r+5)*dpr,Y(z));bg.fillStyle='#14204a';bg.fillText(lab,X(x)+(r+5)*dpr,Y(z));}};
  for(const p of PICKS())if(!/^[★🏠◎]/.test(p[0]))dot(p[1],p[2],'#ffffff',5,s>=.5?p[0]:''); // names once zoomed in enough to read them
  for(const h of HOUSES)dot(h.at[0],h.at[1],SAVE.homes.includes(h.id)?'#4f8bff':'#2fc36a',6,SAVE.homes.includes(h.id)?'Home':'For sale $'+(h.price/1000|0)+'k');
  for(const k in GIVERS)if(nextFor(k))dot(GIVERS[k].at[0],GIVERS[k].at[1],GIVERS[k].css,7,GIVERS[k].name);
  for(const [x,z] of GARAGES)dot(x,z,'#35d16a',5,'Garage');
  for(const t of __late.TURFS){const c=GG.crewOf(SAVE.turf[t.id]);dot(t.cx,t.cz,c?c.col:'#d8d6d0',4,s>.6?t.id:'');}
  for(const b of BIZ){const st=SAVE.biz[b.id];dot(b.at[0],b.at[1],st?'#ffc23d':'#a05cff',6,st?`${b.name} · ${money(st.safe)}`:`${b.name} $${b.price/1000}k`);}
  {const C=__late.HB.F.find(F=>F.r.name==='Centre Island')||__late.HB.F[0];if(C)dot(C.gate.A.x,C.gate.A.z,'#3fe0ff',7,'Island ferries');for(const F of __late.HB.F)dot(F.gate.B.x,F.gate.B.z,'#3fe0ff',6,'Ferry to the city');}
  for(const s of SPOTB)dot(s.at[0],s.at[1],s.col,5,s.name);
  if(MS&&MS.tp)dot(MS.tp[0],MS.tp[1],'#3fe0ff',8,'Mission');
  if(G.wp)dot(G.wp.x,G.wp.z,'#8a5cff',9,G.wp.name);
  const th=G.car?G.car.th:player.th,hx=sin(th),hz=cos(th),px=X(__gs.FX),py=Y(__gs.FZ),q=dpr;
  bg.fillStyle='#e8303f';bg.strokeStyle='#fff';bg.lineWidth=2.5*q;bg.beginPath();bg.moveTo(px+hx*14*q,py+hz*14*q);bg.lineTo(px-hx*8*q-hz*9*q,py-hz*8*q+hx*9*q);bg.lineTo(px-hx*3*q,py-hz*3*q);bg.lineTo(px-hx*8*q+hz*9*q,py-hz*8*q-hx*9*q);bg.closePath();bg.fill();bg.stroke();
}
if(TEST){window.__openMap=openMap;window.__closeMap=closeMap;window.__setWp=(x,z,n)=>{setWaypointAt(x,z,n);computeRoute();return __gs.ROUTE&&{len:__gs.ROUTE.len|0,pts:__gs.ROUTE.pts.length,steps:__gs.ROUTE.steps.slice(0,4)};};}

export { BM, closeMap, computeRoute, openMap, setWaypointAt, stepGPS };
