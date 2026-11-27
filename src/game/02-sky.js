// Six City — sky. One of the game's modules; they load in numbered order (src/game/index.js).
import './01-core.js';
import * as THREE from 'three';
import { __gs } from './shared.js';
import { ATM, C3, PI, cos, max, min, renderer, rnd, rpick, rr, scene, sin, smooth, stage } from './01-core.js';

/* ============================== sky ============================== */
const skyU={uZen:{value:C3(.16,.34,.8)},uHor:{value:C3(.62,.76,.95)},uSun:{value:C3(1,.95,.85)},uCloud:{value:C3(1,1,1)},
  uSunDir:{value:new THREE.Vector3(0,1,0)},uStars:{value:0},uTime:{value:0},uCov:{value:.35},uOvc:{value:0}};
const skyMat=new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,fog:false,
  vertexShader:`varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
  fragmentShader:`
  uniform vec3 uZen,uHor,uSun,uCloud,uSunDir;uniform float uStars,uTime,uCov,uOvc;varying vec3 vDir;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  const mat2 RM=mat2(1.6,1.2,-1.2,1.6);
  float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<6;i++){s+=a*noise(p);p=RM*p+7.1;a*=.5;}return s;}
  float cloudD(vec2 uv){vec2 w=vec2(fbm(uv*.6+uTime*.004),fbm(uv*.6+3.7-uTime*.003));float n=fbm(uv+w*.9);
    return smoothstep(1.-uCov-.05,1.-uCov+.32,n);}
  void main(){
    vec3 d=normalize(vDir);float h=max(d.y,0.);
    vec3 col=mix(uHor,uZen,1.-pow(1.-h,2.6));
    if(d.y<0.)col=mix(uHor,uHor*.45,smoothstep(0.,-.25,d.y));
    float sd=max(dot(d,uSunDir),0.);
    // Mie glow around the sun + a brighter, warmer horizon toward it
    col+=uSun*(pow(sd,8.)*.35+pow(sd,2.)*.08)*(1.-h*.6)*(1.-uOvc*.7);
    float c=0.;vec3 cc=vec3(0.);
    if(d.y>.005){
      vec2 uv=d.xz/(d.y+.12)*1.1+uTime*vec2(.006,.002);
      c=cloudD(uv);
      // self-shadowing: march a few steps toward the sun; denser there = darker underside
      vec2 ls=normalize(uSunDir.xz+1e-4)*.09;float occ=0.;for(int k=1;k<=4;k++)occ+=cloudD(uv+ls*float(k));
      float lit=exp(-occ*.75*(1.+uOvc));
      vec3 base=uCloud*mix(.42,.7,uOvc)*mix(vec3(.82,.86,.95),vec3(1.),1.-uOvc);
      cc=mix(base,uCloud*1.08,lit)+uSun*pow(sd,6.)*(1.-c)*1.6*(1.-uOvc);   // silver lining at thin edges facing the sun
      // thin high cirrus
      float ci=smoothstep(.55,.85,fbm(vec2(uv.x*.35,uv.y*1.6)*.7+11.))*.35*(1.-uOvc);
      col=mix(col,uCloud*1.05,ci*smoothstep(.02,.3,d.y));
      float fade=smoothstep(.005,.18,d.y);c*=fade;
      col=mix(col,cc,c);
      vec3 g=floor(d*240.);float st=step(.9987,hash(g.xy+g.z*17.3));col+=st*uStars*smoothstep(0.,.25,d.y)*(1.-c)*(1.-uOvc);}
    col+=uSun*pow(sd,1400.)*35.*(1.-c)*(1.-uOvc);
    // overcast: everything slides toward a flat, bright grey
    float l=dot(col,vec3(.3,.59,.11));col=mix(col,vec3(l)*vec3(.95,.97,1.),uOvc*.75);
    gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`});
const domeGeo=new THREE.SphereGeometry(1,32,16);
const dome=new THREE.Mesh(domeGeo,skyMat);dome.scale.setScalar(900);dome.frustumCulled=false;scene.add(dome);
const envScene=new THREE.Scene();{const d2=new THREE.Mesh(domeGeo,skyMat);d2.scale.setScalar(900);envScene.add(d2);}
const pmrem=new THREE.PMREMGenerator(renderer);
let envRT=null;
function updateEnv(){const rt=pmrem.fromScene(envScene,0,0.1,3000);scene.environment=rt.texture;if(envRT)envRT.dispose();envRT=rt;}

const sun=new THREE.DirectionalLight(0xffffff,3);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
{const s=sun.shadow.camera;s.left=-130;s.right=130;s.top=130;s.bottom=-130;s.near=1;s.far=1600;}
sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.35;
scene.add(sun,sun.target);
const hemi=new THREE.HemisphereLight(0xbfd4ff,0x3a332b,0.4);scene.add(hemi);

const SKY={
  day:{zen:C3(.16,.34,.8),hor:C3(.62,.76,.95),cloud:C3(1,1,1),sun:C3(1,.95,.85)},
  twi:{zen:C3(.13,.16,.36),hor:C3(.95,.5,.28),cloud:C3(.9,.52,.42),sun:C3(1,.5,.2)},
  night:{zen:C3(.008,.012,.03),hor:C3(.025,.035,.07),cloud:C3(.03,.04,.06),sun:C3(.5,.6,.8)}};
const mix3=(o,a,b,c,wa,wb,wc)=>o.setRGB(a.r*wa+b.r*wb+c.r*wc,a.g*wa+b.g*wb+c.g*wc,a.b*wa+b.b*wb+c.b*wc);
const sunDir=new THREE.Vector3();let night=0,sinE=1;
function updateSky(time){
  const ang=(time-6)/24*2*PI;sinE=sin(ang)*0.9;
  const el=Math.asin(sinE),az=ang*0.9+0.7;
  sunDir.set(cos(el)*cos(az),sinE,cos(el)*sin(az));
  const wd=smooth(0,.33,sinE),wn=smooth(0,-.22,sinE),wt=max(0,1-wd-wn);night=wn;
  mix3(skyU.uZen.value,SKY.day.zen,SKY.twi.zen,SKY.night.zen,wd,wt,wn);
  mix3(skyU.uHor.value,SKY.day.hor,SKY.twi.hor,SKY.night.hor,wd,wt,wn);
  mix3(skyU.uCloud.value,SKY.day.cloud,SKY.twi.cloud,SKY.night.cloud,wd,wt,wn);
  mix3(skyU.uSun.value,SKY.day.sun,SKY.twi.sun,SKY.night.sun,wd,wt,wn*.5);
  skyU.uStars.value=wn*1.2;
  const ld=skyU.uSunDir.value;
  if(sinE>=-0.04){ld.copy(sunDir);if(ld.y<.03){ld.y=.03;ld.normalize();}}
  else{ld.set(-sunDir.x,max(.25,-sunDir.y),-sunDir.z).normalize();}
  mix3(sun.color,SKY.day.sun,SKY.twi.sun,SKY.night.sun,wd,wt,wn);
  sun.intensity=wd*3.3+wt*0.9*smooth(-.04,.05,sinE)+wn*0.35;
  hemi.color.copy(skyU.uZen.value).lerp(C3(.3,.38,.62),.35+wn*.5);
  hemi.intensity=.12+wn*1.0;
  scene.fog.color.copy(skyU.uHor.value);
  renderer.toneMappingExposure=1+wn*.25;
  // weather on top of the time of day: cloud cover dims and softens the sun, overcast fills in skylight, rain thickens the haze
  const o=WX.ovc,r=WX.rain;skyU.uCov.value=WX.cov;skyU.uOvc.value=o;
  sun.intensity*=1-.82*o;hemi.intensity+=o*(.55*wd+.1);hemi.color.lerp(C3(.78,.8,.84).multiplyScalar(wd+.15),o*.6);
  skyU.uCloud.value.multiplyScalar(1-.35*o*wd);skyU.uZen.value.lerp(C3(.42,.46,.52).multiplyScalar(wd*.9+.08),o*.8);skyU.uHor.value.lerp(C3(.6,.63,.68).multiplyScalar(wd*.9+.06),o*.8);
  scene.fog.color.copy(skyU.uHor.value);scene.fog.density=.00042*(1+o*.5+r*.8);
  ATM.A[0]=skyU.uSunDir.value.x;ATM.A[1]=skyU.uSunDir.value.y;ATM.A[2]=skyU.uSunDir.value.z;ATM.A[3]=55+o*40;
  const glow=(wd*.32+wt*.9)*(1-o*.85)*(sinE>-.05?1:0);ATM.C[0]=skyU.uSun.value.r;ATM.C[1]=skyU.uSun.value.g*.92;ATM.C[2]=skyU.uSun.value.b*.8;ATM.C[3]=glow;
  ATM.B[1]=r;ATM.B[2]=wd;ATM.B[3]=o;
}
/* --- weather: clear → cloudy → rain and back, drifting on its own (Y cycles it by hand). Wetness lags the rain: streets soak in ~30 s and dry over minutes --- */
const WX={mode:0,cov:.38,ovc:0,rain:0,wet:0,t:0,next:200,manual:0};
const WXM=[{n:'Clear',cov:.36,ovc:0,rain:0},{n:'Cloudy',cov:.62,ovc:.45,rain:0},{n:'Overcast',cov:.85,ovc:.85,rain:0},{n:'Rain',cov:.95,ovc:1,rain:1},{n:'Storm',cov:1,ovc:1,rain:1.6}];
{const m=location.search.match(/weather=(\w+)/);if(m){const k=WXM.findIndex(q=>q.n.toLowerCase()===m[1]);if(k>=0){WX.mode=k;Object.assign(WX,{cov:WXM[k].cov,ovc:WXM[k].ovc,rain:WXM[k].rain,wet:WXM[k].rain?1:0,manual:1});}}}
function setWeather(k){WX.mode=k;WX.t=0;WX.next=rr(150,320);}
function stepWeather(dt){const T=WXM[WX.mode];WX.t+=dt;
  if(!WX.manual&&WX.t>WX.next){const c=WX.mode,opts=c===0?[0,1,1]:c===1?[0,2,3]:c===2?[1,3,3]:c===3?[2,4,3]:[3];setWeather(rpick(opts));}
  const ap=(v,t,rate)=>v+(t-v)*min(1,dt*rate);WX.cov=ap(WX.cov,T.cov,.05);WX.ovc=ap(WX.ovc,T.ovc,.05);WX.rain=ap(WX.rain,T.rain,.12);
  WX.wet=WX.rain>.15?min(1,WX.wet+dt/30*WX.rain):max(0,WX.wet-dt/150);
  ATM.B[0]=__gs.IN?0:WX.wet;}
// rain: 14k streaks in a box that travels with the camera; each falls, wraps, and is stretched along its velocity so it reads as motion blur
const rainMesh=(()=>{const N=14000,seed=new Float32Array(N*4*3),cor=new Float32Array(N*4*2),idx=new Uint32Array(N*6);
  for(let i=0;i<N;i++){const a=rnd(),b=rnd(),c=rnd();for(let k=0;k<4;k++){seed.set([a,b,c],(i*4+k)*3);cor.set([k&1?1:-1,k>>1],(i*4+k)*2);}idx.set([i*4,i*4+1,i*4+3,i*4,i*4+3,i*4+2],i*6);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(seed,3));g.setAttribute('aC',new THREE.BufferAttribute(cor,2));g.setIndex(new THREE.BufferAttribute(idx,1));
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uT:{value:0},uBox:{value:new THREE.Vector3(32,22,32)},uWind:{value:new THREE.Vector2(1.6,.8)},uAmt:{value:0},uCol:{value:new THREE.Color(.5,.53,.58)}},
    vertexShader:`attribute vec2 aC;uniform float uT,uAmt;uniform vec3 uBox;uniform vec2 uWind;varying float vA;varying float vY;
      void main(){vec3 sd=position;float spd=9.+sd.z*3.;vec3 vel=vec3(uWind.x,-spd,uWind.y);
        vec3 p=fract(sd+(vel*uT-cameraPosition)/uBox)*uBox-uBox*.5+cameraPosition;
        vec3 vd=normalize(p-cameraPosition),side=normalize(cross(normalize(vel),vd))*.02;
        p+=side*aC.x+normalize(vel)*aC.y*(.55+sd.x*.3);
        float d=length(p-cameraPosition);vA=step(fract(sd.y*7.31),uAmt*.9)*smoothstep(1.2,3.,d)*(1.-smoothstep(10.,16.,d));vY=aC.y;
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform vec3 uCol;varying float vA;varying float vY;void main(){if(vA<.01)discard;gl_FragColor=vec4(uCol*vA*(.3+.7*vY),1.);}`});
  const o=new THREE.Mesh(g,m);o.frustumCulled=false;o.renderOrder=90;o.visible=false;scene.add(o);return o;})();
function stepRain(dt){const u=rainMesh.material.uniforms;u.uT.value+=dt;u.uAmt.value=WX.rain;rainMesh.visible=WX.rain>.03&&!__gs.IN;
  const day=ATM.B[2];u.uCol.value.setRGB(.5,.53,.58).multiplyScalar(.4+day*1.1);}

await stage(.2,'Painting textures');
export { WX, WXM, dome, hemi, night, setWeather, sinE, skyU, stepRain, stepWeather, sun, updateEnv, updateSky };
