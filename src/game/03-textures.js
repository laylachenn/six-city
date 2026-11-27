// Six City — textures. One of the game's modules; they load in numbered order (src/game/index.js).
import './02-sky.js';
import * as THREE from 'three';
import { MAXANISO, PI, R, REAL, cos, cv, floor, hypot, lerp, max, mkRng, ri, round, rr, sqrt, stage } from './01-core.js';

/* ============================== textures ============================== */
function tex(c,srgb,rep){const t=new THREE.CanvasTexture(c);if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;if(rep)t.repeat.set(rep,rep);t.anisotropy=MAXANISO;return t;}
function speckle(g,S,n,lo,hi,a){for(let k=0;k<n;k++){const v=lo+R()*(hi-lo)|0;g.fillStyle=`rgba(${v},${v},${v},${a})`;g.fillRect(R()*S,R()*S,1+R()*1.5,1+R()*1.5);}}

function normalFromHeight(c,str,rep){
  const S=c.width,H=c.height,src=c.getContext('2d').getImageData(0,0,S,H).data,oc=cv(S,H),g=oc.getContext('2d'),im=g.createImageData(S,H),d=im.data;
  const h=(x,y)=>src[(((y+H)%H)*S+((x+S)%S))*4];
  for(let y=0;y<H;y++)for(let x=0;x<S;x++){const dx=(h(x+1,y)-h(x-1,y))/255*str,dy=(h(x,y+1)-h(x,y-1))/255*str,l=sqrt(dx*dx+dy*dy+1),i=(y*S+x)*4;
    d[i]=(-dx/l*.5+.5)*255;d[i+1]=(dy/l*.5+.5)*255;d[i+2]=(1/l*.5+.5)*255;d[i+3]=255;}
  g.putImageData(im,0,0);return tex(oc,false,rep);
}
function paverTexture(){const S=256,c=cv(S),g=c.getContext('2d');g.fillStyle='#a3a29d';g.fillRect(0,0,S,S);speckle(g,S,9000,120,190,.25);
  g.strokeStyle='rgba(60,60,58,.55)';g.lineWidth=2;for(let k=0;k<=S;k+=64){g.beginPath();g.moveTo(k,0);g.lineTo(k,S);g.moveTo(0,k);g.lineTo(S,k);g.stroke();}
  const hc=cv(S),hg=hc.getContext('2d');hg.fillStyle='#fff';hg.fillRect(0,0,S,S);speckle(hg,S,5000,215,255,.5);hg.strokeStyle='#000';hg.lineWidth=3;for(let k=0;k<=S;k+=64){hg.beginPath();hg.moveTo(k,0);hg.lineTo(k,S);hg.moveTo(0,k);hg.lineTo(S,k);hg.stroke();}
  return{map:tex(c,true,20),nrm:normalFromHeight(hc,1.6,20)};}
function noiseTexture(base,lo,hi,rep,tint){const S=256,c=cv(S),g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,S,S);
  for(let k=0;k<16000;k++){const v=lo+R()*(hi-lo);g.fillStyle=`rgba(${v*tint[0]|0},${v*tint[1]|0},${v*tint[2]|0},.35)`;g.fillRect(R()*S,R()*S,2,2);}return tex(c,true,rep);}

