export type ModuleType = 'gain' | 'filter' | 'saturation' | 'delay' | 'reverb' | 'chorus' | 'compressor' | 'phaser' | 'autowah' | 'stutter' | 'equalizer' | 'limiter' | 'flanger' | 'tremolo';
export type ParameterScale = 'linear' | 'log';
export type ParameterKind = 'continuous' | 'choice';

export interface ParameterChoice {
  value: number;
  label: string;
}

export interface ParameterDefinition {
  id: string;
  name: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit: 'dB' | 'Hz' | '%' | 'Q' | 'mode' | 'type' | 'ms' | 's' | 'ratio' | 'degrees';
  scale: ParameterScale;
  kind: ParameterKind;
  choices?: ParameterChoice[];
  mappable: boolean;
  faustPath: string;
}

export interface ModuleDefinition {
  type: ModuleType;
  name: string;
  shortName: string;
  description: string;
  definitionVersion: '0.1.0';
  sourceSha256: string;
  wasmSha256: string;
  wasmPath: string;
  metadataPath: string;
  parameters: ParameterDefinition[];
}

export interface DspNode {
  id: string;
  type: ModuleType;
  params: Record<string, number>;
  bypassed: boolean;
}

export interface MacroMapping {
  id: string;
  nodeId: string;
  paramId: string;
  min: number;
  max: number;
  inverted: boolean;
}

export interface MacroControl {
  id: string;
  name: string;
  value: number;
  mappings: MacroMapping[];
}

export interface ActivityItem {
  id: string;
  actor: 'human' | 'agent' | 'system';
  summary: string;
  timestamp: string;
}

export interface EngineProvenance {
  effectDefinition: 'audio-effect-builder-faust';
  definitionVersion: '0.1.0';
  faustWasmVersion: '0.16.6';
  faustCompilerVersion: '2.85.9';
  libraries: {
    analyzers: '1.3.0';
    basics: '1.22.0';
    delays: '1.2.0';
    filters: '1.7.1';
    maths: '2.9.0';
    misceffects: '2.5.2';
    oscillators: '1.7.0';
    platform: '1.3.0';
    reverbs: '1.5.1';
    routes: '1.3.0';
    compressors: '1.6.0';
    phaflangers: '1.1.0';
    signals: '1.6.0';
  };
  moduleSourceSha256: Record<ModuleType, string>;
}

export interface LegacyMigrationRecord {
  sourceSchemaVersion: 1;
  migratedAt: string;
  unsupportedModuleTypes: string[];
  legacyBackup: LegacyProjectV1;
}

export interface ProjectV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  revision: number;
  engine: EngineProvenance;
  chain: string[];
  nodes: Record<string, DspNode>;
  macros: MacroControl[];
  activity: ActivityItem[];
  migration?: LegacyMigrationRecord;
}

/** @deprecated Kept as a source-compatible alias for the original browser MVP. */
export type ProjectV1 = ProjectV2;

export interface LegacyDspNodeV1 {
  id: string;
  type: string;
  params: Record<string, number>;
  bypassed: boolean;
}

export interface LegacyProjectV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  chain: string[];
  nodes: Record<string, LegacyDspNodeV1>;
  macros: MacroControl[];
  activity: Array<Omit<ActivityItem, 'actor'> & { actor: 'human' | 'agent' }>;
}

export type ProjectCommand =
  | { type: 'rename_project'; name: string }
  | { type: 'clear_project' }
  | { type: 'add_module'; moduleType: ModuleType; index?: number; nodeId?: string }
  | { type: 'set_parameter'; nodeId: string; paramId: string; value: number }
  | { type: 'move_module'; nodeId: string; index: number }
  | { type: 'set_bypass'; nodeId: string; bypassed: boolean }
  | { type: 'disconnect_module'; nodeId: string }
  | { type: 'connect_module'; nodeId: string; index?: number }
  | { type: 'delete_module'; nodeId: string }
  | { type: 'create_macro'; name?: string; macroId?: string }
  | { type: 'rename_macro'; macroId: string; name: string }
  | { type: 'set_macro_value'; macroId: string; value: number }
  | {
      type: 'add_mapping';
      macroId: string;
      nodeId: string;
      paramId: string;
      min: number;
      max: number;
      inverted?: boolean;
      mappingId?: string;
    }
  | {
      type: 'update_mapping';
      macroId: string;
      mappingId: string;
      nodeId?: string;
      paramId?: string;
      min?: number;
      max?: number;
      inverted?: boolean;
    }
  | { type: 'remove_mapping'; macroId: string; mappingId: string }
  | { type: 'delete_macro'; macroId: string };

const parameter = (
  id: string,
  name: string,
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  unit: ParameterDefinition['unit'],
  scale: ParameterScale,
  faustPath: string,
  options: Partial<Pick<ParameterDefinition, 'kind' | 'choices' | 'mappable'>> = {},
): ParameterDefinition => ({
  id,
  name,
  min,
  max,
  default: defaultValue,
  step,
  unit,
  scale,
  kind: options.kind ?? 'continuous',
  choices: options.choices,
  mappable: options.mappable ?? true,
  faustPath,
});

