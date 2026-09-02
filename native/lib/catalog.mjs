export const NATIVE_MODULE_CATALOG = Object.freeze({
  gain: Object.freeze({
    source: 'faust/gain.dsp',
    parameters: Object.freeze({ level: Object.freeze({ name: 'Level', min: -24, max: 24, step: 0.1, unit: 'dB', faustPath: '/Audio_Effect_Builder_Gain/Gain_Level', scale: 'linear' }) }),
  }),
  filter: Object.freeze({
    source: 'faust/filter.dsp',
    parameters: Object.freeze({
      mode: Object.freeze({ name: 'Mode', min: 0, max: 1, step: 1, unit: '', faustPath: '/Audio_Effect_Builder_Filter/Filter_Mode', scale: 'linear', choices: [0, 1], choiceLabels: ['High Pass', 'Low Pass'] }),
      cutoff: Object.freeze({ name: 'Cutoff', min: 20, max: 20000, step: 1, unit: 'Hz', faustPath: '/Audio_Effect_Builder_Filter/Filter_Cutoff', scale: 'log' }),
      resonance: Object.freeze({ name: 'Resonance', min: 0.1, max: 20, step: 0.1, unit: 'Q', faustPath: '/Audio_Effect_Builder_Filter/Filter_Resonance', scale: 'log' }),
    }),
  }),
  saturation: Object.freeze({
    source: 'faust/saturation.dsp',
    parameters: Object.freeze({
      character: Object.freeze({ name: 'Character', min: 0, max: 3, step: 1, unit: '', faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Character', scale: 'linear', choices: [0, 1, 2, 3], choiceLabels: ['Soft Clip', 'Cubic', 'Fuzz', 'Tape'] }),
      drive: Object.freeze({ name: 'Drive', min: 0, max: 24, step: 0.1, unit: 'dB', faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Drive', scale: 'linear' }),
      tone: Object.freeze({ name: 'Tone', min: 200, max: 16000, step: 1, unit: 'Hz', faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Tone', scale: 'log' }),
      mix: Object.freeze({ name: 'Mix', min: 0, max: 100, step: 1, unit: '%', faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Mix', scale: 'linear' }),
      output: Object.freeze({ name: 'Output', min: -24, max: 24, step: 0.1, unit: 'dB', faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Output', scale: 'linear' }),
      bias: Object.freeze({ name: 'Bias', min: -1, max: 1, step: 0.01, unit: '%', faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Bias', scale: 'linear' }),
      clip: Object.freeze({ name: 'Clip', min: 0.1, max: 1, step: 0.01, unit: '%', faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Clip', scale: 'linear' }),
      age: Object.freeze({ name: 'Age', min: 0, max: 100, step: 1, unit: '%', faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Age', scale: 'linear' }),
      wow: Object.freeze({ name: 'Wow', min: 0, max: 100, step: 1, unit: '%', faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Wow', scale: 'linear' }),
    }),
  }),
});

export const SOURCE_FINGERPRINTS = Object.freeze({
  gain: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
  filter: '873e26b2ca7ac309783f154f4becd1fc479d046cd295d0ae732aa81cfbc931eb',
  saturation: 'f8a7bbe451c3abd30e4c61fd6210ea3b6a2fef2ae5b67fda2c49c2890969bbf1',
});
