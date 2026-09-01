'use client';

/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect -- Preserves the coordinator's existing synchronous ref and hydration semantics during this structure-only refactor. */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BrowserAudioEngine } from '../audio/BrowserAudioEngine';
import { renderAndAnalyzeProject, type OfflineComparison } from '../audio/compare';
import {
  applyProjectCommands,
  createInitialProject,
  findAvailableMappingTarget,
  makeId,
  parseProject,
} from '../domain/project';
import { MODULE_CATALOG, MODULE_TYPES } from '../domain/catalog';
import {
  formatParameter,
  getEffectiveParameter,
  getMappingForParameter,
  getParameterDefinition,
} from '../domain/parameters';
import type { MacroControl, MacroMapping, ModuleType, ProjectCommand, ProjectV2 } from '../domain/types';
import { registerWebMcpTools } from '../agent/registerWebMcpTools';
import { applyApprovedAgentProposal, authorizeAgentProposal, createAgentProposal, type AgentProposal, type AgentProposalInput } from '../agent/proposals';
import { freezeProjectRevision, requestPluginBuild, type FrozenProjectRevision, type NativeBuildGate } from '../domain/build';
import { validateProjectForBuild, type ProjectValidationResult } from '../domain/validation';
import { historyReducer, redoHistory, undoHistory } from '../state/history';
import { restorePersistedProject, savePersistedProject } from '../state/persistence';
import { DropZone } from './DropZone';
import { AgentDrawer, type AgentStatus } from './AgentDrawer';
import { AnalysisModal } from './AnalysisModal';
import { AuditionBar } from './AuditionBar';
import { MacroSidebar } from './MacroSidebar';
import { ModuleSidebar } from './ModuleSidebar';
import { NativeExportModal } from './NativeExportModal';
import { moduleDragKey, nodeDragKey } from './dnd';
import { useVst3ExportSession } from '../../vst3-export/useVst3ExportSession';

type Notice = { kind: 'error' | 'success'; text: string } | null;

