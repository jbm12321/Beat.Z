export const NATIVE_MODULE_CATALOG = Object.freeze({
  gain: Object.freeze({
    source: 'faust/gain.dsp',
    parameters: Object.freeze({ level: Object.freeze({ min: -24, max: 24, faustPath: '/Audio_Effect_Builder_Gain/Gain_Level', scale: 'linear' }) }),
  }),
  filter: Object.freeze({
    source: 'faust/filter.dsp',
    parameters: Object.freeze({
      mode: Object.freeze({ min: 0, max: 1, faustPath: '/Audio_Effect_Builder_Filter/Filter_Mode', scale: 'linear', choices: [0, 1] }),
      cutoff: Object.freeze({ min: 20, max: 20000, faustPath: '/Audio_Effect_Builder_Filter/Filter_Cutoff', scale: 'log' }),
      resonance: Object.freeze({ min: 0.1, max: 20, faustPath: '/Audio_Effect_Builder_Filter/Filter_Resonance', scale: 'log' }),
    }),
  }),
  saturation: Object.freeze({
    source: 'faust/saturation.dsp',
    parameters: Object.freeze({
      drive: Object.freeze({ min: 0, max: 24, faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Drive', scale: 'linear' }),
      tone: Object.freeze({ min: 200, max: 16000, faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Tone', scale: 'log' }),
      mix: Object.freeze({ min: 0, max: 100, faustPath: '/Audio_Effect_Builder_Saturation/Saturation_Mix', scale: 'linear' }),
    }),
  }),
});

export const SOURCE_FINGERPRINTS = Object.freeze({
  gain: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
  filter: '873e26b2ca7ac309783f154f4becd1fc479d046cd295d0ae732aa81cfbc931eb',
  saturation: '238cd373e164ba480c6367ae7ef1c071205346361c7f597d6c1dc3878af0a75b',
});
