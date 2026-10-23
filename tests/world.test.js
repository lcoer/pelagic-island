import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeight, islandRadius, damp, createRandom, weatherPreset } from '../src/world.js';

test('地形为连续岛屿，外海位于水下且海岸不规则', () => {
  assert.ok(terrainHeight(0, 0) > 1);
  assert.ok(terrainHeight(100, 100) < -4);
  assert.notEqual(islandRadius(0), islandRadius(1));
  for (let x = -45; x < 45; x += 0.5) {
    assert.ok(Number.isFinite(terrainHeight(x, 5)));
    assert.ok(Math.abs(terrainHeight(x + 0.01, 5) - terrainHeight(x, 5)) < 0.1);
  }
});
test('随机种子确定且取值在零和一之间', () => {
  const a = createRandom(42), b = createRandom(42);
  for (let i = 0; i < 100; i++) { const n = a(); assert.equal(n, b()); assert.ok(n >= 0 && n < 1); }
});
test('天气过渡不依赖帧率且无过冲', () => {
  let a = 0, b = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 1, 2, 1 / 60);
  for (let i = 0; i < 30; i++) b = damp(b, 1, 2, 1 / 30);
  assert.ok(Math.abs(a - b) < 1e-10);
  assert.ok(a > 0 && a < 1);
  assert.equal(weatherPreset('storm').storm, 1);
  assert.equal(weatherPreset('night').hour, 22);
  assert.throws(() => weatherPreset('invalid'));
});
