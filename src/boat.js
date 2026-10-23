import * as THREE from 'three';
import { clamp, damp, terrainHeight } from './world.js';
import { sampleOcean, constrainBoatMove, WakeField } from './ocean-physics.js';

function createBoatModel(){
  const boat=new THREE.Group();boat.name='interactive-sailboat';
  const cream=new THREE.MeshStandardMaterial({color:'#eee8d4',roughness:.43,metalness:.08});
  const navy=new THREE.MeshStandardMaterial({color:'#254c56',roughness:.48});
  const timber=new THREE.MeshStandardMaterial({color:'#a87d48',roughness:.8});
  const dark=new THREE.MeshStandardMaterial({color:'#46443c',roughness:.48,metalness:.5});
  const cloth=new THREE.MeshStandardMaterial({color:'#f8e4b6',roughness:.93,side:THREE.DoubleSide});
  const coral=new THREE.MeshStandardMaterial({color:'#c56d4d',roughness:.9,side:THREE.DoubleSide});
  function add(geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;boat.add(m);return m;}
  // Longitudinal hull sections, smoothly tapering to a pointed bow (+Z).
  const vertices=[],indices=[];
  const sections=32,sides=12;
  for(let j=0;j<=sections;j++){
    const t=j/sections,z=-2.75+t*5.8,width=Math.pow(Math.sin(Math.PI*t),.56)*1.08*(1-t*.2);
    for(let i=0;i<=sides;i++){
      const a=i/sides*Math.PI;
      vertices.push(Math.cos(a)*width,.48-Math.sin(a)*(.64+.1*Math.sin(t*Math.PI)),z);
    }
  }
  for(let j=0;j<sections;j++)for(let i=0;i<sides;i++){
    const a=j*(sides+1)+i,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);
  }
  const hullGeo=new THREE.BufferGeometry();hullGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));hullGeo.setIndex(indices);hullGeo.computeVertexNormals();
  const hull=add(hullGeo,cream);hull.material.side=THREE.DoubleSide;
  const outline=new THREE.Shape();
  outline.moveTo(0,3.05);outline.bezierCurveTo(-1.2,1.7,-1.4,-1.8,0,-2.75);outline.bezierCurveTo(1.4,-1.8,1.2,1.7,0,3.05);
  const deck=new THREE.ShapeGeometry(outline,32);deck.rotateX(Math.PI/2);deck.translate(0,.49,0);
  // Shape's second coordinate maps to Z; its winding is corrected for +Y.
  add(deck,timber).material.side=THREE.DoubleSide;
  const waterline=[];
  for(let j=0;j<=sections;j++){
    const t=j/sections,width=Math.pow(Math.sin(Math.PI*t),.56)*1.08*(1-t*.2);
    waterline.push(new THREE.Vector3(-width,.5,-2.75+t*5.8));
  }
  for(let j=sections;j>=0;j--){const t=j/sections,width=Math.pow(Math.sin(Math.PI*t),.56)*1.08*(1-t*.2);waterline.push(new THREE.Vector3(width,.5,-2.75+t*5.8));}
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(waterline,true),100,.065,5,true),navy);
  for(const x of [-.65,-.32,0,.32,.65])add(new THREE.BoxGeometry(.018,.01,3.9),dark,x,.505,0);
  add(new THREE.BoxGeometry(1.15,.48,1.35),cream,0,.73,-.65);
  add(new THREE.BoxGeometry(.82,.04,.42),navy,0,1.0,-.65);
  add(new THREE.CylinderGeometry(.045,.065,5,8),dark,0,2.95,.4);
  const boom=add(new THREE.CylinderGeometry(.035,.035,2.5,6),dark,.66,1.27,-.57);boom.rotation.z=Math.PI/2;boom.rotation.y=.3;
  // Subdivided billowing sail, made entirely from vertices (no cloth image).
  function sail(a,b,c,material){
    const pos=[],idx=[],steps=12;
    const row=[];
    for(let j=0;j<=steps;j++){
      row[j]=[];
      for(let i=0;i<=steps-j;i++){
        const u=i/steps,v=j/steps,w=1-u-v,p=a.clone().multiplyScalar(w).addScaledVector(b,u).addScaledVector(c,v);
        p.x+=Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*.42;
        row[j][i]=pos.length/3;pos.push(p.x,p.y,p.z);
      }
    }
    for(let j=0;j<steps;j++)for(let i=0;i<steps-j;i++){
      idx.push(row[j][i],row[j][i+1],row[j+1][i]);
      if(i<steps-j-1)idx.push(row[j][i+1],row[j+1][i+1],row[j+1][i]);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return add(g,material);
  }
  const mainSail=sail(new THREE.Vector3(.05,1.4,.35),new THREE.Vector3(.05,5.3,.35),new THREE.Vector3(1.35,1.4,-1.95),cloth);
  sail(new THREE.Vector3(-.03,1.1,.65),new THREE.Vector3(-.03,4.7,.45),new THREE.Vector3(-.9,.75,2.75),coral);
  const ropeGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,5.35,.4),new THREE.Vector3(0,.55,2.8),new THREE.Vector3(0,5.35,.4),new THREE.Vector3(0,.55,-2.5)]);
  boat.add(new THREE.LineSegments(ropeGeo,new THREE.LineBasicMaterial({color:'#d4c6a4'})));
  add(new THREE.TorusGeometry(.22,.055,6,20),coral,0,.85,-1.85).rotation.x=Math.PI/2;
  const ring=add(new THREE.TorusGeometry(3.35,.027,5,80),new THREE.MeshBasicMaterial({color:'#eedcb6',transparent:true,opacity:.45,depthWrite:false}),0,.03,0);
  ring.rotation.x=Math.PI/2;ring.visible=false;ring.castShadow=false;
  const proxy=new THREE.Mesh(new THREE.BoxGeometry(2.65,5.5,6.3),new THREE.MeshBasicMaterial());proxy.position.y=2.4;proxy.visible=false;boat.add(proxy);
  return {boat,proxy,hull,ring,mainSail};
}

