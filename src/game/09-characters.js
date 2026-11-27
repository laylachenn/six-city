// Six City — characters. One of the game's modules; they load in numbered order (src/game/index.js).
import './08-input.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { __gs, __late, later } from './shared.js';
import { PI, REAL, TEST, abs, cos, lerp, max, min, renderer, scene, sin, smooth } from './01-core.js';
import { XAX } from './04-world.js';
import { renderFrame } from './05-landmarks.js';
import { PIMS, pedPose, peds } from './07-people.js';
import { G, player } from './08-input.js';
later({poseRigs:()=>poseRigs,useRigs:()=>useRigs}); // for earlier modules, read when called

/* ============================== detailed characters (Quaternius Universal Base Characters, CC0) ============================== */
// Loaded from assets/chars over http. If they can't load (e.g. the page was opened as a file), the built-in characters above are used instead.
const CH='assets/chars/',RIG_PEDS=16,DRIVEN=['spine_01','spine_02','spine_03','neck_01','Head','thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r','upperarm_l','lowerarm_l','upperarm_r','lowerarm_r'];
let RIGS=null,useRigs=false;
const DOWN=new THREE.Vector3(0,-1,0),QI=new THREE.Quaternion();
function prepRig(g,lightTex){
  const sc=g.scene;sc.updateMatrixWorld(true);
  const bones={};let body=null;
  sc.traverse(o=>{if(o.isBone)bones[o.name]=o;if(o.isSkinnedMesh&&/Superhero/.test(o.material.name))body=o;});
  const qw=o=>o.getWorldQuaternion(new THREE.Quaternion()),pw=n=>bones[n].getWorldPosition(new THREE.Vector3());
  const rest={};for(const n of DRIVEN)rest[n]={q:qw(bones[n]),pi:qw(bones[n].parent).invert()};
  for(const sd of['l','r']){
    rest['upperarm_'+sd].base=new THREE.Quaternion().setFromUnitVectors(pw('lowerarm_'+sd).sub(pw('upperarm_'+sd)).normalize(),DOWN);
    rest['lowerarm_'+sd].base=new THREE.Quaternion().setFromUnitVectors(pw('hand_'+sd).sub(pw('lowerarm_'+sd)).normalize(),DOWN);
  }
  // per-vertex "arm" mask + distance along the arm, used by the clothing shader
  const geo=body.geometry,pos=geo.attributes.position,si=geo.attributes.skinIndex,sw=geo.attributes.skinWeight;
  const isArm=body.skeleton.bones.map(b=>/upperarm|lowerarm|hand|index|middle|pinky|ring|thumb/.test(b.name)?1:0);
  const sh={l:pw('upperarm_l'),r:pw('upperarm_r')},ax={},a=new Float32Array(pos.count*2),v=new THREE.Vector3();
  for(const sd of['l','r']){ax[sd]=pw('hand_'+sd).sub(sh[sd]);ax[sd].multiplyScalar(1/ax[sd].lengthSq());}
  for(let k=0;k<pos.count;k++){let w=0;for(let c=0;c<4;c++)w+=isArm[si.getComponent(k,c)]*sw.getComponent(k,c);
    v.fromBufferAttribute(pos,k);const sd=v.x>0?'l':'r';a[k*2]=w;a[k*2+1]=v.sub(sh[sd]).dot(ax[sd]);}
  geo.setAttribute('aArm',new THREE.BufferAttribute(a,2));
  return{scene:sc,rest,bodyInv:body.matrixWorld.clone().invert(),hairAxis:new THREE.Vector3(1,0,0).applyQuaternion(qw(bones.Head).invert()).normalize(),headInv:bones.Head.matrixWorld.clone().invert(),light:lightTex,hip:pw('thigh_l').y,knee:pw('calf_l').y,neck:pw('neck_01').y,hair:[],beard:null};
}
function prepHair(g){g.scene.updateMatrixWorld(true);let m=null;g.scene.traverse(o=>{if(o.isMesh)m=o;});return{geo:m.geometry.clone().applyMatrix4(m.matrixWorld),mat:m.material};}
function pedBodyMat(base,p,g,cut,w){
  const m=base.clone();if(p.tone)m.map=g.light;m.color.setScalar(p.tint);m.normalScale.set(.7,.7);
  const u={uDen:{value:p.denim?1:0},uShirt:{value:p.jacket||p.shirt},uPant:{value:p.pants},uShoe:{value:p.shoe},uAcc:{value:p.accent},uCut:{value:cut},uW:{value:w}};
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,u);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 aArm;varying vec3 vRest;varying vec2 vArm;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRest=position;vArm=aArm;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 uShirt,uPant,uShoe,uAcc;uniform vec4 uCut;uniform vec2 uW;uniform float uDen;varying vec3 vRest;varying vec2 vArm;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat gCloth=0.;float E(float a,float x){return smoothstep(a-.003,a+.003,x);}')
     .replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;','mapN.xy *= normalScale*(1.-.8*gCloth);'))
     .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.82,gCloth);')
     .replace('#include <map_fragment>',`#include <map_fragment>
      {float y=vRest.y,arm=smoothstep(.35,.65,vArm.x),body=1.-arm;vec3 c=diffuseColor.rgb;
       float pant=body*E(uCut.z,y)*(1.-E(uW.x,y));
       float top=clamp(body*E(uCut.y,y)*(1.-E(uCut.w,y))+arm*(1.-E(uCut.x,vArm.y)),0.,1.);
       float trim=clamp(body*E(uCut.w-.022,y)*(1.-E(uCut.w,y))+arm*E(uCut.x-.04,vArm.y)*(1.-E(uCut.x,vArm.y))+body*E(uCut.y,y)*(1.-E(uCut.y+.022,y)),0.,1.);
       float shoe=body*(1.-E(uW.y,y));
       vec3 pc=uPant;
       if(uDen>.5){pc*=1.+.16*smoothstep(.5,.8,vRest.y)*smoothstep(-.01,.07,vRest.z)+.1*smoothstep(.42,.5,vRest.y)*(1.-smoothstep(.5,.58,vRest.y));}
       c=mix(c,pc,pant);c=mix(c,uDen>.5?vec3(.52,.36,.2):uAcc,body*E(uW.x-.04,y)*(1.-E(uW.x,y)));
       c=mix(c,uShirt,top);c=mix(c,uAcc,trim);
       c=mix(c,uShoe,shoe);c=mix(c,vec3(.9),shoe*(1.-E(.03,y)));gCloth=clamp(pant+top+shoe,0.,1.);
       diffuseColor.rgb=c;}`);};
  m.customProgramCacheKey=()=>'pedbody';return m;
}
function dressPed(p){
  if(RBS&&p.isPlayer&&(p.male?RBS.m:RBS.f).length)return dressRB(p,__late.SAVE.outfit.rb??0); // realistic mode: you're one of the realistic people too
  const g=p.male?RIGS.m:RIGS.f,root=SkeletonUtils.clone(g.scene),bones={};root.rotation.order='YXZ';
  const cut=new THREE.Vector4(p.sleeve,p.crop?g.hip+.22:g.hip+.03,p.shorts?g.knee+(p.shorts>1?.22:.03):.1,g.neck+.005),w=new THREE.Vector2(g.hip+.1,.1);
  let bodyMesh=null;
  root.traverse(o=>{if(o.isBone)bones[o.name]=o;
    if(o.isSkinnedMesh){o.frustumCulled=false;const n=o.material.name;
      if(/Superhero/.test(n)){bodyMesh=o;o.material=pedBodyMat(o.material,p,g,cut,w);o.castShadow=o.receiveShadow=true;}
      else if(/Hair/.test(n)){o.material=o.material.clone();o.material.color.copy(p.hairC).multiplyScalar(.7);}}});
  const addHair=h=>{const hm=h.mat.clone();hm.color.copy(p.hairC);if(p.isPlayer){hm.roughness=.45;}const me=new THREE.Mesh(h.geo,hm);me.matrixAutoUpdate=false;me.matrix.copy(g.headInv);me.castShadow=true;bones.Head.add(me);return me;};
  let hs=g.hair[p.hair%g.hair.length];p.longHair=!p.male&&p.hair%g.hair.length===0;
  if(p.longHair&&p.isPlayer){const geo=hs.geo.clone(),pa=geo.attributes.position,top=1.66;
    for(let k=0;k<pa.count;k++){const x=pa.getX(k),y=pa.getY(k),z=pa.getZ(k);if(y>=top)continue;const t=top-y,back=smooth(.06,-.04,z),f=lerp(1.5,3.6,back);
      pa.setXYZ(k,x*(1+t*.6*back),top-t*f,z-t*.55*back);}
    geo.computeVertexNormals();
    // skin the hair: the crown follows the head, the long part follows the neck and upper back, so it moves with the body
    const sk=bodyMesh.skeleton,bi=n=>max(0,sk.bones.findIndex(b=>b.name===n)),iH=bi('Head'),iN=bi('neck_01'),iS=bi('spine_03'),pa2=geo.attributes.position,cnt=pa2.count,SI=new Uint16Array(cnt*4),SW=new Float32Array(cnt*4);
    for(let k=0;k<cnt;k++){const y=pa2.getY(k),z=pa2.getZ(k),back=smooth(.05,-.05,z),wh=lerp(1,smooth(1.4,1.64,y),back),wn=(1-wh)*smooth(1.25,1.5,y)*.5,ws=1-wh-wn;
      SI[k*4]=iH;SI[k*4+1]=iN;SI[k*4+2]=iS;SW[k*4]=wh;SW[k*4+1]=wn;SW[k*4+2]=ws;}
    geo.applyMatrix4(g.bodyInv);geo.setAttribute('skinIndex',new THREE.BufferAttribute(SI,4));geo.setAttribute('skinWeight',new THREE.BufferAttribute(SW,4));
    const hm=hs.mat.clone();hm.color.copy(p.hairC);hm.roughness=.45;const hk=new THREE.SkinnedMesh(geo,hm);hk.frustumCulled=false;hk.castShadow=true;
    hk.position.copy(bodyMesh.position);hk.quaternion.copy(bodyMesh.quaternion);hk.scale.copy(bodyMesh.scale);bodyMesh.parent.add(hk);hk.bind(sk,bodyMesh.bindMatrix);
    p.hairMesh=hk;p.hairSkinned=true;}
  else p.hairMesh=addHair(hs);if(p.male&&p.beard)addHair(g.beard);
  p.rig={root,g,b:DRIVEN.map(n=>bones[n])};p.handR=bones.hand_r||null;root.visible=false;scene.add(root);
}
/* --- realistic mode: pedestrians are Microsoft Rocketbox avatars (MIT) — photo-textured people in real clothes, ~9k triangles each.
   Their Biped skeleton is renamed to the names the walk/run animation drives, so the same procedural animation moves them. --- */
