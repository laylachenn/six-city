// Six City — audio. One of the game's modules; they load in numbered order (src/game/index.js).
import './16-map.js';
import * as RD from '../radio.js';
import { __gs, __late, later } from './shared.js';
import { $, TEST, abs, ceil, clamp, floor, hypot, max, min, rnd } from './01-core.js';
import { WX, WXM } from './02-sky.js';
import { hood, placeName } from './05-landmarks.js';
import { cars } from './06-cars.js';
import { G, player, toggleCar } from './08-input.js';
import { HELI } from './10-police.js';
import { SAVE } from './11-missions.js';
import { CUT } from './12-story.js';
later({AC:()=>AC,RAD:()=>RAD,initAudio:()=>initAudio,master:()=>master,radioCycle:()=>radioCycle,radioHush:()=>radioHush,thud:()=>thud}); // for earlier modules, read when called

/* ============================== audio ============================== */
let AC=null,master=null,eng=null,engGain=null,sir=null,sirGain=null,heliGain=null;__gs.muted=false;
function initAudio(){
  if(AC)return;try{
    AC=new(window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=.5;master.connect(AC.destination);
    eng=AC.createOscillator();eng.type='sawtooth';const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=420;engGain=AC.createGain();engGain.gain.value=0;eng.connect(f);f.connect(engGain);engGain.connect(master);eng.start();
    sir=AC.createOscillator();sir.type='triangle';sirGain=AC.createGain();sirGain.gain.value=0;sir.connect(sirGain);sirGain.connect(master);sir.start();
    { // helicopter: low noise chopped by the rotor
      const nb=AC.createBuffer(1,AC.sampleRate,AC.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=rnd()*2-1;
      const ns=AC.createBufferSource(),lp=AC.createBiquadFilter(),am=AC.createGain(),lfo=AC.createOscillator(),lg=AC.createGain();ns.buffer=nb;ns.loop=true;lp.type='lowpass';lp.frequency.value=280;
      am.gain.value=.5;lfo.type='square';lfo.frequency.value=12;lg.gain.value=.5;lfo.connect(lg);lg.connect(am.gain);heliGain=AC.createGain();heliGain.gain.value=0;
      ns.connect(lp);lp.connect(am);am.connect(heliGain);heliGain.connect(master);ns.start();lfo.start();}
  }catch(e){AC=null;}
}
function thud(v){
  if(!AC)return;const n=AC.sampleRate*.25|0,b=AC.createBuffer(1,n,AC.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=(rnd()*2-1)*Math.pow(1-i/n,3);
  const s=AC.createBufferSource(),g=AC.createGain(),f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=700;g.gain.value=v;s.buffer=b;s.connect(f);f.connect(g);g.connect(master);s.start();
}
function stepAudio(){
  if(!AC)return;const t=AC.currentTime,c=G.car;
  if(c&&!c.T.pedal){const sp=abs(c.speed),gear=min(4,floor(sp/13)),fr=(sp-gear*13)/13;eng.frequency.setTargetAtTime((52+fr*70+gear*9+(c.thr?8:0))*(c.bike?1.7:1),t,.06);engGain.gain.setTargetAtTime(c.hp>0?.05+(c.thr?.035:0):0,t,.08);}
  else engGain.gain.setTargetAtTime(0,t,.1);
  const on=floor(G.heat)>0&&G.copDist<220;
  sirGain.gain.setTargetAtTime(on?.05*(1-G.copDist/240):0,t,.2);
  if(on)sir.frequency.setTargetAtTime((performance.now()/420|0)%2?930:690,t,.05);
  heliGain.gain.setTargetAtTime(HELI.on?.16*clamp(1-hypot(HELI.x-__gs.FX,HELI.y,HELI.z-__gs.FZ)/320,0,1):0,t,.2);
}

/* ============================== radio ==============================
   Stations, songs and DJ lines live in src/radio.js (unit-tested). This plays them: each song is synthesised step by step
   with Web Audio (drums, bass, chords, lead) a quarter-second ahead, through a car-speaker filter. DJs talk between songs
   with the browser's speech synthesis, the music ducks under them. Every station keeps its own clock, so it carries on
   while you're out of the car. In a car: scroll or , and . to change station. */
const RAD={on:SAVE.radio??0,bus:null,out:null,noise:null,clock:RD.STATIONS.map(()=>rnd()*900),cur:null,step:0,talkK:floor(rnd()*5),speaking:false,talkNext:0,popT:0,live:false,lastTitle:null};
const radioEl=$('radio');
function radioInit(){
  if(RAD.bus||!AC)return;
  RAD.out=AC.createGain();RAD.out.gain.value=0;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=6500;const hp=AC.createBiquadFilter();hp.type='highpass';hp.frequency.value=55;
  const comp=AC.createDynamicsCompressor();comp.threshold.value=-18;comp.ratio.value=4;
  RAD.bus=AC.createGain();RAD.bus.gain.value=.3;RAD.bus.connect(hp);hp.connect(lp);lp.connect(comp);comp.connect(RAD.out);RAD.out.connect(master);
  const n=AC.sampleRate,b=AC.createBuffer(1,n,n),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=rnd()*2-1;RAD.noise=b;
}
// --- instruments: every note is a short-lived node chain that disconnects itself
function rEnv(g,t,a,peak,dec,end){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.setTargetAtTime(0,t+a,dec);return t+end;}
function rOsc(type,f,t,stop,dest){const o=AC.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);o.connect(dest);o.start(t);o.stop(stop);return o;}
function rNoise(t,dur,ftype,freq,vol,q){const s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=RAD.noise;f.type=ftype;f.frequency.value=freq;if(q)f.Q.value=q;
  s.connect(f);f.connect(g);g.connect(RAD.bus);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.start(t,rnd()*.5);s.stop(t+dur+.02);}
function rKick(t,v){const g=AC.createGain();g.connect(RAD.bus);const o=rOsc('sine',150,t,t+.5,g);o.frequency.exponentialRampToValueAtTime(42,t+.12);g.gain.setValueAtTime(v*.9,t);g.gain.exponentialRampToValueAtTime(.001,t+.45);}
function rSnare(t,v,soft){rNoise(t,soft?.12:.18,'bandpass',soft?1500:1900,v*(soft?.28:.4),.8);const g=AC.createGain();g.connect(RAD.bus);rOsc('triangle',190,t,t+.12,g);g.gain.setValueAtTime(v*.25,t);g.gain.exponentialRampToValueAtTime(.001,t+.1);}
function rHat(t,v){rNoise(t,.045,'highpass',7500,v*.13);}
function rBass(kind,m,t,dur){const g=AC.createGain(),f=AC.createBiquadFilter();f.type='lowpass';g.connect(RAD.bus);f.connect(g);const fr=RD.midiFreq(m);
  if(kind==='808'){rOsc('sine',fr,t,t+dur*3,g);rEnv(g,t,.005,.32,dur*1.2,dur*3);}
  else if(kind==='soft'){rOsc('triangle',fr,t,t+dur*2,g);rEnv(g,t,.01,.6,dur*.8,dur*2);}
  else{f.frequency.setValueAtTime(kind==='arp'?1400:900,t);f.frequency.setTargetAtTime(260,t,.08);rOsc('sawtooth',fr,t,t+dur*1.5,f);rEnv(g,t,.005,kind==='arp'?.2:.28,dur*.5,dur*1.5);}}
function rPad(kind,notes,t,dur){const g=AC.createGain(),f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=kind==='lush'?1800:kind==='strum'?2600:1200;f.connect(g);g.connect(RAD.bus);
  const type=kind==='lush'?'sawtooth':kind==='strum'?'sawtooth':kind==='rhodes'?'sine':'triangle',vol=kind==='lush'?.05:kind==='strum'?.045:kind==='rhodes'?.13:.075;
  notes.forEach((m,i)=>{const st=t+(kind==='strum'?i*.018:0);rOsc(type,RD.midiFreq(m),st,t+dur+.6,f);if(kind==='lush')rOsc(type,RD.midiFreq(m)*1.004,st,t+dur+.6,f);});
  if(kind==='strum'||kind==='keys'||kind==='rhodes'){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.01);g.gain.setTargetAtTime(vol*.35,t+.01,.25);g.gain.setTargetAtTime(0,t+dur,.12);}
  else{g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+dur*.3);g.gain.setTargetAtTime(0,t+dur*.9,.2);}}
