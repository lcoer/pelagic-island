import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleOcean, boatWaterPoint, constrainBoatMove, WakeField } from '../src/ocean-physics.js';

test('共享海浪查询连续、有限，并跟随波浪强度变化',()=>{
  const a=sampleOcean(24,30,3,.72,.65);
  assert.ok(Number.isFinite(a.height));
  assert.ok(Math.abs(sampleOcean(24.001,30,3,.72,.65).height-a.height)<.01);
  assert.equal(sampleOcean(24,30,3,0,.65).height,0);
  assert.notEqual(sampleOcean(24,30,4,.72,.65).height,a.height);
  assert.ok(Number.isFinite(sampleOcean(24,30,3,.72,.65,{x:58,z:75}).height));
});
test('船只限于外海且不能穿越海岛',()=>{
  for(const p of [[0,0],[4,3],[100,100],[-5,20]]){
    const safe=boatWaterPoint(...p);assert.ok(Math.hypot(safe.x,safe.z)>=36-.001);assert.ok(Math.hypot(safe.x,safe.z)<=73+.001);
  }
  const result=constrainBoatMove({x:0,z:40},{x:0,z:-45});
  assert.ok(result.z>=36,'穿越海岛的拖动应在近岸停止');
});
test('尾流扰动会传播、衰减，暂停不推进，长时间保持稳定',()=>{
  const wake=new WakeField(64,176);wake.disturb(24,35,.16,2.5,.7);
  assert.ok(wake.sample(24,35)>0);
  const initial=wake.energy;wake.step(0);assert.equal(wake.energy,initial);
  for(let i=0;i<120;i++)wake.step(1/60);
  const spread=wake.sample(29,35);assert.ok(Math.abs(spread)>1e-6,'波纹应离开扰动位置向外传播');
  for(let i=0;i<1200;i++)wake.step(1/60);
  assert.ok(wake.energy<initial*.1);
  assert.ok(wake.height.every(Number.isFinite));
});