const RB_F=['Female_Adult_01','Female_Adult_02','Female_Adult_03','Female_Adult_04','Female_Adult_05','Female_Adult_06','Female_Adult_08','Female_Adult_11','Female_Adult_12','Female_Adult_15','Female_Adult_17'],
  RB_M=['Male_Adult_01','Male_Adult_02','Male_Adult_04','Male_Adult_05','Male_Adult_06','Male_Adult_08','Male_Adult_09','Male_Adult_12','Male_Adult_13','Male_Adult_17'];
const RB_BONES={Bip01_Spine:'spine_01',Bip01_Spine1:'spine_02',Bip01_Spine2:'spine_03',Bip01_Neck:'neck_01',Bip01_Head:'Head',
  Bip01_L_Thigh:'thigh_l',Bip01_L_Calf:'calf_l',Bip01_L_Foot:'foot_l',Bip01_R_Thigh:'thigh_r',Bip01_R_Calf:'calf_r',Bip01_R_Foot:'foot_r',
  Bip01_L_UpperArm:'upperarm_l',Bip01_L_Forearm:'lowerarm_l',Bip01_L_Hand:'hand_l',Bip01_R_UpperArm:'upperarm_r',Bip01_R_Forearm:'lowerarm_r',Bip01_R_Hand:'hand_r'};