export const MODULE_CATALOG: Record<ModuleType, ModuleDefinition> = {
  gain: {
    type: 'gain', name: 'Gain', shortName: 'GAIN', description: 'Clean level adjustment.', definitionVersion: '0.1.0',
    sourceSha256: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
    wasmSha256: '54303a27ef533cc9f5b9983e6c0621174d42e92c0e8f645bde0bbdaa74e8fb87',
    wasmPath: '/faust/gain/dsp-module.wasm', metadataPath: '/faust/gain/dsp-meta.json',
    parameters: [parameter('level', 'Level', -24, 24, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Gain/Gain_Level')],
  },
  filter: {
    type: 'filter', name: 'Filter', shortName: 'FILT', description: 'Remove lows or highs with resonant shaping.', definitionVersion: '0.1.0',
    sourceSha256: '076d102ec4209b0a9e33d4199e302896a3951017e88a1e821ec106347c03ee7f',
    wasmSha256: '39ac96e8aff15297cf241ee4033f160a725bfd6bae26254696a0c9fd99eed69a',
    wasmPath: '/faust/filter/dsp-module.wasm', metadataPath: '/faust/filter/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 3, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Filter/Filter_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'High Pass' }, { value: 1, label: 'Low Pass' }, { value: 2, label: 'Band Pass' }, { value: 3, label: 'Notch' }], mappable: false,
      }),
      parameter('cutoff', 'Cutoff', 20, 20000, 80, 1, 'Hz', 'log', '/Audio_Effect_Builder_Filter/Filter_Cutoff'),
      parameter('resonance', 'Resonance', 0.1, 20, 0.7, 0.1, 'Q', 'log', '/Audio_Effect_Builder_Filter/Filter_Resonance'),
    ],
  },
  saturation: {
    type: 'saturation', name: 'Saturation', shortName: 'SAT', description: 'Add harmonic color and weight.', definitionVersion: '0.1.0',
    sourceSha256: '9074635f03744b4b4f280eac15839585716d4a23a732ac7c59e26eb1c3bab068',
    wasmSha256: '05cea5472644ff2ad0d19234d05a3e411e73fd0a52800b192790d1bc04adcbf1',
    wasmPath: '/faust/saturation/dsp-module.wasm', metadataPath: '/faust/saturation/dsp-meta.json',
    parameters: [
      parameter('character', 'Character', 0, 3, 0, 1, 'type', 'linear', '/Audio_Effect_Builder_Saturation/Saturation_Character', {
        kind: 'choice', choices: [{ value: 0, label: 'Soft Clip' }, { value: 1, label: 'Cubic' }, { value: 2, label: 'Fuzz' }, { value: 3, label: 'Tape' }], mappable: false,
      }),
      parameter('drive', 'Drive', 0, 24, 6, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Saturation/Saturation_Drive'),
      parameter('tone', 'Tone', 200, 16000, 8000, 1, 'Hz', 'log', '/Audio_Effect_Builder_Saturation/Saturation_Tone'),
      parameter('mix', 'Mix', 0, 100, 50, 1, '%', 'linear', '/Audio_Effect_Builder_Saturation/Saturation_Mix'),
      parameter('output', 'Output', -24, 24, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Saturation/Saturation_Output'),
      parameter('bias', 'Bias', -1, 1, 0, 0.01, '%', 'linear', '/Audio_Effect_Builder_Saturation/Saturation_Bias'),
      parameter('clip', 'Clip', 0.1, 1, 0.5, 0.01, '%', 'linear', '/Audio_Effect_Builder_Saturation/Saturation_Clip'),
      parameter('age', 'Age', 0, 100, 0, 1, '%', 'linear', '/Audio_Effect_Builder_Saturation/Saturation_Age'),
      parameter('wow', 'Wow', 0, 100, 0, 1, '%', 'linear', '/Audio_Effect_Builder_Saturation/Saturation_Wow'),
    ],
  },
  delay: {
    type: 'delay', name: 'Delay', shortName: 'DLY', description: 'Add rhythmic stereo echoes.', definitionVersion: '0.1.0',
    sourceSha256: 'fb9a020e31f2b4f290a17ad2a18ec5d87c6f701195af2bc95e38f2d99cef1b92',
    wasmSha256: '6a5495bfa670ef8435cd8a2bf282f16e64e5a447ef3b5dbeabff3f4e77cba99c',
    wasmPath: '/faust/delay/dsp-module.wasm', metadataPath: '/faust/delay/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 2, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Delay/Delay_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'Digital' }, { value: 1, label: 'Ping-Pong' }, { value: 2, label: 'Tape' }], mappable: false,
      }),
      parameter('time', 'Time', 20, 2000, 250, 1, 'ms', 'log', '/Audio_Effect_Builder_Delay/Delay_Time'),
      parameter('feedback', 'Feedback', 0, 90, 30, 1, '%', 'linear', '/Audio_Effect_Builder_Delay/Delay_Feedback'),
      parameter('tone', 'Tone', 500, 16000, 8000, 1, 'Hz', 'log', '/Audio_Effect_Builder_Delay/Delay_Tone'),
      parameter('mix', 'Mix', 0, 100, 25, 1, '%', 'linear', '/Audio_Effect_Builder_Delay/Delay_Mix'),
      parameter('output', 'Output', -24, 12, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Delay/Delay_Output'),
    ],
  },
  reverb: {
    type: 'reverb', name: 'Reverb', shortName: 'VERB', description: 'Create depth with shared spatial voicings.', definitionVersion: '0.1.0',
    sourceSha256: 'bec502b0ca2f0b01dd7c10051cd848417f24ca0eb45b73c2854a49da54abb5ff',
    wasmSha256: 'd03ff0e330e877212436fed13d983036605d29b5aac719775abc45be402ba12a',
    wasmPath: '/faust/reverb/dsp-module.wasm', metadataPath: '/faust/reverb/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 2, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Reverb/Reverb_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'Room' }, { value: 1, label: 'Hall' }, { value: 2, label: 'Plate' }], mappable: false,
      }),
      parameter('preDelay', 'Pre Delay', 0, 200, 20, 1, 'ms', 'linear', '/Audio_Effect_Builder_Reverb/Reverb_Pre_Delay'),
      parameter('decay', 'Decay', 0.2, 12, 2, 0.1, 's', 'log', '/Audio_Effect_Builder_Reverb/Reverb_Decay'),
      parameter('size', 'Size', 0, 100, 50, 1, '%', 'linear', '/Audio_Effect_Builder_Reverb/Reverb_Size'),
      parameter('damping', 'Damping', 0, 100, 35, 1, '%', 'linear', '/Audio_Effect_Builder_Reverb/Reverb_Damping'),
      parameter('mix', 'Mix', 0, 100, 20, 1, '%', 'linear', '/Audio_Effect_Builder_Reverb/Reverb_Mix'),
      parameter('output', 'Output', -24, 12, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Reverb/Reverb_Output'),
    ],
  },
  chorus: {
    type: 'chorus', name: 'Chorus', shortName: 'CHR', description: 'Add modulated width and ensemble movement.', definitionVersion: '0.1.0',
    sourceSha256: '19432a2946b7711dc6f4d694e3fdc5c665df67dddbcadc59622c4052539aa419',
    wasmSha256: '76fe0d8e4c7245c12a21bb91e8f2bd8af5c3ca610ec48553f29939e2b9527759',
    wasmPath: '/faust/chorus/dsp-module.wasm', metadataPath: '/faust/chorus/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 2, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Chorus/Chorus_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'Classic' }, { value: 1, label: 'Wide' }, { value: 2, label: 'Ensemble' }], mappable: false,
      }),
      parameter('rate', 'Rate', 0.05, 8, 0.8, 0.01, 'Hz', 'log', '/Audio_Effect_Builder_Chorus/Chorus_Rate'),
      parameter('depth', 'Depth', 0, 100, 35, 1, '%', 'linear', '/Audio_Effect_Builder_Chorus/Chorus_Depth'),
      parameter('delay', 'Delay', 5, 30, 15, 0.1, 'ms', 'linear', '/Audio_Effect_Builder_Chorus/Chorus_Delay'),
      parameter('mix', 'Mix', 0, 100, 30, 1, '%', 'linear', '/Audio_Effect_Builder_Chorus/Chorus_Mix'),
      parameter('output', 'Output', -24, 12, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Chorus/Chorus_Output'),
    ],
  },
  compressor: {
    type: 'compressor', name: 'Compressor', shortName: 'COMP', description: 'Control dynamics with linked stereo compression.', definitionVersion: '0.1.0',
    sourceSha256: '5c63fd9f14183aae0c1b3b1cd4a22cf674623bb39a6508218d1857599b8232d6',
    wasmSha256: '5b8c083fea87784b1005ad39ca9b37be255d8852b6d96e4e6e2abb6447d14631',
    wasmPath: '/faust/compressor/dsp-module.wasm', metadataPath: '/faust/compressor/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 2, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Compressor/Compressor_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'Clean' }, { value: 1, label: 'Punch' }, { value: 2, label: 'Glue' }], mappable: false,
      }),
      parameter('threshold', 'Threshold', -48, 0, -18, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Compressor/Compressor_Threshold'),
      parameter('ratio', 'Ratio', 1, 20, 4, 0.1, 'ratio', 'log', '/Audio_Effect_Builder_Compressor/Compressor_Ratio'),
      parameter('attack', 'Attack', 0.1, 200, 20, 0.1, 'ms', 'log', '/Audio_Effect_Builder_Compressor/Compressor_Attack'),
      parameter('release', 'Release', 20, 2000, 250, 1, 'ms', 'log', '/Audio_Effect_Builder_Compressor/Compressor_Release'),
      parameter('makeup', 'Makeup', -12, 24, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Compressor/Compressor_Makeup'),
      parameter('mix', 'Mix', 0, 100, 100, 1, '%', 'linear', '/Audio_Effect_Builder_Compressor/Compressor_Mix'),
    ],
  },
  phaser: {
    type: 'phaser', name: 'Phaser', shortName: 'PHAS', description: 'Add sweeping all-pass movement and stereo depth.', definitionVersion: '0.1.0',
    sourceSha256: 'b812485b365ccf92ba7fb8680feced1b3ce27b86a568c8634ca6ce949c827c04',
    wasmSha256: 'efb34fc50e334da4c1b2c3886a35906f359881ddba8aabd52f123cd4f525741c',
    wasmPath: '/faust/phaser/dsp-module.wasm', metadataPath: '/faust/phaser/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 2, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Phaser/Phaser_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'Classic' }, { value: 1, label: 'Wide' }, { value: 2, label: 'Deep' }], mappable: false,
      }),
      parameter('rate', 'Rate', 0.05, 5, 0.5, 0.01, 'Hz', 'log', '/Audio_Effect_Builder_Phaser/Phaser_Rate'),
      parameter('depth', 'Depth', 0, 100, 60, 1, '%', 'linear', '/Audio_Effect_Builder_Phaser/Phaser_Depth'),
      parameter('center', 'Center', 100, 2000, 700, 1, 'Hz', 'log', '/Audio_Effect_Builder_Phaser/Phaser_Center'),
      parameter('feedback', 'Feedback', -85, 85, 15, 1, '%', 'linear', '/Audio_Effect_Builder_Phaser/Phaser_Feedback'),
      parameter('mix', 'Mix', 0, 100, 50, 1, '%', 'linear', '/Audio_Effect_Builder_Phaser/Phaser_Mix'),
      parameter('output', 'Output', -24, 12, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Phaser/Phaser_Output'),
    ],
  },
  autowah: {
    type: 'autowah', name: 'Auto Wah', shortName: 'WAH', description: 'Add touch-sensitive resonant filter movement.', definitionVersion: '0.1.0',
    sourceSha256: '26001c6599cf9b72c57290b26498233f076d278ec1b7bdecbe40be04c3448443',
    wasmSha256: '73320b19493169576de250765d2b76fa51160366b7cafc3f19bbdd9f28ba67a9',
    wasmPath: '/faust/autowah/dsp-module.wasm', metadataPath: '/faust/autowah/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 3, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Auto_Wah/Auto_Wah_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'Low Pass Up' }, { value: 1, label: 'Low Pass Down' }, { value: 2, label: 'High Pass Up' }, { value: 3, label: 'High Pass Down' }], mappable: false,
      }),
      parameter('sensitivity', 'Sensitivity', -24, 24, 12, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Auto_Wah/Auto_Wah_Sensitivity'),
      parameter('attack', 'Attack', 1, 100, 10, 1, 'ms', 'log', '/Audio_Effect_Builder_Auto_Wah/Auto_Wah_Attack'),
      parameter('release', 'Release', 20, 1000, 180, 1, 'ms', 'log', '/Audio_Effect_Builder_Auto_Wah/Auto_Wah_Release'),
      parameter('frequency', 'Frequency', 100, 2000, 300, 1, 'Hz', 'log', '/Audio_Effect_Builder_Auto_Wah/Auto_Wah_Frequency'),
      parameter('range', 'Range', 0, 100, 70, 1, '%', 'linear', '/Audio_Effect_Builder_Auto_Wah/Auto_Wah_Range'),
      parameter('resonance', 'Resonance', 0.5, 10, 3, 0.1, 'Q', 'log', '/Audio_Effect_Builder_Auto_Wah/Auto_Wah_Resonance'),
      parameter('mix', 'Mix', 0, 100, 100, 1, '%', 'linear', '/Audio_Effect_Builder_Auto_Wah/Auto_Wah_Mix'),
      parameter('output', 'Output', -24, 12, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Auto_Wah/Auto_Wah_Output'),
    ],
  },
  stutter: {
    type: 'stutter', name: 'Stutter', shortName: 'STUT', description: 'Capture, chop, reverse, and alternate rhythmic slices.', definitionVersion: '0.1.0',
    sourceSha256: 'b5f10b05476725a477d1b2df078a932b2ccb68e079b2e5dd908dba5c89b790d9',
    wasmSha256: '7aa1dcb42b72e95aa06cc3d67c7bf6d5ec9a557cf5a43d6162e1ae66ec3230eb',
    wasmPath: '/faust/stutter/dsp-module.wasm', metadataPath: '/faust/stutter/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 3, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Stutter/Stutter_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'Repeat' }, { value: 1, label: 'Gate' }, { value: 2, label: 'Reverse' }, { value: 3, label: 'Ping-Pong' }], mappable: false,
      }),
      parameter('rate', 'Rate', 1, 20, 8, 0.1, 'Hz', 'log', '/Audio_Effect_Builder_Stutter/Stutter_Rate'),
      parameter('repeats', 'Repeats', 1, 8, 3, 1, 'type', 'linear', '/Audio_Effect_Builder_Stutter/Stutter_Repeats', {
        kind: 'choice', choices: [{ value: 1, label: '1x' }, { value: 2, label: '2x' }, { value: 3, label: '3x' }, { value: 4, label: '4x' }, { value: 6, label: '6x' }, { value: 8, label: '8x' }], mappable: false,
      }),
      parameter('gate', 'Gate', 25, 100, 85, 1, '%', 'linear', '/Audio_Effect_Builder_Stutter/Stutter_Gate'),
      parameter('mix', 'Mix', 0, 100, 100, 1, '%', 'linear', '/Audio_Effect_Builder_Stutter/Stutter_Mix'),
      parameter('output', 'Output', -24, 12, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Stutter/Stutter_Output'),
    ],
  },
  equalizer: {
    type: 'equalizer', name: '3-Band EQ', shortName: 'EQ3', description: 'Shape lows, mids, and highs with three independent bands.', definitionVersion: '0.1.0',
    sourceSha256: '0ee8adecb250e184c1c2f15d8630c13acb193945bc815d87110dfee1bb14c25a',
    wasmSha256: '12fb431e7ed255a30f9a979c44fd63b72729cf377914b091f04f91285bdeca7c',
    wasmPath: '/faust/equalizer/dsp-module.wasm', metadataPath: '/faust/equalizer/dsp-meta.json',
    parameters: [
      parameter('lowGain', 'Low Gain', -18, 18, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_3-Band_EQ/3-Band_EQ_Low_Gain'),
      parameter('lowFrequency', 'Low Frequency', 40, 500, 120, 1, 'Hz', 'log', '/Audio_Effect_Builder_3-Band_EQ/3-Band_EQ_Low_Frequency'),
      parameter('midGain', 'Mid Gain', -18, 18, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_3-Band_EQ/3-Band_EQ_Mid_Gain'),
      parameter('midFrequency', 'Mid Frequency', 200, 8000, 1000, 1, 'Hz', 'log', '/Audio_Effect_Builder_3-Band_EQ/3-Band_EQ_Mid_Frequency'),
      parameter('midQ', 'Mid Q', 0.2, 10, 1, 0.1, 'Q', 'log', '/Audio_Effect_Builder_3-Band_EQ/3-Band_EQ_Mid_Q'),
      parameter('highGain', 'High Gain', -18, 18, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_3-Band_EQ/3-Band_EQ_High_Gain'),
      parameter('highFrequency', 'High Frequency', 2000, 16000, 8000, 1, 'Hz', 'log', '/Audio_Effect_Builder_3-Band_EQ/3-Band_EQ_High_Frequency'),
      parameter('output', 'Output', -24, 12, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_3-Band_EQ/3-Band_EQ_Output'),
    ],
  },
  limiter: {
    type: 'limiter', name: 'Limiter', shortName: 'LIM', description: 'Control sample peaks with linked stereo limiting.', definitionVersion: '0.1.0',
    sourceSha256: '5564b1c1f20994bf827916a3e877f125c15ca19c70879918fe64a3e1eeda1bf6',
    wasmSha256: '60aa6c10c035b0bffb823f3106d8d348c0fe59be57a065dd6e04bca4b04f7091',
    wasmPath: '/faust/limiter/dsp-module.wasm', metadataPath: '/faust/limiter/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 3, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Limiter/Limiter_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'Transparent' }, { value: 1, label: 'Punch' }, { value: 2, label: 'Brickwall' }, { value: 3, label: 'Soft Clip' }], mappable: false,
      }),
      parameter('input', 'Input', 0, 24, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Limiter/Limiter_Input'),
      parameter('ceiling', 'Ceiling', -12, 0, -1, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Limiter/Limiter_Ceiling'),
      parameter('lookahead', 'Lookahead', 0, 10, 5, 0.1, 'ms', 'linear', '/Audio_Effect_Builder_Limiter/Limiter_Lookahead'),
      parameter('release', 'Release', 10, 500, 100, 1, 'ms', 'log', '/Audio_Effect_Builder_Limiter/Limiter_Release'),
      parameter('softness', 'Softness', 0, 100, 20, 1, '%', 'linear', '/Audio_Effect_Builder_Limiter/Limiter_Softness'),
    ],
  },
  flanger: {
    type: 'flanger', name: 'Flanger', shortName: 'FLNG', description: 'Create moving comb-filter sweeps with short modulated delays.', definitionVersion: '0.1.0',
    sourceSha256: 'b66905707f0238d73e8230793edfeac787136aa6fa1608fbe4dc6d48e5aea9b4',
    wasmSha256: 'ebbf4306323211a06c267dafaefb4b238b56ce538c2f1292ea5d85820f973c0e',
    wasmPath: '/faust/flanger/dsp-module.wasm', metadataPath: '/faust/flanger/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 3, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Flanger/Flanger_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'Classic' }, { value: 1, label: 'Stereo' }, { value: 2, label: 'Jet' }, { value: 3, label: 'Through-Zero' }], mappable: false,
      }),
      parameter('rate', 'Rate', 0.05, 10, 0.3, 0.01, 'Hz', 'log', '/Audio_Effect_Builder_Flanger/Flanger_Rate'),
      parameter('depth', 'Depth', 0, 100, 60, 1, '%', 'linear', '/Audio_Effect_Builder_Flanger/Flanger_Depth'),
      parameter('delay', 'Delay', 0.1, 10, 2, 0.1, 'ms', 'log', '/Audio_Effect_Builder_Flanger/Flanger_Delay'),
      parameter('feedback', 'Feedback', 0, 95, 35, 1, '%', 'linear', '/Audio_Effect_Builder_Flanger/Flanger_Feedback'),
      parameter('stereo', 'Stereo', 0, 180, 90, 1, 'degrees', 'linear', '/Audio_Effect_Builder_Flanger/Flanger_Stereo'),
      parameter('mix', 'Mix', 0, 100, 50, 1, '%', 'linear', '/Audio_Effect_Builder_Flanger/Flanger_Mix'),
      parameter('output', 'Output', -24, 12, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Flanger/Flanger_Output'),
    ],
  },
  tremolo: {
    type: 'tremolo', name: 'Tremolo', shortName: 'TREM', description: 'Add linked, panned, stereo, or chopped amplitude movement.', definitionVersion: '0.1.0',
    sourceSha256: 'c32438699b15eeefaa04630fe662e529233ee8a58d2d227548e556b87e7a5b2f',
    wasmSha256: 'fcd740fc6d557c1768dd197f62caf119eba0072c6ba723d43f1b2ba9e74cffdd',
    wasmPath: '/faust/tremolo/dsp-module.wasm', metadataPath: '/faust/tremolo/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 3, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Tremolo/Tremolo_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'Tremolo' }, { value: 1, label: 'Auto-Pan' }, { value: 2, label: 'Stereo Tremolo' }, { value: 3, label: 'Pulse/Chop' }], mappable: false,
      }),
      parameter('rate', 'Rate', 0.05, 20, 4, 0.01, 'Hz', 'log', '/Audio_Effect_Builder_Tremolo/Tremolo_Rate'),
      parameter('depth', 'Depth', 0, 100, 50, 1, '%', 'linear', '/Audio_Effect_Builder_Tremolo/Tremolo_Depth'),
      parameter('shape', 'Shape', 0, 100, 25, 1, '%', 'linear', '/Audio_Effect_Builder_Tremolo/Tremolo_Shape'),
      parameter('stereo', 'Stereo Phase', 0, 180, 90, 1, 'degrees', 'linear', '/Audio_Effect_Builder_Tremolo/Tremolo_Stereo_Phase'),
      parameter('mix', 'Mix', 0, 100, 100, 1, '%', 'linear', '/Audio_Effect_Builder_Tremolo/Tremolo_Mix'),
      parameter('output', 'Output', -24, 12, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Tremolo/Tremolo_Output'),
    ],
  },
};