function rLead(kind,m,t,dur){const g=AC.createGain(),f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=kind==='guitar'?2200:kind==='saw'?2600:5000;f.connect(g);g.connect(RAD.bus);const fr=RD.midiFreq(m);
  if(kind==='bell'){rOsc('sine',fr,t,t+1,f);rOsc('sine',fr*2.01,t,t+.4,f);rEnv(g,t,.003,.09,.22,1);}
  else{rOsc(kind==='guitar'?'square':'sawtooth',fr,t,t+dur*2+.1,f);rEnv(g,t,.005,kind==='guitar'?.05:.055,dur*.9,dur*2+.1);}}
// one 16th step of the current song
function radioPlayStep(song,s,t){const st=RD.STATIONS[RAD.on],P=RD.songStep(song,s),sec=P.section,i=P.step,sd=song.stepDur;
  if(i%2===1)t+=song.swing*sd*.33;
  if(sec.drums){const v=sec.drums,fillBar=P.barInSection===sec.bars-1&&sec.name!=='outro';
    if(song.kick[i])rKick(t,song.kick[i]*v);
    if(song.snare[i])rSnare(t,song.snare[i]*v,st.id==='ravine');else if(fillBar&&i>=12&&i%2===0)rSnare(t,.35*v,true);
    if(song.hat[i])rHat(t,song.hat[i]*v);}
  else if(sec.name==='intro'&&P.barInSection===sec.bars-1&&i>=8&&i%2===0)rSnare(t,.15+.05*(i-8),true); // build into the verse
  if(sec.bass&&song.bassPat[i]!==null)rBass(st.bass,P.bassRoot+song.bassPat[i],t,sd*(st.bass==='808'?3:1.6));
  if(sec.pad){const len=st.pad==='strum'||st.pad==='keys'?8:16;if(i%len===0)rPad(st.pad,P.chord,t,sd*len);}
  if(sec.lead){const ph=sec.lead==='B'?song.leadB:song.leadA,m=ph[(P.bar%2)*16+i];if(m!==null&&m!==undefined)rLead(st.lead,m,t,sd*2);}
  if(st.crackle&&rnd()<.25)rNoise(t,.01,'highpass',3000,.04+rnd()*.05);}
