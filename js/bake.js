// Merge static meshes by material so the GPU draws a handful of batches instead of hundreds of tiny parts.
// Groups whose name is in `keep` stay separate (they animate), but their own static children are merged too.
import * as THREE from './three.module.min.js';
import { mergeGeometries } from './BufferGeometryUtils.js';

const ATTRS = ['position', 'normal', 'uv'];
function norm(g) { // same attribute set everywhere so geometries can be merged
  let geo = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(geo.attributes)) if (!ATTRS.includes(k)) geo.deleteAttribute(k);
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}
export function bake(root, keep = new Set()) {
  root.updateMatrixWorld(true);
  const owners = [root]; root.traverse(n => { if (n !== root && keep.has(n.name)) owners.push(n); });
  const ownerOf = n => { let p = n.parent; while (p && p !== root && !keep.has(p.name)) p = p.parent; return p || root; };
  for (const owner of owners) {
    const inv = new THREE.Matrix4().copy(owner.matrixWorld).invert(), buckets = new Map(), victims = [];
    owner.traverse(n => { if (!n.isMesh || n.isInstancedMesh || n.userData.noBake || ownerOf(n) !== owner) return;
      const m = n.material; if (Array.isArray(m)) return; const key = m.uuid + (n.castShadow ? 's' : '');
      const geo = norm(n.geometry).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld));
      if (!buckets.has(key)) buckets.set(key, { m, cast: n.castShadow, geos: [] }); buckets.get(key).geos.push(geo); victims.push(n); });
    for (const v of victims) v.parent.remove(v);
    for (const { m, cast, geos } of buckets.values()) { const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue; const o = new THREE.Mesh(merged, m); o.castShadow = cast; o.receiveShadow = true; owner.add(o); }
  }
  return root;
}
