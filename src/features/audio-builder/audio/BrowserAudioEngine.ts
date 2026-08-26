import { getEffectiveParameter } from '../domain/parameters.ts';
import type { DspNode, ProjectV1 } from '../domain/types.ts';

type ModuleGraph = {
  input: AudioNode;
  output: AudioNode;
  nodes: AudioNode[];
  update: (node: DspNode) => void;
  dispose?: () => void;
};

const dbToGain = (db: number) => 10 ** (db / 20);
export function normalizedMixGains(mix: number) {
  const value = Math.max(0, Math.min(1, mix));
  const dry = Math.cos((Math.PI / 2) * value);
  const wet = Math.sin((Math.PI / 2) * value);
  const normalization = Math.max(1, dry + wet);
  return { dry: dry / normalization, wet: wet / normalization };
}

export function projectTopologyKey(project: ProjectV1) {
  return project.chain
    .map((nodeId) => {
      const node = project.nodes[nodeId];
      return node ? `${node.id}:${node.type}:${node.bypassed ? 1 : 0}` : `${nodeId}:missing`;
    })
    .join('|');
}

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
  if (!analyser) return 0;
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  if (rms <= 0.00001) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(rms) + 60) / 60));
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
  private graphNodes: AudioNode[] = [];
  private moduleGraphs = new Map<string, ModuleGraph>();
  private project: ProjectV1 | null = null;
  private bypassed = false;
  private playing = false;

  get isPlaying() {
    return this.playing;
  }

  async ensureContext() {
    if (this.context) return this.context;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.sourceBus = this.context.createGain();
    this.inputAnalyser = this.context.createAnalyser();
    this.inputAnalyser.fftSize = 512;
    this.outputAnalyser = this.context.createAnalyser();
    this.outputAnalyser.fftSize = 512;
    this.dryGain = this.context.createGain();
    this.wetGain = this.context.createGain();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.82;
    this.sourceBus.connect(this.inputAnalyser);
    this.outputAnalyser.connect(this.masterGain).connect(this.context.destination);
    this.sourceBuffer = this.createDemoBuffer();
    if (this.project) this.rebuildGraph();
    return this.context;
  }

  setProject(project: ProjectV1) {
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

  getMeters() {
    return { input: meterValue(this.inputAnalyser), output: meterValue(this.outputAnalyser) };
  }

  dispose() {
    this.stop();
    this.clearGraph();
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

  private clearGraph() {
    this.moduleGraphs.forEach((graph) => {
      try { graph.dispose?.(); } catch { /* processor may already be disposed */ }
    });
    this.moduleGraphs.clear();
    this.graphNodes.forEach((node) => {
      try { node.disconnect(); } catch { /* already disconnected */ }
    });
    this.graphNodes = [];
    try { this.inputAnalyser?.disconnect(); } catch { /* already disconnected */ }
    try { this.dryGain?.disconnect(); } catch { /* already disconnected */ }
    try { this.wetGain?.disconnect(); } catch { /* already disconnected */ }
  }

  private rebuildGraph() {
    if (!this.context || !this.project || !this.inputAnalyser || !this.outputAnalyser || !this.dryGain || !this.wetGain) return;
    const now = this.context.currentTime;
    this.dryGain.gain.cancelScheduledValues(now);
    this.wetGain.gain.cancelScheduledValues(now);
    this.dryGain.gain.setValueAtTime(0, now);
    this.wetGain.gain.setValueAtTime(0, now);
    this.clearGraph();

    this.inputAnalyser.connect(this.dryGain);
    this.dryGain.connect(this.outputAnalyser);
    let current: AudioNode = this.inputAnalyser;
    for (const nodeId of this.project.chain) {
      const node = this.project.nodes[nodeId];
      if (!node || node.bypassed) continue;
      const graph = this.createModuleGraph(node);
      current.connect(graph.input);
      current = graph.output;
      this.graphNodes.push(...graph.nodes);
      this.moduleGraphs.set(node.id, graph);
    }
    current.connect(this.wetGain);
    this.wetGain.connect(this.outputAnalyser);
    this.applyBypassGains(0.028);
  }

  private updateGraphParameters() {
    if (!this.project) return;
    for (const nodeId of this.project.chain) {
      const node = this.project.nodes[nodeId];
      if (!node || node.bypassed) continue;
      this.moduleGraphs.get(nodeId)?.update(node);
    }
  }

  private smooth(parameter: AudioParam, target: number, timeConstant = 0.012) {
    if (!this.context || !Number.isFinite(target)) return;
    const now = this.context.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.setTargetAtTime(target, now, timeConstant);
  }

  private applyBypassGains(duration = 0.02) {
    if (!this.context || !this.dryGain || !this.wetGain) return;
    const now = this.context.currentTime;
    this.dryGain.gain.cancelScheduledValues(now);
    this.wetGain.gain.cancelScheduledValues(now);
    this.dryGain.gain.setValueAtTime(this.dryGain.gain.value, now);
    this.wetGain.gain.setValueAtTime(this.wetGain.gain.value, now);
    this.dryGain.gain.linearRampToValueAtTime(this.bypassed ? 1 : 0, now + duration);
    this.wetGain.gain.linearRampToValueAtTime(this.bypassed ? 0 : 1, now + duration);
  }

  private value(node: DspNode, paramId: string) {
    if (!this.project) return node.params[paramId];
    return getEffectiveParameter(this.project, node.id, paramId);
  }

  private mixGraph(input: GainNode, output: GainNode, processedOutput: AudioNode, mixPercent: number, extraNodes: AudioNode[]) {
    if (!this.context) throw new Error('Audio context is not ready.');
    const dry = this.context.createGain();
    const wet = this.context.createGain();
    const initial = normalizedMixGains(mixPercent / 100);
    dry.gain.value = initial.dry;
    wet.gain.value = initial.wet;
    input.connect(dry).connect(output);
    processedOutput.connect(wet).connect(output);
    return {
      nodes: [input, output, dry, wet, ...extraNodes],
      update: (nextMixPercent: number) => {
        const next = normalizedMixGains(nextMixPercent / 100);
        this.smooth(dry.gain, next.dry);
        this.smooth(wet.gain, next.wet);
      },
    };
  }

  private createModuleGraph(node: DspNode): ModuleGraph {
    if (!this.context) throw new Error('Audio context is not ready.');
    const context = this.context;
    const input = context.createGain();
    const output = context.createGain();

    if (node.type === 'gain') {
      input.gain.value = dbToGain(this.value(node, 'level'));
      input.connect(output);
      return {
        input, output, nodes: [input, output],
        update: (next) => this.smooth(input.gain, dbToGain(this.value(next, 'level'))),
      };
    }

    if (node.type === 'high_pass' || node.type === 'low_pass' || node.type === 'parametric_eq') {
      const filter = context.createBiquadFilter();
      if (node.type === 'high_pass') {
        filter.type = 'highpass';
        filter.frequency.value = this.value(node, 'cutoff');
        filter.Q.value = this.value(node, 'resonance');
      } else if (node.type === 'low_pass') {
        filter.type = 'lowpass';
        filter.frequency.value = this.value(node, 'cutoff');
        filter.Q.value = this.value(node, 'resonance');
      } else {
        filter.type = 'peaking';
        filter.frequency.value = this.value(node, 'frequency');
        filter.gain.value = this.value(node, 'gain');
        filter.Q.value = this.value(node, 'q');
      }
      input.connect(filter).connect(output);
      return {
        input, output, nodes: [input, output, filter],
        update: (next) => {
          if (next.type === 'parametric_eq') {
            this.smooth(filter.frequency, this.value(next, 'frequency'));
            this.smooth(filter.gain, this.value(next, 'gain'));
            this.smooth(filter.Q, this.value(next, 'q'));
          } else {
            this.smooth(filter.frequency, this.value(next, 'cutoff'));
            this.smooth(filter.Q, this.value(next, 'resonance'));
          }
        },
      };
    }

    if (node.type === 'compressor') {
      const compressor = context.createDynamicsCompressor();
      const makeup = context.createGain();
      compressor.threshold.value = this.value(node, 'threshold');
      compressor.ratio.value = this.value(node, 'ratio');
      compressor.attack.value = this.value(node, 'attack') / 1000;
      compressor.release.value = this.value(node, 'release') / 1000;
      compressor.knee.value = 12;
      makeup.gain.value = dbToGain(this.value(node, 'makeup'));
      input.connect(compressor).connect(makeup).connect(output);
      return {
        input, output, nodes: [input, output, compressor, makeup],
        update: (next) => {
          this.smooth(compressor.threshold, this.value(next, 'threshold'));
          this.smooth(compressor.ratio, this.value(next, 'ratio'));
          this.smooth(compressor.attack, this.value(next, 'attack') / 1000);
          this.smooth(compressor.release, this.value(next, 'release') / 1000);
          this.smooth(makeup.gain, dbToGain(this.value(next, 'makeup')));
        },
      };
    }

    if (node.type === 'saturation') {
      const drive = context.createGain();
      const shaper = context.createWaveShaper();
      const tone = context.createBiquadFilter();
      let lastDrive = this.value(node, 'drive');
      drive.gain.value = dbToGain(lastDrive * 0.5);
      shaper.curve = makeSaturationCurve(lastDrive) as Float32Array<ArrayBuffer>;
      shaper.oversample = '4x';
      tone.type = 'lowpass';
      tone.frequency.value = this.value(node, 'tone');
      input.connect(drive).connect(shaper).connect(tone);
      const mix = this.mixGraph(input, output, tone, this.value(node, 'mix'), [drive, shaper, tone]);
      return {
        input, output, nodes: mix.nodes,
        update: (next) => {
          const nextDrive = this.value(next, 'drive');
          this.smooth(drive.gain, dbToGain(nextDrive * 0.5));
          if (nextDrive !== lastDrive) {
            shaper.curve = makeSaturationCurve(nextDrive) as Float32Array<ArrayBuffer>;
            lastDrive = nextDrive;
          }
          this.smooth(tone.frequency, this.value(next, 'tone'));
          mix.update(this.value(next, 'mix'));
        },
      };
    }

    if (node.type === 'delay') {
      const delay = context.createDelay(1.5);
      const filter = context.createBiquadFilter();
      const feedback = context.createGain();
      delay.delayTime.value = this.value(node, 'time') / 1000;
      filter.type = 'lowpass';
      filter.frequency.value = this.value(node, 'tone');
      feedback.gain.value = this.value(node, 'feedback') / 100;
      input.connect(delay);
      delay.connect(filter).connect(feedback).connect(delay);
      const mix = this.mixGraph(input, output, filter, this.value(node, 'mix'), [delay, filter, feedback]);
      return {
        input, output, nodes: mix.nodes,
        update: (next) => {
          this.smooth(delay.delayTime, this.value(next, 'time') / 1000, 0.018);
          this.smooth(filter.frequency, this.value(next, 'tone'));
          this.smooth(feedback.gain, this.value(next, 'feedback') / 100);
          mix.update(this.value(next, 'mix'));
        },
      };
    }

    if (node.type === 'reverb') {
      const convolverA = context.createConvolver();
      const convolverB = context.createConvolver();
      const impulseA = context.createGain();
      const impulseB = context.createGain();
      const tone = context.createBiquadFilter();
      let lastDecay = this.value(node, 'decay');
      let lastImpulseTone = this.value(node, 'tone');
      let activeA = true;
      let impulseTimer: ReturnType<typeof setTimeout> | null = null;
      convolverA.buffer = this.createImpulseResponse(lastDecay, lastImpulseTone);
      impulseA.gain.value = 1;
      impulseB.gain.value = 0;
      tone.type = 'lowpass';
      tone.frequency.value = lastImpulseTone;
      input.connect(convolverA).connect(impulseA).connect(tone);
      input.connect(convolverB).connect(impulseB).connect(tone);
      const mix = this.mixGraph(input, output, tone, this.value(node, 'mix'), [convolverA, convolverB, impulseA, impulseB, tone]);
      return {
        input, output, nodes: mix.nodes,
        update: (next) => {
          const decay = this.value(next, 'decay');
          const toneHz = this.value(next, 'tone');
          this.smooth(tone.frequency, toneHz);
          mix.update(this.value(next, 'mix'));
          if (decay === lastDecay && toneHz === lastImpulseTone) return;
          lastDecay = decay;
          lastImpulseTone = toneHz;
          if (impulseTimer !== null) clearTimeout(impulseTimer);
          impulseTimer = setTimeout(() => {
            impulseTimer = null;
            if (!this.context) return;
            const inactiveConvolver = activeA ? convolverB : convolverA;
            const activeGain = activeA ? impulseA : impulseB;
            const inactiveGain = activeA ? impulseB : impulseA;
            inactiveConvolver.buffer = this.createImpulseResponse(lastDecay, lastImpulseTone);
            const now = this.context.currentTime;
            activeGain.gain.cancelScheduledValues(now);
            inactiveGain.gain.cancelScheduledValues(now);
            activeGain.gain.setValueAtTime(activeGain.gain.value, now);
            inactiveGain.gain.setValueAtTime(0, now);
            activeGain.gain.linearRampToValueAtTime(0, now + 0.06);
            inactiveGain.gain.linearRampToValueAtTime(1, now + 0.06);
            activeA = !activeA;
          }, 140);
        },
        dispose: () => {
          if (impulseTimer !== null) clearTimeout(impulseTimer);
        },
      };
    }

    if (node.type === 'chorus') {
      const delay = context.createDelay(0.08);
      const oscillator = context.createOscillator();
      const depth = context.createGain();
      delay.delayTime.value = 0.016;
      oscillator.frequency.value = this.value(node, 'rate');
      depth.gain.value = this.value(node, 'depth') / 1000;
      oscillator.connect(depth).connect(delay.delayTime);
      oscillator.start();
      input.connect(delay);
      const mix = this.mixGraph(input, output, delay, this.value(node, 'mix'), [delay, oscillator, depth]);
      return {
        input, output, nodes: mix.nodes,
        update: (next) => {
          this.smooth(oscillator.frequency, this.value(next, 'rate'));
          this.smooth(depth.gain, this.value(next, 'depth') / 1000);
          mix.update(this.value(next, 'mix'));
        },
        dispose: () => oscillator.stop(),
      };
    }

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = this.value(node, 'ceiling');
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = this.value(node, 'release') / 1000;
    input.connect(limiter).connect(output);
    return {
      input, output, nodes: [input, output, limiter],
      update: (next) => {
        this.smooth(limiter.threshold, this.value(next, 'ceiling'));
        this.smooth(limiter.release, this.value(next, 'release') / 1000);
      },
    };
  }

  private createImpulseResponse(decaySeconds: number, toneHz: number) {
    if (!this.context) throw new Error('Audio context is not ready.');
    const sampleRate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * Math.min(8, decaySeconds)));
    const buffer = this.context.createBuffer(2, length, sampleRate);
    let randomState = Math.max(1, Math.round(decaySeconds * 1000 + toneHz));
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let previous = 0;
      const smoothing = Math.max(0.02, Math.min(0.92, 1 - toneHz / 20000));
      for (let index = 0; index < length; index += 1) {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        const noise = randomState / 0xffffffff * 2 - 1;
        previous = previous * smoothing + noise * (1 - smoothing);
        const envelope = (1 - index / length) ** 2.6;
        data[index] = previous * envelope * 0.72;
      }
    }
    return buffer;
  }
}
