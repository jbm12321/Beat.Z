import {
  LAST_VALID_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  createInitialProject,
  migrateLegacyProject,
  upgradeSaturationProject,
  validateProject,
  type ProjectV2,
} from '../domain/project.ts';

export interface ProjectStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type PersistenceSource = 'current' | 'legacy-migration' | 'last-valid' | 'new';

export interface PersistedProjectResult {
  project: ProjectV2;
  source: PersistenceSource;
  warning?: string;
}

function parseJson(value: string | null) {
  if (!value) return null;
  return JSON.parse(value) as unknown;
}

export function restorePersistedProject(storage: ProjectStorage): PersistedProjectResult {
  let currentFailed = false;
  try {
    const current = parseJson(storage.getItem(STORAGE_KEY));
    if (current) return { project: upgradeSaturationProject(current), source: 'current' };
  } catch {
    currentFailed = true;
  }

  try {
    const legacy = parseJson(storage.getItem(LEGACY_STORAGE_KEY));
    if (legacy) {
      return {
        project: migrateLegacyProject(legacy),
        source: 'legacy-migration',
        warning: currentFailed
          ? 'The current save was invalid. A recoverable legacy project was migrated to Faust v0.1.'
          : 'Your previous browser project was migrated to the Faust v0.1 engine. The original remains stored as a recovery copy.',
      };
    }
  } catch {
    // Preserve the original legacy value and continue to the known-good snapshot.
  }

  try {
    const lastValid = parseJson(storage.getItem(LAST_VALID_STORAGE_KEY));
    if (lastValid) {
      return {
        project: upgradeSaturationProject(lastValid),
        source: 'last-valid',
        warning: 'The current save was invalid, so the last valid project was restored.',
      };
    }
  } catch {
    // A clean project is safer than mutating or overwriting invalid stored data.
  }

  return {
    project: createInitialProject(),
    source: 'new',
    warning: currentFailed ? 'The saved project could not be opened. It was left untouched and a clean project was opened.' : undefined,
  };
}

export function savePersistedProject(storage: ProjectStorage, value: ProjectV2) {
  const project = validateProject(value);
  const serialized = JSON.stringify(project);
  storage.setItem(LAST_VALID_STORAGE_KEY, serialized);
  storage.setItem(STORAGE_KEY, serialized);
}
