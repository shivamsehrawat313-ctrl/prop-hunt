import * as THREE from 'three';
import { palette } from './palette.js';

export function createLighting(scene, map) {
  scene.background = new THREE.Color(palette.tealDeep);
  scene.fog = new THREE.Fog(new THREE.Color(palette.tealDeep), 120, 220);

  const hemi = new THREE.HemisphereLight(new THREE.Color('#a7eee0'), new THREE.Color('#24463e'), map.lighting.hemisphere);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(new THREE.Color('#7ad9c9'), map.lighting.ambient * 0.32);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(new THREE.Color('#c5f4e8'), map.lighting.key);
  moon.position.set(-40, 80, 25);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -80;
  moon.shadow.camera.right = 80;
  moon.shadow.camera.top = 80;
  moon.shadow.camera.bottom = -80;
  moon.shadow.bias = -0.0004;
  scene.add(moon);

  // Keep the river bright through its material and four crossing glows. Avoid a chain
  // of dynamic lights; the nearest camp and local player use the remaining two lights.
  for (const crossing of map.river.crossings) {
    const glow = new THREE.PointLight(new THREE.Color(palette.riverGlow), 2.4, 17, 2);
    glow.position.set(crossing.x, 1.7, crossing.y);
    scene.add(glow);
  }
  return { moon };
}

export function makeSoftShadow(scene) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { color: { value: new THREE.Color('#0a2625') } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 color; varying vec2 vUv; void main(){ vec2 p=(vUv-0.5)*2.0; float d=dot(p,p); float a=exp(-d*4.8)*0.48; gl_FragColor=vec4(color,a); }',
    side: THREE.DoubleSide,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 1.05), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  shadow.renderOrder = 1;
  scene.add(shadow);
  return shadow;
}