async function loadRB(){
  const {FBXLoader}=await import('three/addons/loaders/FBXLoader.js');
  const M=new THREE.LoadingManager();M.addHandler(/\.tga$/i,{setPath(){return this;},setCrossOrigin(){return this;},load:(u,ok)=>{const t=new THREE.Texture();if(ok)ok(t);return t;}}); // textures are loaded below as compressed JPG/PNG
  const fl=new FBXLoader(M),tl=new THREE.TextureLoader(),TX={},tx=(n,srgb)=>TX[n]||(TX[n]=(()=>{const t=tl.load('assets/people/'+n);if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;})());
  const one=async(name,male)=>{const g=await fl.loadAsync('assets/people/'+name+'.fbx');g.animations=[];g.scale.setScalar(.01);
    const wrap=new THREE.Group();wrap.add(g);
    g.traverse(o=>{if(o.isBone&&RB_BONES[o.name])o.name=RB_BONES[o.name];
      if(o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=o.receiveShadow=true;
        o.material=[].concat(o.material).map(m=>{const pre=m.name.split('_')[0],part=/opacity/.test(m.name)?'opacity':/head/.test(m.name)?'head':'body';
          if(part==='opacity')return new THREE.MeshStandardMaterial({map:tx(pre+'_opacity_color.png',true),alphaTest:.42,side:THREE.DoubleSide,roughness:.6});
          return new THREE.MeshStandardMaterial({map:tx(`${pre}_${part}_color.jpg`,true),normalMap:tx(`${pre}_${part}_normal.jpg`,false),roughness:part==='head'?.55:.8,metalness:0});});
        if(o.material.length===1)o.material=o.material[0];}});
    wrap.updateMatrixWorld(true);const bones={};wrap.traverse(o=>{if(o.isBone)bones[o.name]=o;});
    const qw=o=>o.getWorldQuaternion(new THREE.Quaternion()),pw=n=>bones[n].getWorldPosition(new THREE.Vector3());
    const rest={};for(const n of DRIVEN)rest[n]={q:qw(bones[n]),pi:qw(bones[n].parent).invert()};
    for(const sd of['l','r']){rest['upperarm_'+sd].base=new THREE.Quaternion().setFromUnitVectors(pw('lowerarm_'+sd).sub(pw('upperarm_'+sd)).normalize(),DOWN);
      rest['lowerarm_'+sd].base=new THREE.Quaternion().setFromUnitVectors(pw('hand_'+sd).sub(pw('lowerarm_'+sd)).normalize(),DOWN);}
    return{scene:wrap,rest,male,rb:true,name};};
  const res=await Promise.allSettled([...RB_F.map(n=>one(n,false)),...RB_M.map(n=>one(n,true))]);
  const ok=res.filter(r=>r.status==='fulfilled').map(r=>r.value);res.filter(r=>r.status!=='fulfilled').forEach(r=>console.warn('avatar failed',r.reason));
  return ok.length?{f:ok.filter(a=>!a.male),m:ok.filter(a=>a.male)}:null;}
