import { createFaustAudioNode, setFaustParameters, type FaustRealtimeNode, type StereoSamples } from '../faust/runtime.ts';
import type { DspNode, ProjectV2 } from '../domain/types.ts';

type ModuleGraph = {
  node: FaustRealtimeNode;
  update: (dspNode: DspNode, project: ProjectV2) => void;
  dispose: () => void;
};

export type BrowserAudioStatus = { kind: 'warning' | 'error'; message: string };

type ActivePath = {
  input: AudioNode;
  gain: GainNode;
  nodes: AudioNode[];
  modules: Map<string, ModuleGraph>;
};

export function normalizedMixGains(mix: number) {
  const value = Math.max(0, Math.min(1, mix));
  const dry = Math.cos((Math.PI / 2) * value);
  const wet = Math.sin((Math.PI / 2) * value);
  const normalization = Math.max(1, dry + wet);
  return { dry: dry / normalization, wet: wet / normalization };
}

export function projectTopologyKey(project: ProjectV2) {
  return project.chain
    .map((nodeId) => {
      const node = project.nodes[nodeId];
      return node ? `${node.id}:${node.type}:${node.bypassed ? 1 : 0}` : `${nodeId}:missing`;
    })
    .join('|');
}

/** Retained as a deterministic utility for imported v1 project diagnostics. Live Saturation is Faust-powered. */
export function makeSaturationCurve(driveDb: number, points = 2048) {
  const curve = new Float32Array(points);
  const drive = 1 + Math.max(0, driveDb) * 0.32;
  const normalizer = Math.tanh(drive);
  for (let index = 0; index < points; index += 1) {
    const x = (index / (points - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * drive) / normalizer;
  }
  return curve;
}

export function createDemoSamples(sampleRate: number, durationSeconds = 4) {
  const length = Math.floor(sampleRate * durationSeconds);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const chord = [110, 138.59, 164.81, 220];
  let randomState = 0x2f6e2b1;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0xffffffff * 2 - 1;
  };

  for (let sample = 0; sample < length; sample += 1) {
    const time = sample / sampleRate;
    const beatTime = time % 0.5;
    const eighthTime = time % 0.25;
    const kickPhase = 2 * Math.PI * (48 * beatTime + 3.8 * (1 - Math.exp(-beatTime * 18)));
    const kick = Math.sin(kickPhase) * Math.exp(-beatTime * 13) * 0.42;
    const hat = random() * Math.exp(-eighthTime * 70) * 0.06;
    const barPulse = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, (time % 2) * 2));
    let harmonicLeft = 0;
    let harmonicRight = 0;
    chord.forEach((frequency, index) => {
      const weight = 0.045 / (1 + index * 0.32);
      harmonicLeft += Math.sin(2 * Math.PI * frequency * time + index * 0.25) * weight;
      harmonicLeft += Math.sin(2 * Math.PI * frequency * 2 * time) * weight * 0.24;
      harmonicRight += Math.sin(2 * Math.PI * frequency * 1.003 * time + index * 0.42) * weight;
      harmonicRight += Math.sin(2 * Math.PI * frequency * 2.006 * time) * weight * 0.24;
    });
    left[sample] = Math.tanh((harmonicLeft * barPulse + kick + hat) * 1.3) * 0.7;
    right[sample] = Math.tanh((harmonicRight * barPulse + kick * 0.96 + hat * 0.82) * 1.3) * 0.7;
  }
  return { left, right };
}

