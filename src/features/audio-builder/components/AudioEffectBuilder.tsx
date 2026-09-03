'use client';

/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect -- Preserves the coordinator's existing synchronous ref and hydration semantics during this structure-only refactor. */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BrowserAudioEngine } from '../audio/BrowserAudioEngine';
import { renderAndAnalyzeProject } from '../audio/compare';
import {
  applyProjectCommands,
  createInitialProject,
  findAvailableMappingTarget,
  LAST_VALID_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  makeId,
  STORAGE_KEY,
} from '../domain/project';
import { MODULE_CATALOG, MODULE_TYPES } from '../domain/catalog';
import {
  formatParameter,
  getEffectiveParameter,
  getMappingForParameter,
  getParameterDefinition,
} from '../domain/parameters';
import type { MacroControl, MacroMapping, ModuleType, ProjectCommand } from '../domain/types';
import { registerWebMcpTools } from '../agent/registerWebMcpTools';
import { applyApprovedAgentProposal, authorizeAgentProposal, createAgentProposal, type AgentProposal, type AgentProposalInput } from '../agent/proposals';
import { freezeProjectRevision, requestPluginBuild, type FrozenProjectRevision, type NativeBuildGate } from '../domain/build';
import { validateProjectForBuild, type ProjectValidationResult } from '../domain/validation';
import { historyReducer, redoHistory, undoHistory } from '../state/history';
import { restorePersistedProject, savePersistedProject } from '../state/persistence';
import { DropZone } from './DropZone';
import { AgentDrawer, type AgentStatus } from './AgentDrawer';
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
  const [showNative, setShowNative] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'modules' | 'macros' | null>(null);
  const [modulesHidden, setModulesHidden] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('checking');
  const [agentHighlights, setAgentHighlights] = useState<string[]>([]);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [validation, setValidation] = useState<ProjectValidationResult>(() => validateProjectForBuild(project));
  const [frozenRevision, setFrozenRevision] = useState<FrozenProjectRevision | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sourceName, setSourceName] = useState('Beat.Z demo loop');
  const [chainBypass, setChainBypass] = useState(false);
  const [meters, setMeters] = useState({ input: 0, output: 0, inputPeak: 0, outputPeak: 0 });
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const audioRef = useRef<BrowserAudioEngine | null>(null);
  const proposalRef = useRef<AgentProposal | null>(null);
  const validationRef = useRef(validation);
  const frozenRef = useRef<FrozenProjectRevision | null>(null);
  const buildApprovedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    job: vst3ExportJob,
    busy: vst3ExportBusy,
    error: vst3ExportError,
    submit: submitVst3Export,
    reset: resetVst3Export,
  } = useVst3ExportSession();

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

  const clearProject = () => {
    const hasContent = Object.keys(projectRef.current.nodes).length > 0 || projectRef.current.macros.length > 0;
    if (!hasContent || !window.confirm('Reset the builder to a fresh first-time session? This cannot be undone.')) return;
    audioRef.current?.stop();
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LAST_VALID_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.location.reload();
  };

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

  useEffect(() => {
    if (selectedNodeId && !project.nodes[selectedNodeId]) setSelectedNodeId(null);
    if (selectedMacroId && !project.macros.some((macro) => macro.id === selectedMacroId)) setSelectedMacroId(null);
  }, [project, selectedMacroId, selectedNodeId]);

  useEffect(() => {
    const nextValidation = validateProjectForBuild(project);
    validationRef.current = nextValidation;
    setValidation(nextValidation);
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
    setWaveformPeaks(engine.getWaveformPeaks());
    const timer = window.setInterval(() => {
      setMeters(engine.getMeters());
      setPlaybackProgress(engine.getPlaybackProgress());
    }, 80);
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
        contentHash: frozen?.contentHash ?? '', message: 'Prepare the current project for download and approve the native build request in the page first.',
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

  const commitProjectName = (element: HTMLElement) => {
    const name = element.textContent?.trim() ?? '';
    if (name === projectRef.current.name) return;
    try {
      commitCommands([{ type: 'rename_project', name }]);
    } catch {
      element.textContent = projectRef.current.name;
    }
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

  const chooseAudio = async (file: File | undefined) => {
    if (!file) return;
    try {
      await audioRef.current?.loadFile(file);
      setSourceName(file.name);
      setPlaybackProgress(0);
      setWaveformPeaks(audioRef.current?.getWaveformPeaks() ?? []);
      setNotice({ kind: 'success', text: 'Local audio loaded. It remains only in this browser tab.' });
    } catch {
      setNotice({ kind: 'error', text: 'That audio file could not be decoded by this browser.' });
    }
  };

  const switchToDemoAudio = async () => {
    const engine = audioRef.current;
    if (!engine) return;
    const wasPlaying = engine.isPlaying;
    if (wasPlaying) engine.stop();
    engine.useDemo();
    setSourceName('Beat.Z demo loop');
    setPlaybackProgress(0);
    setWaveformPeaks(engine.getWaveformPeaks());
    if (wasPlaying) await engine.play();
    setNotice({ kind: 'success', text: 'Switched back to the built-in audition loop.' });
  };

  const toggleChainBypass = () => {
    const next = !chainBypass;
    setChainBypass(next);
    audioRef.current?.setBypass(next);
  };

  const freezeCurrentRevision = async (validationResult: ProjectValidationResult) => {
    const frozen = await freezeProjectRevision(projectRef.current, validationResult);
    if (projectRef.current.revision !== frozen.revision) throw new Error('The project changed while it was being prepared. Analyze the current revision again.');
    frozenRef.current = frozen;
    setFrozenRevision(frozen);
    buildApprovedRef.current = false;
    setNotice({ kind: 'success', text: `Revision ${frozen.revision} is prepared with an exact content fingerprint.` });
  };

  const freezeBuild = async () => {
    try {
      setAnalyzing(true);
      let currentValidation = validationRef.current;
      if (currentValidation.status !== 'valid' || currentValidation.revision !== projectRef.current.revision) {
        const comparison = await performAnalysis();
        currentValidation = validateProjectForBuild(projectRef.current, comparison.processed);
        validationRef.current = currentValidation;
        setValidation(currentValidation);
      }
      if (currentValidation.status !== 'valid') {
        const issue = currentValidation.issues.find((entry) => entry.severity === 'error');
        throw new Error(issue?.message ?? 'The current project needs a successful audio analysis before it can be prepared for download.');
      }
      await freezeCurrentRevision(currentValidation);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'The current project could not be prepared for download.' });
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
    <main className={`app-shell ${modulesHidden ? 'modules-hidden' : ''} ${controlsHidden ? 'controls-hidden' : ''}`}>
      {mobilePanel && <button className="mobile-backdrop" aria-label="Close panel" onClick={() => setMobilePanel(null)} />}

      <ModuleSidebar
        mobileOpen={mobilePanel === 'modules'}
        onAddModule={addModule}
        onOpenInsert={() => setInsertIndex(project.chain.length)}
        onHide={() => { setModulesHidden(true); setMobilePanel(null); }}
      />

      <section className="workspace" aria-label="Plugin workspace">
        <header className="workspace-header">
          <div className="project-title-wrap">
            <button type="button" className={`restore-rail-button ${modulesHidden ? 'is-visible' : ''}`} onClick={() => setModulesHidden(false)}>Primitives</button>
            <button type="button" className={`mobile-rail-button modules-toggle ${modulesHidden ? 'is-hidden' : ''}`} onClick={() => { setModulesHidden(false); setMobilePanel('modules'); }}>Modules</button>
            <button type="button" className="icon-button text-icon-button" aria-label="Undo" title="Undo" disabled={!history.past.length} onClick={undo}>Undo</button>
            <button type="button" className="icon-button text-icon-button" aria-label="Redo" title="Redo" disabled={!history.future.length} onClick={redo}>Redo</button>
            <button type="button" className="icon-button text-icon-button" aria-label="Clear project" title="Clear primitives and controls" disabled={!Object.keys(project.nodes).length && !project.macros.length} onClick={clearProject}>Clear</button>
          </div>
          <div className="workspace-actions">
            <button type="button" className={`agent-button ${showAgent ? 'is-active' : ''}`} aria-label={proposal && proposal.status !== 'applied' ? 'WebMCP proposal ready' : agentStatus === 'connected' ? 'WebMCP connected' : 'WebMCP actions'} onClick={() => setShowAgent((open) => !open)}>
              <span className={`agent-dot ${agentStatus}`} /> WebMCP
            </button>
            <button type="button" className={`mobile-rail-button controls-toggle ${controlsHidden ? 'is-hidden' : ''}`} onClick={() => { setControlsHidden(false); setMobilePanel('macros'); }}>Controls</button>
            <button type="button" className={`restore-rail-button ${controlsHidden ? 'is-visible' : ''}`} onClick={() => setControlsHidden(false)}>Controls</button>
            <button type="button" className="export-button" onClick={() => setShowNative(true)}><span>Download</span><span>plugin</span></button>
          </div>
        </header>

        <div className={`workspace-canvas ${selectedNode ? 'has-inspector' : ''}`}>
          <div className="chain-label">
            <span className="chain-label-title">Signal chain</span>
            <strong
              className="chain-project-name"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Project name"
              tabIndex={0}
              title="Edit project name"
              onBlur={(event) => commitProjectName(event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === 'Escape') {
                  event.currentTarget.textContent = projectRef.current.name;
                  event.currentTarget.blur();
                }
              }}
            >{project.name}</strong>
          </div>
          <div className="chain-scroll">
            <div className={`signal-chain ${project.chain.length === 0 ? 'is-empty' : ''}`} aria-label="Audio signal chain">
              <span className="terminal">Input</span>
              <DropZone index={0} empty={project.chain.length === 0} active={dropIndex === 0} onOpen={() => setInsertIndex(0)} onDrop={handleDrop} onDragEnter={setDropIndex} />
              {project.chain.map((nodeId, index) => {
                const node = project.nodes[nodeId];
                const definition = MODULE_CATALOG[node.type];
                const primary = node.type === 'saturation'
                  ? definition.parameters.find((parameter) => parameter.id === 'character')!
                  : definition.parameters[0];
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
                    </div>
                    <DropZone index={index + 1} active={dropIndex === index + 1} onOpen={() => setInsertIndex(index + 1)} onDrop={handleDrop} onDragEnter={setDropIndex} />
                  </div>
                );
              })}
              <span className="terminal">Output</span>
            </div>
          </div>

          {project.chain.length === 0 && <p className="canvas-hint">Add Module</p>}

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
              <header><span>Primitives</span><button type="button" aria-label="Close" onClick={() => setInsertIndex(null)}>×</button></header>
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
                <div>
                  <span>{MODULE_CATALOG[selectedNode.type].shortName}</span>
                  <strong>{MODULE_CATALOG[selectedNode.type].name}</strong>
                  {(() => {
                    const mode = MODULE_CATALOG[selectedNode.type].parameters.find((parameter) =>
                      parameter.id === 'mode' || (selectedNode.type === 'saturation' && parameter.id === 'character')
                    );
                    if (!mode) return null;
                    const effective = getEffectiveParameter(project, selectedNode.id, mode.id);
                    return (
                      <label className="inspector-character">
                        <span>Mode</span>
                        <select
                          className="parameter-select"
                          value={effective}
                          onChange={(event) => commitCommands([{ type: 'set_parameter', nodeId: selectedNode.id, paramId: mode.id, value: Number(event.target.value) }])}
                        >
                          {mode.choices?.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                        </select>
                      </label>
                    );
                  })()}
                </div>
                <div className="inspector-actions">
                  {project.chain.includes(selectedNode.id) && <>
                    <button type="button" disabled={project.chain.indexOf(selectedNode.id) === 0} onClick={() => moveSelected(-1)} aria-label="Move module left">←</button>
                    <button type="button" disabled={project.chain.indexOf(selectedNode.id) === project.chain.length - 1} onClick={() => moveSelected(1)} aria-label="Move module right">→</button>
                  </>}
                  <button type="button" className={selectedNode.bypassed ? 'is-active' : ''} onClick={() => commitCommands([{ type: 'set_bypass', nodeId: selectedNode.id, bypassed: !selectedNode.bypassed }])}>{selectedNode.bypassed ? 'Enable' : 'Bypass'}</button>
                  <button type="button" className="danger-action" onClick={() => {
                    const confirmed = window.confirm(`Delete ${MODULE_CATALOG[selectedNode.type].name}? Its macro mappings will also be removed.`);
                    if (confirmed) commitCommands([{ type: 'delete_module', nodeId: selectedNode.id }]);
                  }}>Delete</button>
                  <button type="button" aria-label="Close inspector" onClick={() => setSelectedNodeId(null)}>×</button>
                </div>
              </header>
              <div className="parameter-grid">
                {MODULE_CATALOG[selectedNode.type].parameters.filter((parameter) => {
                  if (parameter.id === 'mode') return false;
                  if (selectedNode.type !== 'saturation') return true;
                  if (parameter.id === 'character') return false;
                  if (['drive', 'tone', 'mix', 'output'].includes(parameter.id)) return true;
                  const character = selectedNode.params.character;
                  return (character === 1 && parameter.id === 'bias')
                    || (character === 2 && parameter.id === 'clip')
                    || (character === 3 && ['age', 'wow'].includes(parameter.id));
                }).map((parameter) => {
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
            onClose={() => setShowAgent(false)}
            onApproveProposal={approveCurrentProposal}
            onDismissProposal={() => { proposalRef.current = null; setProposal(null); }}
          />
        </div>

        <AuditionBar
          playing={playing}
          sourceName={sourceName}
          isDemo={sourceName === 'Beat.Z demo loop'}
          playbackProgress={playbackProgress}
          waveformPeaks={waveformPeaks}
          meters={meters}
          chainBypass={chainBypass}
          onTogglePlayback={() => void togglePlayback()}
          onSeek={(progress) => void audioRef.current?.seek(progress)}
          onChooseFile={() => fileInputRef.current?.click()}
          onUseDemo={() => void switchToDemoAudio()}
          onToggleBypass={toggleChainBypass}
        />
      </section>

      <MacroSidebar
        project={project}
        mobileOpen={mobilePanel === 'macros'}
        selectedMacroId={selectedMacroId}
        selectedMacro={selectedMacro}
        hasAvailableTarget={Boolean(availableTarget)}
        onCreateMacro={createMacro}
        onSelectMacro={setSelectedMacroId}
        onAddMapping={addMapping}
        onChangeMappingTarget={changeMappingTarget}
        onCommit={(commands) => { commitCommands(commands); }}
        onHide={() => { setControlsHidden(true); setMobilePanel(null); }}
      />

      {showNative ? (
        <NativeExportModal
          projectName={project.name}
          frozen={frozenRevision}
          job={vst3ExportJob}
          error={vst3ExportError}
          busy={analyzing || vst3ExportBusy}
          onClose={() => setShowNative(false)}
          onFreezeBuild={() => void freezeBuild()}
          onRequestBuild={() => void requestNativeBuild()}
        />
      ) : null}

      <input ref={fileInputRef} className="visually-hidden" type="file" accept="audio/*" onChange={(event) => void chooseAudio(event.target.files?.[0])} />
      {notice && <div className={`notice ${notice.kind}`} role="status" aria-live="polite">{notice.text}</div>}
    </main>
  );
}
