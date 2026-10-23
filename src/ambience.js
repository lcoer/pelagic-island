import { clamp, createRandom } from './world.js';

function hold(param,t){
  if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(t);
  else {const value=param.value;param.cancelScheduledValues(t);param.setValueAtTime(value,t);}
}

// No recordings or downloads: filtered stochastic sources form a layered,
// stereo soundscape. Slow overlapping envelopes create breaking waves and
// receding wash rather than a constant noise bed.
export function ambienceMix({wind=.65,waves=.72,storm=0,distance=70}={},t=0){
  const w=clamp(wind/2,0,1),s=clamp(waves/2,0,1),rain=clamp(storm,0,1);
  const near=clamp(1-distance/270,.28,1);
  const phase=t*.68+.23*Math.sin(t*.127);
  const swell=(.5+.5*Math.sin(phase))**2,second=(.5+.5*Math.sin(phase*.83+2.3))**3;
  const wash=(.5+.5*Math.sin(phase-1.2))**2;
  const gust=.55+.27*Math.sin(t*.19+.8)+.13*Math.sin(t*.71);
  return {
    surfLeft:(.14+s*.2+swell*(.35+s*.55))*near,
    surfRight:(.1+s*.17+second*(.29+s*.45))*near,
    water:(.045+wash*(.11+s*.11)+rain*.09)*near,
    deep:(.08+s*.15+rain*.05)*near,
    wind:(.035+w*.43+rain*.12)*gust,
    surfCutoff:650+swell*1250+s*750,
    windCutoff:650+w*1700+gust*500,
    waterCutoff:3000+wash*2100+rain*1700
  };
}

export function noiseSamples(length,type,seed){
  const random=createRandom(seed),data=new Float32Array(length);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for(let i=0;i<length;i++){
    const white=random()*2-1;
    b0=.99886*b0+white*.0555179;b1=.99332*b1+white*.0750759;b2=.969*b2+white*.153852;
    b3=.8665*b3+white*.3104856;b4=.55*b4+white*.5329522;b5=-.7616*b5-white*.016898;
    data[i]=type==='white'?white*.65:(b0+b1+b2+b3+b4+b5+b6+white*.5362)*.1;b6=white*.115926;
  }
  // Remove a slow linear end-to-start difference, then DC. The loop is
  // continuous without fading out or falling silent at every buffer boundary.
  const delta=data[length-1]-data[0];let mean=0;
  for(let i=0;i<length;i++){data[i]-=delta*i/(length-1);mean+=data[i];}mean/=length;
  let peak=0;for(let i=0;i<length;i++){data[i]-=mean;peak=Math.max(peak,Math.abs(data[i]));}
  const scale=peak>.85?.85/peak:1;for(let i=0;i<length;i++)data[i]*=scale;
  return data;
}

export function createAmbienceGraph(context){
  const master=context.createGain();master.gain.value=0;
  const compressor=context.createDynamicsCompressor();compressor.threshold.value=-13;compressor.knee.value=18;compressor.ratio.value=3;compressor.attack.value=.02;compressor.release.value=.45;
  const analyser=context.createAnalyser();analyser.fftSize=1024;
  compressor.connect(master);master.connect(analyser);analyser.connect(context.destination);
  function buffer(type,seconds,seed){
    const length=Math.floor(context.sampleRate*seconds),b=context.createBuffer(2,length,context.sampleRate);
    for(let channel=0;channel<2;channel++)b.copyToChannel(noiseSamples(length,type,seed+channel*971),channel);
    return b;
  }
  const pink=buffer('pink',11.7,1681),white=buffer('white',9.3,8191),sources=[];
  function layer(b,offset,low,high,pan){
    const source=context.createBufferSource();source.buffer=b;source.loop=true;
    const highpass=context.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=low;highpass.Q.value=.5;
    const lowpass=context.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=high;lowpass.Q.value=.55;
    const gain=context.createGain();gain.gain.value=0;
    const panner=context.createStereoPanner();panner.pan.value=pan;
    source.connect(highpass);highpass.connect(lowpass);lowpass.connect(gain);gain.connect(panner);panner.connect(compressor);source.start(0,offset);sources.push(source);
    return {gain:gain.gain,filter:lowpass.frequency};
  }
  const layers={surfLeft:layer(pink,0,90,1800,-.5),surfRight:layer(pink,4.2,110,1400,.5),water:layer(white,2.7,900,4800,.15),deep:layer(pink,7.4,38,230,0),wind:layer(pink,1.8,180,1700,-.12)};
  function target(param,value,t){hold(param,t);param.setTargetAtTime(value,t,.22);}
  function apply(mix,t=context.currentTime){
    for(const name of Object.keys(layers))target(layers[name].gain,mix[name],t);
    target(layers.surfLeft.filter,mix.surfCutoff,t);target(layers.surfRight.filter,mix.surfCutoff*.83,t);
    target(layers.wind.filter,mix.windCutoff,t);target(layers.water.filter,mix.waterCutoff,t);
  }
  return {master,analyser,sources,layers,apply,dispose(){sources.forEach(s=>s.stop());master.disconnect();analyser.disconnect();}};
}

