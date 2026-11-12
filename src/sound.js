// ---------- sound (Web Audio, synthesized) ----------
let ac=null;
function wake(){ try{ const p=ac&&ac.state!=='running'&&ac.resume(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} }
// iOS: start audio from a tap, play as media (so the in-game Sound setting is the mute control), and resume after interruptions.
function audio(){
  try{
    if(!ac){
      try{ if(navigator.audioSession) navigator.audioSession.type='playback'; }catch(e){}
      ac=new (window.AudioContext||window.webkitAudioContext)();
      const b=ac.createBuffer(1,1,22050),src=ac.createBufferSource(); src.buffer=b; src.connect(ac.destination); src.start(0);
    }
    wake();
  }catch(e){ ac=null; }
  return ac;
}
document.addEventListener('pointerdown',wake,{passive:true,capture:true});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) wake(); });
function tone(f,dur=.12,type='sine',vol=.09,delay=0,to){
  if(!state.sound) return; const c=audio(); if(!c) return;
  const t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();
  o.type=type; o.frequency.setValueAtTime(f,t);
  if(to) o.frequency.exponentialRampToValueAtTime(to,t+dur);
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+.01); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+dur+.03);
}
const sfx={
  tap:d=>tone({up:660,right:587,down:440,left:494}[d]||330,.13,'triangle',.1),
  step:()=>tone(300+Math.random()*40,.07,'sine',.05),
  turn:()=>tone(760,.08,'triangle',.06),
  oops:()=>tone(320,.28,'sine',.1,0,150),
  win:()=>[523,659,784,1047].forEach((f,i)=>tone(f,.24,'triangle',.1,i*.11)),
  hint:()=>{ tone(880,.1,'sine',.07); tone(1175,.14,'sine',.07,.1); },
  swap:()=>{ tone(520,.08,'triangle',.08); tone(780,.1,'triangle',.08,.07); }
};
// Animal calls are synthesized (no audio files), shaped from published descriptions:
// baby penguin: emperor penguin chick calls are short and high pitched (adults are longer and deeper).
// toucan: low, rough, harsh croak repeated, plus bill clacks.  hornbill: Oriental pied hornbill, a loud crackling laugh/cackle.
// otter: smooth-coated otter chirps and musical bubbling, and a harsh "ha".  panda: friendly goat-like bleat; a falling nasal honk when blocked.
// shark: rig sharks are the first sharks recorded making sound: sharp clicks of about 48 ms, mostly single, some doubled.
// baby seal: seal pups use a tonal, wavering contact call to find their mothers; their aggressive calls are higher.
// bubble tea: not an animal, so a slurp and popping pearls.
let cryOut=null;
function cryBus(c){   // calls go through a boost and a limiter so they are louder without clipping
  if(!cryOut){
    const g=c.createGain(); g.gain.value=2.2;
    const lim=c.createDynamicsCompressor(); lim.threshold.value=-16; lim.knee.value=14; lim.ratio.value=8; lim.attack.value=.003; lim.release.value=.2;
    g.connect(lim); lim.connect(c.destination); cryOut=g;
  }
  return cryOut;
}
let noiseBuf=null;
function noiseBuffer(c){
  if(!noiseBuf){ noiseBuf=c.createBuffer(1,Math.floor(c.sampleRate*.5),c.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; }
  return noiseBuf;
}
function note(c,s,o){
  const osc=c.createOscillator(),lp=c.createBiquadFilter(),env=c.createGain(),end=s+o.dur+.05;
  osc.type=o.wave; osc.frequency.setValueAtTime(o.f0,s); osc.frequency.exponentialRampToValueAtTime(o.f1,s+o.dur);
  lp.type='lowpass'; lp.frequency.value=o.lp;
  env.gain.setValueAtTime(.0001,s); env.gain.exponentialRampToValueAtTime(o.vol,s+Math.min(.03,o.dur/3)); env.gain.exponentialRampToValueAtTime(.0001,s+o.dur);
  osc.connect(lp); let out=lp;
  if(o.am){ const am=c.createGain(),l=c.createOscillator(),lg=c.createGain(); am.gain.value=1-o.amDepth/2; l.frequency.value=o.am; lg.gain.value=o.amDepth/2; l.connect(lg); lg.connect(am.gain); l.start(s); l.stop(end); lp.connect(am); out=am; }
  if(o.vib){ const l=c.createOscillator(),lg=c.createGain(); l.frequency.value=o.vib; lg.gain.value=o.vibDepth; l.connect(lg); lg.connect(osc.frequency); l.start(s); l.stop(end); }
  out.connect(env); env.connect(cryBus(c)); osc.start(s); osc.stop(end);
}
function hiss(c,s,dur,vol,freq,q){
  const src=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();
  src.buffer=noiseBuffer(c); bp.type='bandpass'; bp.frequency.value=freq; bp.Q.value=q;
  g.gain.setValueAtTime(.0001,s); g.gain.exponentialRampToValueAtTime(vol,s+Math.min(.02,dur/2)); g.gain.exponentialRampToValueAtTime(.0001,s+dur);
  src.connect(bp); bp.connect(g); g.connect(cryBus(c)); src.start(s); src.stop(s+dur+.05);
}
function slurp(c,s,dur,vol,f0,f1){   // noise through a sweeping band-pass, like sucking through a straw
  const src=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();
  src.buffer=noiseBuffer(c); src.loop=true; bp.type='bandpass'; bp.Q.value=4;
  bp.frequency.setValueAtTime(f0,s); bp.frequency.exponentialRampToValueAtTime(f1,s+dur);
  g.gain.setValueAtTime(.0001,s); g.gain.exponentialRampToValueAtTime(vol,s+.05); g.gain.setValueAtTime(vol,s+dur*.7); g.gain.exponentialRampToValueAtTime(.0001,s+dur);
  src.connect(bp); bp.connect(g); g.connect(cryBus(c)); src.start(s); src.stop(s+dur+.05);
}
const pop=(c,s,f=900,vol=.16)=>note(c,s,{wave:'sine',f0:f,f1:f*.35,dur:.07,vol,lp:4000});
const click=(c,s)=>{ hiss(c,s,.048,.45,3400,1.4); note(c,s,{wave:'square',f0:1100,f1:320,dur:.035,vol:.09,lp:5000}); };
const peep=(c,s,f0,f1,dur=.1,vol=.13)=>note(c,s,{wave:'sine',f0,f1,dur,vol,lp:5000});
const CRIES={
  penguin:{
    win:(c,t)=>{ peep(c,t,1300,1750); peep(c,t+.14,1750,1250,.12); peep(c,t+.32,1350,1800); peep(c,t+.46,1800,1300,.12);
                 note(c,t+.66,{wave:'triangle',f0:1500,f1:1650,dur:.34,vol:.11,lp:4000,vib:22,vibDepth:120}); },
    hit:(c,t)=>peep(c,t,1650,950,.2,.14),
    hi:(c,t)=>{ peep(c,t,1300,1700,.09); peep(c,t+.13,1350,1800,.09); }
  },
  toucan:{
    win:(c,t)=>{ for(let i=0;i<3;i++) note(c,t+i*.34,{wave:'sawtooth',f0:240,f1:170,dur:.24,vol:.1,lp:1100,am:38,amDepth:.9});
                 hiss(c,t+1.08,.04,.12,2600,3); hiss(c,t+1.2,.04,.12,2600,3); },
    hit:(c,t)=>{ note(c,t,{wave:'sawtooth',f0:230,f1:160,dur:.2,vol:.11,lp:1100,am:38,amDepth:.9}); hiss(c,t+.22,.04,.12,2600,3); },
    hi:(c,t)=>note(c,t,{wave:'sawtooth',f0:240,f1:170,dur:.24,vol:.1,lp:1100,am:38,amDepth:.9})
  },
  hornbill:{
    win:(c,t)=>{ for(let i=0;i<9;i++){ const f=800-i*35; note(c,t+i*.095,{wave:'square',f0:f,f1:f*.82,dur:.07,vol:.09,lp:2400,am:60,amDepth:.4}); } },
    hit:(c,t)=>{ for(let i=0;i<3;i++) note(c,t+i*.085,{wave:'square',f0:900-i*60,f1:700-i*60,dur:.06,vol:.1,lp:2400}); },
    hi:(c,t)=>{ for(let i=0;i<4;i++){ const f=800-i*35; note(c,t+i*.095,{wave:'square',f0:f,f1:f*.82,dur:.07,vol:.09,lp:2400,am:60,amDepth:.4}); } }
  },
  otter:{
    win:(c,t)=>{ [[900,1500],[1000,1650],[950,1400]].forEach(([a,b],i)=>note(c,t+i*.13,{wave:'sine',f0:a,f1:b,dur:.09,vol:.11,lp:3500}));
                 note(c,t+.45,{wave:'triangle',f0:720,f1:760,dur:.42,vol:.1,lp:2200,vib:16,vibDepth:150}); },
    hit:(c,t)=>{ hiss(c,t,.16,.22,1800,.8); note(c,t+.14,{wave:'sine',f0:1300,f1:900,dur:.09,vol:.08,lp:3000}); },
    hi:(c,t)=>[[900,1500],[1000,1650]].forEach(([a,b],i)=>note(c,t+i*.13,{wave:'sine',f0:a,f1:b,dur:.09,vol:.11,lp:3500}))
  },
  panda:{
    win:(c,t)=>note(c,t,{wave:'sawtooth',f0:540,f1:470,dur:1.1,vol:.1,lp:1300,vib:9,vibDepth:30,am:24,amDepth:.6}),
    hit:(c,t)=>[0,.27].forEach(d=>note(c,t+d,{wave:'sawtooth',f0:340,f1:190,dur:.22,vol:.13,lp:1000})),
    hi:(c,t)=>note(c,t,{wave:'sawtooth',f0:540,f1:480,dur:.45,vol:.1,lp:1300,vib:9,vibDepth:30,am:24,amDepth:.6})
  },
  shark:{
    win:(c,t)=>{ click(c,t); click(c,t+.1); click(c,t+.38); click(c,t+.48); click(c,t+.78);
                 note(c,t+.95,{wave:'sine',f0:150,f1:70,dur:.16,vol:.22,lp:800}); hiss(c,t+.95,.07,.3,900,1); },
    hit:(c,t)=>{ click(c,t); note(c,t+.05,{wave:'sine',f0:130,f1:60,dur:.15,vol:.22,lp:700}); },
    hi:(c,t)=>{ click(c,t); click(c,t+.1); }
  },
  seal:{
    win:(c,t)=>{ note(c,t,{wave:'sawtooth',f0:620,f1:430,dur:.55,vol:.1,lp:1800,vib:7,vibDepth:18});
                 note(c,t+.65,{wave:'sawtooth',f0:680,f1:450,dur:.65,vol:.1,lp:1800,vib:7,vibDepth:22}); },
    hit:(c,t)=>note(c,t,{wave:'sawtooth',f0:920,f1:720,dur:.24,vol:.1,lp:2400}),
    hi:(c,t)=>note(c,t,{wave:'sawtooth',f0:600,f1:470,dur:.35,vol:.1,lp:1800,vib:7,vibDepth:16})
  },
  boba:{
    win:(c,t)=>{ slurp(c,t,.5,.35,500,2600); [.58,.7,.8,.92].forEach((d,i)=>pop(c,t+d,800+i*120)); },
    hit:(c,t)=>{ hiss(c,t,.18,.3,420,.7); pop(c,t+.12,420,.14); },
    hi:(c,t)=>{ pop(c,t,850); pop(c,t+.12,1050); }
  }
};
const CRY_WIN_MS={penguin:1050,toucan:1350,hornbill:950,otter:950,panda:1150,shark:1150,seal:1350,boba:1050};
function cry(type,mood){
  if(!state.sound) return; const c=audio(); if(!c) return;
  const f=CRIES[type]&&CRIES[type][mood]; if(f) f(c,c.currentTime+.01);
}
function say(t){
  if(!state.voice||!('speechSynthesis' in window)) return;
  try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); u.rate=.92; u.pitch=1.25; speechSynthesis.speak(u); }catch(e){}
}
