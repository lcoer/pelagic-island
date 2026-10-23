export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const damp = (x, target, speed, dt) => target + (x - target) * Math.exp(-speed * dt);
export function createRandom(seed = 7261) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function islandRadius(a) { return 27 + 2.3 * Math.sin(a * 3 + 0.5) + 1.4 * Math.sin(a * 5 - 1.2) + 0.8 * Math.cos(a * 7); }
export function terrainHeight(x, z) {
  const d = Math.hypot(x, z * 1.12), shore = islandRadius(Math.atan2(z * 1.12, x)) - d;
  const base = 2.8 * Math.tanh(shore * 0.14);
  const hill = 5.5 * Math.exp(-((x + 7) ** 2 / 95 + (z + 4) ** 2 / 110));
  const shelf = 2.5 * Math.exp(-((x - 14) ** 2 / 40 + (z + 8) ** 2 / 48));
  const detail = (Math.sin(x * 0.65 + Math.sin(z * 0.4)) * Math.cos(z * 0.55) * 0.2 + Math.sin(x * 1.9 + z) * 0.055) * clamp(shore / 6, 0, 1);
  return base + (hill + shelf) * clamp(shore / 4, 0, 1) + detail - Math.max(-shore - 10, 0) * 0.12;
}
export function weatherPreset(name) {
  const presets = { clear: { storm: 0, hour: 17.65, wind: 0.65, waves: 0.72 }, storm: { storm: 1, hour: 15, wind: 1.7, waves: 1.65 }, night: { storm: 0, hour: 22, wind: 0.45, waves: 0.6 } };
  if (!presets[name]) throw new Error(`Unknown weather: ${name}`);
  return { ...presets[name] };
}