export const MODULE_TYPES = Object.keys(MODULE_CATALOG) as ModuleType[];
export const PRE_PAIR1_ENGINE_PROVENANCE = Object.freeze({
  effectDefinition: 'audio-effect-builder-faust', definitionVersion: '0.1.0', faustWasmVersion: '0.16.6', faustCompilerVersion: '2.85.9',
  libraries: { basics: '1.22.0', filters: '1.7.1', maths: '2.9.0', platform: '1.3.0', signals: '1.6.0' },
  moduleSourceSha256: {
    gain: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
    filter: '873e26b2ca7ac309783f154f4becd1fc479d046cd295d0ae732aa81cfbc931eb',
    saturation: 'f8a7bbe451c3abd30e4c61fd6210ea3b6a2fef2ae5b67fda2c49c2890969bbf1',
  },
});
const PRE_CANONICAL_COMPILER_ENGINE_PROVENANCE = Object.freeze({
  ...PRE_PAIR1_ENGINE_PROVENANCE,
  faustCompilerVersion: '2.86.2',
  libraries: { ...PRE_PAIR1_ENGINE_PROVENANCE.libraries, basics: '1.23.0' },
});
const PRE_SATURATION_V2_ENGINE_PROVENANCE = Object.freeze({
  ...PRE_PAIR1_ENGINE_PROVENANCE,
  moduleSourceSha256: {
    ...PRE_PAIR1_ENGINE_PROVENANCE.moduleSourceSha256,
    saturation: '238cd373e164ba480c6367ae7ef1c071205346361c7f597d6c1dc3878af0a75b',
  },
});
// The first Pair 1 release used these exact sources.  Its projects remain
// valid inputs but are upgraded to the more audible, same-contract DSP set.
export const PRE_AUDIBILITY_ENGINE_PROVENANCE = Object.freeze({
  effectDefinition: 'audio-effect-builder-faust', definitionVersion: '0.1.0', faustWasmVersion: '0.16.6', faustCompilerVersion: '2.85.9',
  libraries: { analyzers: '1.3.0', basics: '1.22.0', delays: '1.2.0', filters: '1.7.1', maths: '2.9.0', misceffects: '2.5.2', oscillators: '1.7.0', platform: '1.3.0', reverbs: '1.5.1', signals: '1.6.0' },
  moduleSourceSha256: {
    gain: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
    filter: '6918312c734213e2476c899588f4917a0d7dfc469196ce0aec718d22e03c25d6',
    saturation: 'f8a7bbe451c3abd30e4c61fd6210ea3b6a2fef2ae5b67fda2c49c2890969bbf1',
    delay: 'ffb3c7f559aeedd613450d814c910552faca1129651f05cfc846a3511876c647',
    reverb: '95310a51570124fe27680d0946cf54c8316ec96e6afa3ce0ac619c61676adda3',
  },
});
export const PRE_CHORUS_COMPRESSOR_ENGINE_PROVENANCE = Object.freeze({
  effectDefinition: 'audio-effect-builder-faust', definitionVersion: '0.1.0', faustWasmVersion: '0.16.6', faustCompilerVersion: '2.85.9',
  libraries: { analyzers: '1.3.0', basics: '1.22.0', delays: '1.2.0', filters: '1.7.1', maths: '2.9.0', misceffects: '2.5.2', oscillators: '1.7.0', platform: '1.3.0', reverbs: '1.5.1', signals: '1.6.0' },
  moduleSourceSha256: {
    gain: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
    filter: '076d102ec4209b0a9e33d4199e302896a3951017e88a1e821ec106347c03ee7f',
    saturation: '9074635f03744b4b4f280eac15839585716d4a23a732ac7c59e26eb1c3bab068',
    delay: 'fb9a020e31f2b4f290a17ad2a18ec5d87c6f701195af2bc95e38f2d99cef1b92',
    reverb: 'bec502b0ca2f0b01dd7c10051cd848417f24ca0eb45b73c2854a49da54abb5ff',
  },
});
export const PRE_PHASER_COMPRESSOR_MODES_ENGINE_PROVENANCE = Object.freeze({
  effectDefinition: 'audio-effect-builder-faust', definitionVersion: '0.1.0', faustWasmVersion: '0.16.6', faustCompilerVersion: '2.85.9',
  libraries: { analyzers: '1.3.0', basics: '1.22.0', compressors: '1.6.0', delays: '1.2.0', filters: '1.7.1', maths: '2.9.0', misceffects: '2.5.2', oscillators: '1.7.0', platform: '1.3.0', reverbs: '1.5.1', signals: '1.6.0' },
  moduleSourceSha256: {
    gain: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
    filter: '076d102ec4209b0a9e33d4199e302896a3951017e88a1e821ec106347c03ee7f',
    saturation: '9074635f03744b4b4f280eac15839585716d4a23a732ac7c59e26eb1c3bab068',
    delay: 'fb9a020e31f2b4f290a17ad2a18ec5d87c6f701195af2bc95e38f2d99cef1b92',
    reverb: 'bec502b0ca2f0b01dd7c10051cd848417f24ca0eb45b73c2854a49da54abb5ff',
    chorus: '19432a2946b7711dc6f4d694e3fdc5c665df67dddbcadc59622c4052539aa419',
    compressor: '8440fc44c50c362eb6287707d90a9e10033db2d9a5a0a662ef22a93d90db4ff9',
  },
});
export const PRE_AUTOWAH_STUTTER_ENGINE_PROVENANCE = Object.freeze({
  effectDefinition: 'audio-effect-builder-faust', definitionVersion: '0.1.0', faustWasmVersion: '0.16.6', faustCompilerVersion: '2.85.9',
  libraries: { analyzers: '1.3.0', basics: '1.22.0', compressors: '1.6.0', delays: '1.2.0', filters: '1.7.1', maths: '2.9.0', misceffects: '2.5.2', oscillators: '1.7.0', phaflangers: '1.1.0', platform: '1.3.0', reverbs: '1.5.1', signals: '1.6.0' },
  moduleSourceSha256: {
    gain: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
    filter: '076d102ec4209b0a9e33d4199e302896a3951017e88a1e821ec106347c03ee7f',
    saturation: '9074635f03744b4b4f280eac15839585716d4a23a732ac7c59e26eb1c3bab068',
    delay: 'fb9a020e31f2b4f290a17ad2a18ec5d87c6f701195af2bc95e38f2d99cef1b92',
    reverb: 'bec502b0ca2f0b01dd7c10051cd848417f24ca0eb45b73c2854a49da54abb5ff',
    chorus: '19432a2946b7711dc6f4d694e3fdc5c665df67dddbcadc59622c4052539aa419',
    compressor: '5c63fd9f14183aae0c1b3b1cd4a22cf674623bb39a6508218d1857599b8232d6',
    phaser: 'b812485b365ccf92ba7fb8680feced1b3ce27b86a568c8634ca6ce949c827c04',
  },
});
export const PRE_EQ_LIMITER_FLANGER_ENGINE_PROVENANCE = Object.freeze({
  effectDefinition: 'audio-effect-builder-faust', definitionVersion: '0.1.0', faustWasmVersion: '0.16.6', faustCompilerVersion: '2.85.9',
  libraries: { analyzers: '1.3.0', basics: '1.22.0', compressors: '1.6.0', delays: '1.2.0', filters: '1.7.1', maths: '2.9.0', misceffects: '2.5.2', oscillators: '1.7.0', phaflangers: '1.1.0', platform: '1.3.0', reverbs: '1.5.1', routes: '1.3.0', signals: '1.6.0' },
  moduleSourceSha256: {
    gain: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
    filter: '076d102ec4209b0a9e33d4199e302896a3951017e88a1e821ec106347c03ee7f',
    saturation: '9074635f03744b4b4f280eac15839585716d4a23a732ac7c59e26eb1c3bab068',
    delay: 'fb9a020e31f2b4f290a17ad2a18ec5d87c6f701195af2bc95e38f2d99cef1b92',
    reverb: 'bec502b0ca2f0b01dd7c10051cd848417f24ca0eb45b73c2854a49da54abb5ff',
    chorus: '19432a2946b7711dc6f4d694e3fdc5c665df67dddbcadc59622c4052539aa419',
    compressor: '5c63fd9f14183aae0c1b3b1cd4a22cf674623bb39a6508218d1857599b8232d6',
    phaser: 'b812485b365ccf92ba7fb8680feced1b3ce27b86a568c8634ca6ce949c827c04',
    autowah: '26001c6599cf9b72c57290b26498233f076d278ec1b7bdecbe40be04c3448443',
    stutter: 'b5f10b05476725a477d1b2df078a932b2ccb68e079b2e5dd908dba5c89b790d9',
  },
});
export const PRE_TREMOLO_ENGINE_PROVENANCE = Object.freeze({
  effectDefinition: 'audio-effect-builder-faust', definitionVersion: '0.1.0', faustWasmVersion: '0.16.6', faustCompilerVersion: '2.85.9',
  libraries: { analyzers: '1.3.0', basics: '1.22.0', compressors: '1.6.0', delays: '1.2.0', filters: '1.7.1', maths: '2.9.0', misceffects: '2.5.2', oscillators: '1.7.0', phaflangers: '1.1.0', platform: '1.3.0', reverbs: '1.5.1', routes: '1.3.0', signals: '1.6.0' },
  moduleSourceSha256: {
    gain: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
    filter: '076d102ec4209b0a9e33d4199e302896a3951017e88a1e821ec106347c03ee7f',
    saturation: '9074635f03744b4b4f280eac15839585716d4a23a732ac7c59e26eb1c3bab068',
    delay: 'fb9a020e31f2b4f290a17ad2a18ec5d87c6f701195af2bc95e38f2d99cef1b92',
    reverb: 'bec502b0ca2f0b01dd7c10051cd848417f24ca0eb45b73c2854a49da54abb5ff',
    chorus: '19432a2946b7711dc6f4d694e3fdc5c665df67dddbcadc59622c4052539aa419',
    compressor: '5c63fd9f14183aae0c1b3b1cd4a22cf674623bb39a6508218d1857599b8232d6',
    phaser: 'b812485b365ccf92ba7fb8680feced1b3ce27b86a568c8634ca6ce949c827c04',
    autowah: '26001c6599cf9b72c57290b26498233f076d278ec1b7bdecbe40be04c3448443',
    stutter: 'b5f10b05476725a477d1b2df078a932b2ccb68e079b2e5dd908dba5c89b790d9',
    equalizer: '0ee8adecb250e184c1c2f15d8630c13acb193945bc815d87110dfee1bb14c25a',
    limiter: '5564b1c1f20994bf827916a3e877f125c15ca19c70879918fe64a3e1eeda1bf6',
    flanger: 'b66905707f0238d73e8230793edfeac787136aa6fa1608fbe4dc6d48e5aea9b4',
  },
});
export const ENGINE_PROVENANCE: EngineProvenance = {
  effectDefinition: 'audio-effect-builder-faust', definitionVersion: '0.1.0', faustWasmVersion: '0.16.6', faustCompilerVersion: '2.85.9',
  libraries: { analyzers: '1.3.0', basics: '1.22.0', compressors: '1.6.0', delays: '1.2.0', filters: '1.7.1', maths: '2.9.0', misceffects: '2.5.2', oscillators: '1.7.0', phaflangers: '1.1.0', platform: '1.3.0', reverbs: '1.5.1', routes: '1.3.0', signals: '1.6.0' },
  moduleSourceSha256: Object.fromEntries(MODULE_TYPES.map((type) => [type, MODULE_CATALOG[type].sourceSha256])) as Record<ModuleType, string>,
};