export function AudioEffectBuilder() {
  const [history, dispatchHistory] = useReducer(historyReducer, undefined, () => ({ past: [], present: createInitialProject(), future: [] }));
  const project = history.present;
  const projectRef = useRef(project);
  const historyRef = useRef(history);
  const [hydrated, setHydrated] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [showAgent, setShowAgent] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showNative, setShowNative] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'modules' | 'macros' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('checking');
  const [agentHighlights, setAgentHighlights] = useState<string[]>([]);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [comparison, setComparison] = useState<OfflineComparison | null>(null);
  const [validation, setValidation] = useState<ProjectValidationResult>(() => validateProjectForBuild(project));
  const [frozenRevision, setFrozenRevision] = useState<FrozenProjectRevision | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loudnessMatched, setLoudnessMatched] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.name);
  const [playing, setPlaying] = useState(false);
  const [sourceName, setSourceName] = useState('Built-in loop');
  const [chainBypass, setChainBypass] = useState(false);
  const [meters, setMeters] = useState({ input: 0, output: 0, inputPeak: 0, outputPeak: 0 });
  const audioRef = useRef<BrowserAudioEngine | null>(null);
  const proposalRef = useRef<AgentProposal | null>(null);
  const validationRef = useRef(validation);
  const frozenRef = useRef<FrozenProjectRevision | null>(null);
  const buildApprovedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const {
    enabled: vst3ExportEnabled,
    job: vst3ExportJob,
    busy: vst3ExportBusy,
    error: vst3ExportError,
    submit: submitVst3Export,
    reset: resetVst3Export,
  } = useVst3ExportSession(showNative);

  projectRef.current = project;
  historyRef.current = history;
  proposalRef.current = proposal;
  validationRef.current = validation;
  frozenRef.current = frozenRevision;

  const commitCommands = useCallback((commands: ProjectCommand[], actor: 'human' | 'agent' = 'human', expectedRevision?: number) => {
    try {
      const next = applyProjectCommands(projectRef.current, commands, actor, expectedRevision);
      projectRef.current = next;
      dispatchHistory({ type: 'commit', project: next });
      if (actor === 'agent') {
        const changedIds = commands.flatMap((command) => ('nodeId' in command && typeof command.nodeId === 'string' ? [command.nodeId] : []));
        setAgentHighlights(changedIds);
        window.setTimeout(() => setAgentHighlights([]), 1800);
      }
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That change could not be applied.';
      setNotice({ kind: 'error', text: message });
      throw error;
    }
  }, []);

  const undo = useCallback(() => {
    const next = undoHistory(historyRef.current);
    if (next === historyRef.current) return;
    historyRef.current = next;
    projectRef.current = next.present;
    dispatchHistory({ type: 'sync', state: next });
  }, []);

  const redo = useCallback(() => {
    const next = redoHistory(historyRef.current);
    if (next === historyRef.current) return;
    historyRef.current = next;
    projectRef.current = next.present;
    dispatchHistory({ type: 'sync', state: next });
  }, []);

  useEffect(() => {
    const restored = restorePersistedProject(window.localStorage);
    projectRef.current = restored.project;
    dispatchHistory({ type: 'load', project: restored.project });
    if (restored.warning) setNotice({ kind: restored.source === 'new' ? 'error' : 'success', text: restored.warning });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      savePersistedProject(window.localStorage, project);
    } catch {
      setNotice({ kind: 'error', text: 'This browser could not save the latest valid project locally.' });
    }
  }, [hydrated, project]);

  useEffect(() => setTitleDraft(project.name), [project.name]);

  useEffect(() => {
    if (selectedNodeId && !project.nodes[selectedNodeId]) setSelectedNodeId(null);
    if (selectedMacroId && !project.macros.some((macro) => macro.id === selectedMacroId)) setSelectedMacroId(null);
  }, [project, selectedMacroId, selectedNodeId]);

  useEffect(() => {
    const nextValidation = validateProjectForBuild(project);
    validationRef.current = nextValidation;
    setValidation(nextValidation);
    setComparison(null);
    setLoudnessMatched(false);
    frozenRef.current = null;
    setFrozenRevision(null);
    resetVst3Export();
    buildApprovedRef.current = false;
    audioRef.current?.setLoudnessMatchGain(1);
  }, [project, resetVst3Export]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const engine = new BrowserAudioEngine();
    audioRef.current = engine;
    engine.setStatusListener((status) => setNotice({ kind: status.kind === 'error' ? 'error' : 'success', text: status.message }));
    engine.setProject(projectRef.current);
    const timer = window.setInterval(() => setMeters(engine.getMeters()), 80);
    return () => {
      window.clearInterval(timer);
      engine.setStatusListener(null);
      engine.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => audioRef.current?.setProject(project), [project]);

  const performAnalysis = useCallback(async () => {
    const engine = audioRef.current;
    if (!engine) throw new Error('The browser audio engine is not ready yet.');
    setAnalyzing(true);
    try {
      await engine.ensureContext();
      const audition = engine.getAuditionSamples();
      if (!audition) throw new Error('Choose or initialize an audition source before analyzing.');
      const revision = projectRef.current.revision;
      const result = await renderAndAnalyzeProject(projectRef.current, audition.samples, audition.sampleRate);
      if (projectRef.current.revision !== revision) throw new Error('The project changed during analysis. Run the comparison again for the current revision.');
      const nextValidation = validateProjectForBuild(projectRef.current, result.processed);
      setComparison(result);
      setValidation(nextValidation);
      validationRef.current = nextValidation;
      return result;
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Offline analysis could not be completed.' });
      throw error;
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const stageProposal = useCallback((input: AgentProposalInput) => {
    const next = createAgentProposal(projectRef.current, input);
    proposalRef.current = next;
    setProposal(next);
    setShowAgent(true);
    return next;
  }, []);

  const applyProposal = useCallback((proposalId: string, expectedRevision: number) => {
    const staged = proposalRef.current;
    if (!staged || staged.id !== proposalId) throw new Error('That agent proposal is no longer available.');
    if (expectedRevision !== projectRef.current.revision) throw new Error(`Stale revision ${expectedRevision}; current revision is ${projectRef.current.revision}.`);
    const result = applyApprovedAgentProposal(projectRef.current, staged);
    projectRef.current = result.project;
    proposalRef.current = result.proposal;
    setProposal(result.proposal);
    dispatchHistory({ type: 'commit', project: result.project });
    const changedIds = staged.commands.flatMap((command) => ('nodeId' in command && typeof command.nodeId === 'string' ? [command.nodeId] : []));
    setAgentHighlights(changedIds);
    window.setTimeout(() => setAgentHighlights([]), 1800);
    return result.project;
  }, []);

  const requestBuildForAgent = useCallback((): NativeBuildGate => {
    const frozen = frozenRef.current;
    if (!frozen || !buildApprovedRef.current) {
      return {
        status: 'unavailable', code: 'approval_required', projectId: projectRef.current.id, revision: frozen?.revision ?? projectRef.current.revision,
        contentHash: frozen?.contentHash ?? '', message: 'Freeze a validated revision and approve the native build request in the page first.',
      };
    }
    return requestPluginBuild(frozen, true);
  }, []);

  useEffect(() => {
    let unregister: () => void = () => undefined;
    registerWebMcpTools({
      getProject: () => projectRef.current,
      getValidation: () => validationRef.current,
      stageProposal,
      applyProposal,
      analyze: performAnalysis,
      requestBuild: requestBuildForAgent,
    }).then((registration) => {
      unregister = registration.unregister;
      setAgentStatus(registration.supported ? 'connected' : 'unavailable');
    }).catch(() => setAgentStatus('unavailable'));
    return () => unregister();
  }, [applyProposal, performAnalysis, requestBuildForAgent, stageProposal]);

  const selectedNode = selectedNodeId ? project.nodes[selectedNodeId] : null;
  const selectedMacro = selectedMacroId ? project.macros.find((macro) => macro.id === selectedMacroId) ?? null : null;
  const disconnectedNodes = useMemo(() => Object.values(project.nodes).filter((node) => !project.chain.includes(node.id)), [project]);
  const availableTarget = useMemo(() => findAvailableMappingTarget(project), [project]);

  const addModule = (moduleType: ModuleType, index = project.chain.length) => {
    const nodeId = makeId('node');
    commitCommands([{ type: 'add_module', moduleType, index, nodeId }]);
    setSelectedNodeId(nodeId);
    setInsertIndex(null);
    setMobilePanel(null);
  };

  const createMacro = () => {
    if (project.macros.length >= 8) {
      setNotice({ kind: 'error', text: 'This plugin already exposes the maximum of eight controls.' });
      return;
    }
    const macroId = makeId('macro');
    commitCommands([{ type: 'create_macro', macroId }]);
    setSelectedMacroId(macroId);
    setMobilePanel(null);
  };

  const commitProjectName = () => {
    const name = titleDraft.trim();
    if (name && name !== project.name) commitCommands([{ type: 'rename_project', name }]);
    else setTitleDraft(project.name);
  };

  const togglePlayback = async () => {
    try {
      const engine = audioRef.current;
      if (!engine) return;
      if (engine.isPlaying) {
        engine.stop();
        setPlaying(false);
      } else {
        await engine.play();
        setPlaying(true);
      }
    } catch {
      setNotice({ kind: 'error', text: 'Audio could not start. Check this browser’s audio permissions.' });
    }
  };

  const restartPlayback = async () => {
    try {
      await audioRef.current?.restart();
      setPlaying(true);
    } catch {
      setNotice({ kind: 'error', text: 'The audition source could not restart.' });
    }
  };

  const chooseAudio = async (file: File | undefined) => {
    if (!file) return;
    try {
      await audioRef.current?.loadFile(file);
      setSourceName(file.name);
      setNotice({ kind: 'success', text: 'Local audio loaded. It remains only in this browser tab.' });
    } catch {
      setNotice({ kind: 'error', text: 'That audio file could not be decoded by this browser.' });
    }
  };

  const switchToDemoAudio = async () => {
    const engine = audioRef.current;
    if (!engine) return;
    engine.useDemo();
    setSourceName('Built-in loop');
    if (engine.isPlaying) await engine.restart();
    setNotice({ kind: 'success', text: 'Switched back to the built-in audition loop.' });
  };

  const toggleChainBypass = () => {
    const next = !chainBypass;
    setChainBypass(next);
    audioRef.current?.setBypass(next);
  };

  const toggleLoudnessMatch = () => {
    if (!comparison) return;
    const next = !loudnessMatched;
    setLoudnessMatched(next);
    audioRef.current?.setLoudnessMatchGain(next ? comparison.loudnessMatch.gain : 1);
  };

  const validateAndShow = async () => {
    try {
      await performAnalysis();
      setShowAnalysis(true);
      setNotice({ kind: 'success', text: 'Offline comparison and browser validation are complete.' });
    } catch {
      // performAnalysis reports the specific failure.
    }
  };

  const freezeCurrentRevision = async () => {
    try {
      setAnalyzing(true);
      const frozen = await freezeProjectRevision(projectRef.current, validationRef.current);
      if (projectRef.current.revision !== frozen.revision) throw new Error('The project changed while it was being frozen. Validate the current revision again.');
      frozenRef.current = frozen;
      setFrozenRevision(frozen);
      buildApprovedRef.current = false;
      setNotice({ kind: 'success', text: `Revision ${frozen.revision} is frozen with an exact content fingerprint.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'The current revision could not be frozen.' });
    } finally {
      setAnalyzing(false);
    }
  };

  const requestNativeBuild = async () => {
    const frozen = frozenRef.current;
    if (!frozen) return;
    buildApprovedRef.current = true;
    try {
      await submitVst3Export(frozen);
      setNotice({ kind: 'success', text: 'The VST3 build was queued on your Mac.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'The VST3 build could not be requested.' });
    }
  };

  const approveCurrentProposal = () => {
    const staged = proposalRef.current;
    if (!staged) return;
    try {
      const approved = authorizeAgentProposal(staged);
      proposalRef.current = approved;
      setProposal(approved);
      applyProposal(approved.id, projectRef.current.revision);
      setNotice({ kind: 'success', text: 'The approved agent patch was applied as one revision.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'The proposal could not be applied.' });
    }
  };

  const handleDrop = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    const moduleType = event.dataTransfer.getData(moduleDragKey) as ModuleType;
    const nodeId = event.dataTransfer.getData(nodeDragKey);
    try {
      if (moduleType && MODULE_CATALOG[moduleType]) addModule(moduleType, index);
      else if (nodeId && project.nodes[nodeId]) {
        const command: ProjectCommand = project.chain.includes(nodeId)
          ? { type: 'move_module', nodeId, index }
          : { type: 'connect_module', nodeId, index };
        commitCommands([command]);
        setSelectedNodeId(nodeId);
      }
    } finally {
      setDropIndex(null);
    }
  };

  const exportProject = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'}.effect-project.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
    setNotice({ kind: 'success', text: 'Project recipe exported.' });
  };

  const importProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = parseProject(JSON.parse(await file.text()));
      const next: ProjectV2 = structuredClone(imported);
      next.revision = projectRef.current.revision + 1;
      next.activity = [{ id: makeId('activity'), actor: 'human' as const, summary: 'Imported project recipe', timestamp: new Date().toISOString() }, ...next.activity].slice(0, 24);
      projectRef.current = next;
      dispatchHistory({ type: 'commit', project: next });
      setSelectedNodeId(null);
      setSelectedMacroId(null);
      setShowExport(false);
      setNotice({ kind: 'success', text: 'Project recipe imported.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'That project file is invalid.' });
    }
  };

  const moveSelected = (offset: number) => {
    if (!selectedNodeId) return;
    const index = project.chain.indexOf(selectedNodeId);
    if (index < 0) return;
    commitCommands([{ type: 'move_module', nodeId: selectedNodeId, index: index + offset }]);
  };

  const addMapping = (macro: MacroControl) => {
    const target = findAvailableMappingTarget(project);
    if (!target) {
      setNotice({ kind: 'error', text: 'Add a module with an unmapped parameter first.' });
      return;
    }
    commitCommands([{
      type: 'add_mapping',
      macroId: macro.id,
      nodeId: target.nodeId,
      paramId: target.parameter.id,
      min: target.parameter.min,
      max: target.parameter.max,
    }]);
  };

  const changeMappingTarget = (macro: MacroControl, mapping: MacroMapping, targetValue: string) => {
    const [nodeId, paramId] = targetValue.split('::');
    const node = project.nodes[nodeId];
    const definition = node && getParameterDefinition(node, paramId);
    if (!definition) return;
    commitCommands([{ type: 'update_mapping', macroId: macro.id, mappingId: mapping.id, nodeId, paramId, min: definition.min, max: definition.max }]);
  };

  return (
    <main className="app-shell">
      {mobilePanel && <button className="mobile-backdrop" aria-label="Close panel" onClick={() => setMobilePanel(null)} />}

      <ModuleSidebar
        mobileOpen={mobilePanel === 'modules'}
        onAddModule={addModule}
        onOpenInsert={() => setInsertIndex(project.chain.length)}
      />

      <section className="workspace" aria-label="Plugin workspace">
        <header className="workspace-header">
          <div className="project-title-wrap">
            <button type="button" className="mobile-rail-button modules-toggle" onClick={() => setMobilePanel('modules')}>Modules</button>
            <input
              className="project-name"
              aria-label="Project name"
              value={titleDraft}
              maxLength={64}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitProjectName}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            />
          </div>
          <div className="workspace-actions">
            <button type="button" className="icon-button" aria-label="Undo" title="Undo" disabled={!history.past.length} onClick={undo}>↶</button>
            <button type="button" className="icon-button" aria-label="Redo" title="Redo" disabled={!history.future.length} onClick={redo}>↷</button>
            <button type="button" className={`top-action ${chainBypass ? 'is-active' : ''}`} disabled={project.chain.length === 0} title={project.chain.length === 0 ? 'Add a Faust primitive before comparing.' : 'Switch between dry and processed playback.'} aria-pressed={chainBypass} onClick={toggleChainBypass}>Compare</button>
            <button type="button" className={`top-action validation-action ${validation.status}`} disabled={analyzing} onClick={() => void validateAndShow()}>
              <span className="validation-dot" /> {analyzing ? 'Checking…' : 'Validate'}
            </button>
            <button type="button" className="top-action" onClick={() => setShowNative(true)}>Build</button>
            <button type="button" className={`agent-button ${showAgent ? 'is-active' : ''}`} onClick={() => setShowAgent((open) => !open)}>
              <span className={`agent-dot ${agentStatus}`} /> {proposal && proposal.status !== 'applied' ? 'Proposal ready' : agentStatus === 'connected' ? 'Agent connected' : 'Agent actions'}
            </button>
            <button type="button" className="mobile-rail-button controls-toggle" onClick={() => setMobilePanel('macros')}>Controls</button>
            <div className="export-wrap">
              <button type="button" className="export-button" onClick={() => setShowExport((open) => !open)}>Export</button>
              {showExport && (
                <div className="export-menu" role="menu">
                  <button type="button" role="menuitem" onClick={exportProject}><span>Project recipe</span><small>JSON</small></button>
                  <button type="button" role="menuitem" onClick={() => importInputRef.current?.click()}><span>Import project</span><small>JSON</small></button>
                  <hr />
                  <button type="button" role="menuitem" className="native-menu-item" onClick={() => { setShowNative(true); setShowExport(false); }}>
                    <span>VST3 plugin</span><small>Native builder required</small>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className={`workspace-canvas ${selectedNode ? 'has-inspector' : ''}`}>
          <div className="chain-label">Signal chain <span>Revision {project.revision}</span></div>
          <div className="chain-scroll">
            <div className={`signal-chain ${project.chain.length === 0 ? 'is-empty' : ''}`} aria-label="Audio signal chain">
              <span className="terminal">Input</span>
              <DropZone index={0} empty={project.chain.length === 0} active={dropIndex === 0} onOpen={() => setInsertIndex(0)} onDrop={handleDrop} onDragEnter={setDropIndex} />
              {project.chain.map((nodeId, index) => {
                const node = project.nodes[nodeId];
                const definition = MODULE_CATALOG[node.type];
                const primary = definition.parameters[0];
                return (
                  <div className="chain-fragment" key={node.id}>
                    <div
                      className={`dsp-node ${selectedNodeId === node.id ? 'is-selected' : ''} ${node.bypassed ? 'is-bypassed' : ''} ${agentHighlights.includes(node.id) ? 'agent-changed' : ''}`}
                      role="button"
                      tabIndex={0}
                      draggable
                      aria-label={`${definition.name} module${node.bypassed ? ', bypassed' : ''}`}
                      onClick={() => setSelectedNodeId(node.id)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedNodeId(node.id); } }}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData(nodeDragKey, node.id);
                        event.dataTransfer.setData('text/plain', `node:${node.id}`);
                      }}
                    >
                      <span className="node-order">{String(index + 1).padStart(2, '0')}</span>
                      <strong>{definition.shortName}</strong>
                      <span className="node-value">{formatParameter(primary, getEffectiveParameter(project, node.id, primary.id))}</span>
                      <span className="node-handle" aria-hidden="true">•••</span>
                    </div>
                    <DropZone index={index + 1} active={dropIndex === index + 1} onOpen={() => setInsertIndex(index + 1)} onDrop={handleDrop} onDragEnter={setDropIndex} />
                  </div>
                );
              })}
              <span className="terminal">Output</span>
            </div>
          </div>

          {project.chain.length === 0 && <p className="canvas-hint">Add your first module to shape the sound.</p>}

          {disconnectedNodes.length > 0 && (
            <div className="disconnected-shelf">
              <span className="shelf-label">Unconnected</span>
              {disconnectedNodes.map((node) => (
                <button
                  type="button"
                  key={node.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData(nodeDragKey, node.id)}
                  onClick={() => {
                    commitCommands([{ type: 'connect_module', nodeId: node.id }]);
                    setSelectedNodeId(node.id);
                  }}
                >
                  {MODULE_CATALOG[node.type].shortName}<span>Reconnect +</span>
                </button>
              ))}
            </div>
          )}

          {insertIndex !== null && (
            <div className="insert-menu" role="dialog" aria-label="Choose a module">
              <header><span>Insert module</span><button type="button" aria-label="Close" onClick={() => setInsertIndex(null)}>×</button></header>
              <div>
                {MODULE_TYPES.map((moduleType) => (
                  <button type="button" key={moduleType} onClick={() => addModule(moduleType, insertIndex)}>
                    <strong>{MODULE_CATALOG[moduleType].shortName}</strong><span>{MODULE_CATALOG[moduleType].name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedNode && (
            <section className="node-inspector" aria-label={`${MODULE_CATALOG[selectedNode.type].name} parameters`}>
              <header className="inspector-title">
                <div><span>{MODULE_CATALOG[selectedNode.type].shortName}</span><strong>{MODULE_CATALOG[selectedNode.type].name}</strong></div>
                <div className="inspector-actions">
                  {project.chain.includes(selectedNode.id) && <>
                    <button type="button" disabled={project.chain.indexOf(selectedNode.id) === 0} onClick={() => moveSelected(-1)} aria-label="Move module left">←</button>
                    <button type="button" disabled={project.chain.indexOf(selectedNode.id) === project.chain.length - 1} onClick={() => moveSelected(1)} aria-label="Move module right">→</button>
                  </>}
                  <button type="button" className={selectedNode.bypassed ? 'is-active' : ''} onClick={() => commitCommands([{ type: 'set_bypass', nodeId: selectedNode.id, bypassed: !selectedNode.bypassed }])}>{selectedNode.bypassed ? 'Enable' : 'Bypass'}</button>
                  <button type="button" onClick={() => commitCommands([{ type: project.chain.includes(selectedNode.id) ? 'disconnect_module' : 'connect_module', nodeId: selectedNode.id }])}>{project.chain.includes(selectedNode.id) ? 'Disconnect' : 'Reconnect'}</button>
                  <button type="button" className="danger-action" onClick={() => {
                    const confirmed = window.confirm(`Delete ${MODULE_CATALOG[selectedNode.type].name}? Its macro mappings will also be removed.`);
                    if (confirmed) commitCommands([{ type: 'delete_module', nodeId: selectedNode.id }]);
                  }}>Delete</button>
                  <button type="button" aria-label="Close inspector" onClick={() => setSelectedNodeId(null)}>×</button>
                </div>
              </header>
              <div className="parameter-grid">
                {MODULE_CATALOG[selectedNode.type].parameters.map((parameter) => {
                  const mappingOwner = getMappingForParameter(project, selectedNode.id, parameter.id);
                  const effective = getEffectiveParameter(project, selectedNode.id, parameter.id);
                  return (
                    <label className={`parameter-control ${mappingOwner ? 'is-mapped' : ''}`} key={parameter.id}>
                      <span>{parameter.name}<output>{formatParameter(parameter, effective)}</output></span>
                      {parameter.kind === 'choice' ? (
                        <select
                          className="parameter-select"
                          value={effective}
                          disabled={Boolean(mappingOwner)}
                          onChange={(event) => commitCommands([{ type: 'set_parameter', nodeId: selectedNode.id, paramId: parameter.id, value: Number(event.target.value) }])}
                        >
                          {parameter.choices?.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                        </select>
                      ) : (
                        <input
                          type="range"
                          min={parameter.min}
                          max={parameter.max}
                          step={parameter.step}
                          value={effective}
                          disabled={Boolean(mappingOwner)}
                          onChange={(event) => commitCommands([{ type: 'set_parameter', nodeId: selectedNode.id, paramId: parameter.id, value: Number(event.target.value) }])}
                        />
                      )}
                      {mappingOwner ? <small>Controlled by {mappingOwner.macro.name}</small> : <small>Faust · smoothed</small>}
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          <AgentDrawer
            open={showAgent}
            status={agentStatus}
            activity={project.activity}
            proposal={proposal}
            currentRevision={project.revision}
            canUndo={history.past.length > 0}
            onClose={() => setShowAgent(false)}
            onUndo={undo}
            onApproveProposal={approveCurrentProposal}
            onDismissProposal={() => { proposalRef.current = null; setProposal(null); }}
          />
        </div>

        <AuditionBar
          playing={playing}
          sourceName={sourceName}
          isDemo={sourceName === 'Built-in loop'}
          meters={meters}
          chainBypass={chainBypass}
          loudnessMatched={loudnessMatched}
          canLoudnessMatch={Boolean(comparison)}
          analyzing={analyzing}
          onTogglePlayback={() => void togglePlayback()}
          onChooseFile={() => fileInputRef.current?.click()}
          onUseDemo={() => void switchToDemoAudio()}
          onRestart={() => void restartPlayback()}
          onToggleBypass={toggleChainBypass}
          onToggleLoudnessMatch={toggleLoudnessMatch}
          onAnalyze={() => void validateAndShow()}
        />
      </section>

      <MacroSidebar
        project={project}
        mobileOpen={mobilePanel === 'macros'}
        selectedMacroId={selectedMacroId}
        selectedMacro={selectedMacro}
        agentStatus={agentStatus}
        hasAvailableTarget={Boolean(availableTarget)}
        onCreateMacro={createMacro}
        onSelectMacro={setSelectedMacroId}
        onAddMapping={addMapping}
        onChangeMappingTarget={changeMappingTarget}
        onCommit={(commands) => { commitCommands(commands); }}
      />

      {showAnalysis && comparison ? <AnalysisModal comparison={comparison} validation={validation} onClose={() => setShowAnalysis(false)} /> : null}
      {showNative ? (
        <NativeExportModal
          validation={validation}
          frozen={frozenRevision}
          exportEnabled={vst3ExportEnabled}
          job={vst3ExportJob}
          error={vst3ExportError}
          busy={analyzing || vst3ExportBusy}
          onClose={() => setShowNative(false)}
          onExport={exportProject}
          onValidate={() => void validateAndShow()}
          onFreeze={() => void freezeCurrentRevision()}
          onRequestBuild={() => void requestNativeBuild()}
        />
      ) : null}

      <input ref={fileInputRef} className="visually-hidden" type="file" accept="audio/*" onChange={(event) => void chooseAudio(event.target.files?.[0])} />
      <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importProject(event.target.files?.[0])} />
      {notice && <div className={`notice ${notice.kind}`} role="status" aria-live="polite">{notice.text}</div>}
    </main>
  );
}
