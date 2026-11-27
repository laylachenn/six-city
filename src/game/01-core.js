// Six City — core. One of the game's modules; they load in numbered order (src/game/index.js).
import * as THREE from 'three';
import { __gs, __late } from './shared.js';

let N8AOPass=null;try{({N8AOPass}=await import('n8ao'));}catch(e){console.warn('ambient occlusion unavailable',e);} // optional: the game runs without it

/* ============================== utils ============================== */
const {sin,cos,abs,min,max,sqrt,floor,ceil,PI,atan2,exp,sign,hypot,round} = Math;
const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function cv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h||w;return c;}
const wrap=a=>{a=(a+PI)%(2*PI);if(a<0)a+=2*PI;return a-PI};
function mkRng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const R=mkRng(20261), rr=(a,b)=>a+R()*(b-a), ri=(a,b)=>floor(rr(a,b+1)), pick=a=>a[floor(R()*a.length)];
const rnd=Math.random, rpick=a=>a[floor(rnd()*a.length)];
const C3=(r,g,b)=>new THREE.Color(r,g,b);
const $=id=>document.getElementById(id);
const TEST=location.search.includes('test');
const menuShow=on=>document.body.classList.toggle('menu',on);
// loading progress: hand the main thread back to the browser between build stages so the menu keeps painting
const yieldNow=()=>new Promise(r=>{const c=new MessageChannel();c.port1.onmessage=()=>r();c.port2.postMessage(0);});
async function stage(p,label){window.__boot?.(p,label);if(!document.hidden)await new Promise(r=>{requestAnimationFrame(()=>r());setTimeout(r,100);});await yieldNow();}
await stage(.08,'Fetching the map');

/* ============================== map data (OpenStreetMap, ODbL) ============================== */
let MAP;
try{const r=await fetch('assets/toronto.json');if(!r.ok)throw new Error(r.status);MAP=await r.json();}
catch(e){$('err').textContent='Could not load the Toronto map data. Start the local server in the game folder (python3 -m http.server 8765) and open http://127.0.0.1:8765';throw e;}
const PLAY=MAP.play, CURB=0, NODES=MAP.nodes, EDGES=MAP.edges;
__gs.IN=null; // the interior you're in (see interiors)
__gs.ISLE_ON=false; // set once the island grid exists (the islands' ground is 45 cm up, like their mesh)
const groundH=(x,z)=>__gs.IN&&(!__gs.IN.real||hypot(x-__gs.IN.ox,z-__gs.IN.oz)<22)?__gs.IN.floorY:(__gs.ISLE_ON&&z>1600&&__late.onIsland(x,z)?.45:0); // the CN Tower deck only lifts what's inside the pod

/* ============================== renderer ============================== */
const canvas=$('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const QUAL=[{name:'Low',pr:1,shadow:0},{name:'Medium',pr:1.25,shadow:1024},{name:'High',pr:2,shadow:2048}];
__gs.qual=2;__gs.prCap=min(devicePixelRatio,QUAL[__gs.qual].pr);__gs.pr=min(__gs.prCap,1.5);
renderer.setPixelRatio(__gs.pr);
renderer.setSize(innerWidth,innerHeight,false);
const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x9fb8d8,0.0005);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.4,9000);
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()});
const MAXANISO=renderer.capabilities.getMaxAnisotropy();
/* ============================== atmosphere: height fog with sun glow (aerial perspective) + rain-wet streets, in every built-in material ==============================
   Three float arrays are shared by reference by every material (UniformsUtils.clone keeps typed arrays as-is), so one write a frame reaches all of them.
   uAtA = sun direction xyz, haze scale height · uAtB = wetness, rain, daylight, overcast · uAtC = sun glow colour rgb, glow strength */