export const STORAGE_KEY = 'audio-effect-builder.project.v2';
export const LAST_VALID_STORAGE_KEY = 'audio-effect-builder.project.v2.last-valid';
export const LEGACY_STORAGE_KEY = 'audio-effect-builder.project.v1';

export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createInitialProject(): ProjectV2 {
  return {
    schemaVersion: 2, id: makeId('project'), name: 'Name your plugin', revision: 0, engine: structuredClone(ENGINE_PROVENANCE),
    chain: [], nodes: {}, macros: [], activity: [],
  };
}

export function createNode(type: ModuleType, id = makeId('node')): DspNode {
  const params = Object.fromEntries(MODULE_CATALOG[type].parameters.map((definition) => [definition.id, definition.default]));
  return { id, type, params, bypassed: false };
}

export function getParameterDefinition(node: DspNode, paramId: string) {
  return MODULE_CATALOG[node.type].parameters.find((definition) => definition.id === paramId);
}

export function getMappingForParameter(project: ProjectV2, nodeId: string, paramId: string) {
  for (const macro of project.macros) {
    const mapping = macro.mappings.find((candidate) => candidate.nodeId === nodeId && candidate.paramId === paramId);
    if (mapping) return { macro, mapping };
  }
  return null;
}

export function interpolateParameter(definition: ParameterDefinition, min: number, max: number, normalized: number) {
  const t = clamp(normalized, 0, 1);
  if (definition.scale === 'log' && min > 0 && max > 0) return Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * t);
  return min + (max - min) * t;
}

