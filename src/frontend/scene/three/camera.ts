import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { VisualFootprint } from './visualAdapter';
import { SOIL_DISPLAY_DEPTH, MAX_CROP_DISPLAY_HEIGHT } from './visualTokens';

// PROVISIONAL Visual System camera tuning. No scientific/model values.
export const CAMERA_LIMITS = {
  fov: 38,
  azimuthMin: -65,
  azimuthMax: 78,
  elevationMin: 20,
  elevationMax: 52,
  defaultAzimuth: 32,
  defaultElevation: 34,
  resetDistanceFactor: 0.88,
  closeDistance: 8,
  farDistanceFactor: 1.35,
  edgeClearance: 0.65,
  minimumCameraHeight: 1.2,
} as const;

function direction(azimuth: number, elevation: number) {
  const yaw = THREE.MathUtils.degToRad(azimuth), tilt = THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt));
}

const DEFAULT_DIRECTION = direction(CAMERA_LIMITS.defaultAzimuth, CAMERA_LIMITS.defaultElevation);

export class CameraRig {
  readonly controls: OrbitControls;
  private footprint!: VisualFootprint;
  private defaultTarget = new THREE.Vector3();
  private defaultDistance = 30;
  private framing?: { position: THREE.Vector3; target: THREE.Vector3 };
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.9;
    this.controls.minAzimuthAngle = THREE.MathUtils.degToRad(CAMERA_LIMITS.azimuthMin);
    this.controls.maxAzimuthAngle = THREE.MathUtils.degToRad(CAMERA_LIMITS.azimuthMax);
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(90 - CAMERA_LIMITS.elevationMax);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(90 - CAMERA_LIMITS.elevationMin);
    this.controls.addEventListener('start', this.cancelTransition);
  }

  private cancelTransition = () => { this.framing = undefined; };

  /** Only one framing action. Never writes configuration or simulation state. */
  resetView(footprint: VisualFootprint, immediate = false) {
    this.footprint = footprint;
    this.camera.fov = CAMERA_LIMITS.fov;
    const box = new THREE.Box3(
      new THREE.Vector3(-footprint.width / 2, -SOIL_DISPLAY_DEPTH, -footprint.depth / 2),
      new THREE.Vector3(footprint.width / 2, MAX_CROP_DISPLAY_HEIGHT, footprint.depth / 2),
    );
    const corners: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
      corners.push(new THREE.Vector3(x, y, z));
    const target = box.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3(DEFAULT_DIRECTION.z, 0, -DEFAULT_DIRECTION.x).normalize();
    const up = new THREE.Vector3().crossVectors(DEFAULT_DIRECTION, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanH = tanV * this.camera.aspect;
    const fitDistance = () => Math.max(...corners.flatMap(point => {
      const offset = point.clone().sub(target);
      return [
        offset.dot(DEFAULT_DIRECTION) + Math.abs(offset.dot(right)) / (tanH * 0.92),
        offset.dot(DEFAULT_DIRECTION) + Math.abs(offset.dot(up)) / (tanV * 0.84),
      ];
    }));
    // Centre the projected silhouette vertically, rather than leaving most
    // of the unused background above an overview positioned too low.
    for (let i = 0; i < 4; i++) {
      const distance = fitDistance();
      const projectedY = corners.map(point => {
        const offset = point.clone().sub(target);
        return offset.dot(up) / ((distance - offset.dot(DEFAULT_DIRECTION)) * tanV);
      });
      const centreY = (Math.min(...projectedY) + Math.max(...projectedY)) / 2;
      target.y += centreY * distance * tanV / up.y;
    }
    const overviewFitDistance = fitDistance();
    // Tighten only the reset composition, keeping the existing zoom-out reach.
    const closerDistance = overviewFitDistance * CAMERA_LIMITS.resetDistanceFactor;
    for (let i = 0; i < 3; i++) {
      const projectedY = corners.map(point => {
        const offset = point.clone().sub(target);
        return offset.dot(up) / ((closerDistance - offset.dot(DEFAULT_DIRECTION)) * tanV);
      });
      const centreY = (Math.min(...projectedY) + Math.max(...projectedY)) / 2;
      target.y += centreY * closerDistance * tanV / up.y;
    }
    // Narrow viewports may need more room than the 12% closer target. Preserve
    // a small actual frustum margin instead of cropping the farm or its labels.
    const marginDistance = Math.max(...corners.flatMap(point => {
      const offset = point.clone().sub(target);
      return [
        offset.dot(DEFAULT_DIRECTION) + Math.abs(offset.dot(right)) / (tanH * 0.95),
        offset.dot(DEFAULT_DIRECTION) + Math.abs(offset.dot(up)) / (tanV * 0.965),
      ];
    }));
    this.defaultTarget.copy(target);
    this.defaultDistance = Math.max(closerDistance, marginDistance);
    this.controls.minDistance = CAMERA_LIMITS.closeDistance;
    this.controls.maxDistance = overviewFitDistance * CAMERA_LIMITS.farDistanceFactor;
    this.camera.near = 0.08;
    this.camera.far = Math.max(300, this.defaultDistance * 4);
    this.camera.updateProjectionMatrix();
    const position = target.clone().addScaledVector(DEFAULT_DIRECTION, this.defaultDistance);
    // Flush pending drag/zoom damping so Reset View cannot retain old input.
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    if (immediate || this.reducedMotion.matches) {
      this.framing = undefined;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
    } else {
      this.framing = { position, target: target.clone() };
    }
  }

  /** Intersection of the current viewing direction with the exposed footprint.
   * At close range the orbit aim slides continuously along the front/side edge.
   * There is no soil-view state, preset threshold or geometry substitution.
   */
  private edgePoint(yaw: number) {
    const ray = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const distance = Math.min(
      Math.abs(ray.x) > 0.0001 ? this.footprint.width / 2 / Math.abs(ray.x) : Infinity,
      this.footprint.depth / 2 / ray.z,
    );
    return { point: ray.clone().multiplyScalar(distance), distance, ray };
  }

  private constrainInspection() {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const radius = THREE.MathUtils.clamp(spherical.radius, this.controls.minDistance, this.controls.maxDistance);
    const edge = this.edgePoint(spherical.theta);
    const progress = THREE.MathUtils.clamp((this.defaultDistance - radius) / (this.defaultDistance - CAMERA_LIMITS.closeDistance), 0, 1);
    let amount = THREE.MathUtils.smoothstep(progress, 0, 0.9);
    // Keep the eye outside the footprint once it is low enough to approach
    // the canopy/profile. This geometric constraint applies to every angle.
    const safeAmount = 1 - (radius * Math.sin(spherical.phi) - CAMERA_LIMITS.edgeClearance) / edge.distance;
    amount = Math.max(amount, THREE.MathUtils.clamp(safeAmount, 0, 1));
    const target = this.defaultTarget.clone().lerp(
      new THREE.Vector3(edge.point.x, -SOIL_DISPLAY_DEPTH / 3, edge.point.z), amount,
    );
    spherical.radius = Math.max(radius, (CAMERA_LIMITS.minimumCameraHeight - target.y) / Math.cos(spherical.phi));
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
    this.camera.lookAt(target);
  }

  update(delta: number) {
    this.controls.update();
    if (this.framing) {
      const alpha = this.reducedMotion.matches ? 1 : 1 - Math.exp(-delta * 9);
      const spherical = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
      const goal = new THREE.Spherical().setFromVector3(this.framing.position.clone().sub(this.framing.target));
      spherical.radius = THREE.MathUtils.lerp(spherical.radius, goal.radius, alpha);
      spherical.theta = THREE.MathUtils.lerp(spherical.theta, goal.theta, alpha);
      spherical.phi = THREE.MathUtils.lerp(spherical.phi, goal.phi, alpha);
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      if (Math.abs(spherical.radius - goal.radius) < 0.0001 && Math.abs(spherical.theta - goal.theta) < 0.00001 && Math.abs(spherical.phi - goal.phi) < 0.00001) {
        this.camera.position.copy(this.framing.position);
        this.controls.target.copy(this.framing.target);
        this.framing = undefined;
      }
    }
    // Reset follows the same safe, continuous path as manual navigation;
    // interrupting it with a gesture does not jump to a different aim point.
    this.constrainInspection();
  }

  refitIfAtDefault(footprint: VisualFootprint) {
    const state = this.snapshot();
    if (!this.framing && Math.abs(state.distance - this.defaultDistance) < 0.01 &&
      Math.abs(state.azimuth - CAMERA_LIMITS.defaultAzimuth) < 0.01 &&
      Math.abs(state.elevation - CAMERA_LIMITS.defaultElevation) < 0.01)
      this.resetView(footprint, true);
  }

  /** Annotation position follows the visible face, not a hidden view mode. */
  cutawayAnchor(): THREE.Vector3 {
    const yaw = this.controls.getAzimuthalAngle();
    const edge = this.edgePoint(yaw).point;
    if (Math.abs(edge.z - this.footprint.depth / 2) < 0.01) {
      edge.x = THREE.MathUtils.clamp(edge.x + 1.8, -this.footprint.width / 2 + 0.3, this.footprint.width / 2 - 0.3);
      edge.z += 0.04;
    } else {
      edge.z = THREE.MathUtils.clamp(edge.z - Math.sign(edge.x) * 1.8, -this.footprint.depth / 2 + 0.3, this.footprint.depth / 2 - 0.3);
      edge.x += Math.sign(edge.x) * 0.04;
    }
    return edge;
  }

  // Read-only instrumentation used by camera regression checks.
  snapshot() {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    return {
      position: this.camera.position.toArray(), target: this.controls.target.toArray(),
      azimuth: THREE.MathUtils.radToDeg(spherical.theta), elevation: 90 - THREE.MathUtils.radToDeg(spherical.phi),
      distance: spherical.radius, defaultDistance: this.defaultDistance, fov: this.camera.fov,
    };
  }

  dispose() {
    this.controls.removeEventListener('start', this.cancelTransition);
    this.controls.dispose();
  }
}
