import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createIsland, createBirds } from './island.js';
import { createInteractiveBoat } from './boat.js';
import { SeaAmbience } from './ambience.js';
import { skyVertex, skyFragment, oceanVertex, oceanFragment } from './shaders.js';
import { clamp, damp, createRandom, weatherPreset } from './world.js';
import './style.css';

const $ = id => document.getElementById(id);
const smoothstep = (a,b,x) => { const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const state = { weather:'clear', hour:17.65, storm:0, wind:.65, waves:.72, paused:false, cycle:true, tour:false, quality:'medium' };
let toastTimeout;
function toast(message){ $('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),2500); }
function fail(error){ console.error(error);$('loading')?.classList.add('loaded');$('error').hidden=false;$('error').textContent=`场景启动失败：${error.message}。请使用支持 WebGL2 的现代浏览器并开启硬件加速，再刷新页面。`; }
window.addEventListener('error',e=>{if($('loading')&&!$('loading').classList.contains('loaded'))fail(e.error||new Error(e.message));});

try { init(); } catch(error){ fail(error); }

function init(){
  const ambience=new SeaAmbience();
  const renderer = new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.info.autoReset=false;
  renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('aria-label','三维海岛，拖动旋转视角，滚轮缩放，右键平移');
  $('world').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();state.paused=true;ambience.setPaused(true);toast('图形上下文已丢失，请刷新页面重新进入海岛。');});

  const scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#b0b7ad',.0025);
  const camera=new THREE.PerspectiveCamera(44,innerWidth/innerHeight,.2,3000);
  const home = new THREE.Vector3(58,24,75), focus=new THREE.Vector3(0,4,0);
  let viewScale=1;
  camera.position.copy(home);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.copy(focus);controls.enableDamping=true;controls.dampingFactor=.065;
  controls.minDistance=16;controls.maxDistance=215;controls.maxPolarAngle=Math.PI*.485;
  controls.minTargetRadius=0;controls.maxTargetRadius=55;
  controls.cursor.set(0,3,0);controls.zoomSpeed=.7;controls.panSpeed=.65;controls.autoRotateSpeed=.35;
  controls.update();
  controls.addEventListener('start',()=>{if(state.tour)toggleTour(false);});

  const uniforms={
    uTime:{value:0},uStorm:{value:0},uWind:{value:.65},uWaves:{value:.72},uDay:{value:1},uSunset:{value:.75},
    uSun:{value:new THREE.Vector3(-.8,.2,-.5).normalize()},uSunColor:{value:new THREE.Color('#ffe1b2')},
    uZenith:{value:new THREE.Color('#687d99')},uHorizon:{value:new THREE.Color('#e2b192')}
  };
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),new THREE.ShaderMaterial({
    uniforms,vertexShader:skyVertex,fragmentShader:skyFragment,side:THREE.BackSide,depthWrite:false,depthTest:true
  }));
  sky.name='procedural-sky';sky.renderOrder=-100;sky.frustumCulled=false;scene.add(sky);

  const boatSystem=createInteractiveBoat({scene,camera,canvas:renderer.domElement,controls,uniforms,state,
    onDragStart:()=>toggleTour(false),toast,linearFloat:renderer.extensions.has('OES_texture_float_linear')});

  // Nonlinear grid: nearshore geometry is dense, the far ocean uses larger
  // cells. The same vertex count spans 2.5 km without a visible sea edge.
  const oceanGeo=new THREE.PlaneGeometry(2,2,280,280);
  const oceanPos=oceanGeo.attributes.position;
  for(let i=0;i<oceanPos.count;i++){
    const x=oceanPos.getX(i),y=oceanPos.getY(i);
    const stretch=v=>Math.sign(v)*(Math.abs(v)*22+Math.abs(v)**3*1228);
    oceanPos.setXY(i,stretch(x),stretch(y));
  }
  oceanGeo.computeBoundingSphere();
  const ocean=new Reflector(oceanGeo,{textureWidth:768,textureHeight:768,clipBias:.003,multisample:0,shader:{
    name:'ProceduralGerstnerOcean',uniforms:{...uniforms,color:{value:new THREE.Color()},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()}},
    vertexShader:oceanVertex,fragmentShader:oceanFragment
  }});
  Object.assign(ocean.material.uniforms,uniforms);
  ocean.rotation.x=-Math.PI/2;ocean.name='ocean';ocean.frustumCulled=false;scene.add(ocean);

  const hemi=new THREE.HemisphereLight('#c3e0ec','#8a7655',1.85);scene.add(hemi);
  const sunlight=new THREE.DirectionalLight('#ffdeac',3.4);sunlight.castShadow=true;
  sunlight.shadow.mapSize.set(2048,2048);sunlight.shadow.camera.left=-48;sunlight.shadow.camera.right=48;
  sunlight.shadow.camera.top=45;sunlight.shadow.camera.bottom=-45;sunlight.shadow.camera.near=1;sunlight.shadow.camera.far=220;
  sunlight.shadow.bias=-.0003;sunlight.shadow.normalBias=.045;sunlight.shadow.radius=2;
  scene.add(sunlight,sunlight.target);
  const island=createIsland(scene,uniforms);
  const updateBirds=createBirds(scene);

  // Rain is a GPU-animated volume of line segments, with no image sprites.
  const seeded=createRandom(987),rainPositions=[],rainEnds=[];
  for(let i=0;i<6500;i++){
    const x=(seeded()-.5)*150,y=seeded()*75,z=(seeded()-.5)*150;
    rainPositions.push(x,y,z,x,y,z);rainEnds.push(0,1);
  }
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.Float32BufferAttribute(rainPositions,3));rainGeo.setAttribute('aEnd',new THREE.Float32BufferAttribute(rainEnds,1));
  const rainMaterial=new THREE.ShaderMaterial({
    uniforms:{uTime:uniforms.uTime,uStorm:uniforms.uStorm,uWind:uniforms.uWind},transparent:true,depthWrite:false,
    vertexShader:`uniform float uTime,uStorm,uWind; attribute float aEnd;varying float vAlpha;
      void main(){vec3 p=position;p.y=mod(p.y-uTime*27.,75.);p.x+=cameraPosition.x+sin(position.z)*2.-p.y*uWind*.2;p.z+=cameraPosition.z;
      p+=vec3(.2*uWind,-1.15,0.)*aEnd;vec4 mv=viewMatrix*vec4(p,1.);vAlpha=uStorm*.3*(1.-smoothstep(30.,100.,-mv.z));gl_Position=projectionMatrix*mv;}`,
    fragmentShader:'varying float vAlpha;void main(){gl_FragColor=vec4(.65,.78,.86,vAlpha);}'
  });
  const rain=new THREE.LineSegments(rainGeo,rainMaterial);rain.frustumCulled=false;rain.visible=false;scene.add(rain);
  const lightningLight=new THREE.DirectionalLight('#d5e6ff',0);lightningLight.position.set(-30,60,-50);scene.add(lightningLight);
  const boltMat=new THREE.LineBasicMaterial({color:'#e1edff',transparent:true,opacity:0,toneMapped:false});
  const boltGeo=new THREE.BufferGeometry();const boltPoints=[];
  for(let i=0;i<18;i++)boltPoints.push(new THREE.Vector3(-70+seeded()*5,65-i*3.5,-95+seeded()*3));
  boltGeo.setFromPoints(boltPoints);const bolt=new THREE.Line(boltGeo,boltMat);scene.add(bolt);
  let lightning=0,nextLightning=8;

  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.23,.45,1.05);composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const fxaa=new ShaderPass(FXAAShader);composer.addPass(fxaa);
  const vignette=new ShaderPass({uniforms:{tDiffuse:{value:null}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float vig=1.-.2*smoothstep(.2,.8,length((vUv-.5)*vec2(1.,.8)));gl_FragColor=vec4(c*vig,1.);}`
  });composer.addPass(vignette);

  function resize(){
    const mobile=innerWidth<580,nextScale=mobile?1.65:1;
    camera.position.sub(controls.target).multiplyScalar(nextScale/viewScale).add(controls.target);viewScale=nextScale;
    camera.fov=mobile?54:44;camera.aspect=innerWidth/innerHeight;
    if(mobile)camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*.14,innerWidth,innerHeight);else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);
    const ratio=renderer.getPixelRatio();fxaa.uniforms.resolution.value.set(1/(innerWidth*ratio),1/(innerHeight*ratio));
  }
  const qualities={high:{ratio:1.8,reflection:1024,bloom:true},medium:{ratio:1.25,reflection:768,bloom:true},low:{ratio:.85,reflection:384,bloom:false}};
  function setQuality(value){
    state.quality=value;const q=qualities[value];
    renderer.setPixelRatio(Math.min(devicePixelRatio,q.ratio));composer.setPixelRatio(renderer.getPixelRatio());
    ocean.getRenderTarget().setSize(q.reflection,q.reflection);bloom.enabled=q.bloom;resize();
  }
  setQuality('medium');window.addEventListener('resize',resize);

  let hourTarget=state.hour,stormTarget=0,windTarget=.65,wavesTarget=.72;
  let seekingTime=false;
  const descriptions={clear:'落日微风 · 温柔涌浪',storm:'暴雨将至 · 风起浪涌',night:'月光如水 · 灯塔守望'};
  function updateRange(el){const min=Number(el.min),max=Number(el.max);el.style.setProperty('--fill',`${(Number(el.value)-min)/(max-min)*100}%`);}
  const ranges=[...document.querySelectorAll('input[type=range]')];ranges.forEach(el=>{updateRange(el);el.addEventListener('input',()=>updateRange(el));});
  function updateSoundUI(){
    const enabled=ambience.enabled,audible=enabled&&ambience.volume>0;
    $('sound').setAttribute('aria-pressed',String(enabled));
    const label=enabled?'关闭海浪与风声':'开启海浪与风声';$('sound').setAttribute('aria-label',label);$('sound').title=label;
    $('sound-waves').setAttribute('d',audible?'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m16 9 5 6m0-6-5 6');
    $('sound-volume').title=`环境音量 ${Math.round(ambience.volume*100)}%`;
  }
  $('sound-volume').value=Math.round(ambience.volume*100);updateRange($('sound-volume'));updateSoundUI();
  $('sound').addEventListener('click',async()=>{
    $('sound').disabled=true;
    try{await ambience.setEnabled(!ambience.enabled);toast(ambience.enabled?'海浪与风声已开启':'环境音已关闭');}
    catch{await ambience.setEnabled(false);toast('声音未能开启，请检查浏览器声音权限后重试');}
    finally{$('sound').disabled=false;updateSoundUI();}
  });
  $('sound-volume').addEventListener('input',()=>{void ambience.setVolume(Number($('sound-volume').value)/100).catch(()=>{});updateSoundUI();});
  function selectWeather(value){
    const p=weatherPreset(value);state.weather=value;hourTarget=p.hour;stormTarget=p.storm;windTarget=p.wind;wavesTarget=p.waves;seekingTime=true;
    $('cycle').checked=false;state.cycle=false;
    $('time').value=p.hour;$('wind').value=p.wind;$('waves').value=p.waves;
    $('wind-value').value=p.wind.toFixed(2);$('waves-value').value=p.waves.toFixed(2);ranges.forEach(updateRange);
    document.querySelectorAll('[data-weather]').forEach(b=>{const selected=b.dataset.weather===value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    $('weather-description').textContent=descriptions[value];$('weather-code').textContent={clear:'01',storm:'02',night:'03'}[value];
  }
  document.querySelectorAll('[data-weather]').forEach(b=>b.addEventListener('click',()=>selectWeather(b.dataset.weather)));
  $('time').addEventListener('input',e=>{hourTarget=Number(e.target.value);state.hour=hourTarget;seekingTime=false;state.cycle=false;$('cycle').checked=false;});
  $('wind').addEventListener('input',e=>{windTarget=Number(e.target.value);$('wind-value').value=windTarget.toFixed(2);});
  $('waves').addEventListener('input',e=>{wavesTarget=Number(e.target.value);$('waves-value').value=wavesTarget.toFixed(2);});
  $('cycle').addEventListener('change',e=>{state.cycle=e.target.checked;seekingTime=false;});
  $('quality').addEventListener('change',e=>{setQuality(e.target.value);toast(`已切换${e.target.selectedOptions[0].text}画质`);});
  function toggleTour(force){state.tour=force??!state.tour;controls.autoRotate=state.tour;$('tour').setAttribute('aria-pressed',String(state.tour));$('tour-label').textContent=state.tour?'停止漫游':'环岛漫游';}
  $('tour').addEventListener('click',()=>toggleTour());
  function togglePause(){state.paused=!state.paused;ambience.setPaused(state.paused);$('pause').textContent=state.paused?'▷':'Ⅱ';$('pause').setAttribute('aria-label',state.paused?'继续动画':'暂停动画');toast(state.paused?'时间已暂停，仍可自由探索':'时间继续流动');}
  $('pause').addEventListener('click',togglePause);
  $('reset').addEventListener('click',()=>{
    toggleTour(false);
    // Consume pending damping once, before restoring the authored camera.
    controls.enableDamping=false;controls.update();controls.enableDamping=true;
    controls.target.copy(focus);camera.position.copy(home).sub(focus).multiplyScalar(viewScale).add(focus);controls.update();toast('已回到最初的海岸');
  });
  $('fullscreen').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前窗口不支持全屏，请在浏览器中打开。');}
  });
  $('collapse').addEventListener('click',()=>{
    const hidden=!$('panel-content').hidden;$('panel-content').hidden=hidden;document.querySelector('.panel').classList.toggle('collapsed',hidden);
    $('collapse').textContent=hidden?'+':'−';$('collapse').setAttribute('aria-expanded',String(!hidden));$('collapse').setAttribute('aria-label',hidden?'展开环境控制':'收起环境控制');
  });
  function toggleUI(){const hidden=document.body.classList.toggle('ui-hidden');$('restore-ui').hidden=!hidden;}
  $('hide').addEventListener('click',toggleUI);$('restore-ui').addEventListener('click',toggleUI);
  $('capture').addEventListener('click',()=>{
    // Render immediately; preserveDrawingBuffer is unnecessary and would cost
    // performance on every ordinary frame. Captures contain the scene only.
    composer.render();renderer.domElement.toBlob(blob=>{
      if(!blob){toast('画面保存失败，请重试');return;}
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`pelagic-${state.weather}-${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('已保存这一刻的海');
    },'image/png');
  });
  window.addEventListener('keydown',e=>{
    if(['INPUT','SELECT','BUTTON'].includes(e.target.tagName))return;
    if(e.code==='Space'){e.preventDefault();togglePause();}if(e.key.toLowerCase()==='h')toggleUI();
    if(e.key==='1')selectWeather('clear');if(e.key==='2')selectWeather('storm');if(e.key==='3')selectWeather('night');
  });

  const palette={
    blue:new THREE.Color('#4e92bb'),sunsetBlue:new THREE.Color('#65718e'),nightBlue:new THREE.Color('#061025'),
    horizon:new THREE.Color('#c2d8d9'),sunsetHorizon:new THREE.Color('#edb48b'),nightHorizon:new THREE.Color('#273e58'),
    stormTop:new THREE.Color('#192b3d'),stormHorizon:new THREE.Color('#4b5c68'),
    daySun:new THREE.Color('#fff4dd'),setSun:new THREE.Color('#ffc58d'),moon:new THREE.Color('#6c90bf')
  };
  function updateLighting(){
    const angle=(state.hour-6)/24*Math.PI*2,elevation=Math.sin(angle);
    const day=smoothstep(-.16,.12,elevation),sunset=1-smoothstep(.05,.55,elevation);
    const sun=uniforms.uSun.value;
    sun.set(Math.cos(angle)*.83,Math.max(.025,Math.abs(elevation)),Math.cos(angle)*.56);
    if(elevation<0){sun.x*=-1;sun.z*=-1;}sun.normalize();
    uniforms.uDay.value=day;uniforms.uSunset.value=sunset;
    uniforms.uZenith.value.copy(palette.blue).lerp(palette.sunsetBlue,sunset).lerp(palette.nightBlue,1-day).lerp(palette.stormTop,state.storm*.92);
    uniforms.uHorizon.value.copy(palette.horizon).lerp(palette.sunsetHorizon,sunset*.85).lerp(palette.nightHorizon,1-day).lerp(palette.stormHorizon,state.storm*.85);
    uniforms.uSunColor.value.copy(palette.daySun).lerp(palette.setSun,sunset*.85).lerp(palette.moon,1-day);
    if(day<.5)uniforms.uSunColor.value.multiplyScalar(.22);
    sunlight.position.copy(sun).multiplyScalar(100);sunlight.color.copy(palette.daySun).lerp(palette.setSun,sunset*.6).lerp(palette.moon,1-day);
    sunlight.intensity=(.65+day*3.3)*(1-state.storm*.9);
    hemi.intensity=(.44+day*1.55)*(1-state.storm*.45);hemi.color.copy(palette.horizon).lerp(palette.moon,1-day);
    scene.fog.color.copy(uniforms.uHorizon.value);scene.fog.density=.002+state.storm*.006;
    const night=1-day;island.lamp.intensity=8+night*55;island.lampMat.emissiveIntensity=2+night*4;
    island.beamMat.uniforms.uNight.value=night;island.beamGroup.visible=night>.02;island.spot.intensity=night*550;
    bloom.strength=.19+night*.18;
  }
  const timer=new THREE.Timer();timer.connect(document);
  let elapsed=0,frames=0,fpsElapsed=0,firstFrame=true;
  // A read-only inspection hook supports reproducible smoke tests and makes
  // the delivered demo easier to debug without adding a development GUI.
  window.__PELAGIC__={get state(){return {...state};},get diagnostics(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,programs:renderer.info.programs?.length,camera:camera.position.toArray(),time:elapsed,boat:boatSystem.inspect(),audio:ambience.inspect()};}};

  renderer.setAnimationLoop(()=>{
    timer.update();const rawDelta=timer.getDelta(),dt=Math.min(rawDelta,.05);
    if(!state.paused){
      elapsed+=dt;
      state.storm=damp(state.storm,stormTarget,1.1,dt);state.wind=damp(state.wind,windTarget,1.2,dt);state.waves=damp(state.waves,wavesTarget,1.1,dt);
      if(seekingTime){state.hour=damp(state.hour,hourTarget,2.,dt);if(Math.abs(state.hour-hourTarget)<.005){state.hour=hourTarget;seekingTime=false;}}
      if(state.cycle){state.hour=(state.hour+dt*.025)%24;hourTarget=state.hour;$('time').value=state.hour;updateRange($('time'));}
      uniforms.uTime.value=elapsed;uniforms.uStorm.value=state.storm;uniforms.uWind.value=state.wind;uniforms.uWaves.value=state.waves;
      updateLighting();updateBirds(elapsed);island.beamGroup.rotation.y=elapsed*.32;
      rain.visible=state.storm>.01;
      if(state.storm>.7){nextLightning-=dt;if(nextLightning<=0){lightning=1;nextLightning=5+seeded()*11;bolt.position.x=(seeded()-.5)*90;}}
      lightning=Math.max(0,lightning-dt*6);lightningLight.intensity=lightning*9*state.storm;boltMat.opacity=lightning*state.storm;
    }
    const hours=Math.floor(state.hour),minutes=Math.min(59,Math.floor((state.hour-hours)*60));
    $('time-value').value=`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
    // OrbitControls remains active while the simulation is paused.
    const autoRotate=controls.autoRotate;controls.autoRotate=autoRotate&&!state.paused;
    if(!boatSystem.dragging)controls.update(dt);controls.autoRotate=autoRotate;
    // Keep the camera above the water even after a large pan.
    if(camera.position.y<1.4)camera.position.y=1.4;
    boatSystem.update(state.paused?0:dt,elapsed);boatSystem.updateLabel();
    ambience.updateEnvironment({wind:state.wind,waves:state.waves,storm:state.storm,distance:Math.max(0,Math.hypot(camera.position.x,camera.position.z)-27)});
    renderer.info.reset();composer.render();
    frames++;fpsElapsed+=rawDelta;
    if(fpsElapsed>=.8){$('fps').textContent=`${Math.round(frames/fpsElapsed)} FPS`;frames=0;fpsElapsed=0;}
    if(firstFrame){firstFrame=false;$('loading').classList.add('loaded');setTimeout(()=>$('loading').remove(),1100);}
  });
}