function meterValue(analyser: AnalyserNode | null) {
  if (!analyser) return { level: 0, peak: 0 };
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  let peak = 0;
  for (const sample of samples) {
    sum += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const rms = Math.sqrt(sum / samples.length);
  const level = rms <= 0.00001 ? 0 : Math.min(1, Math.max(0, (20 * Math.log10(rms) + 60) / 60));
  return { level, peak };
}

export class BrowserAudioEngine {
  private context: AudioContext | null = null;
  private sourceBus: GainNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private sourceBuffer: AudioBuffer | null = null;
  private activePath: ActivePath | null = null;
  private moduleGraphs = new Map<string, ModuleGraph>();
  private project: ProjectV2 | null = null;
  private bypassed = false;
  private playing = false;
  private comparisonGain = 1;
  private rebuildGeneration = 0;
  private error: string | null = null;
  private statusListener: ((status: BrowserAudioStatus) => void) | null = null;

  get isPlaying() {
    return this.playing;
  }

  get lastError() {
    return this.error;
  }

  setStatusListener(listener: ((status: BrowserAudioStatus) => void) | null) {
    this.statusListener = listener;
  }

  async ensureContext() {
    if (this.context) return this.context;
    if (typeof AudioContext === 'undefined') throw new Error('This browser does not provide the Web Audio features required for auditioning.');
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.sourceBus = this.context.createGain();
    this.inputAnalyser = this.context.createAnalyser();
    this.inputAnalyser.fftSize = 512;
    this.outputAnalyser = this.context.createAnalyser();
    this.outputAnalyser.fftSize = 512;
    this.dryGain = this.context.createGain();
    this.dryGain.gain.value = 1;
    this.wetGain = this.context.createGain();
    this.wetGain.gain.value = 0;
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.82;
    this.sourceBus.connect(this.inputAnalyser);
    this.inputAnalyser.connect(this.dryGain);
    this.dryGain.connect(this.outputAnalyser);
    this.wetGain.connect(this.outputAnalyser);
    this.outputAnalyser.connect(this.masterGain).connect(this.context.destination);
    this.sourceBuffer = this.createDemoBuffer();
    if (this.project) this.rebuildGraph();
    return this.context;
  }

  setProject(project: ProjectV2) {
    const previousTopology = this.project ? projectTopologyKey(this.project) : null;
    this.project = project;
    if (!this.context) return;
    if (previousTopology !== projectTopologyKey(project)) this.rebuildGraph();
    else this.updateGraphParameters();
  }

  async loadFile(file: File) {
    const context = await this.ensureContext();
    const data = await file.arrayBuffer();
    this.sourceBuffer = await context.decodeAudioData(data.slice(0));
    if (this.playing) await this.restart();
  }

  useDemo() {
    if (!this.context) return;
    this.sourceBuffer = this.createDemoBuffer();
  }

  async play() {
    const context = await this.ensureContext();
    await context.resume();
    if (this.playing || !this.sourceBus) return;
    if (!this.sourceBuffer) this.sourceBuffer = this.createDemoBuffer();
    const source = context.createBufferSource();
    source.buffer = this.sourceBuffer;
    source.loop = true;
    source.connect(this.sourceBus);
    source.start();
    this.currentSource = source;
    this.playing = true;
  }

  stop() {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* source may already be stopped */ }
      this.currentSource.disconnect();
    }
    this.currentSource = null;
    this.playing = false;
  }

  async restart() {
    this.stop();
    await this.play();
  }

  setBypass(bypassed: boolean) {
    this.bypassed = bypassed;
    this.applyBypassGains();
  }

  setLoudnessMatchGain(gain: number) {
    this.comparisonGain = Number.isFinite(gain) ? Math.max(0.125, Math.min(8, gain)) : 1;
    this.applyBypassGains();
  }

  getMeters() {
    const input = meterValue(this.inputAnalyser);
    const output = meterValue(this.outputAnalyser);
    return { input: input.level, output: output.level, inputPeak: input.peak, outputPeak: output.peak };
  }

  getAuditionSamples(): { samples: StereoSamples; sampleRate: number } | null {
    if (!this.sourceBuffer) return null;
    const left = Float32Array.from(this.sourceBuffer.getChannelData(0));
    const right = this.sourceBuffer.numberOfChannels > 1 ? Float32Array.from(this.sourceBuffer.getChannelData(1)) : Float32Array.from(left);
    return { samples: [left, right], sampleRate: this.sourceBuffer.sampleRate };
  }

  dispose() {
    this.stop();
    this.rebuildGeneration += 1;
    if (this.activePath) this.disposePath(this.activePath);
    this.activePath = null;
    this.moduleGraphs.clear();
    void this.context?.close();
    this.context = null;
  }

  private createDemoBuffer() {
    if (!this.context) throw new Error('Audio context is not ready.');
    const samples = createDemoSamples(this.context.sampleRate);
    const buffer = this.context.createBuffer(2, samples.left.length, this.context.sampleRate);
    buffer.copyToChannel(samples.left, 0);
    buffer.copyToChannel(samples.right, 1);
    return buffer;
  }

  private disposePath(path: ActivePath) {
    try { this.inputAnalyser?.disconnect(path.input); } catch { /* path may already be disconnected */ }
    path.modules.forEach((graph) => {
      try { graph.dispose(); } catch { /* processor may already be disposed */ }
    });
    path.nodes.forEach((node) => {
      try { node.disconnect(); } catch { /* node may already be disconnected */ }
    });
  }

  private rebuildGraph() {
    const generation = ++this.rebuildGeneration;
    void this.buildGraphPath(generation).catch((cause) => {
      if (generation !== this.rebuildGeneration) return;
      this.error = cause instanceof Error ? cause.message : 'The Faust AudioWorklet graph could not be built.';
      this.statusListener?.({ kind: 'error', message: `Low-latency effects are unavailable: ${this.error}` });
      this.bypassed = true;
      this.applyBypassGains();
    });
  }

  private async buildGraphPath(generation: number) {
    if (!this.context || !this.project || !this.inputAnalyser || !this.wetGain) return;
    const context = this.context;
    const snapshot = structuredClone(this.project);
    const modules = new Map<string, ModuleGraph>();
    const nodes: AudioNode[] = [];
    let input: AudioNode | null = null;
    let current: AudioNode = this.inputAnalyser;

    try {
      for (const nodeId of snapshot.chain) {
        const dspNode = snapshot.nodes[nodeId];
        if (!dspNode || dspNode.bypassed) continue;
        const faustNode = await createFaustAudioNode(context, dspNode, snapshot);
        if (generation !== this.rebuildGeneration) {
          faustNode.destroy();
          modules.forEach((graph) => graph.dispose());
          return;
        }
        const graph: ModuleGraph = {
          node: faustNode,
          update: (nextNode, nextProject) => setFaustParameters(faustNode, nextNode, nextProject),
          dispose: () => faustNode.destroy(),
        };
        current.connect(faustNode);
        if (!input) input = faustNode;
        current = faustNode;
        nodes.push(faustNode);
        modules.set(nodeId, graph);
      }

      const pathGain = context.createGain();
      pathGain.gain.value = 0;
      current.connect(pathGain);
      pathGain.connect(this.wetGain);
      input ??= pathGain;
      nodes.push(pathGain);
      const nextPath: ActivePath = { input, gain: pathGain, nodes, modules };

      if (generation !== this.rebuildGeneration) {
        this.disposePath(nextPath);
        return;
      }

      const previousPath = this.activePath;
      this.activePath = nextPath;
      this.moduleGraphs = modules;
      this.error = null;
      this.updateGraphParameters();
      const now = context.currentTime;
      pathGain.gain.setValueAtTime(0, now);
      pathGain.gain.linearRampToValueAtTime(1, now + 0.03);
      if (previousPath) {
        previousPath.gain.gain.cancelScheduledValues(now);
        previousPath.gain.gain.setValueAtTime(previousPath.gain.gain.value, now);
        previousPath.gain.gain.linearRampToValueAtTime(0, now + 0.03);
        window.setTimeout(() => this.disposePath(previousPath), 45);
      }
      this.applyBypassGains(0.03);
    } catch (error) {
      modules.forEach((graph) => graph.dispose());
      nodes.forEach((node) => { try { node.disconnect(); } catch { /* node may be detached */ } });
      throw error;
    }
  }

  private updateGraphParameters() {
    if (!this.project) return;
    for (const nodeId of this.project.chain) {
      const node = this.project.nodes[nodeId];
      if (!node || node.bypassed) continue;
      this.moduleGraphs.get(nodeId)?.update(node, this.project);
    }
  }

  private applyBypassGains(duration = 0.02) {
    if (!this.context || !this.dryGain || !this.wetGain) return;
    const now = this.context.currentTime;
    const shouldUseDry = this.bypassed || !this.activePath;
    this.dryGain.gain.cancelScheduledValues(now);
    this.wetGain.gain.cancelScheduledValues(now);
    this.dryGain.gain.setValueAtTime(this.dryGain.gain.value, now);
    this.wetGain.gain.setValueAtTime(this.wetGain.gain.value, now);
    this.dryGain.gain.linearRampToValueAtTime(shouldUseDry ? 1 : 0, now + duration);
    this.wetGain.gain.linearRampToValueAtTime(shouldUseDry ? 0 : this.comparisonGain, now + duration);
  }
}