export function getEffectiveParameter(project: ProjectV2, nodeId: string, paramId: string) {
  const node = project.nodes[nodeId];
  if (!node) throw new Error(`Unknown node: ${nodeId}`);
  const owner = getMappingForParameter(project, nodeId, paramId);
  if (!owner) return node.params[paramId];
  const definition = getParameterDefinition(node, paramId);
  if (!definition) throw new Error(`Unknown parameter: ${paramId}`);
  const t = owner.mapping.inverted ? 1 - owner.macro.value : owner.macro.value;
  return interpolateParameter(definition, owner.mapping.min, owner.mapping.max, t);
}

export function formatParameter(definition: ParameterDefinition, value: number) {
  if (definition.kind === 'choice') return definition.choices?.find((choice) => choice.value === value)?.label ?? String(value);
  if (definition.unit === 'Hz' && definition.max <= 20) return `${value.toFixed(value < 1 ? 2 : 1)} Hz`;
  if (definition.unit === 'Hz') return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} kHz` : `${Math.round(value)} Hz`;
  if (definition.unit === '%') return `${Math.round(value)}%`;
  if (definition.unit === 'Q') return value.toFixed(2);
  if (definition.unit === 'ms') return `${Math.round(value)} ms`;
  if (definition.unit === 's') return `${value.toFixed(1)} s`;
  if (definition.unit === 'ratio') return `${value.toFixed(1)}:1`;
  if (definition.unit === 'degrees') return `${Math.round(value)}°`;
  return `${value.toFixed(1)} dB`;
}

function requireNode(project: ProjectV2, nodeId: string) {
  const node = project.nodes[nodeId];
  if (!node) throw new Error(`Module ${nodeId} does not exist.`);
  return node;
}

function requireMacro(project: ProjectV2, macroId: string) {
  const macro = project.macros.find((candidate) => candidate.id === macroId);
  if (!macro) throw new Error(`Macro ${macroId} does not exist.`);
  return macro;
}

function validateMacroName(project: ProjectV2, name: string, ignoreId?: string) {
  const clean = name.trim();
  if (!clean || clean.length > 24) throw new Error('Control names must contain 1–24 characters.');
  if (project.macros.some((macro) => macro.id !== ignoreId && macro.name.toLowerCase() === clean.toLowerCase())) throw new Error('Control names must be unique.');
  return clean;
}

function validateIndex(index: number, max: number, action: string) {
  if (!Number.isInteger(index) || index < 0 || index > max) throw new Error(`${action} index must be between 0 and ${max}.`);
  return index;
}

function validateNativeValue(definition: ParameterDefinition, value: number, label = definition.name) {
  if (!Number.isFinite(value) || value < definition.min || value > definition.max) throw new Error(`${label} must be between ${definition.min} and ${definition.max}.`);
  if (definition.kind === 'choice' && !definition.choices?.some((choice) => choice.value === value)) throw new Error(`${label} is not a supported choice.`);
  return value;
}

function validateMappingTarget(project: ProjectV2, nodeId: string, paramId: string, ignoreMappingId?: string) {
  const node = requireNode(project, nodeId);
  const definition = getParameterDefinition(node, paramId);
  if (!definition) throw new Error(`Parameter ${paramId} does not exist on ${MODULE_CATALOG[node.type].name}.`);
  if (!definition.mappable) throw new Error(`${definition.name} cannot be assigned to a control in this version.`);
  const occupied = project.macros.some((macro) => macro.mappings.some((mapping) => mapping.id !== ignoreMappingId && mapping.nodeId === nodeId && mapping.paramId === paramId));
  if (occupied) throw new Error('A DSP parameter can be controlled by only one control.');
  return definition;
}

function describeCommand(project: ProjectV2, command: ProjectCommand) {
  if (command.type === 'rename_project') return `Renamed project to ${command.name.trim()}`;
  if (command.type === 'clear_project') return 'Cleared all primitives and controls';
  if (command.type === 'add_module') return `Added ${MODULE_CATALOG[command.moduleType].name}`;
  if ('nodeId' in command && typeof command.nodeId === 'string' && project.nodes[command.nodeId]) {
    const moduleName = MODULE_CATALOG[project.nodes[command.nodeId].type].name;
    if (command.type === 'set_parameter') return `Adjusted ${moduleName}`;
    if (command.type === 'move_module') return `Reordered ${moduleName}`;
    if (command.type === 'set_bypass') return `${command.bypassed ? 'Bypassed' : 'Enabled'} ${moduleName}`;
    if (command.type === 'disconnect_module') return `Disconnected ${moduleName}`;
    if (command.type === 'connect_module') return `Reconnected ${moduleName}`;
    if (command.type === 'delete_module') return `Deleted ${moduleName}`;
  }
  if (command.type === 'create_macro') return 'Created a plugin control';
  if (command.type === 'rename_macro') return 'Renamed a plugin control';
  if (command.type === 'set_macro_value') return `Adjusted ${requireMacro(project, command.macroId).name}`;
  if (command.type === 'add_mapping') return `Mapped ${requireMacro(project, command.macroId).name}`;
  if (command.type === 'update_mapping') return `Updated ${requireMacro(project, command.macroId).name} mapping`;
  if (command.type === 'remove_mapping') return `Removed ${requireMacro(project, command.macroId).name} mapping`;
  if (command.type === 'delete_macro') return `Deleted ${requireMacro(project, command.macroId).name}`;
  return 'Updated project';
}

function applyOne(project: ProjectV2, command: ProjectCommand) {
  switch (command.type) {
    case 'rename_project': {
      const name = command.name.trim();
      if (!name || name.length > 64) throw new Error('Project names must contain 1–64 characters.');
      project.name = name;
      return;
    }
    case 'clear_project':
      project.chain = [];
      project.nodes = {};
      project.macros = [];
      delete project.migration;
      return;
    case 'add_module': {
      if (!MODULE_CATALOG[command.moduleType]) throw new Error(`Unknown module type: ${String(command.moduleType)}`);
      const node = createNode(command.moduleType, command.nodeId);
      if (project.nodes[node.id]) throw new Error(`Module ID ${node.id} already exists.`);
      const index = command.index === undefined ? project.chain.length : validateIndex(command.index, project.chain.length, 'Insert');
      project.nodes[node.id] = node;
      project.chain.splice(index, 0, node.id);
      return;
    }
    case 'set_parameter': {
      const node = requireNode(project, command.nodeId);
      const definition = getParameterDefinition(node, command.paramId);
      if (!definition) throw new Error(`Unknown parameter: ${command.paramId}`);
      if (getMappingForParameter(project, command.nodeId, command.paramId)) throw new Error('Mapped parameters must be adjusted through their macro.');
      node.params[command.paramId] = validateNativeValue(definition, command.value);
      return;
    }
    case 'move_module': {
      requireNode(project, command.nodeId);
      if (!project.chain.includes(command.nodeId)) throw new Error('Only connected modules can be reordered.');
      const remaining = project.chain.filter((id) => id !== command.nodeId);
      const index = validateIndex(command.index, remaining.length, 'Move');
      remaining.splice(index, 0, command.nodeId);
      project.chain = remaining;
      return;
    }
    case 'set_bypass':
      requireNode(project, command.nodeId).bypassed = Boolean(command.bypassed);
      return;
    case 'disconnect_module':
      requireNode(project, command.nodeId);
      project.chain = project.chain.filter((id) => id !== command.nodeId);
      return;
    case 'connect_module': {
      requireNode(project, command.nodeId);
      const remaining = project.chain.filter((id) => id !== command.nodeId);
      const index = command.index === undefined ? remaining.length : validateIndex(command.index, remaining.length, 'Connect');
      remaining.splice(index, 0, command.nodeId);
      project.chain = remaining;
      return;
    }
    case 'delete_module':
      requireNode(project, command.nodeId);
      project.chain = project.chain.filter((id) => id !== command.nodeId);
      delete project.nodes[command.nodeId];
      project.macros.forEach((macro) => { macro.mappings = macro.mappings.filter((mapping) => mapping.nodeId !== command.nodeId); });
      return;
    case 'create_macro': {
      if (project.macros.length >= 8) throw new Error('A plugin can expose at most eight controls.');
      const name = validateMacroName(project, command.name ?? `Control ${project.macros.length + 1}`);
      const id = command.macroId ?? makeId('macro');
      if (project.macros.some((macro) => macro.id === id)) throw new Error(`Macro ID ${id} already exists.`);
      project.macros.push({ id, name, value: 0.5, mappings: [] });
      return;
    }
    case 'rename_macro':
      requireMacro(project, command.macroId).name = validateMacroName(project, command.name, command.macroId);
      return;
    case 'set_macro_value':
      if (!Number.isFinite(command.value) || command.value < 0 || command.value > 1) throw new Error('Macro values must be between 0 and 1.');
      requireMacro(project, command.macroId).value = command.value;
      return;
    case 'add_mapping': {
      const macro = requireMacro(project, command.macroId);
      const definition = validateMappingTarget(project, command.nodeId, command.paramId);
      validateNativeValue(definition, command.min, 'Mapping minimum');
      validateNativeValue(definition, command.max, 'Mapping maximum');
      if (command.min > command.max) throw new Error('Mapping minimum must be less than or equal to its maximum.');
      const id = command.mappingId ?? makeId('mapping');
      if (project.macros.some((candidate) => candidate.mappings.some((mapping) => mapping.id === id))) throw new Error(`Mapping ID ${id} already exists.`);
      macro.mappings.push({ id, nodeId: command.nodeId, paramId: command.paramId, min: command.min, max: command.max, inverted: Boolean(command.inverted) });
      return;
    }
    case 'update_mapping': {
      const macro = requireMacro(project, command.macroId);
      const mapping = macro.mappings.find((candidate) => candidate.id === command.mappingId);
      if (!mapping) throw new Error(`Mapping ${command.mappingId} does not exist.`);
      const nodeId = command.nodeId ?? mapping.nodeId;
      const paramId = command.paramId ?? mapping.paramId;
      const definition = validateMappingTarget(project, nodeId, paramId, mapping.id);
      const min = command.min ?? mapping.min;
      const max = command.max ?? mapping.max;
      validateNativeValue(definition, min, 'Mapping minimum');
      validateNativeValue(definition, max, 'Mapping maximum');
      if (min > max) throw new Error('Mapping minimum must be less than or equal to its maximum.');
      Object.assign(mapping, { nodeId, paramId, min, max, inverted: command.inverted ?? mapping.inverted });
      return;
    }
    case 'remove_mapping': {
      const macro = requireMacro(project, command.macroId);
      const mapping = macro.mappings.find((candidate) => candidate.id === command.mappingId);
      if (!mapping) throw new Error(`Mapping ${command.mappingId} does not exist.`);
      requireNode(project, mapping.nodeId).params[mapping.paramId] = getEffectiveParameter(project, mapping.nodeId, mapping.paramId);
      macro.mappings = macro.mappings.filter((candidate) => candidate.id !== command.mappingId);
      return;
    }
    case 'delete_macro': {
      const macro = requireMacro(project, command.macroId);
      macro.mappings.forEach((mapping) => {
        const node = project.nodes[mapping.nodeId];
        if (node) node.params[mapping.paramId] = getEffectiveParameter(project, mapping.nodeId, mapping.paramId);
      });
      project.macros = project.macros.filter((candidate) => candidate.id !== command.macroId);
      return;
    }
  }
}

export function applyProjectCommands(source: ProjectV2, commands: ProjectCommand[], actor: ActivityItem['actor'], expectedRevision?: number): ProjectV2 {
  if (expectedRevision !== undefined && expectedRevision !== source.revision) throw new Error(`Stale revision ${expectedRevision}; current revision is ${source.revision}.`);
  if (!commands.length || commands.length > 50) throw new Error('A change batch must contain between 1 and 50 commands.');
  const project = structuredClone(source);
  const summaries: string[] = [];
  commands.forEach((command) => { summaries.push(describeCommand(project, command)); applyOne(project, command); });
  project.revision = source.revision + 1;
  project.activity = [{
    id: makeId('activity'), actor, summary: summaries.length === 1 ? summaries[0] : `${summaries.length} coordinated changes`, timestamp: new Date().toISOString(),
  }, ...project.activity].slice(0, 24);
  return validateProject(project);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateProject(value: unknown): ProjectV2 {
  if (!isRecord(value) || value.schemaVersion !== 2) throw new Error('This is not a supported Audio Effect Builder v0.1 project.');
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 64) throw new Error('The project metadata is invalid.');
  if (!Number.isInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.chain) || !isRecord(value.nodes) || !Array.isArray(value.macros) || !Array.isArray(value.activity)) throw new Error('The project structure is invalid.');
  const project = structuredClone(value) as unknown as ProjectV2;
  if (!sameJson(project.engine, ENGINE_PROVENANCE)) throw new Error('The project uses an unsupported Faust effect or library version.');

  const nodeIds = Object.keys(project.nodes);
  if (new Set(project.chain).size !== project.chain.length || project.chain.some((id) => typeof id !== 'string' || !project.nodes[id])) throw new Error('The signal chain contains an invalid module.');
  nodeIds.forEach((id) => {
    const node = project.nodes[id];
    if (!node || node.id !== id || !MODULE_CATALOG[node.type] || typeof node.bypassed !== 'boolean' || !isRecord(node.params)) throw new Error(`Module ${id} is invalid.`);
    const definitions = MODULE_CATALOG[node.type].parameters;
    if (Object.keys(node.params).length !== definitions.length || Object.keys(node.params).some((paramId) => !definitions.some((definition) => definition.id === paramId))) throw new Error(`Module ${id} has an unsupported parameter.`);
    definitions.forEach((definition) => validateNativeValue(definition, node.params[definition.id], `Module ${id} ${definition.name}`));
  });

  if (project.macros.length > 8) throw new Error('The project exposes more than eight macro controls.');
  const macroIds = new Set<string>();
  const mappingIds = new Set<string>();
  const names = new Set<string>();
  const targets = new Set<string>();
  project.macros.forEach((macro) => {
    if (!macro || typeof macro.id !== 'string' || typeof macro.name !== 'string' || !macro.name.trim() || macro.name.length > 24 || !Number.isFinite(macro.value) || macro.value < 0 || macro.value > 1 || !Array.isArray(macro.mappings)) throw new Error('A macro control is invalid.');
    if (macroIds.has(macro.id)) throw new Error('Macro IDs must be unique.');
    macroIds.add(macro.id);
    const lower = macro.name.toLowerCase();
    if (names.has(lower)) throw new Error('Macro names must be unique.');
    names.add(lower);
    macro.mappings.forEach((mapping) => {
      if (!mapping || typeof mapping.id !== 'string' || typeof mapping.nodeId !== 'string' || typeof mapping.paramId !== 'string' || typeof mapping.inverted !== 'boolean') throw new Error('A macro mapping is invalid.');
      if (mappingIds.has(mapping.id)) throw new Error('Mapping IDs must be unique.');
      mappingIds.add(mapping.id);
      const node = project.nodes[mapping.nodeId];
      const definition = node && getParameterDefinition(node, mapping.paramId);
      if (!definition || !definition.mappable || !Number.isFinite(mapping.min) || !Number.isFinite(mapping.max) || mapping.min < definition.min || mapping.max > definition.max || mapping.min > mapping.max) throw new Error('A macro mapping range is invalid.');
      const target = `${mapping.nodeId}:${mapping.paramId}`;
      if (targets.has(target)) throw new Error('A parameter is mapped more than once.');
      targets.add(target);
    });
  });

  project.activity.forEach((item) => {
    if (!item || typeof item.id !== 'string' || !['human', 'agent', 'system'].includes(item.actor) || typeof item.summary !== 'string' || !item.summary || typeof item.timestamp !== 'string' || Number.isNaN(Date.parse(item.timestamp))) throw new Error('The activity history is invalid.');
  });
  if (project.migration && (project.migration.sourceSchemaVersion !== 1 || typeof project.migration.migratedAt !== 'string' || !Array.isArray(project.migration.unsupportedModuleTypes) || !isRecord(project.migration.legacyBackup) || project.migration.legacyBackup.schemaVersion !== 1)) throw new Error('The migration record is invalid.');
  return project;
}

function validateLegacyProject(value: unknown): LegacyProjectV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || typeof value.name !== 'string' || !value.name.trim() || !Number.isInteger(value.revision) || !Array.isArray(value.chain) || !isRecord(value.nodes) || !Array.isArray(value.macros) || !Array.isArray(value.activity)) throw new Error('This legacy project is invalid.');
  const legacy = structuredClone(value) as unknown as LegacyProjectV1;
  if (new Set(legacy.chain).size !== legacy.chain.length || legacy.chain.some((id) => typeof id !== 'string' || !legacy.nodes[id])) throw new Error('The legacy signal chain is invalid.');
  Object.entries(legacy.nodes).forEach(([id, node]) => {
    if (!node || node.id !== id || typeof node.type !== 'string' || !isRecord(node.params) || Object.values(node.params).some((value) => !Number.isFinite(value)) || typeof node.bypassed !== 'boolean') throw new Error(`Legacy module ${id} is invalid.`);
  });
  return legacy;
}

export function migrateLegacyProject(value: unknown): ProjectV2 {
  const legacy = validateLegacyProject(value);
  const nodes: Record<string, DspNode> = {};
  const unsupportedModuleTypes = new Set<string>();
  Object.entries(legacy.nodes).forEach(([id, node]) => {
    if (node.type === 'gain') {
      const migrated = createNode('gain', id);
      if (Number.isFinite(node.params.level)) migrated.params.level = clamp(node.params.level, -24, 24);
      migrated.bypassed = node.bypassed;
      nodes[id] = migrated;
      return;
    }
    if (node.type === 'high_pass' || node.type === 'low_pass') {
      const migrated = createNode('filter', id);
      migrated.params.mode = node.type === 'high_pass' ? 0 : 1;
      if (Number.isFinite(node.params.cutoff)) migrated.params.cutoff = clamp(node.params.cutoff, 20, 20000);
      if (Number.isFinite(node.params.resonance)) migrated.params.resonance = clamp(node.params.resonance, 0.1, 20);
      migrated.bypassed = node.bypassed;
      nodes[id] = migrated;
      return;
    }
    if (node.type === 'saturation') {
      const migrated = createNode('saturation', id);
      MODULE_CATALOG.saturation.parameters.forEach((definition) => {
        if (Number.isFinite(node.params[definition.id])) migrated.params[definition.id] = clamp(node.params[definition.id], definition.min, definition.max);
      });
      migrated.bypassed = node.bypassed;
      nodes[id] = migrated;
      return;
    }
    unsupportedModuleTypes.add(node.type);
  });

  const macros = legacy.macros.map((macro) => ({
    ...macro,
    mappings: macro.mappings.filter((mapping) => {
      const node = nodes[mapping.nodeId];
      const definition = node && getParameterDefinition(node, mapping.paramId);
      return Boolean(definition?.mappable && mapping.min >= definition.min && mapping.max <= definition.max && mapping.min <= mapping.max);
    }),
  }));
  const migratedAt = new Date().toISOString();
  const project: ProjectV2 = {
    schemaVersion: 2,
    id: legacy.id,
    name: legacy.name,
    revision: legacy.revision + 1,
    engine: structuredClone(ENGINE_PROVENANCE),
    chain: legacy.chain.filter((id) => Boolean(nodes[id])),
    nodes,
    macros,
    activity: [{
      id: makeId('activity'), actor: 'system' as const,
      summary: unsupportedModuleTypes.size
        ? `Migrated to Faust v0.1; preserved ${unsupportedModuleTypes.size} unsupported module type${unsupportedModuleTypes.size === 1 ? '' : 's'} in the recovery record`
        : 'Migrated project to the Faust v0.1 engine',
      timestamp: migratedAt,
    }, ...legacy.activity].slice(0, 24),
    migration: { sourceSchemaVersion: 1, migratedAt, unsupportedModuleTypes: [...unsupportedModuleTypes].sort(), legacyBackup: legacy },
  };
  return validateProject(project);
}

export function parseProject(value: unknown): ProjectV2 {
  if (isRecord(value) && value.schemaVersion === 1) return migrateLegacyProject(value);
  return validateProject(value);
}

/** Migrates only named, exact historical v0.1 engines into the current engine. */
export function upgradeProjectEngine(value: unknown): ProjectV2 {
  if (!isRecord(value) || value.schemaVersion !== 2 || !isRecord(value.nodes)) return validateProject(value);
  const project = structuredClone(value) as Record<string, unknown>;
  const isPrePair1 = sameJson(project.engine, PRE_PAIR1_ENGINE_PROVENANCE);
  const isPreCanonicalCompiler = sameJson(project.engine, PRE_CANONICAL_COMPILER_ENGINE_PROVENANCE);
  const isPreSaturationV2 = sameJson(project.engine, PRE_SATURATION_V2_ENGINE_PROVENANCE);
  const isPreAudibility = sameJson(project.engine, PRE_AUDIBILITY_ENGINE_PROVENANCE);
  const isPreChorusCompressor = sameJson(project.engine, PRE_CHORUS_COMPRESSOR_ENGINE_PROVENANCE);
  const isPrePhaserCompressorModes = sameJson(project.engine, PRE_PHASER_COMPRESSOR_MODES_ENGINE_PROVENANCE);
  const isPreAutoWahStutter = sameJson(project.engine, PRE_AUTOWAH_STUTTER_ENGINE_PROVENANCE);
  const isPreEqLimiterFlanger = sameJson(project.engine, PRE_EQ_LIMITER_FLANGER_ENGINE_PROVENANCE);
  const isPreTremolo = sameJson(project.engine, PRE_TREMOLO_ENGINE_PROVENANCE);
  if (!isPrePair1 && !isPreCanonicalCompiler && !isPreSaturationV2 && !isPreAudibility && !isPreChorusCompressor && !isPrePhaserCompressorModes && !isPreAutoWahStutter && !isPreEqLimiterFlanger && !isPreTremolo) return validateProject(project);
  if (isPreSaturationV2) {
    for (const node of Object.values(project.nodes as Record<string, unknown>)) {
      if (!isRecord(node) || node.type !== 'saturation' || !isRecord(node.params)) continue;
      const keys = Object.keys(node.params).sort();
      if (keys.join(',') !== 'drive,mix,tone') throw new Error('The historical Saturation project has an unsupported parameter set.');
      node.params = { ...createNode('saturation', String(node.id)).params, ...node.params };
    }
  }
  if (isPrePhaserCompressorModes) {
    for (const node of Object.values(project.nodes as Record<string, unknown>)) {
      if (!isRecord(node) || node.type !== 'compressor' || !isRecord(node.params)) continue;
      const keys = Object.keys(node.params).sort();
      if (keys.join(',') !== 'attack,makeup,mix,ratio,release,threshold') throw new Error('The historical Compressor project has an unsupported parameter set.');
      node.params = { mode: 0, ...node.params };
    }
  }
  project.engine = structuredClone(ENGINE_PROVENANCE);
  return validateProject(project);
}

export function findAvailableMappingTarget(project: ProjectV2) {
  for (const nodeId of [...project.chain, ...Object.keys(project.nodes).filter((id) => !project.chain.includes(id))]) {
    const node = project.nodes[nodeId];
    for (const definition of MODULE_CATALOG[node.type].parameters) {
      if (definition.mappable && !getMappingForParameter(project, nodeId, definition.id)) return { nodeId, parameter: definition };
    }
  }
  return null;
}
