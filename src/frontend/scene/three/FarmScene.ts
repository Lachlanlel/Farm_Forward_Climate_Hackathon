import * as THREE from 'three';
import type { FarmAreaConfig, WheatPlantingState, AdaptationState, WaterSourceState } from '../simulation/types';
import { areaToVisualFootprint, type VisualFootprint } from './visualAdapter';
import { SOIL_LAYERS, SOIL_DISPLAY_DEPTH, tokens } from './visualTokens';
import { createPaddockBoundary, createSoilCutaway } from './SoilCutaway';
import { createWheatField, type WheatField } from './WheatField';
import { CameraRig, CAMERA_LIMITS } from './camera';
import { loadWheatFamily, type WheatFamily, type WheatAssetStatus } from './wheatAsset';
import { loadRootAsset, type RootAsset, type RootAssetStatus } from './rootAsset';
import { RootSystems } from './RootSystems';
import { ROOT_PREVIEW, resolveRootPresentation, type RootPresentationState } from './rootPresentation';
import { SoilMoisture } from './SoilMoisture';
import { MOISTURE_PREVIEW, MoistureTransition, validateMoisturePresentation, type SoilMoisturePresentationState, type SoilMoisture as LayerMoisture } from './soilMoisturePresentation';
import { adaptMoistureTransport, type MoistureTransportInput } from './soilMoistureTransport';
import { CropTransition, resolveCropAppearance, type CropPresentationState } from './cropPresentation';
import { SOIL_APPEARANCE_PREVIEW, validateSoilAppearance, type SoilAppearanceState } from './soilVisualPresets';
import { StubbleLayer } from './StubbleLayer';
import { loadStubbleAsset, type StubbleAsset } from './stubbleAsset';
import { WaterSources } from './WaterSources';
import { WATER_SOURCE_PREVIEW, validateWaterSources, validateWaterSourceReview, sampleWaterSources,
  type WaterSourceReviewPlan, type WaterSourceFrame } from './waterSourcePresentation';

export type SceneStatus = 'ready' | 'unavailable';
export type MoistureStatus = 'fields' | 'material-only';
export interface MoistureReviewFrame { displayed: LayerMoisture; progress: number; paused: boolean; waterSources?: WaterSourceState }

function disposeGeometry(group: THREE.Object3D, retainedAsset?: WheatFamily, retainedRoots?: RootAsset) {
  const retained = new Set(retainedAsset ? Object.values(retainedAsset.geometries) : []);
  if (retainedRoots) retainedRoots.geometries.forEach(g => retained.add(g));
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      if (!retained.has(object.geometry)) geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => {
        if (material !== retainedAsset?.material && material !== retainedRoots?.material) materials.add(material);
      });
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
}

/** Presentation only. Takes the handoff's configuration field as input.
 * A future visual-state adapter can be supplied alongside this config; this
 * milestone deliberately has no engine, drought state or agronomic estimates.
 */
export class FarmScene {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  private renderer: THREE.WebGLRenderer;
  private rig: CameraRig;
  private farm = new THREE.Group();
  private footprint: VisualFootprint;
  private observer: ResizeObserver;
  private raf = 0;
  private lastTime = 0;
  private stopped = false;
  private sun: THREE.DirectionalLight;
  private wheatAsset?: WheatFamily;
  private wheatField?: WheatField;
  private adaptations: AdaptationState = { stubbleRetention:false, widerRows:false };
  private stubbleLayer?: StubbleLayer;
  private stubbleAsset?: StubbleAsset;
  private stubbleLoading = false;
  private waterSources?: WaterSources;
  private waterSourceState: WaterSourceState = { ...WATER_SOURCE_PREVIEW };
  private waterSourceReview?: WaterSourceReviewPlan;
  private sourceTime = 0;
  private sourceClockMode: 'recycling' | 'supplied' = 'recycling';
  private lastSourceDiagnostics = -Infinity;
  private sourceViewport = new THREE.Vector2();
  private motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  private reducedMotion = this.motionPreference.matches;
  private lastCropLod?: object;
  private disposed = false;
  private assetLoading = false;
  private rootAsset?: RootAsset;
  private rootSystems?: RootSystems;
  private rootsLoading = false;
  private moistureTransition = new MoistureTransition(MOISTURE_PREVIEW);
  private soilMoisture?: SoilMoisture;
  private soilAppearance: SoilAppearanceState = { ...SOIL_APPEARANCE_PREVIEW };
  private moistureFieldsAvailable = true;
  private moisturePaused = false;
  private lastMoistureUiTime = -Infinity;
  private cropTransition = new CropTransition();
  private rootPresentation: RootPresentationState = { ...ROOT_PREVIEW, layerAccess: { ...ROOT_PREVIEW.layerAccess } };

