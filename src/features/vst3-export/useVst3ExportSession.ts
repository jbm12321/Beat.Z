'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FrozenProjectRevision } from '../audio-builder/domain/build.ts';
import { getVst3Build, getVst3Capability, submitVst3Build, type PublicVst3Build } from './client.ts';

export function useVst3ExportSession(open: boolean) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [job, setJob] = useState<PublicVst3Build | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    getVst3Capability()
      .then((capability) => { if (active) setEnabled(capability.enabled); })
      .catch((cause) => { if (active) { setEnabled(false); setError(cause instanceof Error ? cause.message : 'VST3 export could not be checked.'); } });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!job || (job.status !== 'queued' && job.status !== 'building')) return;
    const timeout = window.setTimeout(() => {
      getVst3Build(job.id)
        .then(setJob)
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Build status could not be checked.'));
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [job]);

  const submit = useCallback(async (frozen: FrozenProjectRevision) => {
    setBusy(true);
    setError(null);
    try {
      const submitted = await submitVst3Build(frozen);
      setJob(submitted);
      return submitted;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The VST3 build could not be requested.';
      setError(message);
      throw cause;
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    setJob(null);
    setError(null);
  }, []);

  return { enabled, job, busy, error, submit, reset };
}
