import test from 'node:test';
import assert from 'node:assert/strict';
import { ambienceMix, noiseSamples } from '../src/ambience.js';

test('海浪和风声强度随环境变化，声浪包络连续',()=>{
  const calm=ambienceMix({wind:.2,waves:.3,storm:0,distance:70},3);
  const storm=ambienceMix({wind:1.7,waves:1.65,storm:1,distance:70},3);
  assert.ok(storm.wind>calm.wind);assert.ok(storm.surfLeft>calm.surfLeft);assert.ok(storm.water>calm.water);
  const next=ambienceMix({wind:.2,waves:.3,storm:0,distance:70},3.001);
  assert.ok(Math.abs(next.surfLeft-calm.surfLeft)<.001);
  assert.notEqual(ambienceMix({},0).surfLeft,ambienceMix({},4).surfLeft);
  for(let t=0;t<60;t+=.1)for(const value of Object.values(ambienceMix({wind:2,waves:2,storm:1},t)))assert.ok(Number.isFinite(value)&&value>=0);
});
test('程序化噪声有界、无直流偏移且接缝连续',()=>{
  for(const type of ['pink','white']){
    const noise=noiseSamples(44100,type,871);
    assert.ok(noise.every(Number.isFinite));
    assert.ok(Math.max(...noise)<1&&Math.min(...noise)>-1);
    const mean=noise.reduce((a,b)=>a+b,0)/noise.length;
    assert.ok(Math.abs(mean)<.001);
    assert.ok(Math.abs(noise[0]-noise.at(-1))<1e-6);
  }
});