// --- DJ voices: speech synthesis, a different voice per station where the browser has a few
const SPK=window.speechSynthesis||null;let rVoices=[];
function loadVoices(){if(!SPK)return;const v=SPK.getVoices();rVoices=v.filter(x=>/^en/i.test(x.lang));if(!rVoices.length)rVoices=v;}
if(SPK){loadVoices();SPK.addEventListener?.('voiceschanged',loadVoices);}
function radioCtx(){return{hood:hood(__gs.FX,__gs.FZ),place:placeName(__gs.FX,__gs.FZ),time:G.time,weather:WXM[WX.mode].n,heat:G.heat,feed:__late.PH.feed.find(p=>!p.mine)?.text||null};}
function radioSay(text,st,then){
  if(!SPK||TEST||__gs.muted){then&&setTimeout(then,1200);return;}
  const u=new SpeechSynthesisUtterance(text),idx=RD.STATIONS.indexOf(st);if(rVoices.length)u.voice=rVoices[(idx*3)%rVoices.length];
  u.pitch=st.voice.pitch;u.rate=st.voice.rate;u.volume=.9;const my=RAD.on,id=RAD.sayId=(RAD.sayId||0)+1;
  u.onstart=()=>{if(RAD.sayId===id)RAD.speaking=true;};u.onend=u.onerror=()=>{if(RAD.sayId!==id)return;RAD.speaking=false;if(then&&RAD.on===my&&RAD.live)then();};
  SPK.cancel();SPK.speak(u);RAD.speaking=true;}
function radioHush(){RAD.sayId=(RAD.sayId||0)+1;if(SPK&&RAD.speaking)SPK.cancel();RAD.speaking=false;}
function radioPop(a,b){radioEl.innerHTML=`<b>${a}</b>${b?`<span>${b}</span>`:''}`;radioEl.classList.add('on');RAD.popT=3.2;}
function radioPopNow(){const st=RD.STATIONS[RAD.on];if(!st){radioPop('Radio off');return;}
  if(st.talk)radioPop(st.name,st.tag);else{const s=RAD.cur?.song;radioPop(st.name,s?`${s.title} · ${s.artist}`:st.tag);}}