// facade styles: 0 blue office glass, 1 stone/concrete, 2 brick, 3 condo glass with balconies, 4 black curtain wall, 5 gold glass
function facadeTextures(style){
  const S=1024,N=16,cs=S/N;
  const ca=cv(S),co=cv(S),ce=cv(S),ch=cv(S),a=ca.getContext('2d'),o=co.getContext('2d'),e=ce.getContext('2d'),hh=ch.getContext('2d');
  const glassy=style===0||style>=3;
  e.fillStyle='#000';e.fillRect(0,0,S,S);hh.fillStyle=glassy?'#eee':'#c8c8c8';hh.fillRect(0,0,S,S);
  const orm=(r,m)=>`rgb(255,${r*255|0},${m*255|0})`;
  a.fillStyle=['#7d858c','#bdb8ae','#8a5642','#e3e6e6','#141518','#6e5622'][style];a.fillRect(0,0,S,S);
  if(style===1&&!REAL)speckle(a,S,30000,150,200,.2);
  if(style===2&&!REAL){
    for(let y=0;y<S;y+=8){a.fillStyle='rgba(50,30,24,.5)';a.fillRect(0,y,S,1.5);for(let x=(y/8%2)*8;x<S;x+=16){a.fillRect(x,y,1.5,8);
      if(R()<.3){a.fillStyle=`rgba(${R()<.5?170:60},${R()<.5?110:40},70,.18)`;a.fillRect(x,y,16,8);a.fillStyle='rgba(50,30,24,.5)';}}}
    for(let y=0;y<S;y+=8){hh.fillStyle='#9a9a9a';hh.fillRect(0,y,S,1.5);}
  }
  o.fillStyle=style===3?orm(.75,0):glassy?orm(.45,.7):orm(style===2?.95:.92,0);o.fillRect(0,0,S,S);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const x=i*cs,y=j*cs;let wx,wy,ww,wh;
    if(style===0||style===4||style===5){wx=x+2;wy=y+2;ww=cs-4;wh=cs-14;}
    else if(style===3){wx=x+1;wy=y+11;ww=cs-2;wh=cs-12;}
    else if(style===1){wx=x+9;wy=y+12;ww=cs-18;wh=cs-26;}
    else{wx=x+17;wy=y+13;ww=cs-34;wh=cs-26;a.fillStyle='#e6e1d6';a.fillRect(wx-3,wy-3,ww+6,wh+7);}
    const v=R();
    a.fillStyle=style===0?`rgb(${120+v*30|0},${140+v*30|0},${165+v*30|0})`:
      style===3?`rgb(${92+v*28|0},${126+v*24|0},${138+v*24|0})`:
      style===4?`rgb(${30+v*14|0},${29+v*12|0},${28+v*10|0})`:
      style===5?`rgb(${186+v*34|0},${146+v*26|0},${64+v*22|0})`:
      `rgb(${70+v*30|0},${82+v*30|0},${96+v*30|0})`;
    a.fillRect(wx,wy,ww,wh);
    if(!glassy&&R()<.3){a.fillStyle='rgba(215,205,185,.75)';a.fillRect(wx,wy,ww,wh*rr(.25,.7));}
    if(style===0){a.fillStyle='#4d555c';a.fillRect(x,y+cs-12,cs,10);}
    if(style===4){a.fillStyle='#0a0a0b';a.fillRect(x,y+cs-12,cs,10);a.fillRect(x,y,3,cs);}
    if(style===5){a.fillStyle='#4f3d12';a.fillRect(x,y+cs-12,cs,10);}
    if(style===2){a.fillStyle='#e6e1d6';a.fillRect(wx+ww/2-1,wy,2,wh);}
    o.fillStyle=`rgb(0,${(glassy?.06:.1)*255|0},${(glassy?1:.9)*255|0})`;o.fillRect(wx,wy,ww,wh);
    if(style===3){ // concrete floor slab + glass balcony rail on most bays
      a.fillStyle='#eef0ef';a.fillRect(x,y,cs,10);o.fillStyle=orm(.8,0);o.fillRect(x,y,cs,10);hh.fillStyle='#fff';hh.fillRect(x,y,cs,10);
      if((i+j*3)%5<3){a.fillStyle='rgba(205,228,232,.5)';a.fillRect(wx,wy+wh*.56,ww,wh*.44);a.fillStyle='rgba(255,255,255,.8)';a.fillRect(wx,wy+wh*.56,ww,2);}
    }
    if(style===2){hh.fillStyle='#f4f4f4';hh.fillRect(wx-3,wy-3,ww+6,wh+7);}
    hh.fillStyle=glassy?'#9c9c9c':'#3c3c3c';hh.fillRect(wx,wy,ww,wh);if(style===0){hh.fillStyle='#c4c4c4';hh.fillRect(x,y+cs-12,cs,10);}
    if(!glassy){const gr=a.createLinearGradient(0,wy+wh,0,wy+wh+22);gr.addColorStop(0,'rgba(35,30,26,.28)');gr.addColorStop(1,'rgba(35,30,26,0)');a.fillStyle=gr;a.fillRect(wx+R()*6,wy+wh+3,ww*rr(.3,.9),22);}
    if(R()<(glassy?.3:.38)){
      const warm=R()<.7,b=rr(.45,1);
      e.fillStyle=warm?`rgb(${255*b|0},${205*b|0},${135*b|0})`:`rgb(${200*b|0},${225*b|0},${255*b|0})`;
      e.fillRect(wx,wy,ww,wh);
    }
  }
  return{map:tex(ca,true),orm:tex(co,false),emis:tex(ce,true),nrm:normalFromHeight(ch,glassy?1.6:2.6)};
}
// extra facade designs for the realistic mode, each on the same 16 x 16 window grid as its base style (so floor heights and window rooms still line up).
// 2·1 Victorian bay-and-gable brick · 2·2 warehouse loft · 2·3 buff-brick 1950s walk-up · 1·1 Beaux-Arts limestone · 1·2 precast concrete with fins
// 3·1 condo with black & white spandrels · 3·2 condo with terracotta accents · 3·3 1970s slab block · 0·1 green glass with white fins · 0·2 silver ribbon windows
// (pickStyle chooses one from the building's material, age and type; buildings with nothing to go on get one at random)
const FVAR={0:2,1:2,2:3,3:3};
function facadeVariant(style,vr){
  const S=1024,N=16,cs=S/N,ca=cv(S),co=cv(S),ce=cv(S),ch=cv(S),a=ca.getContext('2d'),o=co.getContext('2d'),e=ce.getContext('2d'),hh=ch.getContext('2d');
  const r=mkRng(style*31+vr*7+5),rr2=(x,y)=>x+r()*(y-x),orm=(ro,m)=>`rgb(255,${ro*255|0},${m*255|0})`;
  e.fillStyle='#000';e.fillRect(0,0,S,S);hh.fillStyle='#c8c8c8';hh.fillRect(0,0,S,S);o.fillStyle=orm(.9,0);o.fillRect(0,0,S,S);
  const glass=(x,y,w,h,col,ro,me)=>{a.fillStyle=col||`rgb(${60+r()*25|0},${72+r()*25|0},${84+r()*25|0})`;a.fillRect(x,y,w,h);o.fillStyle=`rgb(0,${(ro||.08)*255|0},${(me||.9)*255|0})`;o.fillRect(x,y,w,h);
    hh.fillStyle='#3c3c3c';hh.fillRect(x,y,w,h);if(r()<.34){const b=rr2(.45,1),warm=r()<.72;e.fillStyle=warm?`rgb(${255*b|0},${205*b|0},${135*b|0})`:`rgb(${200*b|0},${225*b|0},${255*b|0})`;e.fillRect(x,y,w,h);}};
  const bar=(x,y,w,h,col,hv)=>{a.fillStyle=col;a.fillRect(x,y,w,h);o.fillStyle=orm(.85,0);o.fillRect(x,y,w,h);hh.fillStyle=hv||'#f0f0f0';hh.fillRect(x,y,w,h);};
  const brick=(base,mortar,bh,bw)=>{a.fillStyle=base;a.fillRect(0,0,S,S);for(let y=0,k=0;y<S;y+=bh,k++){a.fillStyle=mortar;a.fillRect(0,y,S,1.3);hh.fillStyle='#9a9a9a';hh.fillRect(0,y,S,1.3);
    for(let x=(k%2)*bw/2;x<S;x+=bw){a.fillStyle=mortar;a.fillRect(x,y,1.3,bh);if(r()<.3){a.fillStyle=`rgba(${r()<.5?170:50},${r()<.5?100:35},60,.16)`;a.fillRect(x+1,y+1,bw-1,bh-1);}}}};
  const sill=(x,y,w)=>{bar(x-3,y,w+6,4,'#d9d2c2');a.fillStyle='rgba(30,25,20,.25)';a.fillRect(x-3,y+4,w+6,3);};
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const x=i*cs,y=j*cs;
    if(j===0&&i===0){ // backgrounds, drawn once
      if(style===2&&vr===1)brick('#8e4e3a','rgba(215,200,180,.55)',8,16);
      if(style===2&&vr===2)brick('#7c3f30','rgba(60,40,32,.6)',8,16);
      if(style===2&&vr===3)brick('#bfa173','rgba(225,215,195,.6)',7,15);
      if(style===1&&vr===1){a.fillStyle='#cfc3a6';a.fillRect(0,0,S,S);for(let k=0;k<26000;k++){const v=150+r()*80|0;a.fillStyle=`rgba(${v},${v-6},${v-20},.18)`;a.fillRect(r()*S,r()*S,2,2);}
        for(let yy=0;yy<S;yy+=16){a.fillStyle='rgba(90,80,60,.35)';a.fillRect(0,yy,S,1.3);hh.fillStyle='#a0a0a0';hh.fillRect(0,yy,S,1.3);}}
      if(style===1&&vr===2){a.fillStyle='#aaa69c';a.fillRect(0,0,S,S);for(let k=0;k<22000;k++){const v=120+r()*90|0;a.fillStyle=`rgba(${v},${v},${v-4},.14)`;a.fillRect(r()*S,r()*S,2,2);}}
      if(style===3){a.fillStyle='#d9dbd9';a.fillRect(0,0,S,S);}
      if(style===0){a.fillStyle=vr===1?'#d6dad8':'#5d646b';a.fillRect(0,0,S,S);}
      o.fillStyle=style===0?orm(.4,.6):orm(style===2?.95:.85,0);o.fillRect(0,0,S,S);}
    if(style===2&&vr===1){ // tall segmental-arched windows, stone sills, a dark brick band each floor, every 4th bay a solid pier
      if(i%4===3){a.fillStyle='rgba(60,25,18,.22)';a.fillRect(x+6,y,cs-12,cs);hh.fillStyle='#e0e0e0';hh.fillRect(x+6,y,cs-12,cs);continue;}
      const wx=x+20,ww=cs-40,wy=y+12,wh=cs-24;a.fillStyle='#a9654b';a.beginPath();a.ellipse(wx+ww/2,wy+4,ww/2+5,8,0,PI,0);a.fill();
      a.fillStyle='rgba(40,20,15,.5)';for(let k=-2;k<=2;k++){a.save();a.translate(wx+ww/2,wy+6);a.rotate(k*.32);a.fillRect(-.6,-12,1.2,8);a.restore();}
      bar(wx-2,wy,ww+4,wh,'#eae4d6');glass(wx+2,wy+3,ww-4,wh-5);bar(wx+ww/2-1,wy+3,2,wh-5,'#eae4d6');bar(wx+2,wy+wh*.45,ww-4,2,'#eae4d6');sill(wx,wy+wh,ww);
      a.fillStyle='rgba(50,22,16,.35)';a.fillRect(x,y+cs-3,cs,3);}
    else if(style===2&&vr===2){ // loft: big multi-pane steel windows, concrete lintels
      const wx=x+6,ww=cs-12,wy=y+9,wh=cs-18;bar(x,wy-6,cs,6,'#b8b2a6');glass(wx,wy,ww,wh,`rgb(${50+r()*20|0},${58+r()*20|0},${62+r()*20|0})`);
      a.fillStyle='#1d1e20';o.fillStyle=orm(.4,.8);for(let k=0;k<=3;k++){a.fillRect(wx+k*(ww/3)-1,wy,2,wh);o.fillRect(wx+k*(ww/3)-1,wy,2,wh);}for(let k=0;k<=4;k++){a.fillRect(wx,wy+k*(wh/4)-1,ww,2);o.fillRect(wx,wy+k*(wh/4)-1,ww,2);}
      if(r()<.25){a.fillStyle='rgba(220,215,200,.75)';a.fillRect(wx+1,wy+1,ww-2,wh*rr2(.2,.5));}}
    else if(style===2&&vr===3){ // buff brick walk-up: wide aluminium sliders, precast sill band
      const wx=x+5,ww=cs-10,wy=y+20,wh=cs-36;bar(x,wy+wh,cs,5,'#e2ddd0');bar(wx-2,wy-2,ww+4,wh+4,'#c9ccce');glass(wx,wy,ww,wh);bar(wx+ww*.5-1,wy,2,wh,'#c9ccce');
      if(r()<.35){a.fillStyle=`rgba(${200+r()*40|0},${190+r()*30|0},${160+r()*30|0},.8)`;a.fillRect(wx,wy,ww*rr2(.3,.5),wh);}}
    else if(style===1&&vr===1){ // limestone: tall windows, projecting cornice heads with shadow, keystone, deep reveals
      const wx=x+14,ww=cs-28,wy=y+12,wh=cs-22;bar(wx-5,wy-7,ww+10,5,'#e6dcc4');a.fillStyle='rgba(40,32,20,.4)';a.fillRect(wx-5,wy-2,ww+10,3);
      bar(wx+ww/2-4,wy-9,8,9,'#ece3cc');a.fillStyle='rgba(50,40,25,.45)';a.fillRect(wx,wy,ww,3);a.fillRect(wx,wy,3,wh);
      glass(wx+3,wy+3,ww-3,wh-3);bar(wx+ww/2,wy+3,2,wh-3,'#e8e0cc');bar(wx+3,wy+wh*.36,ww-3,2,'#e8e0cc');sill(wx,wy+wh,ww);}
    else if(style===1&&vr===2){ // precast concrete: vertical fins throw shadow beside each window
      const wx=x+10,ww=cs-20,wy=y+4,wh=cs-16;glass(wx,wy,ww,wh,`rgb(${46+r()*20|0},${54+r()*20|0},${60+r()*20|0})`);
      bar(x,y,8,cs,'#c3bfb5','#ffffff');a.fillStyle='rgba(30,30,28,.35)';a.fillRect(x+8,y,6,cs);bar(x,y+cs-12,cs,12,'#b3afa5','#eeeeee');}
    else if(style===3&&vr===3){ // 1970s slab block (St. James Town, Thorncliffe): a concrete balcony slab every floor, brown brick piers, sliding doors behind steel pickets
      bar(x,y,cs,8,'#d6d3cb','#ffffff');
      if(i%4===3){a.fillStyle='#7b5441';a.fillRect(x,y+8,cs,cs-8);for(let yy=y+8;yy<y+cs;yy+=6){a.fillStyle='rgba(205,190,170,.45)';a.fillRect(x,yy,cs,1);hh.fillStyle='#a8a8a8';hh.fillRect(x,yy,cs,1);}}
      else{a.fillStyle='#8f897f';a.fillRect(x,y+8,cs,cs-8);hh.fillStyle='#8a8a8a';hh.fillRect(x,y+8,cs,cs-8);
        glass(x+6,y+12,cs-12,cs-14,`rgb(${44+r()*18|0},${52+r()*18|0},${58+r()*18|0})`,.08,.7);bar(x+cs/2-1,y+12,2,cs-14,'#8f9294');
        if(r()<.3){a.fillStyle=`rgba(${190+r()*50|0},${180+r()*40|0},${150+r()*40|0},.8)`;a.fillRect(x+6,y+12,(cs-12)*rr2(.3,.6),cs-14);}
        const ry=y+cs-25;bar(x,ry,cs,3,'#2b2c2e');a.fillStyle='#2b2c2e';o.fillStyle=orm(.5,.8);hh.fillStyle='#d0d0d0';for(let k=2;k<cs;k+=5){a.fillRect(x+k,ry,1.4,y+cs-ry);o.fillRect(x+k,ry,1.4,y+cs-ry);hh.fillRect(x+k,ry,1.4,y+cs-ry);}}}
    else if(style===3){ // condo: floor slabs, full-height glass, spandrel colours stacked in vertical bands
      const band=vr===1?(i%5<2?'#1e2124':'#f1f2f0'):(i%6===0||i%6===1?'#b5582f':'#e9e7e2');const wx=x+2,ww=cs-4,wy=y+10,wh=cs-11;
      bar(x,y,cs,9,'#eeefed','#ffffff');if(vr===1&&i%5<2){bar(wx,wy,ww,wh,band,'#e0e0e0');glass(wx+4,wy+8,ww-8,wh-12,'rgb(38,46,52)',.06,.6);}
      else{glass(wx,wy,ww,wh,vr===2?`rgb(${70+r()*20|0},${104+r()*20|0},${102+r()*20|0})`:`rgb(${80+r()*24|0},${108+r()*24|0},${124+r()*24|0})`,.06,.4);if(vr===2&&i%6<2)bar(wx,wy+wh*.55,ww,wh*.45,band);}
      if((i+j)%3===0){a.fillStyle='rgba(215,232,236,.45)';a.fillRect(wx,wy+wh*.58,ww,wh*.42);a.fillStyle='rgba(255,255,255,.8)';a.fillRect(wx,wy+wh*.58,ww,2);}}
    else if(style===0&&vr===1){ // green glass curtain wall, white vertical fins every module
      glass(x+1,y+1,cs-2,cs-2,`rgb(${78+r()*20|0},${120+r()*22|0},${108+r()*20|0})`,.05,.95);bar(x,y+cs-9,cs,7,'#6f8a80','#dddddd');bar(x,y,5,cs,'#eef0ee','#ffffff');bar(x+cs/2-1,y,2,cs,'#cfd5d2');}
    else if(style===0&&vr===2){ // silver ribbon windows over metal spandrels
      bar(x,y+cs*.55,cs,cs*.45,'#7d858d','#dddddd');a.fillStyle='rgba(255,255,255,.08)';a.fillRect(x,y+cs*.55,cs,3);glass(x,y+2,cs,cs*.55-2,`rgb(${88+r()*20|0},${102+r()*20|0},${116+r()*20|0})`,.05,1);bar(x,y,cs,2,'#adb4ba');bar(x+cs-2,y,2,cs*.55,'#3c4046');}
  }
  const T={map:tex(ca,true),orm:tex(co,false),emis:tex(ce,true),nrm:normalFromHeight(ch,style===0||style===3?1.6:2.6)};return T;}