let RBS=null,rbNext=0;
function dressRB(p,pick){const L=p.male?RBS.m:RBS.f;if(!L.length)return dressPed(p);const g=pick!==undefined?L[pick%L.length]:L[(rbNext++)%L.length],root=SkeletonUtils.clone(g.scene),bones={};root.rotation.order='YXZ';
  root.traverse(o=>{if(o.isBone)bones[o.name]=o;if(o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=o.receiveShadow=true;}});
  p.longHair=false;p.hairMesh=null;p.rig={root,g,b:DRIVEN.map(n=>bones[n])};p.handR=bones.hand_r||null;root.visible=false;scene.add(root);}
async function loadChars(){
  const L=new GLTFLoader(),ld=u=>new Promise((res,rej)=>L.load(CH+u+'.gltf',res,undefined,rej));
  const g=await Promise.all(['Superhero_Female_FullBody','Superhero_Male_FullBody','Hair_Long','Hair_Buns','Hair_BuzzedFemale','Hair_Buzzed','Hair_SimpleParted','Hair_Beard'].map(ld));
  const tl=new THREE.TextureLoader(),lt=u=>{const t=tl.load(CH+u);t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;};
  const f=prepRig(g[0],lt('T_Superhero_Female_Light_BaseColor.png')),m=prepRig(g[1],lt('T_Superhero_Male_Light.png'));
  f.hair=[2,3,4].map(i=>prepHair(g[i]));m.hair=[5,6].map(i=>prepHair(g[i]));m.beard=prepHair(g[7]);
  RIGS={f,m};{const cp=peds.filter(p=>p.copPed),cv=peds.filter(p=>!p.copPed).slice(0,RIG_PEDS+1);peds.length=0;peds.push(...cv,...cp);}
  if(REAL){RBS=await loadRB().catch(e=>{console.warn('realistic people unavailable',e);return null;});}
  for(const p of peds)(RBS&&!p.isPlayer&&!p.copPed)?dressRB(p):dressPed(p); // officers keep the uniform-coloured characters
  useRigs=true;for(const im of PIMS)im.count=0;
  if(TEST){for(let k=0;k<(location.search.includes('run')?24:3);k++)__late.update(1/60);__gs.holdRender=false;renderFrame();console.log('CHARS loaded',peds.length,renderer.info.render.calls,renderer.info.render.triangles);}
}
const _qt=new THREE.Quaternion(),_qa=new THREE.Quaternion(),qSp=new THREE.Quaternion(),q1=new THREE.Quaternion(),q2=new THREE.Quaternion(),qN=new THREE.Quaternion(),qH=new THREE.Quaternion(),
  qT=new THREE.Quaternion(),qC=new THREE.Quaternion(),qF=new THREE.Quaternion(),qU=new THREE.Quaternion(),qL=new THREE.Quaternion(),_eu=new THREE.Euler();
