import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight, createRandom, TAU, clamp } from './world.js';
import { noiseGLSL, windGLSL } from './shaders.js';

const random = createRandom(82713);
const rand = (a, b) => a + (b - a) * random();
const color = new THREE.Color();

function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function merge(parts) {
  const result = mergeGeometries(parts, false); parts.forEach(g => g.dispose()); return result;
}
function segment(a, b, r1, r2, sides = 7) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r2, r1, d.length(), sides);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((a.x+b.x)/2, (a.y+b.y)/2, (a.z+b.z)/2);
}

export function createIsland(scene, uniforms) {
  const land = new THREE.Group(); land.name = 'procedural-island'; scene.add(land);
  const groundGeo = new THREE.PlaneGeometry(180, 180, 300, 300).rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = terrainHeight(x, z);
    pos.setY(i, h);
    const grass = clamp((h - 2.05) * 1.5 + Math.sin(x * .7) * Math.cos(z * .8) * .3, 0, 1);
    color.set('#ddc59a').lerp(new THREE.Color('#56713a'), grass);
    if (h < .5) color.lerp(new THREE.Color('#a5966b'), .4);
    color.multiplyScalar(.94 + random() * .12);
    colors.push(color.r, color.g, color.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94 });
  groundMat.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vLand;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLand=position;');
    shader.fragmentShader = `varying vec3 vLand;\n${noiseGLSL}\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float grain=noise2(vLand.xz*35.); float ridges=sin(vLand.x*6.+noise2(vLand.xz*.7)*5.)*.5+.5;
      diffuseColor.rgb*=.88+grain*.16+ridges*.06;
    `);
  };
  mesh(groundGeo, groundMat, land);

  // Rocks have continuous deterministic distortion, rather than random cracks
  // at duplicated vertices. A merged mesh keeps the island's draw count low.
  const rockParts = [];
  function rock(x, z, scale) {
    const geo = new THREE.IcosahedronGeometry(1, 4), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x0=p.getX(i), y0=p.getY(i), z0=p.getZ(i);
      const n=1+.08*Math.sin(x0*9+y0*8)*Math.cos(z0*8-x0*3)+.045*Math.sin(y0*14+z0*7);
      p.setXYZ(i,x0*n,y0*n,z0*n);
    }
    geo.scale(scale * rand(.8,1.3),scale * rand(.65,1.2),scale * rand(.8,1.2));
    geo.rotateY(rand(0,TAU)); geo.rotateZ(rand(-.3,.3));
    geo.translate(x,terrainHeight(x,z)+scale*.18,z);
    geo.computeVertexNormals();
    const c=[]; for(let i=0;i<p.count;i++){const v=.75+Math.sin(p.getY(i)*2+p.getX(i))*.09; c.push(v*.36,v*.38,v*.34);}
    geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3)); rockParts.push(geo);
  }
  for(let i=0;i<65;i++) {
    const a=rand(0,TAU), r=rand(22,31); rock(Math.cos(a)*r,Math.sin(a)*r*.85,rand(.4,1.65));
  }
  for(let i=0;i<20;i++) rock(rand(9,20),rand(-15,-4),rand(.5,2.2));
  for(let i=0;i<15;i++) rock(rand(-16,-5),rand(-9,3),rand(.7,2.1));
  mesh(merge(rockParts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87}),land);

  const trunkParts=[], leafParts=[], coconutParts=[];
  function palm(x,z,height,lean,rotation) {
    const y=terrainHeight(x,z)-.1, bend=new THREE.Vector3(Math.cos(rotation)*lean,0,Math.sin(rotation)*lean);
    const curve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(x,y,z),new THREE.Vector3(x+bend.x*.1,y+height*.35,z+bend.z*.1),
      new THREE.Vector3(x+bend.x*.5,y+height*.72,z+bend.z*.5),new THREE.Vector3(x+bend.x,y+height,z+bend.z)
    ]);
    const trunk=new THREE.TubeGeometry(curve,20,.22,7,false);
    const p=trunk.attributes.position, cols=[];
    for(let i=0;i<p.count;i++) {
      const h=(p.getY(i)-y)/height, taper=1-h*.55;
      const c=curve.getPointAt(clamp(h,0,1));
      p.setX(i,c.x+(p.getX(i)-c.x)*taper);p.setZ(i,c.z+(p.getZ(i)-c.z)*taper);
      const ring=.7+.3*Math.pow(Math.sin(h*height*13.)*.5+.5,5.);
      cols.push(.32*ring,.235*ring,.13*ring);
    }
    trunk.setAttribute('color',new THREE.Float32BufferAttribute(cols,3)); trunk.computeVertexNormals();trunkParts.push(trunk);
    const crown=curve.getPoint(1);
    // Each frond is a curved rachis with 25 pairs of long, tapered leaflets.
    // The open silhouette lets sunlight pass through individual leaves.
    const verts=[], leafColors=[];
    const pushTri=(a,b,c,tone)=>{ for(const v of [a,b,c]){verts.push(v.x,v.y,v.z);leafColors.push(.13*tone,.30*tone,.045*tone);} };
    for(let f=0;f<10;f++) {
      const angle=rotation+f*TAU/10+rand(-.17,.17), len=rand(3.2,4.8)*(height/8)**.4;
      const dir=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
      const side=new THREE.Vector3(-dir.z,0,dir.x);
      const droop=f<3 ? .65 : 1.7;
      const center=t=>crown.clone().addScaledVector(dir,len*t).add(new THREE.Vector3(0,Math.sin(t*Math.PI)*1.2-t*t*droop,0));
      for(let j=1;j<25;j++) {
        const t=j/25, stem=center(t), next=center(t+.04), width=Math.sin(Math.PI*t)**.55*.84*(len/4);
        const tone=rand(.75,1.35);
        pushTri(stem.clone().addScaledVector(side,-.025),next,stem.clone().addScaledVector(side,.025),tone);
        for(const s of [-1,1]){
          const base=stem.clone(), tip=stem.clone().addScaledVector(side,width*s).addScaledVector(dir,.35).add(new THREE.Vector3(0,-.25*t-.10,0));
          const wide=base.clone().lerp(tip,.35).addScaledVector(dir,-.09);
          const wide2=base.clone().lerp(tip,.38).addScaledVector(dir,.075);
          pushTri(base,wide,tip,tone);pushTri(base,tip,wide2,tone*.93);
        }
      }
    }
    const leaves=new THREE.BufferGeometry();leaves.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));leaves.setAttribute('color',new THREE.Float32BufferAttribute(leafColors,3));leaves.computeVertexNormals();leafParts.push(leaves);
    for(let i=0;i<3;i++){const g=new THREE.SphereGeometry(.18,6,5);g.translate(crown.x+rand(-.3,.3),crown.y-.15,crown.z+rand(-.3,.3));coconutParts.push(g);}
  }
  const palmSites=[[-17,9],[-14,13],[-12,8],[-20,2],[-18,-3],[-10,15],[-6,12],[0,16],[8,14],[16,5],[20,0],[-22,-8],[-16,-12],[-9,-15],[0,-13],[4,-8]];
  for(const [x,z] of palmSites)palm(x,z,rand(6.8,10),rand(.4,2.3),rand(0,TAU));
  for(let i=0;i<20;i++) { const x=rand(-17,7),z=rand(-12,8);if(terrainHeight(x,z)>2.8)palm(x,z,rand(5,8),rand(.2,1.6),rand(0,TAU)); }
  const windMaterial=(mat)=>{
    mat.onBeforeCompile=shader=>{
      shader.uniforms.uTime=uniforms.uTime;shader.uniforms.uWind=uniforms.uWind;
      shader.vertexShader=windGLSL+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed=windPosition(position);');
    }; return mat;
  };
  const leafMat=windMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.75,side:THREE.DoubleSide}));
  const depthMat=windMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide}));
  const leaves=mesh(merge(leafParts),leafMat,land);leaves.customDepthMaterial=depthMat;leaves.frustumCulled=false;
  mesh(merge(trunkParts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),land);
  mesh(merge(coconutParts),new THREE.MeshStandardMaterial({color:'#5b4728',roughness:1}),land);

  // Understory foliage uses instancing, sharing one geometry and one material.
  const bush=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:'#527432',roughness:.9}),450);
  const dummy=new THREE.Object3D();let planted=0;
  for(let i=0;i<2000 && planted<450;i++){
    const x=rand(-23,23),z=rand(-20,20),h=terrainHeight(x,z);
    if(h<2.8 || (x>9 && z<0))continue;
    dummy.position.set(x,h+.25,z);dummy.scale.set(rand(.25,1.1),rand(.25,.8),rand(.25,1));dummy.rotation.set(rand(-.2,.2),rand(0,TAU),0);dummy.updateMatrix();bush.setMatrixAt(planted,dummy.matrix);
    bush.setColorAt(planted,new THREE.Color().setHSL(rand(.2,.27),rand(.35,.6),rand(.22,.4)));planted++;
  }
  bush.count=planted;bush.castShadow=true;bush.receiveShadow=true;land.add(bush);

  const lighthouse=new THREE.Group();lighthouse.name='lighthouse';
  lighthouse.position.set(14,terrainHeight(14,-8),-8);land.add(lighthouse);
  const white=new THREE.MeshStandardMaterial({color:'#f2e8cf',roughness:.7});
  const red=new THREE.MeshStandardMaterial({color:'#a94b34',roughness:.63});
  const metal=new THREE.MeshStandardMaterial({color:'#263a39',metalness:.6,roughness:.38});
  mesh(new THREE.CylinderGeometry(2.1,2.5,.7,32),white,lighthouse,0,.2,0);
  const heights=[0,3.3,5.0,8.5,10];
  for(let i=0;i<4;i++){
    const bottom=heights[i],top=heights[i+1];
    mesh(new THREE.CylinderGeometry(1.4-top*.055,1.4-bottom*.055,top-bottom,32),i===1||i===3?red:white,lighthouse,0,(top+bottom)/2+.55,0);
  }
  mesh(new THREE.CylinderGeometry(1.5,1.5,.26,32),white,lighthouse,0,10.7,0);
  mesh(new THREE.CylinderGeometry(.94,.94,1.7,12),new THREE.MeshPhysicalMaterial({color:'#a3d7d0',transparent:true,opacity:.21,roughness:.15,metalness:.1,depthWrite:false}),lighthouse,0,11.7,0);
  for(let i=0;i<8;i++){
    const a=i*TAU/8;
    mesh(new THREE.CylinderGeometry(.035,.035,1.9,5),metal,lighthouse,Math.cos(a)*.95,11.7,Math.sin(a)*.95);
    mesh(new THREE.CylinderGeometry(.025,.025,.85,5),metal,lighthouse,Math.cos(a)*1.4,11.2,Math.sin(a)*1.4);
  }
  const rail=mesh(new THREE.TorusGeometry(1.4,.035,6,40),metal,lighthouse,0,11.6,0);rail.rotation.x=Math.PI/2;
  mesh(new THREE.ConeGeometry(1.4,.9,12),red,lighthouse,0,13.05,0);
  mesh(new THREE.SphereGeometry(.12,8,8),metal,lighthouse,0,13.6,0);
  const lampMat=new THREE.MeshStandardMaterial({color:'#fff3bd',emissive:'#ffd482',emissiveIntensity:3});
  mesh(new THREE.CylinderGeometry(.24,.24,.75,12),lampMat,lighthouse,0,11.65,0);
  const lamp=new THREE.PointLight('#ffd69b',35,22,2);lamp.position.set(0,11.7,0);lighthouse.add(lamp);
  const door=mesh(new THREE.BoxGeometry(.7,1.4,.12),metal,lighthouse,0,1.1,1.32);
  const windowMat=new THREE.MeshStandardMaterial({color:'#203c40',roughness:.18});
  for(let y=3;y<10;y+=2.7)mesh(new THREE.BoxGeometry(.35,.65,.13),windowMat,lighthouse,0,y,1.4-y*.055);
  // Twin rotating beams are inexpensive transparent volumes; spotlight lights
  // the ground while the volume makes the sweeping beam visible at night.
  const beamGroup=new THREE.Group();beamGroup.position.y=11.7;lighthouse.add(beamGroup);
  const beamMat=new THREE.ShaderMaterial({
    uniforms:{uNight:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float uNight;varying vec2 vUv; void main(){float fade=pow(vUv.y,1.5);gl_FragColor=vec4(.8,.74,.48,fade*.09*uNight);}'
  });
  for(const sign of [-1,1]){
    const b=mesh(new THREE.ConeGeometry(3.2,45,32,1,true),beamMat,beamGroup,sign*22.5,0,0);b.rotation.z=sign*Math.PI/2;b.castShadow=false;b.receiveShadow=false;
  }
  const spot=new THREE.SpotLight('#ffe4b1',0,85,.14,.65,1.1);spot.position.set(0,0,0);spot.target.position.set(35,-8,0);beamGroup.add(spot,spot.target);

  // A timber jetty leads from the sandy shore into the lagoon.
  const wood=new THREE.MeshStandardMaterial({color:'#756049',roughness:.9});
  const planks=[];
  for(let i=0;i<34;i++){
    const g=new THREE.BoxGeometry(2.6,.17,.35);g.translate(3,1.1,21+i*.4);planks.push(g);
  }
  for(let i=0;i<7;i++) for(const x of [1.9,4.1]){
    const g=new THREE.CylinderGeometry(.12,.14,3.2,7);g.translate(x,-.1,21+i*2.1);planks.push(g);
  }
  mesh(merge(planks),wood,land);
  const cabin=new THREE.Group();cabin.position.set(-2,terrainHeight(-2,-2),-2);land.add(cabin);
  mesh(new THREE.BoxGeometry(3,2.3,2.7),new THREE.MeshStandardMaterial({color:'#c7ab76',roughness:1}),cabin,0,1.15,0);
  const roof=mesh(new THREE.ConeGeometry(2.6,1.4,4),new THREE.MeshStandardMaterial({color:'#66563d',roughness:1}),cabin,0,3,0);roof.rotation.y=Math.PI/4;

  return {land,lighthouse,lamp,lampMat,beamGroup,beamMat,spot};
}

export function createBirds(scene) {
  const birds=[];
  const mat=new THREE.MeshBasicMaterial({color:'#302e2e',side:THREE.DoubleSide});
  for(let i=0;i<9;i++) {
    const g=new THREE.Group();const wings=[];
    for(const sign of [-1,1]){
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,sign*.85,.12,.1,sign*.35,0,.27],3));geo.computeVertexNormals();
      const wing=new THREE.Mesh(geo,mat);g.add(wing);wings.push(wing);
    }
    scene.add(g);birds.push({g,wings,phase:rand(0,TAU),r:rand(29,45),h:rand(17,27)});
  }
  return t=>{for(const b of birds){const a=t*.055+b.phase;b.g.position.set(Math.cos(a)*b.r,b.h+Math.sin(t*.35+b.phase),Math.sin(a)*b.r);b.g.rotation.y=-a;for(let j=0;j<2;j++)b.wings[j].rotation.z=Math.sin(t*3+b.phase)*.25*(j?1:-1);}};
}
