export const palette = {
  ground: '#285748',
  groundLight: '#326956',
  groundShadow: '#1d463f',
  groundHighlight: '#3b735f',
  river: '#35e7e5',
  riverGlow: '#83ffff',
  riverBank: '#174f4d',
  riverBankLight: '#23645c',
  cobble: '#819b99',
  cobbleLight: '#a5b7ad',
  wood: '#526d67',
  tealDeep: '#123533',
  tealMid: '#2a6660',
  slate: '#536c70',
  moon: '#c8f7e8',
  purple: '#825f9a',
  mutedRed: '#7d4f51',
  mutedOrange: '#77634d',
};

export function gradeModelMaterial(material, strength = 0.35) {
  if (!material?.color) return material;
  const color = material.color;
  const hsl = {};
  color.getHSL(hsl);
  if ((hsl.h < 0.13 || hsl.h > 0.94) && hsl.s > 0.3) {
    color.lerp({ r: 0.16, g: 0.38, b: 0.35 }, Math.min(0.84, strength + 0.35));
    material.roughness = Math.max(material.roughness ?? 0.8, 0.78);
  } else {
    color.multiplyScalar(0.78);
    color.lerp({ r: 0.23, g: 0.43, b: 0.39 }, strength * 0.28);
  }
  material.needsUpdate = true;
  return material;
}