  constructor(private container: HTMLDivElement, config: FarmAreaConfig, private onStatus: (status: SceneStatus) => void,
    private onWheatStatus: (status: WheatAssetStatus) => void,
    private onRootStatus: (status: RootAssetStatus) => void = () => {},
    private onMoistureStatus: (status: MoistureStatus) => void = () => {},
    private onMoistureFrame: (frame: MoistureReviewFrame) => void = () => {},
    private onStubbleStatus: (status: 'loading' | 'ready' | 'fallback') => void = () => {}) {
    this.footprint = areaToVisualFootprint(config);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: true });
    this.renderer.localClippingEnabled = true;
    this.renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      if (gl.getShaderSource(fragment)?.includes('moistureNoise')) {
        this.moistureFieldsAvailable = false;
        // Mark materials AFTER the current program initialisation finishes;
        // changing their version inside compilation can be consumed by it.
        queueMicrotask(() => { if (!this.disposed) this.soilMoisture?.disableFields(); });
        this.updateMoistureDiagnostics(); this.onMoistureStatus('material-only');
        console.warn('Moisture field shader unavailable; retaining wet/dry earth and layer readouts.');
      } else console.error('Scene shader failed:', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment));
    };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '3D representative wheat paddock with three exposed soil layers');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.contextRestored);
    container.prepend(this.renderer.domElement);
    this.scene.background = new THREE.Color(tokens.environment.background);
    const lighting = new THREE.Group();
    lighting.name = 'Lighting';
    lighting.add(new THREE.HemisphereLight(tokens.environment.daylight, tokens.environment.groundFill, tokens.lighting.hemisphereIntensity));
    this.sun = new THREE.DirectionalLight(tokens.environment.daylight, tokens.lighting.directionalIntensity);
    this.sun.position.set(-14, 25, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.02;
    lighting.add(this.sun, this.sun.target);
    this.scene.add(lighting);
    this.scene.add(this.farm);
    this.rig = new CameraRig(this.camera, this.renderer.domElement);
    this.rebuildFarm();
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.resize();
    this.motionPreference.addEventListener('change', this.motionPreferenceChanged);
    this.onStatus('ready');
    this.raf = requestAnimationFrame(this.render);
    void this.loadWheat();
    void this.loadRoots();
    this.updateAdaptationDiagnostics();
  }

  async loadStubble() {
    if(this.disposed||this.stubbleLoading||this.stubbleAsset)return;
    this.stubbleLoading=true;
    this.onStubbleStatus('loading');
    try{
      const asset=await loadStubbleAsset();
      if(this.disposed){asset.dispose();return}
      this.stubbleAsset=asset;
      if(this.stubbleLayer){this.farm.remove(this.stubbleLayer);disposeGeometry(this.stubbleLayer);this.stubbleLayer=undefined}
      if(this.adaptations.stubbleRetention)this.ensureStubble();
      this.onStubbleStatus('ready');
    }catch(error){if(!this.disposed){console.warn('Residue GLB unavailable; retaining recipe fallback:',error);this.onStubbleStatus('fallback')}}
    finally{this.stubbleLoading=false;this.updateAdaptationDiagnostics()}
  }

  private ensureStubble(){
    if(!this.stubbleLayer){this.stubbleLayer=new StubbleLayer(this.footprint,this.stubbleAsset);this.farm.add(this.stubbleLayer)}
    this.stubbleLayer.visible=this.adaptations.stubbleRetention;
    this.sun.shadow.needsUpdate=true;
  }

  private updateAdaptationDiagnostics(){
    this.container.dataset.adaptations=JSON.stringify(this.adaptations);
    this.container.dataset.stubble=JSON.stringify({enabled:this.adaptations.stubbleRetention,...this.stubbleLayer?.userData,
      assetStatus:this.stubbleAsset?'ready':this.stubbleLoading?'loading':this.stubbleLayer?'recipe fallback':'not requested',
      authority:'independent management visibility; no renderer evaporation/moisture/crop benefit'});
  }

  async loadWheat() {
    if (this.disposed || this.assetLoading || this.wheatAsset) return;
    this.assetLoading = true;
    this.onWheatStatus('loading');
    try {
      const asset = await loadWheatFamily();
      if (this.disposed) { asset.dispose(); return; }
      this.wheatAsset = asset;
      // Rebuild placement with the current hectares, preserving the user's camera.
      this.rebuildFarm();
      this.onWheatStatus('ready');
    } catch (error) {
      if (!this.disposed) {
        console.warn('Wheat family unavailable; retaining placeholder wheat:', error);
        this.onWheatStatus('fallback');
      }
    } finally { this.assetLoading = false; }
  }

  async loadRoots() {
    if (this.disposed || this.rootsLoading || this.rootAsset) return;
    this.rootsLoading = true; this.onRootStatus('loading');
    try {
      const asset = await loadRootAsset();
      if (this.disposed) { asset.dispose(); return; }
      this.rootAsset = asset; this.rebuildFarm(); this.onRootStatus('ready');
    } catch (error) {
      if (!this.disposed) { console.warn('Root asset unavailable:', error); this.onRootStatus('unavailable'); }
    } finally { this.rootsLoading = false; }
  }

  /** Renderer contract. A future adapter supplies reach/access and independent
   * final senescence. Temporary controls never infer biology from crop stress. */
  setRootPresentation(state: RootPresentationState) {
    resolveRootPresentation(state); // reject invalid/absent model access inputs
    this.rootPresentation = { ...state, layerAccess: { ...state.layerAccess } };
    this.rootSystems?.setPresentation(this.rootPresentation);
    this.updateRootDiagnostics();
  }

  setRootRevealDebug(rootReveal: number) {
    // Debug reveal must never re-enable layers restricted by a future adapter.
    this.setRootPresentation({ ...this.rootPresentation, rootReveal });
  }

  setRootSenescenceDebug(rootSenescence: number) {
    // Condition changes preserve developed depth, reveal and model layer access.
    this.setRootPresentation({ ...this.rootPresentation, rootSenescence });
  }

  /** Inherent appearance and externally supplied fissures only. Does not
   * rebuild the farm, retarget water, change a clock or touch crop/root state. */
  setSoilAppearance(state: SoilAppearanceState) {
    validateSoilAppearance(state);
    this.soilAppearance = { ...state };
    this.soilMoisture?.setAppearance(this.soilAppearance);
    this.container.dataset.soilAppearance = JSON.stringify(this.soilAppearance);
  }

  /** Independent supplied crop channels. No week, moisture, root-access, yield
   * or biological calculations here. Immediate supports pre-sampled model state. */
  setCropPresentation(state: CropPresentationState, immediate = false) {
    this.cropTransition.setState(state, immediate);
    this.wheatField?.setCropPresentation(this.cropTransition.displayed);
    this.updateCropDiagnostics();
  }

  private updateCropDiagnostics() {
    this.container.dataset.crop = JSON.stringify({ displayed: this.cropTransition.displayed,
      target: this.cropTransition.target, settled: this.cropTransition.settled,
      appearance: resolveCropAppearance(this.cropTransition.displayed),
      authority: 'two independent supplied normalised crop outputs; no week/soil inference',
      variation: 'fixed row/slot and template/plant metadata, preserved across LOD and state changes' });
  }

  /** Single authoritative destination per layer. The optional transition is
   * a transient explanation of model states/fluxes, never another water store.
   * Future model conversion belongs outside the renderer; root access is separate. */
  setSoilMoisturePresentation(state: SoilMoisturePresentationState) {
    validateMoisturePresentation(state);
    // Replacing an interval must not replay the previous source event on the
    // new moisture progress. Ordinary static source settings remain untouched.
    if (this.waterSourceReview) {
      this.waterSourceReview = undefined;
      this.waterSourceState = { ...this.waterSourceState, rainfallRate: 0, irrigationRate: 0 };
      this.sourceClockMode = 'recycling';
      this.updateWaterSources(true);
    }
    this.moistureTransition.setState(state);
    this.moisturePaused = false;
    this.soilMoisture?.update(); // explicit model start/seek is immediately coherent
    this.updateMoistureDiagnostics(true);
  }

  /** Future model entry point. No simulation/flux integration in this scene. */
  setMoistureTransport(input: MoistureTransportInput, restartFromSnapshot = false) {
    const request = adaptMoistureTransport(input);
    // Ordinary presentation retargeting captures the current render sample.
    // Explicit model-time intervals/trajectories retain their authoritative
    // previous snapshot; a screen transition must never replace model history.
    if (!restartFromSnapshot && this.moistureTransition.progress < 1 &&
      !request.transition?.moistureSamples && !request.transition?.simulationTiming)
      delete request.transition!.startMoisture;
    this.setSoilMoisturePresentation(request);
  }
  setMoisturePaused(paused: boolean) {
    this.moisturePaused = paused; this.updateMoistureDiagnostics(true);
  }
  seekMoistureReview(progress: number) {
    this.moistureTransition.seek(progress); this.moisturePaused = true;
    this.soilMoisture?.update(); this.updateMoistureDiagnostics(true);
    this.updateWaterSources(true);
  }
  setMoistureSimulationTime(simulationTime: number) {
    this.moistureTransition.seekSimulationTime(simulationTime);
    this.moisturePaused = true; // the caller's model clock is authoritative
    this.soilMoisture?.update(); this.updateMoistureDiagnostics(true);
    this.updateWaterSources(true);
  }

  /** Visual activity only: preserve all soil/model state and existing clocks.
   * Rain-fed suppresses irrigation hardware/spray, retaining supplied data. */
  setWaterSourcePresentation(state: WaterSourceState) {
    validateWaterSources(state);
    this.waterSourceState = { ...state }; this.waterSourceReview = undefined;
    this.sourceClockMode = 'recycling';
    this.updateWaterSources(true);
  }

  /** This track samples the EXISTING moisture interval. The caller must first
   * supply its transport/trajectory independently. No source-to-water formula. */
  setWaterSourceReview(plan: WaterSourceReviewPlan) {
    validateWaterSourceReview(plan);
    this.waterSourceReview = { ...plan, samples: plan.samples.map(point=>({...point})) };
    this.updateWaterSources(true);
  }

  setWaterSourceFrame(frame: WaterSourceFrame) {
    validateWaterSources(frame);
    if (!Number.isFinite(frame.timeSeconds) || frame.timeSeconds < 0 ||
      (frame.transportProgress !== undefined && (!Number.isFinite(frame.transportProgress) || frame.transportProgress < 0 || frame.transportProgress > 1)))
      throw new RangeError('Invalid supplied water-source clock/progress.');
    this.waterSourceReview = undefined; this.sourceTime = frame.timeSeconds;
    this.sourceClockMode = 'supplied';
    this.waterSourceState = { waterSystem: frame.waterSystem, rainfallRate: frame.rainfallRate, irrigationRate: frame.irrigationRate };
    if (frame.transportProgress !== undefined) this.seekMoistureReview(frame.transportProgress);
    this.updateWaterSources(true);
  }

  private updateWaterSources(force = false) {
    if (!this.waterSources) return;
    if (this.waterSourceReview) {
      this.waterSourceState = sampleWaterSources(this.waterSourceReview, this.moistureTransition.progress);
      this.sourceTime = this.waterSourceReview.durationSeconds * this.moistureTransition.progress;
    }
    this.waterSources.setState(this.waterSourceState);
    this.renderer.getDrawingBufferSize(this.sourceViewport);
    // Retain the authoritative selected day/rates; freeze only cosmetic travel.
    this.waterSources.update(this.reducedMotion ? 0 : this.sourceTime, this.sourceViewport.x, this.sourceViewport.y);
    const now = performance.now();
    if (force || now-this.lastSourceDiagnostics>100) {
      this.container.dataset.waterSources = JSON.stringify({ ...this.waterSources.userData,
        sharedProgress: this.waterSourceReview ? this.moistureTransition.progress : null,
        clock: this.waterSourceReview ? 'same supplied moisture interval progression' : this.sourceClockMode === 'supplied' ? 'caller-supplied cosmetic sample' : 'cosmetic recycling clock; no event scheduling',
        reducedMotion: this.reducedMotion });
      this.lastSourceDiagnostics=now;
    }
  }

  private updateMoistureDiagnostics(forceUi = false) {
    this.container.dataset.moisture = JSON.stringify({ target: this.moistureTransition.target,
      displayed: this.moistureTransition.displayed, motion: this.moistureTransition.motion,
      transport: this.moistureTransition.cues, paused: this.moisturePaused,
      fronts: this.moistureTransition.fronts,
      simulationTime: this.moistureTransition.simulationTime,
      transitionProgress: this.moistureTransition.progress, authority: 'supplied destination; displayed values are transition samples only',
      fieldsAvailable: this.moistureFieldsAvailable,
      units: 'normalised visual/debug endpoints; not scientific water units',
      rendering: 'organic field composited within opaque soil albedo; roots retain later stencil pass' });
    // Readouts sample the SAME displayed values as the shader. They are not
    // written back to the destination. Throttle React, not the render state.
    const now = performance.now();
    if (forceUi || this.moistureTransition.progress === 1 || now - this.lastMoistureUiTime >= 100) {
      this.lastMoistureUiTime = now;
      this.onMoistureFrame({ displayed: { ...this.moistureTransition.displayed },
        progress: this.moistureTransition.progress, paused: this.moisturePaused,
        waterSources: this.waterSourceReview ? sampleWaterSources(this.waterSourceReview, this.moistureTransition.progress) : {...this.waterSourceState} });
    }
  }

  private updateRootDiagnostics() {
    this.container.dataset.roots = JSON.stringify(this.rootSystems?.userData ?? { count: 0, source: 'not loaded',
      presentation: resolveRootPresentation(this.rootPresentation) });
  }

  setConfig(config: FarmAreaConfig) {
    if (config.farmAreaHa === this.footprint.actualAreaHa) return;
    this.footprint = areaToVisualFootprint(config);
    this.rebuildFarm();
    this.rig.resetView(this.footprint);
  }

  resetView() {
    this.rig.resetView(this.footprint);
  }

  /** Replace planting and its representative crown selections only. Preserve
   * soil materials/topology, water clock, crop state, root state and camera. */
  setWheatPlanting(state: WheatPlantingState) {
    this.setAdaptations({...this.adaptations,widerRows:state.widerRows});
  }

  setStubbleRetention(enabled:boolean){this.setAdaptations({...this.adaptations,stubbleRetention:enabled})}

  setAdaptations(state:AdaptationState){
    if(typeof state.widerRows!=='boolean'||typeof state.stubbleRetention!=='boolean')throw new TypeError('Adaptations must be booleans');
    const plantingChanged=state.widerRows!==this.adaptations.widerRows;
    this.adaptations={stubbleRetention:state.stubbleRetention,widerRows:state.widerRows};
    if(plantingChanged)this.rebuildPlanting();
    if(state.stubbleRetention){this.ensureStubble();void this.loadStubble()}
    else if(this.stubbleLayer){this.stubbleLayer.visible=false;this.sun.shadow.needsUpdate=true}
    this.updateAdaptationDiagnostics();
  }

  private rebuildPlanting() {
    this.wheatField?.disposePresentation();
    for (const previous of [this.wheatField, this.rootSystems]) {
      if (!previous) continue;
      this.farm.remove(previous);
      disposeGeometry(previous, this.wheatAsset, this.rootAsset);
    }
    const wheat = createWheatField(this.footprint, this.wheatAsset, this.adaptations);
    this.wheatField = wheat;
    wheat.setCropPresentation(this.cropTransition.displayed);
    this.farm.add(wheat);
    this.lastCropLod = undefined;
    this.rootSystems = this.rootAsset ? new RootSystems(this.footprint, wheat.rootCrownCandidates(),
      this.rootAsset, this.rootPresentation) : undefined;
    if (this.rootSystems) this.farm.add(this.rootSystems);
    this.updateRootDiagnostics();
    this.updateCropDiagnostics();
    this.container.dataset.widerRows = String(this.adaptations.widerRows);
    this.container.dataset.wheatPlants = String(wheat.userData.plantCount);
    this.container.dataset.wheatPlacement = JSON.stringify(wheat.userData.placement);
    this.sun.shadow.needsUpdate = true;
  }

  private rebuildFarm() {
    if (this.waterSources) { this.scene.remove(this.waterSources); this.waterSources.dispose(); }
    this.soilMoisture?.dispose();
    this.wheatField?.disposePresentation();
    disposeGeometry(this.farm, this.wheatAsset, this.rootAsset);
    this.farm.clear();
    this.stubbleLayer=undefined;
    this.farm.name = 'FarmScene';
    const wheat = createWheatField(this.footprint, this.wheatAsset, this.adaptations);
    this.wheatField = wheat;
    wheat.setCropPresentation(this.cropTransition.displayed);
    this.updateCropDiagnostics();
    this.lastCropLod = undefined;
    const rootCandidates = this.rootAsset ? wheat.rootCrownCandidates() : undefined;
    const soil = createSoilCutaway(this.footprint);
    this.soilMoisture = new SoilMoisture(soil, this.footprint, this.moistureTransition, this.soilAppearance);
    this.soilMoisture.setReducedMotion(this.reducedMotion);
    this.container.dataset.soilAppearance = JSON.stringify(this.soilAppearance);
    if (!this.moistureFieldsAvailable) this.soilMoisture.disableFields();
    this.farm.add(createPaddockBoundary(this.footprint), soil, wheat);
    this.updateMoistureDiagnostics();
    this.rootSystems = this.rootAsset ? new RootSystems(this.footprint, rootCandidates!,
      this.rootAsset, this.rootPresentation) : undefined;
    if (this.rootSystems) this.farm.add(this.rootSystems);
    this.updateRootDiagnostics();
    // The group is never scaled. Only geometry dimensions and positions change.
    const extent = Math.max(this.footprint.width, this.footprint.depth) * 0.75;
    const shadow = this.sun.shadow.camera;
    shadow.left = shadow.bottom = -extent;
    shadow.right = shadow.top = extent;
    shadow.near = 0.5;
    shadow.far = 100;
    shadow.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;
    this.container.dataset.area = String(this.footprint.actualAreaHa);
    this.container.dataset.width = String(this.footprint.width);
    this.container.dataset.soilDepth = String(SOIL_DISPLAY_DEPTH);
    this.container.dataset.layers = String(SOIL_LAYERS.length);
    this.container.dataset.instances = String(wheat.userData.instanceCount);
    this.container.dataset.wheatPlants = String(wheat.userData.plantCount);
    this.container.dataset.wheatPlacement = JSON.stringify(wheat.userData.placement);
    this.container.dataset.widerRows = String(this.adaptations.widerRows);
    this.container.dataset.plantScale = String(wheat.userData.assetScale);
    this.container.dataset.wheatSource = wheat.userData.source;
    this.container.dataset.wheatTriangles = this.wheatAsset
      ? String((this.wheatAsset.geometries.A.index?.count ?? this.wheatAsset.geometries.A.getAttribute('position').count) / 3) : '';
    if(this.adaptations.stubbleRetention)this.ensureStubble();
    this.updateAdaptationDiagnostics();
    this.waterSources = new WaterSources(this.footprint);
    this.scene.add(this.waterSources);
    this.updateWaterSources(true);
  }

  private motionPreferenceChanged = () => {
    this.reducedMotion = this.motionPreference.matches;
    this.soilMoisture?.setReducedMotion(this.reducedMotion);
    this.updateWaterSources(true);
  };

  private resize = () => {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Keep ongoing manual inspection on resize. Initial load frames the farm.
    if (!this.lastTime) this.rig.resetView(this.footprint, true);
    else this.rig.refitIfAtDefault(this.footprint);
  };

  private render = (time: number) => {
    if (this.stopped) return;
    const delta = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.05) : 0.016;
    this.lastTime = time;
    this.rig.update(delta);
    if (this.cropTransition.step(delta)) {
      this.wheatField?.setCropPresentation(this.cropTransition.displayed); this.updateCropDiagnostics();
    }
    if (!this.moisturePaused && this.moistureTransition.step(delta)) {
      this.soilMoisture?.update(); this.updateMoistureDiagnostics();
    }
    if (!this.waterSourceReview && this.sourceClockMode === 'recycling' && !this.reducedMotion) this.sourceTime += delta;
    this.updateWaterSources();
    const cameraState = this.rig.snapshot();
    const atDefault = Math.abs(cameraState.distance - cameraState.defaultDistance) < .001 &&
      Math.abs(cameraState.azimuth - CAMERA_LIMITS.defaultAzimuth) < .001 &&
      Math.abs(cameraState.elevation - CAMERA_LIMITS.defaultElevation) < .001;
    this.wheatField?.updateForCamera(this.camera, atDefault);
    if (this.wheatField && this.lastCropLod !== this.wheatField.userData.lod) {
      this.lastCropLod = this.wheatField.userData.lod;
      this.container.dataset.instances = String(this.wheatField.userData.instanceCount);
      this.container.dataset.wheatLod = JSON.stringify(this.wheatField.userData.lod);
    }
    this.container.dataset.camera = JSON.stringify(cameraState);
    this.renderer.render(this.scene, this.camera);
    this.updateAnnotations();
    this.raf = requestAnimationFrame(this.render);
  };

  private updateAnnotations() {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    let top = 0;
    const labels = this.container.querySelectorAll<HTMLElement>('[data-layer-label]');
    // On small viewports the DOM layer list takes over; no text is lost.
    let previousY = -Infinity;
    const faceAnchor = this.rig.cutawayAnchor();
    SOIL_LAYERS.forEach((layer, index) => {
      const label = labels[index];
      if (!label) return;
      const anchor = new THREE.Vector3(
        faceAnchor.x,
        top - layer.thickness / 2,
        faceAnchor.z,
      ).project(this.camera);
      let y = (1 - anchor.y) / 2 * height;
      y = Math.max(y, previousY + 27);
      const x = (anchor.x + 1) / 2 * width;
      label.style.left = `${Math.max(12, Math.min(width - 120, x))}px`;
      label.style.top = `${Math.max(12, Math.min(height - 30, y))}px`;
      label.style.visibility = anchor.z < 1 && anchor.z > -1 && Math.abs(anchor.x) < 0.9 && y > 12 && y < height - 35 ? 'visible' : 'hidden';
      previousY = y;
      top -= layer.thickness;
    });
  }

  private contextLost = (event: Event) => {
    event.preventDefault();
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.onStatus('unavailable');
  };

  private contextRestored = () => {
    this.stopped = false;
    this.lastTime = 0;
    this.onStatus('ready');
    this.raf = requestAnimationFrame(this.render);
  };

  dispose() {
    this.disposed = true;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.motionPreference.removeEventListener('change', this.motionPreferenceChanged);
    this.rig.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.contextRestored);
    this.wheatField?.disposePresentation();
    this.soilMoisture?.dispose();
    disposeGeometry(this.farm, this.wheatAsset, this.rootAsset);
    this.wheatAsset?.dispose();
    this.rootAsset?.dispose();
    this.stubbleAsset?.dispose();
    this.waterSources?.dispose();
    this.sun.shadow.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