const ATM={A:new Float32Array([0,1,0,70]),B:new Float32Array(4),C:new Float32Array(4)};
for(const k of['standard','physical','basic','lambert','phong','toon','matcap','points','sprite'])if(THREE.ShaderLib[k])Object.assign(THREE.ShaderLib[k].uniforms,{uAtA:{value:ATM.A},uAtB:{value:ATM.B},uAtC:{value:ATM.C}});
{const SC=THREE.ShaderChunk;
SC.fog_pars_vertex='#ifdef USE_FOG\nvarying float vFogDepth;varying vec3 vFogW;\n#endif';
SC.fog_vertex='#ifdef USE_FOG\nvFogDepth=-mvPosition.z;vFogW=transpose(mat3(viewMatrix))*(mvPosition.xyz-viewMatrix[3].xyz);\n#endif';
SC.fog_pars_fragment=`#ifdef USE_FOG
uniform vec3 fogColor;varying float vFogDepth;varying vec3 vFogW;uniform vec4 uAtA,uAtB,uAtC;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear;uniform float fogFar;
#endif
float atmH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float atmN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(atmH(i),atmH(i+vec2(1,0)),f.x),mix(atmH(i+vec2(0,1)),atmH(i+vec2(1,1)),f.x),f.y);}
#endif`;
SC.fog_fragment=`#ifdef USE_FOG
{vec3 fd=vFogW-cameraPosition;float fl=max(length(fd),1e-3);vec3 fv=fd/fl;
#ifdef FOG_EXP2
 float hk=1./max(uAtA.w,1.),y0=max(cameraPosition.y,0.),dy=fd.y;
 float hAvg=abs(dy)>.05?(exp(-y0*hk)-exp(-(y0+dy)*hk))/(dy*hk):exp(-y0*hk); // mean haze density along the ray (thick near the ground, thin above)
 float od=pow(fogDensity*fl,2.)*.8+fogDensity*fl*hAvg*(1.2+1.3*uAtB.w);
 float fogFactor=1.-exp(-od);
#else
 float fogFactor=smoothstep(fogNear,fogFar,vFogDepth);
#endif
 float sg=pow(max(dot(fv,uAtA.xyz),0.),5.)*uAtC.w;
 gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor+uAtC.rgb*sg,fogFactor);}
#endif`;
// wet streets: flat ground goes darker and glossy, with puddles that turn into mirrors of the sky
SC.lights_physical_fragment+=`
#ifdef USE_FOG

#ifndef USE_ALPHATEST
if(uAtB.x>.001){vec3 upV=normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz);
#ifdef FLAT_SHADED
 float ny=dot(normal,upV);
#else
 float ny=dot(normalize(vNormal),upV);
#endif

 float flatG=smoothstep(.8,.97,ny),pud=smoothstep(.55,.75,atmN(vFogW.xz*.09)*.75+atmN(vFogW.xz*.45)*.35)*smoothstep(.3,1.,uAtB.x);
 float w=uAtB.x*(flatG*.9+.25);
 material.diffuseColor*=1.-.5*w-.25*pud*flatG;
 material.roughness=mix(material.roughness,mix(.38,.05,pud),uAtB.x*flatG);material.roughness=max(material.roughness,.045);}
#endif
#endif`;}
/* ============================== graphics mode: Classic (painted textures) or Realistic (photo-scanned CC0 materials + models from Poly Haven) ============================== */
const GFX=(()=>{const m=location.search.match(/gfx=(\w+)/);if(m)return m[1];try{return localStorage.getItem('sixcity-gfx')||'classic';}catch(e){return 'classic';}})();
const RT={}; // real textures, keyed by Poly Haven id
const REAL_SIZE={red_brick_03:1,white_sandstone_blocks_02:2,large_sandstone_blocks:3,concrete_wall_008:2.71,asphalt_02:3,concrete_pavement:1.8,leafy_grass:2,gravel_concrete:2.12,bark_brown_02:1}; // metres per tile
let REAL=GFX==='real';
if(REAL){try{const L=new THREE.TextureLoader(),load=(id,k,srgb)=>L.loadAsync(`assets/real/tex/${id}_${k}.jpg`).then(t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=MAXANISO;if(srgb)t.colorSpace=THREE.SRGBColorSpace;(RT[id]||(RT[id]={}))[k]=t;});
  const NOR=new Set(['asphalt_02','concrete_pavement','leafy_grass','gravel_concrete','bark_brown_02']);
  await Promise.all(Object.keys(REAL_SIZE).flatMap(id=>[load(id,'diff',true),...(NOR.has(id)?[load(id,'nor',false)]:[])]));
  for(const id in RT){const im=RT[id].diff.image,c=cv(16,16),g=c.getContext('2d');g.drawImage(im,0,0,16,16);const d=g.getImageData(0,0,16,16).data;let r=0,gg=0,b=0;for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];b+=d[i+2];}const n=d.length/4,s2l=v=>Math.pow(v/n/255,2.2);RT[id].avg=new THREE.Vector3(s2l(r),s2l(gg),s2l(b));}
}catch(e){console.warn('realistic textures failed to load, using classic',e);REAL=false;}}
// photo detail on walls: the facade atlas says where the wall is (roughness map red channel = 1) and the photo, at real-world scale, is multiplied in there
function realWall(mat,id,tile,str){if(!REAL||!RT[id])return mat;const T=RT[id],sz=REAL_SIZE[id];
  mat.onBeforeCompile=sh=>{sh.uniforms.dMap={value:T.diff};sh.uniforms.dAvg={value:T.avg};sh.uniforms.dRep={value:new THREE.Vector2(tile[0]/sz,tile[1]/sz)};sh.uniforms.dStr={value:str};
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D dMap;uniform vec3 dAvg;uniform vec2 dRep;uniform float dStr;')
      .replace('#include <map_fragment>','#include <map_fragment>\n{float wm=texture2D(roughnessMap,vRoughnessMapUv).r;vec3 dt=texture2D(dMap,vMapUv*dRep).rgb/max(dAvg,vec3(.02));diffuseColor.rgb*=mix(vec3(1.),clamp(dt,0.,3.),wm*dStr);}');};
  mat.customProgramCacheKey=()=>'rw'+id;return mat;}