// every driven bone gets an absolute rotation (relative to its rest pose, in character space); this converts it to the bone's local rotation
const driveBone=(b,r,Ap,Ac)=>b.quaternion.copy(r.pi).multiply(_qt.copy(Ap).invert()).multiply(Ac).multiply(r.q);
const _mh2=new THREE.Matrix4();
function poseRigs(){
  for(const p of peds){
    const r=p.rig;if(!r)continue;const root=r.root,vis=!p.hidden&&abs(p.x-__gs.FX)<95&&abs(p.z-__gs.FZ)<95;root.visible=vis;if(!vis)continue;
    const A=p.amp,ph=p.phase,s=sin(ph),c=cos(ph),run=smooth(.62,.95,A),walk=1-run,R=r.g.rest,B=r.b,PZ=pedPose(p),cr=PZ&&PZ.crouch?1:0;
    // body bounce: walking dips at mid-stance, running lifts during each flight phase (twice per stride)
    const bob=walk*abs(c)*.03*A+run*(abs(sin(ph))*.075-.035);
    root.position.set(p.x,p.y+bob+p.lie*.12-cr*.48,p.z);root.rotation.set(-p.lie*(p.fb||1),p.th,p.roll||0);root.scale.setScalar(p.sc*(p.male?.97:1));
    const lean=A*(.05+run*.2)+cr*.45,twist=s*A*(.12+run*.08),breathe=sin(G.sigT*1.5+p.sc*50)*.012*(1-A);
    qSp.setFromEuler(_eu.set(lean+breathe,twist,0,'YXZ'));
    q1.copy(QI).slerp(qSp,.33);q2.copy(QI).slerp(qSp,.66);
    qN.setFromEuler(_eu.set(lean*.45,twist*.55,0,'YXZ'));qH.setFromEuler(_eu.set(lean*.25,twist*.2,0,'YXZ')); // head stays level and looks ahead
    driveBone(B[0],R.spine_01,QI,q1);driveBone(B[1],R.spine_02,q1,q2);driveBone(B[2],R.spine_03,q2,qSp);driveBone(B[3],R.neck_01,qSp,qN);driveBone(B[4],R.Head,qN,qH);
    for(let i=0;i<2;i++){
      const sg=i?-1:1,sd=i?'r':'l',sp=s*sg,cp=c*sg;
      // legs: longer stride and high knee recovery when running
      let hip=sp*A*lerp(.68,.95,run)-run*.12;
      const swing=max(0,-cp),kneeW=swing*1.15*A+.05,kneeR=.32+1.55*Math.pow(swing,1.25)+.25*max(0,cp)*max(0,-sp);
      let knee=lerp(kneeW,kneeR,run)*min(1,A*1.4+.05);
      let toe=-run*.45*max(0,sp)*max(0,-cp)+walk*.15*max(0,sp)*A;   // push off the toes at the end of stance
      if(cr){hip=-1.35;knee=2.25;toe=-(hip+knee)*.3;}else if(PZ&&PZ.legs){hip=PZ.legs[i].hip;knee=PZ.legs[i].knee;toe=0;}
      qT.setFromAxisAngle(XAX,hip);qC.setFromAxisAngle(XAX,hip+knee);qF.setFromAxisAngle(XAX,(hip+knee)*.3+toe);
      driveBone(B[5+i*3],R['thigh_'+sd],QI,qT);driveBone(B[6+i*3],R['calf_'+sd],qT,qC);driveBone(B[7+i*3],R['foot_'+sd],qC,qF);
      // arms: relaxed swing when walking, bent ~90° and pumping when running
      let sw=-sp*A*lerp(.5,.95,run)+run*.1,el=-lerp(.14+A*.38+max(0,-sw)*.35,1.45+.2*max(0,sp),run),spl=sg*lerp(.12,.17,run);
      if(PZ){const a=PZ.arms[i];sw=a.sw;el=a.el;spl=a.spl;}
      qU.copy(qSp).multiply(_qa.setFromEuler(_eu.set(sw,0,spl,'ZXY'))).multiply(R['upperarm_'+sd].base);
      qL.copy(qSp).multiply(_qa.setFromEuler(_eu.set(sw+el,0,spl*.6,'ZXY'))).multiply(R['lowerarm_'+sd].base);
      driveBone(B[11+i*2],R['upperarm_'+sd],qSp,qU);driveBone(B[12+i*2],R['lowerarm_'+sd],qU,qL);
    }
    if(p===player&&!G.car&&(__late.ARM.w>0||player.punchT>0)){ // hold the gun up to aim (two hands for the SMG / shotgun), or throw a jab
      const up=__late.ARM.aim||__late.ARM.faceT>0||__late.ARM.w===0,aimP=__gs.camPitch*.9-.2,two=__late.ARM.w>1&&up;
      const pk=__late.ARM.w?0:player.punchK|0,left=pk===1; // fists: jab (right), cross (left), then a high hook (right)
      const swR=up?-PI/2+(__late.ARM.w?aimP:pk===2?-.55:-.1):-.3,elR=up?(__late.ARM.w?0:pk===2?-.5:-.2):-.5,splR=(up?.1:-.1)*(left?-1:1);
      const UA=left?R.upperarm_l:R.upperarm_r,LA=left?R.lowerarm_l:R.lowerarm_r;
      qU.copy(qSp).multiply(_qa.setFromEuler(_eu.set(swR,0,splR,'ZXY'))).multiply(UA.base);
      qL.copy(qSp).multiply(_qa.setFromEuler(_eu.set(swR+elR,0,splR,'ZXY'))).multiply(LA.base);
      driveBone(B[left?11:13],UA,qSp,qU);driveBone(B[left?12:14],LA,qU,qL);
      if(two){const swL=-PI/2+aimP+.2,splL=-.6;
        qU.copy(qSp).multiply(_qa.setFromEuler(_eu.set(swL,0,splL,'ZXY'))).multiply(R.upperarm_l.base);
        qL.copy(qSp).multiply(_qa.setFromEuler(_eu.set(swL-.35,0,splL*.5,'ZXY'))).multiply(R.lowerarm_l.base);
        driveBone(B[11],R.upperarm_l,qSp,qU);driveBone(B[12],R.lowerarm_l,qU,qL);}}
    if(p.longHair&&p.hairMesh&&!p.hairSkinned){ // hair trails back with speed and bounces with each step
      const tgt=-(A*(.1+run*.22))+sin(ph*2)*.045*A;p.hairSw=(p.hairSw||0)+(tgt-(p.hairSw||0))*.25;
      p.hairMesh.matrix.makeRotationAxis(r.g.hairAxis,p.hairSw).multiply(r.g.headInv);
    }
  }
}
const charsReady=loadChars().catch(e=>{console.warn('CHARS not loaded, using built-in characters:',e&&(e.message||e.type)||e);G.charNote=true;});

export { RBS, charsReady, dressPed, useRigs };