export function createInteractiveBoat({scene,camera,canvas,controls,uniforms,state,onDragStart,toast,linearFloat=true}){
  const model=createBoatModel(),boat=model.boat;scene.add(boat);boat.position.set(24,0,30);
  const wake=new WakeField();
  const texture=new THREE.DataTexture(wake.data,wake.size,wake.size,THREE.RGBAFormat,THREE.FloatType);
  texture.minFilter=texture.magFilter=linearFloat?THREE.LinearFilter:THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  uniforms.uWake={value:texture};uniforms.uWakeExtent={value:wake.extent};
  let dragging=false,activePointer=null,hovered=false,heading=.9,vx=0,vz=0,lastX=boat.position.x,lastZ=boat.position.z,speed=.7,wakeDistance=0;
  const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3(),offset=new THREE.Vector3();
  const label=document.createElement('div');label.id='boat-label';label.innerHTML='<i></i><span>拖动小船</span>';document.body.appendChild(label);
  const projected=new THREE.Vector3(),samplePos=new THREE.Vector3(),quaternion=new THREE.Quaternion(),rotation=new THREE.Euler(0,0,0,'YXZ');
  function setRay(e){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
  function occluded(){
    for(let i=1;i<25;i++){const t=i/25,x=camera.position.x+(boat.position.x-camera.position.x)*t,z=camera.position.z+(boat.position.z-camera.position.z)*t,y=camera.position.y+(boat.position.y+.8-camera.position.y)*t;if(terrainHeight(x,z)>y)return true;}
    return false;
  }
  function picked(e){setRay(e);boat.updateMatrixWorld(true);return !occluded()&&raycaster.intersectObject(model.proxy,false).length>0;}
  function setHover(value){hovered=value;model.ring.visible=value||dragging;canvas.style.cursor=dragging?'grabbing':value?'grab':'';label.classList.toggle('active',value||dragging);}
  function end(e){
    if(!dragging || (e?.pointerId!==undefined&&e.pointerId!==activePointer))return;
    const id=activePointer;dragging=false;activePointer=null;controls.enabled=true;
    if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    model.ring.visible=false;label.querySelector('span').textContent='拖动小船';setHover(false);
    e?.stopImmediatePropagation?.();
  }
  function down(e){
    if(dragging){e.stopImmediatePropagation();return;}
    if(e.button!==0||!picked(e))return;
    plane.constant=0;if(!raycaster.ray.intersectPlane(plane,hit))return;
    onDragStart();
    // Clear pending orbit damping without moving the camera when grabbing.
    const saved=camera.position.clone(),target=controls.target.clone();controls.enableDamping=false;controls.update();controls.enableDamping=true;camera.position.copy(saved);controls.target.copy(target);camera.lookAt(target);
    dragging=true;activePointer=e.pointerId;controls.enabled=false;vx=0;vz=0;
    offset.set(boat.position.x-hit.x,0,boat.position.z-hit.z);canvas.setPointerCapture(e.pointerId);
    label.querySelector('span').textContent='松开继续漂航';setHover(true);e.preventDefault();e.stopImmediatePropagation();
  }
  function move(e){
    if(!dragging){if(e.buttons===0)setHover(picked(e));return;}
    if(e.pointerId!==activePointer)return;
    setRay(e);
    if(raycaster.ray.intersectPlane(plane,hit)){
      const p=constrainBoatMove(boat.position,{x:hit.x+offset.x,z:hit.z+offset.z});
      const dx=p.x-boat.position.x,dz=p.z-boat.position.z;
      if(Math.hypot(dx,dz)>.005){heading=Math.atan2(dx,dz);boat.position.x=p.x;boat.position.z=p.z;}
    }
    e.preventDefault();e.stopImmediatePropagation();
  }
  function leave(){if(!dragging)setHover(false);}
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,end,true);
  canvas.addEventListener('pointerleave',leave);window.addEventListener('blur',end);
  window.addEventListener('keydown',e=>{if(e.key==='Escape')end();});

  function heightAt(x,z,t){return sampleOcean(x,z,t,state.waves,state.wind,camera.position).height+wake.sample(x,z);}
  function update(dt,t){
    if(dt>0){
      if(!dragging){
        const r=Math.hypot(boat.position.x,boat.position.z),radial=(42-r)*.055;
        const surface=sampleOcean(boat.position.x,boat.position.z,t,state.waves,state.wind,camera.position),cruise=.65+state.wind*.12;
        vx=damp(vx,boat.position.z/r*cruise+boat.position.x/r*radial-surface.sx*.17,1.5,dt);
        vz=damp(vz,-boat.position.x/r*cruise+boat.position.z/r*radial-surface.sz*.17,1.5,dt);
        const p=constrainBoatMove(boat.position,{x:boat.position.x+vx*dt,z:boat.position.z+vz*dt});boat.position.x=p.x;boat.position.z=p.z;
        if(Math.hypot(vx,vz)>.04){const wanted=Math.atan2(vx,vz);heading+=Math.atan2(Math.sin(wanted-heading),Math.cos(wanted-heading))*(1-Math.exp(-dt*1.4));}
      }
      const dx=boat.position.x-lastX,dz=boat.position.z-lastZ,distance=Math.hypot(dx,dz);speed=damp(speed,Math.min(18,distance/Math.max(dt,.001)),3,dt);
      if(distance>.0005){
        // Stamp all of the swept path, rather than only the newest position.
        const samples=Math.min(100,Math.max(1,Math.ceil(distance/.55))),ux=dx/distance,uz=dz/distance;
        wakeDistance+=distance;
        for(let i=1;i<=samples;i++){
          const x=lastX+dx*i/samples,z=lastZ+dz*i/samples,strength=(.018+Math.min(speed,8)*.012)*Math.min(distance/samples/.35,1);
          const sternX=x-ux*2.55,sternZ=z-uz*2.55;
          wake.disturb(sternX,sternZ,-strength,1.2,.08+Math.min(speed,7)*.025);
          // Paired bow waves open into a V as the wave equation evolves.
          for(const side of [-1,1])wake.disturb(x+ux*1.6-uz*side*.9,z+uz*1.6+ux*side*.9,strength*.6,.85,.04);
        }
      }
      lastX=boat.position.x;lastZ=boat.position.z;wake.step(dt);wake.pack();texture.needsUpdate=true;
      const sin=Math.sin(heading),cos=Math.cos(heading),x=boat.position.x,z=boat.position.z;
      const bow=heightAt(x+sin*2.1,z+cos*2.1,t),stern=heightAt(x-sin*2.1,z-cos*2.1,t);
      const port=heightAt(x-cos*.8,z+sin*.8,t),starboard=heightAt(x+cos*.8,z-sin*.8,t);
      const water=(bow+stern+port+starboard)/4;
      boat.position.y=damp(boat.position.y,water+.02,5,dt);
      rotation.set(clamp(-Math.atan2(bow-stern,4.2),-.3,.3),heading,clamp(Math.atan2(starboard-port,1.6),-.28,.28));
      quaternion.setFromEuler(rotation);boat.quaternion.slerp(quaternion,1-Math.exp(-dt*5));
      model.mainSail.scale.x=1+Math.sin(t*2.4)*.035*state.wind;
    }else if(dragging){boat.position.y=heightAt(boat.position.x,boat.position.z,t)+.02;lastX=boat.position.x;lastZ=boat.position.z;}
    boat.updateMatrixWorld(true);
  }
  function updateLabel(){
    samplePos.copy(boat.position);samplePos.y+=5.8;projected.copy(samplePos).project(camera);
    label.hidden=projected.z<0||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1||occluded()||document.body.classList.contains('ui-hidden');
    label.style.left=`${(projected.x+1)*canvas.clientWidth/2}px`;label.style.top=`${(1-projected.y)*canvas.clientHeight/2}px`;
  }
  function inspect(){
    const screen=boat.position.clone().add(new THREE.Vector3(0,1.3,0)).project(camera);
    return {position:boat.position.toArray(),rotation:[boat.rotation.x,boat.rotation.y,boat.rotation.z],dragging,hovered,speed,wakeDistance,wakeEnergy:wake.energy,screen:[(screen.x+1)*canvas.clientWidth/2,(1-screen.y)*canvas.clientHeight/2],controlsEnabled:controls.enabled};
  }
  return {update,updateLabel,inspect,get dragging(){return dragging;},end};
}