export class SeaAmbience {
  constructor(){
    this.context=null;this.graph=null;this.enabled=false;this.paused=false;this.hidden=document.hidden;this.volume=.55;this.environment={};this.serial=0;this.lastMix=null;
    try{const value=localStorage.getItem('pelagic-volume');if(value!==null)this.volume=clamp(Number(value)||0,0,1);}catch{}
    this.onVisibility=()=>{this.hidden=document.hidden;void this.sync().catch(()=>{});};
    document.addEventListener('visibilitychange',this.onVisibility);
    this.onPageHide=()=>{this.hidden=true;void this.sync().catch(()=>{});};window.addEventListener('pagehide',this.onPageHide);window.addEventListener('pageshow',this.onVisibility);
  }
  get audible(){return this.enabled&&!this.paused&&!this.hidden&&this.volume>0;}
  async setEnabled(enabled){
    if(enabled&&!this.context){
      const Context=window.AudioContext||window.webkitAudioContext;
      if(!Context)throw new Error('当前浏览器不支持 Web Audio');
      this.context=new Context({latencyHint:'playback'});this.graph=createAmbienceGraph(this.context);
      // Audio envelopes run on the audio clock even when GPU rendering is slow.
      this.interval=setInterval(()=>this.tick(),100);
    }
    this.enabled=enabled;await this.sync();
  }
  async sync(){
    clearTimeout(this.suspendTimer);const serial=++this.serial;
    if(!this.context)return;
    if(this.audible){
      await this.context.resume();if(serial!==this.serial||!this.audible)return;
      this.tick();const param=this.graph.master.gain,t=this.context.currentTime;
      hold(param,t);param.setTargetAtTime(this.volume**1.5*.85,t,.2);
    }else{
      const param=this.graph.master.gain,t=this.context.currentTime;hold(param,t);param.setTargetAtTime(0,t,.055);
      this.suspendTimer=setTimeout(()=>{if(!this.audible&&this.context.state==='running')void this.context.suspend().catch(()=>{});},300);
    }
  }
  tick(){if(!this.audible||this.context?.state!=='running')return;this.lastMix=ambienceMix(this.environment,this.context.currentTime);this.graph.apply(this.lastMix);}
  updateEnvironment(environment){this.environment=environment;}
  async setVolume(volume){this.volume=clamp(volume,0,1);try{localStorage.setItem('pelagic-volume',String(this.volume));}catch{}await this.sync();}
  setPaused(paused){this.paused=paused;void this.sync().catch(()=>{});}
  inspect(){
    let rms=0;
    if(this.graph&&this.context.state==='running'){const samples=new Float32Array(this.graph.analyser.fftSize);this.graph.analyser.getFloatTimeDomainData(samples);rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);}
    return {enabled:this.enabled,volume:this.volume,contextState:this.context?.state??'uninitialized',audible:this.audible,sourceCount:this.graph?.sources.length??0,rms,mix:this.lastMix};
  }
}
