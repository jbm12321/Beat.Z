import { analyzeStereo, applyStereoGain, loudnessMatchGain, type AudioAnalysis } from './analysis.ts';
import { renderFaustProjectOffline, type FaustFactoryLoader, type StereoSamples } from '../faust/runtime.ts';
import type { ProjectV2 } from '../domain/project.ts';

export interface OfflineComparison {
  revision: number;
  sampleRate: number;
  dry: AudioAnalysis;
  processed: AudioAnalysis;
  loudnessMatched: AudioAnalysis;
  loudnessMatch: {
    gain: number;
    gainDb: number;
    limited: boolean;
  };
  plainLanguageSummary: string[];
}

export async function renderAndAnalyzeProject(
  project: ProjectV2,
  input: StereoSamples,
  sampleRate: number,
  loadFactory?: FaustFactoryLoader,
): Promise<OfflineComparison> {
  const processed = await renderFaustProjectOffline(project, input, sampleRate, loadFactory);
  const dryAnalysis = analyzeStereo(input, sampleRate);
  const processedAnalysis = analyzeStereo(processed, sampleRate);
  const loudnessMatch = loudnessMatchGain(input, processed);
  const matched = applyStereoGain(processed, loudnessMatch.gain);
  const matchedAnalysis = analyzeStereo(matched, sampleRate);
  const summary = [...processedAnalysis.summary];
  if (Math.abs(loudnessMatch.gainDb) >= 0.1) {
    summary.push(`For a fair comparison, processed playback is adjusted by ${loudnessMatch.gainDb.toFixed(1)} dB without changing the project.`);
  } else {
    summary.push('Dry and processed average levels are already closely matched.');
  }
  if (loudnessMatch.limited) summary.push('The comparison gain reached its safety limit.');
  return {
    revision: project.revision,
    sampleRate,
    dry: dryAnalysis,
    processed: processedAnalysis,
    loudnessMatched: matchedAnalysis,
    loudnessMatch,
    plainLanguageSummary: summary,
  };
}