// ground-floor shopfronts: 8 detailed bays (6.5 m wide each) with signage, framed windows and painted-in-depth interiors
const SHOPS=[
  {n:'Northern Roast',sub:'CAFÉ · ESPRESSO',bg:'#1f3b2e',ink:'#f3e7c9',stone:'#4a4a48',k:'cafe',awn:0x2f5d46},
  {n:'Golden Crust',sub:'BAKERY',bg:'#f2e6cf',ink:'#7a4a1e',stone:'#8a7f72',k:'bakery',awn:0xc9853a},
  {n:'Fern & Petal',sub:'FLOWERS',bg:'#f7f1ea',ink:'#3e6b3a',stone:'#3b3e44',k:'florist',awn:0x6f9a58},
  {n:'ATELIER SIX',sub:'',bg:'#121214',ink:'#e8d9b0',stone:'#1c1c1f',k:'boutique',awn:0},
  {n:'Lakeside Books',sub:'NEW & USED',bg:'#5b1f24',ink:'#f1e4c8',stone:'#6f6a62',k:'books',awn:0x5b1f24},
  {n:'Union Pharmacy',sub:'',bg:'#ffffff',ink:'#1b6b3a',stone:'#a7a59f',k:'pharmacy',awn:0},
  {n:'Ramen Kaze',sub:'NOODLE BAR',bg:'#1a1a1c',ink:'#ffffff',stone:'#3a3330',k:'ramen',awn:0xb3261e},
  {n:'Corner Mart 24/7',sub:'',bg:'#1f4e8c',ink:'#ffffff',stone:'#55585e',k:'mart',awn:0}];