// tune to station i (-1 = off); the station picks up wherever its clock has got to
function radioTune(i){radioHush();RAD.on=i;RAD.cur=null;RAD.live=false;RAD.talkNext=0;SAVE.radio=i;if(i<0)radioPop('Radio off');} // stepRadio picks it up next frame
function radioSync(st,tuning){const t=AC.currentTime,p=RD.songAt(st,t+RAD.clock[RAD.on]);
  RAD.cur={song:p.song,n:p.n,start:t-p.at};RAD.step=ceil(p.at/p.song.stepDur);
  if(tuning&&p.at<p.song.stepDur*16*3&&rnd()<.7)radioSay(RD.djLine(st,null,p.song,radioCtx()),st);}
function radioCycle(d){const n=RD.STATIONS.length;let i=RAD.on+d;if(i>=n)i=-1;if(i<-1)i=n-1;radioTune(i);__late.click();}
function stepRadio(dt){
  if(!AC)return;radioInit();const t=AC.currentTime,st=RD.STATIONS[RAD.on];
  if(RAD.popT>0){RAD.popT-=dt;if(RAD.popT<=0)radioEl.classList.remove('on');}
  const live=!!(G.car&&!G.car.bike&&G.running&&st&&!CUT&&!(G.car.hp<=0));
  if(live!==RAD.live){RAD.live=live;if(!live){radioHush();RAD.cur=null;}else{if(st&&!st.talk)radioSync(st,true);RAD.talkNext=t+.8;radioPopNow();}}
  const siren=floor(G.heat)>0&&G.copDist<220?.65:1; // dip under sirens so you hear the cops coming
  RAD.out.gain.setTargetAtTime(live?(RAD.speaking&&!st?.talk?.35:1)*siren:0,t,live?.15:.05);
  if(!live)return;
  if(st.talk){if(!RAD.speaking&&RAD.talkNext&&t>=RAD.talkNext){RAD.talkNext=0;const k=RAD.talkK++;radioSay(RD.talkLine(k,radioCtx()),st,()=>{RAD.talkNext=AC.currentTime+1.4;});}return;}
  if(!RAD.cur)radioSync(st,false);
  let c=RAD.cur;if(t-(c.start+RAD.step*c.song.stepDur)>1){radioSync(st,false);c=RAD.cur;} // back from a hidden tab: jump, don't replay
  while(c.start+RAD.step*c.song.stepDur<t+.25){
    if(RAD.step>=c.song.steps){ // next song: a DJ link most of the time, and the name on screen
      const prev=c.song,n=c.n+1,song=RD.makeSong(st,n);RAD.cur=c={song,n,start:c.start+prev.dur};RAD.step=0;
      if(rnd()<.6)radioSay(RD.djLine(st,prev,song,radioCtx()),st);radioPop(st.name,`${song.title} · ${song.artist}`);continue;}
    const at=c.start+RAD.step*c.song.stepDur;
    if(at>=t-.05)radioPlayStep(c.song,RAD.step,max(at,t));
    RAD.step++;}
}
if(TEST){window.__radio=()=>({on:RAD.on,live:RAD.live,song:RAD.cur&&{n:RAD.cur.n,title:RAD.cur.song.title,artist:RAD.cur.song.artist,bpm:RAD.cur.song.bpm},step:RAD.step,gain:RAD.out&&RAD.out.gain.value,pop:radioEl.textContent,ac:AC&&AC.state});window.__tune=radioTune;window.__rlevel=()=>{if(!RAD.an){RAD.an=AC.createAnalyser();RAD.an.fftSize=2048;RAD.out.connect(RAD.an);}const d=new Float32Array(2048);RAD.an.getFloatTimeDomainData(d);let s=0,p=0;for(const v of d){s+=v*v;p=Math.max(p,Math.abs(v));}return{rms:+Math.sqrt(s/d.length).toFixed(3),peak:+p.toFixed(3)};};window.__initAudio=()=>{initAudio();return AC&&AC.state;};
  window.__carIn=()=>{if(G.car)return true;let b=null,bd=1e9;for(const c of cars){if(c.T.tram)continue;const d=hypot(c.x-player.x,c.z-player.z);if(d<bd){bd=d;b=c;}}if(!b)return false;player.x=b.x+2;player.z=b.z;toggleCar();return !!G.car;};}

export { AC, RAD, engGain, heliGain, master, radioHush, sirGain, stepAudio, stepRadio, thud };
