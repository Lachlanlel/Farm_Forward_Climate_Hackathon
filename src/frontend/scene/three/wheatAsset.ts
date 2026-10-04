import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { tokens } from './visualTokens';
import { prepareCropGeometry } from './WheatCropVisual';

export type WheatAssetStatus = 'loading' | 'ready' | 'fallback';
export type WheatVariant = 'A' | 'B' | 'C';
export interface WheatAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  dispose(): void;
}
export interface WheatFamily {
  geometries: Record<WheatVariant, THREE.BufferGeometry>;
  material: THREE.MeshStandardMaterial;
  dispose(): void;
}

// The portable build embeds exactly this GLB; normal development fetches it.
declare global { interface Window { __WHEAT_A_GLB__?: string; __WHEAT_GLBS__?: Partial<Record<WheatVariant, string>> } }

export async function loadWheatAsset(variant: WheatVariant = 'A'): Promise<WheatAsset> {
  const loader = new GLTFLoader();
  const embedded = window.__WHEAT_GLBS__?.[variant] ?? (variant === 'A' ? window.__WHEAT_A_GLB__ : undefined);
  const gltf = embedded
    ? await loader.parseAsync(Uint8Array.from(atob(embedded), c => c.charCodeAt(0)).buffer, '')
    : await loader.loadAsync(new URL(`assets/wheat/wheat_${variant}.glb`, document.baseURI).href);
  let geometry: THREE.BufferGeometry | undefined;
  let material: THREE.MeshStandardMaterial | undefined;
  try {
    const meshes: THREE.Mesh[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    if (meshes.length !== 1 || gltf.animations.length) throw new Error(`Wheat ${variant} must be one static shared mesh`);
    const mesh = meshes[0];
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) throw new Error('Expected one standard crop material');
    geometry = mesh.geometry.clone();
    // Bake the standard Blender -> glTF node transform once into shared geometry.
    // This is the exported transform, not a guessed per-instance rotation.
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const height = bounds.max.y - bounds.min.y;
    const bend = geometry.getAttribute('_bend_weight');
    const parts = geometry.getAttribute('_part_id');
    if (bounds.min.y < -0.005 || height < 0.9 || height > 1.1 || !bend || !parts)
      throw new Error(`Wheat ${variant} pivot, metre scale or deformation masks do not match the asset contract`);
    prepareCropGeometry(geometry, variant);
    material = mesh.material.clone();
    material.color.set(tokens.crop.wheatA);
    material.roughness = tokens.material.roughness;
    material.metalness = tokens.material.metalness;
    material.side = THREE.FrontSide;
    material.flatShading = true;
    material.vertexColors = false;
    const result = { geometry, material, dispose() { this.geometry.dispose(); this.material.dispose(); } };
    return result;
  } catch (error) {
    geometry?.dispose();
    material?.dispose();
    throw error;
  } finally {
    // We own the cloned shared buffers/material, not the loader's source scene.
    gltf.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose());
      }
    });
  }
}

export async function loadWheatFamily(): Promise<WheatFamily> {
  const variants: WheatVariant[] = ['A', 'B', 'C'];
  const results = await Promise.allSettled(variants.map(variant => loadWheatAsset(variant)));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) {
    results.forEach(result => { if (result.status === 'fulfilled') result.value.dispose(); });
    throw (failure as PromiseRejectedResult).reason;
  }
  const assets = results.map(result => (result as PromiseFulfilledResult<WheatAsset>).value);
  const material = assets[0].material;
  assets.slice(1).forEach(asset => asset.material.dispose());
  const geometries = { A: assets[0].geometry, B: assets[1].geometry, C: assets[2].geometry };
  return { geometries, material, dispose() { Object.values(geometries).forEach(geometry => geometry.dispose()); material.dispose(); } };
}