// photo detail on the ground decals, in world space (roads keep their markings: the detail fades on bright paint)
function realGround(mat,id,str,paintAware,lum){if(!REAL||!RT[id])return mat;const T=RT[id],sz=REAL_SIZE[id],prev=mat.onBeforeCompile;
  mat.onBeforeCompile=sh=>{prev.call(mat,sh);sh.uniforms.dMap={value:T.diff};sh.uniforms.dAvg={value:T.avg};sh.uniforms.dSz={value:sz};sh.uniforms.dStr={value:str};
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vGw;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvGw=(modelMatrix*vec4(transformed,1.)).xz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vGw;uniform sampler2D dMap;uniform vec3 dAvg;uniform float dSz;uniform float dStr;')
      .replace('#include <color_fragment>',`{vec3 dt=texture2D(dMap,vGw/dSz).rgb/max(dAvg,vec3(.02));${lum?'dt=vec3(dot(dt,vec3(.3,.59,.11)));':''}float k=dStr${paintAware?'*(1.-smoothstep(.25,.55,dot(diffuseColor.rgb,vec3(.3,.59,.11))))':''};diffuseColor.rgb*=mix(vec3(1.),clamp(dt,0.,3.),k);}\n#include <color_fragment>`);};
  mat.customProgramCacheKey=()=>'rg'+id+(paintAware?1:0)+(lum?1:0)+(prev.toString().length);return mat;}
const realTex=(id,repeat,k='diff')=>{const t=RT[id][k].clone();t.needsUpdate=true;t.repeat.set(repeat,repeat);return t;};

export { $, ATM, C3, CURB, EDGES, MAP, MAXANISO, N8AOPass, NODES, PI, PLAY, QUAL, R, REAL, REAL_SIZE, RT, TEST, abs, atan2, camera, canvas, ceil, clamp, cos, cv, exp, floor, groundH, hypot, lerp, max, menuShow, min, mkRng, pick, realGround, realTex, realWall, renderer, ri, rnd, round, rpick, rr, scene, sign, sin, smooth, sqrt, stage, wrap };
