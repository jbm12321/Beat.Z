import type { AudioAnalysis } from '../audio/analysis.ts';
import { ENGINE_PROVENANCE, validateProject, type ProjectV2 } from './project.ts';

export type ValidationSeverity = 'error' | 'warning';
export type ValidationStatus = 'valid' | 'invalid' | 'needs-analysis';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  nodeId?: string;
  macroId?: string;
}

export interface ProjectValidationResult {
  revision: number;
  status: ValidationStatus;
  checkedAt: string;
  engine: typeof ENGINE_PROVENANCE;
  issues: ValidationIssue[];
  analysis?: AudioAnalysis;
}

export function validateProjectForBuild(project: ProjectV2, analysis?: AudioAnalysis): ProjectValidationResult {
  const issues: ValidationIssue[] = [];
  try {
    validateProject(project);
  } catch (cause) {
    issues.push({
      code: 'project_invalid',
      severity: 'error',
      message: cause instanceof Error ? cause.message : 'The project document is invalid.',
    });
  }

  if (project.migration?.unsupportedModuleTypes.length) {
    issues.push({
      code: 'unsupported_legacy_modules',
      severity: 'error',
      message: `The recovery record contains unsupported legacy modules: ${project.migration.unsupportedModuleTypes.join(', ')}. Remove or rebuild them with Faust v0.1 primitives before freezing.`,
    });
  }
  if (project.chain.length === 0) {
    issues.push({ code: 'empty_chain', severity: 'warning', message: 'The signal chain is empty, so processed audio is the same as the input.' });
  }
  if (project.macros.length === 0) {
    issues.push({ code: 'no_macros', severity: 'warning', message: 'No plugin controls are exposed yet. The browser project is still editable.' });
  }

  if (analysis) {
    if (!analysis.valid) issues.push({ code: 'invalid_audio', severity: 'error', message: 'Offline rendering produced invalid audio samples.' });
    if (analysis.silent) issues.push({ code: 'silent_audio', severity: 'error', message: 'Offline rendering produced effectively silent output.' });
    if (analysis.clipped || analysis.peak >= 1) issues.push({ code: 'clipping', severity: 'error', message: 'Offline rendering reaches or exceeds full scale and may clip.' });
    if (![44100, 48000, 96000].includes(analysis.sampleRate)) {
      issues.push({ code: 'unverified_sample_rate', severity: 'warning', message: `The ${analysis.sampleRate} Hz render is outside the three parity sample rates.` });
    }
  }

  const blocking = issues.some((issue) => issue.severity === 'error');
  const status: ValidationStatus = blocking ? 'invalid' : analysis ? 'valid' : 'needs-analysis';
  return {
    revision: project.revision,
    status,
    checkedAt: new Date().toISOString(),
    engine: structuredClone(ENGINE_PROVENANCE),
    issues,
    analysis,
  };
}
