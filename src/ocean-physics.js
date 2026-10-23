import { clamp, terrainHeight } from './world.js';

// One spectrum generates both GLSL and CPU buoyancy queries.
export const WAVE_COMPONENTS = [
  [1,.45,18,.27,0],[.6,1,10,.16,2],[-.3,1,6.1,.10,4],
  [1,-.3,3.3,.055,1],[.8,.6,1.6,.025,3],[-.7,.7,.78,.012,5],[.9,-.4,.38,.005,2]
];
function displacement(x,z,time,strength,wind,camera){
  let dx=0,dz=0,height=0,sx=0,sz=0;
  for(const [vx,vz,len,amp,phase] of WAVE_COMPONENTS){
    const norm=Math.hypot(vx,vz),ux=vx/norm,uz=vz/norm,k=Math.PI*2/len;
    const f=k*(ux*x+uz*z)-Math.sqrt(9.81*k)*time*(.8+wind*.25)+phase;
    const dist=camera?Math.hypot(camera.x-x,camera.z-z):0;
    const t=clamp((dist-len*12)/(len*18),0,1),fade=1-t*t*(3-2*t);
    const a=amp*strength*fade;
    dx+=ux*Math.cos(f)*a*.55;dz+=uz*Math.cos(f)*a*.55;height+=Math.sin(f)*a;
    sx+=ux*k*a*Math.cos(f);sz+=uz*k*a*Math.cos(f);
  }
  const shallow=clamp((-terrainHeight(x,z)+.2)*.55,.06,1);
  return {dx:dx*shallow,dz:dz*shallow,height:height*shallow,sx:sx*shallow,sz:sz*shallow};
}
export function sampleOcean(x,z,time,strength,wind,camera){
  // Invert the horizontal Gerstner displacement before querying height.
  let px=x,pz=z;
  for(let i=0;i<3;i++){const d=displacement(px,pz,time,strength,wind,camera);px=x-d.dx;pz=z-d.dz;}
  return displacement(px,pz,time,strength,wind,camera);
}
export function boatWaterPoint(x,z){
  let radius=Math.hypot(x,z);
  if(radius<.001){x=0;z=36;radius=36;}
  const safe=clamp(radius,36,73)/radius;
  return {x:x*safe,z:z*safe};
}
export function constrainBoatMove(from,to){
  const target=boatWaterPoint(to.x,to.z),distance=Math.hypot(target.x-from.x,target.z-from.z);
  const steps=Math.max(1,Math.ceil(distance/.6));let last={x:from.x,z:from.z};
  for(let i=1;i<=steps;i++){
    const t=i/steps,x=from.x+(target.x-from.x)*t,z=from.z+(target.z-from.z)*t;
    if(Math.hypot(x,z)<36 || terrainHeight(x,z)>-1.6)break;
    last={x,z};
  }
  return last;
}

// A finite-difference damped wave equation. Fixed bounds and fixed allocation
// keep both memory and GPU upload cost independent of interaction duration.
export class WakeField {
  constructor(size=160,extent=176){
    this.size=size;this.extent=extent;this.cell=extent/(size-1);
    this.height=new Float32Array(size*size);this.velocity=new Float32Array(size*size);
    this.foam=new Float32Array(size*size);this.nextVelocity=new Float32Array(size*size);
    this.mask=new Float32Array(size*size);this.data=new Float32Array(size*size*4);
    for(let z=0;z<size;z++)for(let x=0;x<size;x++){
      const edge=Math.min(x,z,size-1-x,size-1-z);
      this.mask[z*size+x]=terrainHeight(x*this.cell-extent/2,z*this.cell-extent/2)<-1.2?clamp(edge/8,0,1):0;
    }
  }
  disturb(x,z,strength,radius=1.6,foam=.2){
    const n=this.size,gx=(x+this.extent/2)/this.cell,gz=(z+this.extent/2)/this.cell,r=radius/this.cell;
    for(let j=Math.max(1,Math.floor(gz-r*2));j<=Math.min(n-2,Math.ceil(gz+r*2));j++)for(let i=Math.max(1,Math.floor(gx-r*2));i<=Math.min(n-2,Math.ceil(gx+r*2));i++){
      const d2=((i-gx)**2+(j-gz)**2)/(r*r),weight=Math.exp(-d2*1.8),p=j*n+i;
      if(!this.mask[p])continue;
      // A raised rim surrounding a depression gives a balanced water impulse.
      this.height[p]=clamp(this.height[p]+strength*(1-d2*1.8)*weight,-.6,.6);
      this.foam[p]=clamp(this.foam[p]+weight*foam,0,1);
    }
  }
  step(dt){
    if(dt<=0)return;
    const n=this.size,steps=Math.ceil(dt/(1/60)),h=dt/steps,c2=5.2**2/this.cell**2;
    for(let s=0;s<steps;s++){
      const decay=Math.exp(-.85*h),foamDecay=Math.exp(-.38*h);
      for(let z=1;z<n-1;z++)for(let x=1;x<n-1;x++){
        const i=z*n+x,m=this.mask[i];
        const lap=this.height[i-1]+this.height[i+1]+this.height[i-n]+this.height[i+n]-4*this.height[i];
        this.nextVelocity[i]=(this.velocity[i]+c2*lap*h)*decay*m;
      }
      for(let i=0;i<n*n;i++){
        this.velocity[i]=this.nextVelocity[i];this.height[i]=(this.height[i]+this.velocity[i]*h)*this.mask[i];this.foam[i]*=foamDecay;
      }
    }
  }
  sample(x,z){
    const n=this.size,fx=clamp((x+this.extent/2)/this.cell,0,n-1),fz=clamp((z+this.extent/2)/this.cell,0,n-1);
    const ix=Math.min(n-2,Math.floor(fx)),iz=Math.min(n-2,Math.floor(fz)),a=fx-ix,b=fz-iz,i=iz*n+ix;
    return (this.height[i]*(1-a)+this.height[i+1]*a)*(1-b)+(this.height[i+n]*(1-a)+this.height[i+n+1]*a)*b;
  }
  pack(){
    const n=this.size;
    for(let z=1;z<n-1;z++)for(let x=1;x<n-1;x++){
      const i=z*n+x,j=i*4;
      this.data[j]=this.height[i];this.data[j+1]=(this.height[i+1]-this.height[i-1])/(this.cell*2);
      this.data[j+2]=(this.height[i+n]-this.height[i-n])/(this.cell*2);this.data[j+3]=this.foam[i];
    }
    return this.data;
  }
  get energy(){let energy=0;for(let i=0;i<this.height.length;i++)energy+=this.height[i]**2;return energy;}
}
