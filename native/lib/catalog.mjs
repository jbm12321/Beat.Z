export const NATIVE_MODULE_CATALOG = Object.freeze({
  gain: Object.freeze({
    source: 'faust/gain.dsp',
    wasmSha256: '54303a27ef533cc9f5b9983e6c0621174d42e92c0e8f645bde0bbdaa74e8fb87',
    parameters: Object.freeze({ level: Object.freeze({ name: 'Level', min: -24, max: 24, step: 0.1, unit: 'dB', faustPath: '/Audio_Effect_Builder_Gain/Gain_Level', scale: 'linear' }) }),
  }),
  filter: Object.freeze({
    source: 'faust/filter.dsp',
    wasmSha256: '7f188b00b97a5bc3744cf07698a28455a408af1771d0828d61ccc654a1658663',
    parameters: Object.freeze({
      mode: Object.freeze({ name: 'Mode', min: 0, max: 3, step: 1, unit: '', faustPath: '/Audio_Effect_Builder_Filter/Filter_Mode', scale: 'linear', choices: [0, 1, 2, 3], choiceLabels: ['High Pass', 'Low Pass', 'Band Pass', 'Notch'] }),
      cutoff: Object.freeze({ name: 'Cutoff', min: 20, max: 20000, step: 1, unit: 'Hz', faustPath: '/Audio_Effect_Builder_Filter/Filter_Cutoff', scale: 'log' }),
      resonance: Object.freeze({ name: 'Resonance', min: 0.1, max: 20, step: 0.1, unit: 'Q', faustPath: '/Audio_Effect_Builder_Filter/Filter_Resonance', scale: 'log' }),
    }),
  }),
  saturation: Object.freeze({
    source: 'faust/saturation.dsp',
    wasmSha256: '14c322467c0188bbc9fd901a94333e85722fea24f4e9150663cf9477555ada78',
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
  delay: Object.freeze({
    source: 'faust/delay.dsp',
    wasmSha256: '8d23c0fcf45ce5565bd8a9b75307242c4a631de26705550f73f2c69deb8c3eb0',
    parameters: Object.freeze({
      mode: Object.freeze({ name: 'Mode', min: 0, max: 2, step: 1, unit: '', faustPath: '/Audio_Effect_Builder_Delay/Delay_Mode', scale: 'linear', choices: [0, 1, 2], choiceLabels: ['Digital', 'Ping-Pong', 'Tape'] }),
      time: Object.freeze({ name: 'Time', min: 20, max: 2000, step: 1, unit: 'ms', faustPath: '/Audio_Effect_Builder_Delay/Delay_Time', scale: 'log' }),
      feedback: Object.freeze({ name: 'Feedback', min: 0, max: 90, step: 1, unit: '%', faustPath: '/Audio_Effect_Builder_Delay/Delay_Feedback', scale: 'linear' }),
      tone: Object.freeze({ name: 'Tone', min: 500, max: 16000, step: 1, unit: 'Hz', faustPath: '/Audio_Effect_Builder_Delay/Delay_Tone', scale: 'log' }),
      mix: Object.freeze({ name: 'Mix', min: 0, max: 100, step: 1, unit: '%', faustPath: '/Audio_Effect_Builder_Delay/Delay_Mix', scale: 'linear' }),
      output: Object.freeze({ name: 'Output', min: -24, max: 12, step: 0.1, unit: 'dB', faustPath: '/Audio_Effect_Builder_Delay/Delay_Output', scale: 'linear' }),
    }),
  }),
  reverb: Object.freeze({
    source: 'faust/reverb.dsp',
    wasmSha256: '8eb5ea751de350fb216d55a553367afbf8454637ef78f09b1b13b7f79127c2fd',
    parameters: Object.freeze({
      mode: Object.freeze({ name: 'Mode', min: 0, max: 2, step: 1, unit: '', faustPath: '/Audio_Effect_Builder_Reverb/Reverb_Mode', scale: 'linear', choices: [0, 1, 2], choiceLabels: ['Room', 'Hall', 'Plate'] }),
      preDelay: Object.freeze({ name: 'Pre Delay', min: 0, max: 200, step: 1, unit: 'ms', faustPath: '/Audio_Effect_Builder_Reverb/Reverb_Pre_Delay', scale: 'linear' }),
      decay: Object.freeze({ name: 'Decay', min: 0.2, max: 12, step: 0.1, unit: 's', faustPath: '/Audio_Effect_Builder_Reverb/Reverb_Decay', scale: 'log' }),
      size: Object.freeze({ name: 'Size', min: 0, max: 100, step: 1, unit: '%', faustPath: '/Audio_Effect_Builder_Reverb/Reverb_Size', scale: 'linear' }),
      damping: Object.freeze({ name: 'Damping', min: 0, max: 100, step: 1, unit: '%', faustPath: '/Audio_Effect_Builder_Reverb/Reverb_Damping', scale: 'linear' }),
      mix: Object.freeze({ name: 'Mix', min: 0, max: 100, step: 1, unit: '%', faustPath: '/Audio_Effect_Builder_Reverb/Reverb_Mix', scale: 'linear' }),
      output: Object.freeze({ name: 'Output', min: -24, max: 12, step: 0.1, unit: 'dB', faustPath: '/Audio_Effect_Builder_Reverb/Reverb_Output', scale: 'linear' }),
    }),
  }),
});

export const SOURCE_FINGERPRINTS = Object.freeze({
  gain: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
  filter: '6918312c734213e2476c899588f4917a0d7dfc469196ce0aec718d22e03c25d6',
  saturation: 'f8a7bbe451c3abd30e4c61fd6210ea3b6a2fef2ae5b67fda2c49c2890969bbf1',
  delay: 'ffb3c7f559aeedd613450d814c910552faca1129651f05cfc846a3511876c647',
  reverb: '95310a51570124fe27680d0946cf54c8316ec96e6afa3ce0ac619c61676adda3',
});
