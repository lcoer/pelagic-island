import { WAVE_COMPONENTS } from './ocean-physics.js';

const glslFloat = value => Number.isInteger(value) ? `${value}.0` : String(value);

// Shared procedural atmosphere: both the ocean's distant reflections and sky
// use the same radiance function. All inputs are in linear working space.
export const noiseGLSL = /* glsl */ `
float hash21(vec2 p) { p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
float noise2(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.),f.x),f.y); }
float fbm(vec2 p) { float f=0.; float a=.5; for(int i=0;i<5;i++){ f+=a*noise2(p); p=mat2(.8,.6,-.6,.8)*p*2.03+13.7; a*=.5; } return f; }
`;

export const atmosphereGLSL = /* glsl */ `
uniform float uTime, uStorm, uDay, uSunset;
uniform vec3 uSun, uSunColor, uZenith, uHorizon;
${noiseGLSL}
vec3 atmosphere(vec3 rd, bool clouds) {
  float h=max(rd.y,0.);
  vec3 col=mix(uHorizon,uZenith,pow(h,.42));
  float s=max(dot(rd,uSun),0.);
  col+=uSunColor*(pow(s,18.)*.28+pow(s,180.)*.55)*(1.-uStorm*.95);
  float disk=smoothstep(cos(.014),cos(.010),s);
  col+=disk*uSunColor*8.*(1.-uStorm*.98);
  if(clouds && rd.y>.015){
    vec2 cp=rd.xz/(rd.y+.12)*2.1+vec2(uTime*.012,uTime*.004);
    float base=fbm(cp);
    float density=smoothstep(.53-uStorm*.24,.75-uStorm*.19,base);
    density*=smoothstep(.015,.13,rd.y);
    float lit=clamp((base-fbm(cp+uSun.xz*.25))*5.+.5,0.,1.);
    vec3 shade=mix(vec3(.11,.14,.18),vec3(.5,.49,.48),uDay);
    vec3 edge=mix(vec3(.18,.25,.36),mix(vec3(1.05,.72,.49),vec3(1.1),1.-uSunset),uDay);
    vec3 cloud=mix(shade,edge,lit)*(1.-uStorm*.6);
    col=mix(col,cloud,density*(.84+uStorm*.16));
    col+=edge*pow(max(0.,1.-abs(base-(.54-uStorm*.24))*20.),4.)*pow(s,10.)*.14*(1.-uStorm);
  }
  return col;
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vDirection;
void main(){ vDirection=position; vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.); gl_Position=p.xyww; }
`;
export const skyFragment = /* glsl */ `
varying vec3 vDirection;
${atmosphereGLSL}
void main(){
  vec3 d=normalize(vDirection); vec3 col=atmosphere(d,true);
  vec2 starUV=vec2(atan(d.z,d.x)*210.,asin(d.y)*210.);
  vec2 cell=floor(starUV); float star=hash21(cell);
  float sparkle=pow(max(0.,1.-length(fract(starUV)-.5)*2.),14.);
  col+=vec3(.65,.78,1.)*sparkle*step(.985,star)*(1.-uDay)*(1.-uStorm)*smoothstep(0.,.15,d.y)*(1.8+.5*sin(uTime*1.5+star*90.));
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const terrainGLSL = /* glsl */ `
float islandRadius(float a){return 27.+2.3*sin(a*3.+.5)+1.4*sin(a*5.-1.2)+.8*cos(a*7.);}
float terrainHeight(vec2 p){
 float d=length(p*vec2(1.,1.12)); float shore=islandRadius(atan(p.y*1.12,p.x))-d;
 float base=2.8*tanh(shore*.14);
 float hill=5.5*exp(-((p.x+7.)*(p.x+7.)/95.+(p.y+4.)*(p.y+4.)/110.));
 float shelf=2.5*exp(-((p.x-14.)*(p.x-14.)/40.+(p.y+8.)*(p.y+8.)/48.));
 float detail=(sin(p.x*.65+sin(p.y*.4))*cos(p.y*.55)*.2+sin(p.x*1.9+p.y)*.055)*clamp(shore/6.,0.,1.);
 return base+(hill+shelf)*clamp(shore/4.,0.,1.)+detail-max(-shore-10.,0.)*.12;
}
`;

// Deep water dispersion w=sqrt(g*k); short waves are attenuated in the
// vertex stage at distance, while the per-pixel slope retains fine ripples.
export const wavesGLSL = /* glsl */ `
uniform float uWaves, uWind;
void addWave(vec2 p,vec2 dir,float len,float amp,float phase,inout vec3 dis,inout vec2 slope,inout float crest,bool geometry){
  float k=6.2831853/len; float a=amp*uWaves; float f=k*dot(dir,p)-sqrt(9.81*k)*uTime*(.8+uWind*.25)+phase;
  float dist=distance(cameraPosition.xz,p);
  float fade=geometry ? 1.-smoothstep(len*12.,len*30.,dist) : 1.-smoothstep(len*50.,len*130.,dist);
  dis+=vec3(dir.x*cos(f)*a*.55,sin(f)*a,dir.y*cos(f)*a*.55)*fade;
  slope+=dir*k*a*cos(f)*fade; crest+=k*a*sin(f)*fade;
}
void waveField(vec2 p, bool geometry, out vec3 dis, out vec2 slope, out float crest){
 dis=vec3(0.); slope=vec2(0.); crest=0.;
 ${WAVE_COMPONENTS.map(([x,z,len,amp,phase])=>`addWave(p,normalize(vec2(${glslFloat(x)},${glslFloat(z)})),${glslFloat(len)},${glslFloat(amp)},${glslFloat(phase)},dis,slope,crest,geometry);`).join('\n')}
}
`;

export const wakeGLSL = /* glsl */ `
uniform sampler2D uWake;
uniform float uWakeExtent;
vec4 wakeAt(vec2 p){
 vec2 uv=p/uWakeExtent+.5;
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec4(0.);
 return texture2D(uWake,uv);
}
`;

export const oceanVertex = /* glsl */ `
uniform mat4 textureMatrix;
uniform float uTime;
varying vec3 vWorld; varying vec4 vMirror; varying vec2 vRest;
${terrainGLSL}
${wavesGLSL}
${wakeGLSL}
void main(){
 vec4 world=modelMatrix*vec4(position,1.); vRest=world.xz;
 vec3 dis; vec2 slope; float crest; waveField(world.xz,true,dis,slope,crest);
 float shallow=clamp((-terrainHeight(world.xz)+.2)*.55,.06,1.);
 world.xyz+=dis*shallow;world.y+=wakeAt(world.xz).r;vWorld=world.xyz;
 vMirror=textureMatrix*vec4(position,1.);
 gl_Position=projectionMatrix*viewMatrix*world;
}
`;
export const oceanFragment = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec3 vWorld; varying vec4 vMirror; varying vec2 vRest;
${atmosphereGLSL}
${terrainGLSL}
${wavesGLSL}
${wakeGLSL}
void main(){
 vec3 dis; vec2 slope; float crest; waveField(vRest,false,dis,slope,crest);
 float ground=terrainHeight(vWorld.xz); float depth=max(vWorld.y-ground,0.);
 float shoreFade=clamp(depth*.55,.08,1.);
 slope*=shoreFade;
 vec4 wake=wakeAt(vWorld.xz);slope+=wake.gb;
 // Small rain impacts perturb normals without any image texture.
 vec2 rainCell=floor(vWorld.xz*1.7); vec2 rp=fract(vWorld.xz*1.7)-.5;
 float age=fract(uTime*1.6+hash21(rainCell));
 float ring=sin(length(rp)*45.-age*25.)*exp(-length(rp)*7.)*sin(age*3.14159)*uStorm*.07;
 slope+=normalize(rp+vec2(.001))*ring;
 vec3 N=normalize(vec3(-slope.x,1.,-slope.y));
 vec3 V=normalize(cameraPosition-vWorld); float ndv=max(dot(N,V),0.);
 float fresnel=.0204+.9796*pow(1.-ndv,5.);
 vec3 R=reflect(-V,N);
 vec2 reflectUV=vMirror.xy/vMirror.w+N.xz*.018/(1.+distance(cameraPosition,vWorld)*.015);
 vec3 planar=texture2D(tDiffuse,clamp(reflectUV,.002,.998)).rgb;
 vec3 reflection=mix(atmosphere(R,false),planar,smoothstep(.04,.3,ndv)*.8);
 vec3 deep=mix(vec3(.012,.16,.21),vec3(.001,.014,.038),1.-uDay);
 vec3 shallow=mix(vec3(.095,.55,.42),vec3(.012,.08,.11),1.-uDay);
 vec3 body=mix(shallow,deep,1.-exp(-depth*.12))*(1.-uStorm*.68);
 float sandNoise=noise2(vWorld.xz*7.);
 vec3 seabed=vec3(.48,.40,.23)*(1.+sandNoise*.15)*(.18+uDay*.8);
 float caustic=pow(1.-abs(sin(vWorld.x*.75+sin(vWorld.z*.7+uTime)) * sin(vWorld.z*.9+sin(vWorld.x*.6-uTime*.7))),14.);
 body=mix(body,seabed+caustic*.14*vec3(.5,1.,.8)*uDay,exp(-depth*.9)*.5);
 vec3 col=mix(body,reflection,clamp(fresnel,.04,.94));
 vec3 H=normalize(V+uSun);
 float spec=pow(max(dot(N,H),0.),380.)*.9+pow(max(dot(N,H),0.),70.)*.035;
 col+=uSunColor*spec*3.5*(1.-uStorm*.92);
 col+=vec3(.05,.22,.14)*max(0.,dis.y)*pow(max(dot(-V,uSun),0.),3.)*uDay;
 float shore=islandRadius(atan(vWorld.z*1.12,vWorld.x))-length(vWorld.xz*vec2(1.,1.12));
 float band=sin(shore*2.8+uTime*1.8+noise2(vWorld.xz*.7)*1.5);
 float foam=smoothstep(.55,.93,band)*exp(-depth*.95)*smoothstep(0.,.24,depth);
 float lace=noise2(vWorld.xz*9.+uTime*.2)*noise2(vWorld.xz*21.-uTime*.4);
 foam*=smoothstep(.09,.28,lace);
 foam+=smoothstep(.29,.48,crest)*smoothstep(.18,.4,lace)*(.25+uStorm*.65);
 // Persistent stern foam and spreading wave rims follow the actual path.
 foam+=wake.a*(.45+.55*smoothstep(.08,.28,lace));
 foam+=smoothstep(.045,.16,length(wake.gb))*.2;
 vec3 foamColor=mix(vec3(.045,.09,.14),vec3(.85,.92,.84),uDay);
 col=mix(col,foamColor,clamp(foam,0.,.88));
 float fog=1.-exp(-distance(cameraPosition,vWorld)*(.0011+uStorm*.003));
 col=mix(col,uHorizon,fog);
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;

export const windGLSL = /* glsl */ `
uniform float uTime, uWind;
vec3 windPosition(vec3 p) {
 float flexibility=pow(clamp(p.y/8.,0.,1.),1.8);
 float gust=sin(uTime*1.5+p.x*.23+p.z*.17)+.35*sin(uTime*3.1+p.z*.7);
 p.x+=gust*flexibility*uWind*.32;
 p.z+=sin(uTime*1.1+p.x*.21)*flexibility*uWind*.21;
 return p;
}
`;