const SHOPV=4; // shopfront designs per kind
const strH=t=>{let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0)/4294967296;};
function shopTextures(){
  const BW=384,H=264,NV=SHOPV,W=BW*SHOPS.length,ca=cv(W,H*NV),co=cv(W,H*NV),ce=cv(W,H*NV),ch=cv(W,H*NV),a=ca.getContext('2d'),o=co.getContext('2d'),e=ce.getContext('2d'),hh=ch.getContext('2d');
  const orm=(r,m)=>`rgb(255,${r*255|0},${m*255|0})`,rc=(...c)=>c[floor(R()*c.length)];
  e.fillStyle='#000';e.fillRect(0,0,W,H*NV);o.fillStyle=orm(.75,0);o.fillRect(0,0,W,H*NV);hh.fillStyle='#bdbdbd';hh.fillRect(0,0,W,H*NV);
  const ic=cv(BW,H),ig=ic.getContext('2d');
  // interior drawn in one-point perspective inside the window rectangle
  function room(S,x0,y0,w,h){
    const g=ig;g.save();g.beginPath();g.rect(x0,y0,w,h);g.clip();
    const bright=S.k==='pharmacy'||S.k==='mart'?1:S.k==='boutique'||S.k==='ramen'?.55:.8,wall=S.k==='ramen'?'#5a2e22':S.k==='boutique'?'#d9d2c6':S.k==='books'?'#6b4a32':'#efe6d6';
    g.fillStyle=wall;g.fillRect(x0,y0,w,h);
    const vx=x0+w*.5,vy=y0+h*.48,bx0=x0+w*.18,bx1=x0+w*.82,by0=y0+h*.16,by1=y0+h*.74;
    const sh=(c,k)=>{const f=k||.82;const m=c.match(/\w\w/g).map(v=>parseInt(v,16)*f|0);return `rgb(${m})`;};
    g.fillStyle=sh(wall.slice(1),.78);g.beginPath();g.moveTo(x0,y0);g.lineTo(bx0,by0);g.lineTo(bx0,by1);g.lineTo(x0,y0+h);g.fill();
    g.beginPath();g.moveTo(x0+w,y0);g.lineTo(bx1,by0);g.lineTo(bx1,by1);g.lineTo(x0+w,y0+h);g.fill();
    g.fillStyle=sh(wall.slice(1),.9);g.beginPath();g.moveTo(x0,y0);g.lineTo(bx0,by0);g.lineTo(bx1,by0);g.lineTo(x0+w,y0);g.fill();
    const fl=S.k==='mart'||S.k==='pharmacy'?'#d8d8d4':'#8a6a4a',fg=g.createLinearGradient(0,by1,0,y0+h);fg.addColorStop(0,sh(fl.slice(1),.7));fg.addColorStop(1,fl);
    g.fillStyle=fg;g.beginPath();g.moveTo(x0,y0+h);g.lineTo(bx0,by1);g.lineTo(bx1,by1);g.lineTo(x0+w,y0+h);g.fill();
    g.strokeStyle='rgba(0,0,0,.15)';g.lineWidth=1;for(let k=1;k<6;k++){const t=k/6;g.beginPath();g.moveTo(lerp(bx0,bx1,t),by1);g.lineTo(lerp(x0,x0+w,t),y0+h);g.stroke();}
    // ceiling lights
    for(let k=0;k<3;k++){const lx=lerp(bx0,bx1,(k+.5)/3),ly=lerp(by0,y0,.45);
      if(S.k==='cafe'||S.k==='ramen'){g.strokeStyle='#222';g.beginPath();g.moveTo(lx,y0);g.lineTo(lx,ly);g.stroke();g.fillStyle=S.k==='ramen'?'#e8433a':'#f6d79a';g.beginPath();g.ellipse(lx,ly+5,S.k==='ramen'?7:9,S.k==='ramen'?9:5,0,0,7);g.fill();}
      else{g.fillStyle='#fffbea';g.fillRect(lx-14,ly-3,28,4);}}
    const shelf=(sx,sy,sw,rows,item)=>{for(let r=0;r<rows;r++){const yy=sy+r*16;g.fillStyle='rgba(60,40,25,.85)';g.fillRect(sx,yy+12,sw,3);for(let xx=sx+2;xx<sx+sw-4;){const iw=item(xx,yy);xx+=iw;}}};
    const C=['#e8433a','#3a7bd5','#f2c14e','#58b368','#9b5de5','#f15bb5','#00bbf9','#ff8c42','#ffffff','#333333'];
    if(S.k==='cafe'){g.fillStyle='#3b2a20';g.fillRect(bx0,by1-26,bx1-bx0,26);g.fillStyle='#c9c5be';g.fillRect(bx0+20,by1-44,26,18);g.fillStyle='#222';g.fillRect(bx1-70,by0+8,56,34);g.fillStyle='#f3efe6';for(let k=0;k<4;k++)g.fillRect(bx1-64,by0+14+k*7,36+R()*8,2);
      for(const tx of[.2,.55,.85]){const X=x0+w*tx,Y=y0+h*.9;g.fillStyle='#2a2a2a';g.fillRect(X-2,Y-22,4,22);g.fillStyle='#d9cbb5';g.beginPath();g.ellipse(X,Y-23,18,5,0,0,7);g.fill();g.fillStyle='#3a3a3a';g.fillRect(X-24,Y-16,3,16);g.fillRect(X+21,Y-16,3,16);}}
    else if(S.k==='bakery'){shelf(bx0+6,by0+8,bx1-bx0-12,3,(xx,yy)=>{g.fillStyle=rc('#c98a4a','#d9a55e','#a86b32','#e5c07b');g.beginPath();g.ellipse(xx+7,yy+8,7,4.5,0,0,7);g.fill();return 15;});
      g.fillStyle='rgba(220,235,240,.55)';g.fillRect(x0+w*.08,y0+h*.66,w*.84,h*.2);g.fillStyle='#6b4a32';g.fillRect(x0+w*.08,y0+h*.86,w*.84,h*.14);
      for(let k=0;k<10;k++){g.fillStyle=rc('#f7d9e3','#f3c178','#ffffff','#e0745a','#8b5a3c');g.beginPath();g.arc(x0+w*.12+k*w*.08,y0+h*.8,5.5,0,7);g.fill();}}
    else if(S.k==='florist'){for(let k=0;k<12;k++){const X=x0+w*(.06+k*.08),Y=y0+h*(.72+(k%2)*.12);g.fillStyle='#3b6b3a';g.fillRect(X-1,Y-26,2,26);g.fillStyle='#7f8a90';g.fillRect(X-9,Y,18,14);
        const fc=rc('#f15bb5','#ffd166','#ffffff','#e63946','#c77dff','#ff8fab');for(let q=0;q<9;q++){g.fillStyle=q%3?fc:'#58b368';g.beginPath();g.arc(X+(R()-.5)*18,Y-26-R()*18,3.5+R()*2,0,7);g.fill();}}}
    else if(S.k==='boutique'){g.fillStyle='#b9a888';g.fillRect(bx0,by0+12,bx1-bx0,3);for(let k=0;k<7;k++){g.fillStyle=rc('#e8d9b0','#2b2b2b','#a63d40','#f2f2f2','#4f6d7a');g.fillRect(bx0+8+k*((bx1-bx0-20)/7),by0+15,10,30);}
      for(const tx of[.22,.5,.78]){const X=x0+w*tx,Y=y0+h*.97,c=rc('#e8d9b0','#111','#a63d40','#f2f2f2','#d4a373','#4f6d7a');g.fillStyle='#ddd';g.beginPath();g.arc(X,Y-h*.72,6,0,7);g.fill();
        g.fillStyle=c;g.beginPath();g.moveTo(X-11,Y-h*.66);g.lineTo(X+11,Y-h*.66);g.lineTo(X+16,Y-h*.3);g.lineTo(X-16,Y-h*.3);g.fill();g.fillStyle='#999';g.fillRect(X-1,Y-h*.3,2,h*.28);g.fillRect(X-8,Y-3,16,3);}}
    else if(S.k==='books'){for(const [sx,sw] of[[x0+2,w*.2],[bx0+4,bx1-bx0-8],[x0+w*.78,w*.2]])shelf(sx,sx===bx0+4?by0+4:y0+10,sw,sx===bx0+4?4:7,(xx,yy)=>{const bw=3+R()*4;g.fillStyle=rc(...C.slice(0,8),'#6b4a32','#2d4a6b','#7a2e2e');g.fillRect(xx,yy+R()*3,bw,12-R()*3);return bw+1;});
      g.fillStyle='#4a3324';g.fillRect(x0+w*.3,y0+h*.8,w*.4,h*.2);for(let k=0;k<5;k++){g.fillStyle=rc(...C);g.fillRect(x0+w*.33+k*w*.07,y0+h*.76,w*.05,h*.05);}}
    else if(S.k==='pharmacy'||S.k==='mart'){for(const [sx,sw,top] of[[x0+2,w*.17,y0+8],[bx0+4,bx1-bx0-8,by0+4],[x0+w*.81,w*.17,y0+8]])shelf(sx,top,sw,sx===bx0+4?4:8,(xx,yy)=>{const bw=4+R()*6;g.fillStyle=S.k==='pharmacy'?rc('#ffffff','#e9f5ee','#cfe8ff','#ffe1e1','#58b368'):rc(...C);g.fillRect(xx,yy+2,bw,10);return bw+1;});
      if(S.k==='mart'){g.fillStyle='rgba(200,235,255,.8)';g.fillRect(bx1-34,by0+2,30,by1-by0-4);g.strokeStyle='#888';g.strokeRect(bx1-34,by0+2,30,by1-by0-4);}
      else{g.fillStyle='#1b6b3a';g.fillRect(vx-7,by0+6,14,34);g.fillRect(vx-17,by0+16,34,14);}}
    else if(S.k==='ramen'){g.fillStyle='#2a1a14';g.fillRect(x0,y0+h*.72,w,h*.28);g.fillStyle='#c9a46a';g.fillRect(x0,y0+h*.7,w,5);
      for(let k=0;k<5;k++){const X=x0+w*(.12+k*.19);g.fillStyle='#111';g.fillRect(X-1,y0+h*.78,3,h*.22);g.fillStyle='#b3261e';g.beginPath();g.ellipse(X,y0+h*.78,9,3,0,0,7);g.fill();}
      g.fillStyle='#e8d9b0';for(let k=0;k<6;k++)g.fillRect(bx0+6+k*18,by0+8,12,18);}
    // soft vignette and warm/cool tint
    const vg=g.createRadialGradient(vx,vy,10,vx,vy,w*.75);vg.addColorStop(0,'rgba(255,240,210,0)');vg.addColorStop(1,`rgba(0,0,0,${.45*(1.2-bright)})`);g.fillStyle=vg;g.fillRect(x0,y0,w,h);
    g.restore();return bright;
  }
  // four shopfront designs per kind (rows of the atlas): 0 stone pilasters · 1 painted timber Victorian · 2 modern metal & glass · 3 brick or tile surround
  for(let vr=0;vr<NV;vr++)SHOPS.forEach((S,i)=>{
    for(const g of[a,o,e,hh]){g.save();g.translate(0,vr*H);}
    const x=i*BW;ig.clearRect(0,0,BW,H);
    const PAINT=['#1f3d2c','#5a1e1e','#1d2b45','#161616','#e4dccb','#2f5e5e','#6b3b23','#7d1f2f','#3d4a2a'];
    const FR=vr===1?{base:rc(...PAINT)}:vr===2?{base:R()<.5?'#26282b':'#bfbdb7',fc:'#0d0e10'}:vr===3?{tile:R()<.4,fc:rc('#1f3a2c','#141414','#3a2418')}:{};
    if(vr===1)FR.fc=FR.base;
    if(vr===0){
    // facade frame: stone pilasters, base, sign band
    a.fillStyle=S.stone;a.fillRect(x,0,BW,H);for(let k=0;k<1800;k++){const v=60+R()*120|0;a.fillStyle=`rgba(${v},${v},${v},.1)`;a.fillRect(x+R()*BW,R()*H,2,2);}
    a.fillStyle='rgba(255,255,255,.1)';a.fillRect(x,0,14,H);a.fillRect(x+BW-14,0,14,H);hh.fillStyle='#fff';hh.fillRect(x,0,14,H);hh.fillRect(x+BW-14,0,14,H);
    a.fillStyle='rgba(0,0,0,.28)';a.fillRect(x,H-14,BW,14);hh.fillStyle='#ddd';hh.fillRect(x,H-14,BW,14);}
    else if(vr===1){ // painted timber: fluted pilasters with capitals, fascia, grain
      a.fillStyle=FR.base;a.fillRect(x,0,BW,H);for(let k=0;k<260;k++){a.fillStyle=`rgba(${R()<.5?255:0},${R()<.5?255:0},${R()<.5?255:0},.035)`;a.fillRect(x+R()*BW,R()*H,1,8+R()*30);}
      for(const px of[x,x+BW-18]){a.fillStyle='rgba(255,255,255,.12)';a.fillRect(px,0,18,H);a.fillStyle='rgba(0,0,0,.25)';for(let f=4;f<18;f+=5)a.fillRect(px+f,70,1.5,H-90);
        a.fillStyle='rgba(255,255,255,.22)';a.fillRect(px-3,58,24,12);hh.fillStyle='#fff';hh.fillRect(px-3,58,24,12);hh.fillStyle='#f0f0f0';hh.fillRect(px,0,18,H);}
      a.fillStyle='rgba(0,0,0,.18)';a.fillRect(x,H-12,BW,12);a.fillStyle='rgba(255,255,255,.15)';a.fillRect(x,6,BW,3);a.fillRect(x,62,BW,3);hh.fillStyle='#fff';hh.fillRect(x,62,BW,3);}
    else if(vr===2){ // flat composite panels with crisp joints
      a.fillStyle=FR.base;a.fillRect(x,0,BW,H);a.fillStyle='rgba(0,0,0,.28)';for(let y=0;y<H;y+=66)a.fillRect(x,y,BW,1.5);for(let xx=x;xx<x+BW;xx+=96)a.fillRect(xx,0,1.5,H);
      hh.fillStyle='#8a8a8a';for(let y=0;y<H;y+=66)hh.fillRect(x,y,BW,1.5);a.fillStyle='rgba(255,255,255,.06)';a.fillRect(x,0,BW,H*.4);}
    else{ // red brick, or white glazed tile
      const tl=FR.tile;a.fillStyle=tl?'#e6e5df':rc('#8c4b37','#7a3f2e','#9a5a3e');a.fillRect(x,0,BW,H);
      const bh=tl?8:6,bwid=tl?16:18;for(let y=0,r=0;y<H;y+=bh,r++){a.fillStyle=tl?'rgba(120,120,115,.5)':'rgba(205,195,180,.55)';a.fillRect(x,y,BW,1);hh.fillStyle='#888';hh.fillRect(x,y,BW,1);
        for(let xx=x+(r%2)*bwid/2;xx<x+BW;xx+=bwid){a.fillRect(xx,y,1,bh);if(!tl&&R()<.35){a.fillStyle=`rgba(${R()<.5?40:150},${R()<.5?20:70},20,.18)`;a.fillRect(xx+1,y+1,bwid-1,bh-1);a.fillStyle='rgba(205,195,180,.55)';}}}
      a.fillStyle=tl?'#2b2b2b':'#a7a296';a.fillRect(x,H-14,BW,14);a.fillStyle=tl?'#1a1a1a':'#bdb8ab';a.fillRect(x,64,BW,8);hh.fillStyle='#fff';hh.fillRect(x,64,BW,8);}
    // sign board
    const sy=10,sh2=48;a.fillStyle=S.bg;a.fillRect(x+22,sy,BW-44,sh2);a.strokeStyle='rgba(0,0,0,.35)';a.lineWidth=3;a.strokeRect(x+22,sy,BW-44,sh2);
    hh.fillStyle='#f0f0f0';hh.fillRect(x+22,sy,BW-44,sh2);
    a.fillStyle='rgba(255,255,255,.06)';a.fillRect(x+30,sy+6,BW-60,4);e.globalAlpha=.18;e.fillStyle=S.bg;e.fillRect(x+22,sy,BW-44,sh2);e.globalAlpha=1;
    // window + door layout
    const door=S.k==='mart'||S.k==='pharmacy'?'mid':(i+vr)%2?'left':'right',dw=vr===2?78:70,top=74,bot=H-16;
    const dx=door==='left'?x+22:door==='right'?x+BW-22-dw:x+BW/2-dw/2;
    const wins=door==='mid'?[[x+22,dx-8],[dx+dw+8,x+BW-22]]:door==='left'?[[dx+dw+10,x+BW-22]]:[[x+22,dx-10]];
    // transom band
    a.fillStyle='rgba(20,20,22,.9)';a.fillRect(x+18,top-8,BW-36,6);
    for(const [wx0,wx1] of wins){const wy0=top,wy1=bot-24,ww=wx1-wx0,wh=wy1-wy0;
      const bright=room(S,wx0-x,wy0,ww,wh);
      a.drawImage(ic,wx0-x,wy0,ww,wh,wx0,wy0,ww,wh);
      // glass reflection over the interior (day look)
      const gr=a.createLinearGradient(wx0,wy0,wx0+ww,wy1);gr.addColorStop(0,'rgba(190,215,235,.42)');gr.addColorStop(.35,'rgba(150,180,205,.16)');gr.addColorStop(.6,'rgba(255,255,255,.05)');gr.addColorStop(1,'rgba(140,170,195,.3)');a.fillStyle=gr;a.fillRect(wx0,wy0,ww,wh);
      a.fillStyle='rgba(255,255,255,.18)';a.beginPath();a.moveTo(wx0+ww*.15,wy0);a.lineTo(wx0+ww*.32,wy0);a.lineTo(wx0+ww*.12,wy1);a.lineTo(wx0-ww*.05,wy1);a.fill();
      // night: lit interior
      e.globalAlpha=.55+bright*.4;e.drawImage(ic,wx0-x,wy0,ww,wh,wx0,wy0,ww,wh);e.globalAlpha=1;
      o.fillStyle=orm(.06,.12);o.fillRect(wx0,wy0,ww,wh);hh.fillStyle='#5a5a5a';hh.fillRect(wx0,wy0,ww,wh);
      // frame + mullions + transom bar
      const fc=FR.fc||(S.k==='boutique'?'#c9b37e':'#1b1c1e');a.strokeStyle=fc;a.lineWidth=vr===2?3:vr===1?8:6;a.strokeRect(wx0,wy0,ww,wh);hh.strokeStyle='#fff';hh.lineWidth=6;hh.strokeRect(wx0,wy0,ww,wh);
      const nm=max(1,round(ww/(vr===2?220:vr===1?80:110)));a.lineWidth=vr===2?2:4;hh.lineWidth=4;for(let k=1;k<nm;k++){const mx=wx0+ww*k/nm;a.beginPath();a.moveTo(mx,wy0);a.lineTo(mx,wy1);a.stroke();hh.beginPath();hh.moveTo(mx,wy0);hh.lineTo(mx,wy1);hh.stroke();}
      a.beginPath();a.moveTo(wx0,wy0+26);a.lineTo(wx1,wy0+26);a.stroke();hh.beginPath();hh.moveTo(wx0,wy0+26);hh.lineTo(wx1,wy0+26);hh.stroke();
      if(vr===1){a.lineWidth=2;for(let tx2=wx0+18;tx2<wx1-6;tx2+=18){a.beginPath();a.moveTo(tx2,wy0);a.lineTo(tx2,wy0+26);a.stroke();}} // small transom panes
      // stall riser under the window
      if(vr===0){a.fillStyle=S.k==='boutique'?'#151517':'rgba(30,30,32,.85)';a.fillRect(wx0-3,wy1+3,ww+6,bot-wy1-3);hh.fillStyle='#e6e6e6';hh.fillRect(wx0-3,wy1+3,ww+6,bot-wy1-3);}
      else if(vr===1){a.fillStyle=FR.base;a.fillRect(wx0-4,wy1+3,ww+8,bot-wy1-3);const np=max(1,round(ww/70));for(let k=0;k<np;k++){const px0=wx0+k*ww/np+5,pw=ww/np-10;a.fillStyle='rgba(0,0,0,.22)';a.fillRect(px0,wy1+8,pw,bot-wy1-14);a.fillStyle=FR.base;a.fillRect(px0+3,wy1+11,pw-6,bot-wy1-20);
        hh.fillStyle='#d0d0d0';hh.fillRect(px0,wy1+8,pw,bot-wy1-14);hh.fillStyle='#f4f4f4';hh.fillRect(px0+3,wy1+11,pw-6,bot-wy1-20);}}
      else if(vr===3){a.fillStyle=FR.tile?'#2b2b2b':'#b5b0a3';a.fillRect(wx0-6,wy1+2,ww+12,6);hh.fillStyle='#fff';hh.fillRect(wx0-6,wy1+2,ww+12,6);}
      // window vinyl
      if(S.k==='cafe'||S.k==='ramen'||S.k==='mart'){for(const g of[a,e]){g.font='700 13px Inter, Arial, sans-serif';g.textAlign='center';g.fillStyle=S.k==='mart'?'#ff3d6e':'rgba(255,255,255,.85)';
        g.fillText(S.k==='mart'?'OPEN':S.k==='cafe'?'COFFEE · PASTRIES':'OPEN LATE',wx0+ww/2,wy0+16);}}
    }
    // door: glass with frame, handle, number
    room(S,dx-x,top,dw,bot-top);a.drawImage(ic,dx-x,top,dw,bot-top,dx,top,dw,bot-top);e.globalAlpha=.6;e.drawImage(ic,dx-x,top,dw,bot-top,dx,top,dw,bot-top);e.globalAlpha=1;
    a.fillStyle='rgba(170,195,215,.35)';a.fillRect(dx,top,dw,bot-top);o.fillStyle=orm(.06,.12);o.fillRect(dx,top,dw,bot-top);
    a.strokeStyle=FR.fc||'#1b1c1e';a.lineWidth=vr===2?4:7;a.strokeRect(dx,top,dw,bot-top);hh.strokeStyle='#fff';hh.lineWidth=7;hh.strokeRect(dx,top,dw,bot-top);hh.fillStyle='#4a4a4a';hh.fillRect(dx+4,top+4,dw-8,bot-top-8);
    a.fillStyle='#c8c9cb';a.fillRect(door==='left'?dx+dw-14:dx+8,top+(bot-top)*.5,5,26);
    a.fillStyle='#e8e2d4';a.font='700 11px Inter, Arial, sans-serif';a.textAlign='center';a.fillText(String(100+ri(1,480)),dx+dw/2,top-14);
    if(S.k==='ramen'){a.fillStyle='#b3261e';a.fillRect(dx,top,dw,30);a.fillStyle='#fff';for(let k=1;k<3;k++)a.fillRect(dx+k*dw/3-1,top,2,30);}
    for(const g of[a,o,e,hh])g.restore();
  });
  return{map:tex(ca,true),orm:tex(co,false),emis:tex(ce,true),nrm:normalFromHeight(ch,2.2)};
}

