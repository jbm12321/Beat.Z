export const NATIVE_MODULE_CATALOG = Object.freeze({
  gain: Object.freeze({
    source: 'faust/gain.dsp',
    wasmSha256: '54303a27ef533cc9f5b9983e6c0621174d42e92c0e8f645bde0bbdaa74e8fb87',
    parameters: Object.freeze({ level: Object.freeze({ name: 'Level', min: -24, max: 24, step: 0.1, unit: 'dB', faustPath: '/Audio_Effect_Builder_Gain/Gain_Level', scale: 'linear' }) }),
  }),
  filter: Object.freeze({
    source: 'faust/filter.dsp',
    wasmSha256: '39ac96e8aff15297cf241ee4033f160a725bfd6bae26254696a0c9fd99eed69a',
    parameters: Object.freeze({
      mode: Object.freeze({ name: 'Mode', min: 0, max: 3, step: 1, unit: '', faustPath: '/Audio_Effect_Builder_Filter/Filter_Mode', scale: 'linear', choices: [0, 1, 2, 3], choiceLabels: ['High Pass', 'Low Pass', 'Band Pass', 'Notch'] }),
      cutoff: Object.freeze({ name: 'Cutoff', min: 20, max: 20000, step: 1, unit: 'Hz', faustPath: '/Audio_Effect_Builder_Filter/Filter_Cutoff', scale: 'log' }),
      resonance: Object.freeze({ name: 'Resonance', min: 0.1, max: 20, step: 0.1, unit: 'Q', faustPath: '/Audio_Effect_Builder_Filter/Filter_Resonance', scale: 'log' }),
    }),
  }),
  saturation: Object.freeze({
    source: 'faust/saturation.dsp',
    wasmSha256: '05cea5472644ff2ad0d19234d05a3e411e73fd0a52800b192790d1bc04adcbf1',
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
    wasmSha256: '6a5495bfa670ef8435cd8a2bf282f16e64e5a447ef3b5dbeabff3f4e77cba99c',
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
    wasmSha256: 'd03ff0e330e877212436fed13d983036605d29b5aac719775abc45be402ba12a',
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
  filter: '076d102ec4209b0a9e33d4199e302896a3951017e88a1e821ec106347c03ee7f',
  saturation: '9074635f03744b4b4f280eac15839585716d4a23a732ac7c59e26eb1c3bab068',
  delay: 'fb9a020e31f2b4f290a17ad2a18ec5d87c6f701195af2bc95e38f2d99cef1b92',
  reverb: 'bec502b0ca2f0b01dd7c10051cd848417f24ca0eb45b73c2854a49da54abb5ff',
});
