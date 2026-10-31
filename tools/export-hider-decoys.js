import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createEnvironment } from '../client/src/environment.js';
import map from '../shared/map.js';

const modelFiles = { hiderBoulders: 'rock_smallTopB.glb', hiderBushes: 'plant_bushDetailed.glb', hiderStumps: 'stump_squareDetailed.glb' };
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return out;
}
function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1]; const [sx, sy, sz] = node.scale || [1, 1, 1]; const [tx, ty, tz] = node.translation || [0, 0, 0];
  const xx=x*x, yy=y*y, zz=z*z, xy=x*y, xz=x*z, yz=y*z, wx=w*x, wy=w*y, wz=w*z;
  return [(1-2*(yy+zz))*sx,2*(xy+wz)*sx,2*(xz-wy)*sx,0,2*(xy-wz)*sy,(1-2*(xx+zz))*sy,2*(yz+wx)*sy,0,2*(xz+wy)*sz,2*(yz-wx)*sz,(1-2*(xx+yy))*sz,0,tx,ty,tz,1];
}
function transformPoint(m,x,y,z) { return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]]; }
async function glbHeight(filename) {
  const bytes = await readFile(resolve('client/public/models', filename));
  if (bytes.toString('ascii',0,4)!=='glTF') throw new Error(`${filename}: invalid GLB`);
  const jsonLength=bytes.readUInt32LE(12); const doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
  const parent=new Map(); for(const node of doc.nodes||[]) for(const child of node.children||[]) parent.set(child,node);
  const root=(doc.scenes?.[doc.scene||0]?.nodes)||doc.nodes.map((_,i)=>i).filter(i=>!parent.has(i));
  let minY=Infinity,maxY=-Infinity;
  function visit(index,parentMatrix) {
    const node=doc.nodes[index]; const matrix=multiply(parentMatrix,nodeMatrix(node));
    const mesh=node.mesh==null?null:doc.meshes[node.mesh];
    for(const primitive of mesh?.primitives||[]) {
      const accessor=doc.accessors[primitive.attributes.POSITION]; if(!accessor?.min||!accessor?.max) continue;
      const [minX,minZ0,minZ]=accessor.min; const [maxX,maxZ0,maxZ]=accessor.max;
      for(const x of [minX,maxX]) for(const y of [minZ0,maxZ0]) for(const z of [minZ,maxZ]) { const point=transformPoint(matrix,x,y,z); minY=Math.min(minY,point[1]); maxY=Math.max(maxY,point[1]); }
    }
    for(const child of node.children||[]) visit(child,matrix);
  }
  for(const index of root) visit(index,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  if(!Number.isFinite(minY)||maxY-minY<0.001) throw new Error(`${filename}: could not determine vertical bounds`);
  return maxY-minY;
}

const modelHeights = {};
for (const [type,file] of Object.entries(modelFiles)) modelHeights[file] = await glbHeight(file);
const env = await createEnvironment(map, null, { add() {} }, { exportDecoysOnly: true, modelHeights });
if(env.hiderDecoys.length < 150) throw new Error(`Unexpected decoy count ${env.hiderDecoys.length}`);
await writeFile(new URL('../shared/hiderDecoys.json', import.meta.url), `${JSON.stringify(env.hiderDecoys)}\n`);
const counts=Object.fromEntries(Object.keys(modelFiles).map(type=>[type,env.hiderDecoys.filter(item=>item.type===type).length]));
console.log(`Wrote ${env.hiderDecoys.length} renderer-matched decoys; model heights ${JSON.stringify(modelHeights)}; counts ${JSON.stringify(counts)}.`);