function radialTexture(stops){const c=cv(128),g=c.getContext('2d'),gr=g.createRadialGradient(64,64,0,64,64,64);for(const[s,col]of stops)gr.addColorStop(s,col);g.fillStyle=gr;g.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function waterNormal(){const S=256,c=cv(S),g=c.getContext('2d'),im=g.createImageData(S,S),W=[];
  for(let k=0;k<10;k++)W.push([ri(-7,7),ri(1,8),rr(.03,.09),rr(0,6.28)]);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){let dx=0,dy=0;for(const[fx,fy,am,ph]of W){const q=cos(2*PI*(fx*x+fy*y)/S+ph)*am;dx+=q*fx;dy+=q*fy;}
    const l=hypot(dx,dy,1),i=(y*S+x)*4;im.data[i]=(-dx/l*.5+.5)*255;im.data[i+1]=(-dy/l*.5+.5)*255;im.data[i+2]=(1/l*.5+.5)*255;im.data[i+3]=255;}
  g.putImageData(im,0,0);return tex(c,false,180);}

await stage(.28,'Laying out streets');
export { FVAR, SHOPS, SHOPV, facadeTextures, facadeVariant, noiseTexture, normalFromHeight, paverTexture, radialTexture, shopTextures, speckle, strH, tex, waterNormal };
