import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Download, Flag, FolderOpen, Heart, ImagePlus, LoaderCircle, Music2, Orbit, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal, Sparkles, Upload, Users, X } from 'lucide-react';
import PfpCard from './components/PfpCard';
import Preview from './components/Preview';
import RangeField from './components/RangeField';
import ColorControls from './components/ColorControls';
import { assetUrl, freshConfig } from './config';
import { FLAGS } from './flags';
import { closeRaster, downloadBlob, fetchMedia, formatSize, formatTime, loadRaster, loadVideoFont, validateImage } from './lib/media';
import { loadProject, saveProject, withDuration } from './lib/project';
import { exportCredits } from './lib/encoder-common';
import { extractFlagPalette, recolorFlagSvg } from './lib/flag-colors';
import { videoFilename } from './lib/export-name';
import { BUILTIN_SOUNDTRACK_NAME, loadBuiltInSoundtrack } from './lib/builtin-audio';
import type { ExportProgress, ExportResult, LoadedAssets, ProjectMedia, RasterAsset, StoredMedia, VideoConfig } from './types';

type Tab = 'people' | 'flag' | 'sound' | 'style';
const TABS = [{ id: 'people', label: 'People', icon: Users }, { id: 'flag', label: 'Flag', icon: Flag }, { id: 'sound', label: 'Sound', icon: Music2 }, { id: 'style', label: 'Style', icon: SlidersHorizontal }] as const;
const stored = (file: File): StoredMedia => ({ name: file.name, type: file.type, blob: file });
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function useRaster(source: StoredMedia | null, onError: (message: string) => void): RasterAsset | null {
  const [loaded, setLoaded] = useState<{ source: StoredMedia; asset: RasterAsset } | null>(null);
  const report = useRef(onError); report.current = onError;
  useEffect(() => {
    let active = true; let asset: RasterAsset | null = null;
    if (source) void loadRaster(source.blob).then((result) => { asset = result; if (active) setLoaded({ source, asset }); else closeRaster(asset); }).catch((error) => { if (active) report.current(errorText(error)); });
    return () => { active = false; closeRaster(asset); };
  }, [source]);
  return source && loaded?.source === source ? loaded.asset : null;
}

function useFlagColours(source: StoredMedia | null, overrides: Record<string, string>, onError: (message: string) => void) {
  const [svg, setSvg] = useState<{ source: StoredMedia; text: string; palette: string[] } | null>(null);
  useEffect(() => {
    let active = true;
    if (source?.type === 'image/svg+xml') void source.blob.text().then((text) => {
      const palette = extractFlagPalette(text);
      if (active) setSvg({ source, text, palette });
    }).catch((error) => { if (active) onError(errorText(error)); });
    return () => { active = false; };
  }, [source, onError]);
  const current = svg?.source === source ? svg : null;
  const coloured = useMemo(() => {
    if (!source || !Object.keys(overrides).length || source.type !== 'image/svg+xml') return source;
    if (!current) return null;
    return { ...source, blob: new Blob([recolorFlagSvg(current.text, overrides)], { type: source.type }) };
  }, [source, current, overrides]);
  return { source: coloured, palette: current?.palette ?? [], editable: source?.type === 'image/svg+xml' };
}

function Waveform({ audio }: { audio: AudioBuffer }) {
  const bars = useMemo(() => {
    const samples = audio.getChannelData(0);
    return Array.from({ length: 76 }, (_, i) => {
      const start = Math.floor(i * samples.length / 76); const end = Math.floor((i + 1) * samples.length / 76);
      let peak = 0; for (let j = start; j < end; j += Math.max(1, Math.floor((end - start) / 160))) peak = Math.max(peak, Math.abs(samples[j]));
      return Math.max(4, peak * 48);
    });
  }, [audio]);
  return <div className="waveform" aria-label="Audio waveform">{bars.map((height, i) => <span key={i} style={{ height }} />)}</div>;
}

export default function App() {
  const [config, setConfig] = useState(freshConfig);
  const [media, setMedia] = useState<ProjectMedia | null>(null);
  const [flagMedia, setFlagMedia] = useState<{ id: string; media: StoredMedia } | null>(null);
  const [audio, setAudio] = useState<AudioBuffer | null>(null);
  const [context, setContext] = useState<AudioContext | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const [tab, setTab] = useState<Tab>('people');
  const [search, setSearch] = useState('');
  const [time, setTime] = useState(8.5);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [seekRevision, setSeekRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<(ExportResult & { url: string; config: VideoConfig; configKey: string; media: ProjectMedia | null; filename: string }) | null>(null);
  const configKey = JSON.stringify(config);
  const latestInputs = useRef({ config, configKey, media });
  latestInputs.current = { config, configKey, media };
  const [software, setSoftware] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const flagInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const soundtrack = loadBuiltInSoundtrack().catch(() => {
      if (active) setError('The built-in soundtrack could not load. You can try it again in Sound or upload your own.');
      return null;
    });
    void Promise.all([fetchMedia('demo-you.svg', 'you.svg'), fetchMedia('demo-them.svg', 'them.svg'), loadVideoFont(), soundtrack]).then(([first, second, , track]) => {
      if (active && !latestInputs.current.media) {
        setMedia({ pfps: [first, second], customFlag: null, audio: track?.media ?? null });
        setAudio(track?.audio ?? null);
      }
    }).catch((e) => { if (active) setError(errorText(e)); });
    return () => { active = false; controller.current?.abort(); };
  }, []);
  useEffect(() => () => { void contextRef.current?.close(); }, []);
  useEffect(() => {
    let active = true;
    const flag = FLAGS.find((item) => item.id === config.flagId);
    if (flagMedia?.id === config.flagId) return;
    if (flag) void fetchMedia(flag.assetPath, `${flag.id}.svg`).then((next) => { if (active) setFlagMedia({ id: flag.id, media: next }); }).catch((e) => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, [config.flagId, flagMedia?.id]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => { setResult(null); }, [config, media]);

  const first = useRaster(media?.pfps[0] ?? null, setError);
  const second = useRaster(media?.pfps[1] ?? null, setError);
  const selectedFlagMedia = config.flagId === 'custom' ? media?.customFlag ?? null : flagMedia?.id === config.flagId ? flagMedia.media : null;
  const flagColours = useFlagColours(selectedFlagMedia, config.colors.flagOverrides, setError);
  const flag = useRaster(flagColours.source, setError);
  const assets = useMemo<LoadedAssets | null>(() => first && second && flag ? { pfps: [first, second], flag } : null, [first, second, flag]);
  const selectedFlag = FLAGS.find((item) => item.id === config.flagId);
  const filteredFlags = FLAGS.filter((item) => `${item.name} ${item.variant}`.toLowerCase().includes(search.toLowerCase().trim()));
  const disabled = Boolean(busy);
  const change = <K extends keyof VideoConfig>(key: K, value: VideoConfig[K]) => {
    setConfig((previous) => ({ ...previous, [key]: value, ...(key === 'flagId' ? { colors: { ...previous.colors, flagOverrides: {} } } : {}) }));
    setResult(null); setNotice('');
  };
  // Never expose a finished file made with older inputs, including the render before effects run.
  const currentResult = !busy && result?.configKey === configKey && result.media === media ? result : null;
  function seek(next: number) { setTime(next); setSeekRevision((value) => value + 1); }
  async function play() {
    try {
      if (audio) {
        const next = contextRef.current ?? new AudioContext(); contextRef.current = next;
        await next.resume(); setContext(next);
      }
      if (time >= config.duration - .01) seek(0);
      setPlaying(true);
    } catch (e) { setError(errorText(e)); }
  }
  async function chooseImage(file: File, index: 0 | 1) {
    if (busy) return;
    setBusy('Reading your picture…');
    try {
      validateImage(file);
      const checked = await loadRaster(file); closeRaster(checked);
      setMedia((previous) => { if (!previous) return previous; const pfps = [...previous.pfps] as ProjectMedia['pfps']; pfps[index] = stored(file); return { ...previous, pfps }; });
      setError('');
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  function changeName(index: 0 | 1, name: string) {
    setConfig((previous) => ({ ...previous, [index === 0 ? 'name1' : 'name2']: name, captions: index === 0 && previous.captions.names === `${previous.name1} and me` ? { ...previous.captions, names: `${name} and me` } : previous.captions }));
  }
  function swap() {
    setMedia((previous) => previous && ({ ...previous, pfps: [previous.pfps[1], previous.pfps[0]] }));
    setConfig((previous) => ({ ...previous, name1: previous.name2, name2: previous.name1, crops: [previous.crops[1], previous.crops[0]], captions: previous.captions.names === `${previous.name1} and me` ? { ...previous.captions, names: `${previous.name2} and me` } : previous.captions }));
  }
  async function chooseFlag(file?: File) {
    if (!file || busy || !media) return;
    setBusy('Reading your flag…');
    try { validateImage(file); const checked = await loadRaster(file); closeRaster(checked); setMedia((previous) => previous && ({ ...previous, customFlag: stored(file) })); change('flagId', 'custom'); setError(''); }
    catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  async function chooseAudio(file?: File) {
    if (!file || busy || !media) return;
    setPlaying(false); setBusy('Reading your soundtrack…'); setError('');
    try {
      const { decodeAudio } = await import('./lib/audio'); const decoded = await decodeAudio(file);
      setAudio(decoded); setMedia((previous) => previous && ({ ...previous, audio: stored(file) }));
      setConfig((previous) => ({ ...previous, audioTrimStart: 0, audioOffset: 0 })); setNotice('Soundtrack added. Play your preview to check the timing.');
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  async function restoreSoundtrack() {
    if (busy || !media) return;
    setPlaying(false); setBusy('Loading the built-in soundtrack…'); setError('');
    try {
      const track = await loadBuiltInSoundtrack();
      setAudio(track.audio); setMedia((previous) => previous && ({ ...previous, audio: track.media }));
      setConfig((previous) => ({ ...previous, audioTrimStart: 0, audioOffset: 0 }));
      setNotice('Built-in soundtrack restored.');
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  async function save() {
    if (!media || !selectedFlagMedia) return;
    setBusy('Packing your project…'); setError('');
    try { downloadBlob(await saveProject(config, media, selectedFlagMedia), 'gaylaxy-project.zip'); setNotice('Project saved with your pictures, flag, soundtrack, and settings.'); }
    catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  async function open(file?: File) {
    if (!file || busy) return;
    setPlaying(false); setBusy('Opening your project…'); setError('');
    try {
      const project = await loadProject(file);
      if (!FLAGS.some((item) => item.id === project.config.flagId) && project.config.flagId !== 'custom') throw new Error('This project uses an unknown flag.');
      if (project.config.flagId === 'custom' && !project.media.customFlag) throw new Error('This project is missing its custom flag.');
      const checked = await Promise.allSettled([...project.media.pfps, ...(project.media.customFlag ? [project.media.customFlag] : []), ...(project.selectedFlagMedia ? [project.selectedFlagMedia] : [])].map((item) => loadRaster(item.blob)));
      checked.forEach((item) => { if (item.status === 'fulfilled') closeRaster(item.value); });
      const failure = checked.find((item) => item.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      const nextAudio = project.media.audio ? await (await import('./lib/audio')).decodeAudio(project.media.audio.blob) : null;
      setFlagMedia(project.selectedFlagMedia ? { id: project.config.flagId, media: project.selectedFlagMedia } : null);
      setConfig(project.config); setMedia(project.media); setAudio(nextAudio); seek(Math.min(8.5, project.config.duration - .2)); setNotice('Project opened. Everything is ready to edit.');
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  async function generate(kind: 'video' | 'audio') {
    if (!assets || busy || (kind === 'audio' && !audio)) return;
    const inputs = latestInputs.current;
    const exportConfig = structuredClone(inputs.config);
    if (kind === 'video') setResult(null);
    setPlaying(false); setError(''); setNotice(''); setProgress({ fraction: 0, stage: 'Preparing export…' }); setBusy(kind === 'video' ? 'Making your video' : 'Making your MP3');
    const abort = new AbortController(); controller.current = abort;
    try {
      const encoder = await import('./lib/export');
      if (kind === 'video') {
        const next = await encoder.exportVideo({ config: exportConfig, assets, audio, signal: abort.signal, onProgress: setProgress, forceFallback: software });
        if (abort.signal.aborted || latestInputs.current.configKey !== inputs.configKey || latestInputs.current.media !== inputs.media) return;
        setResult({ ...next, url: URL.createObjectURL(next.blob), config: exportConfig, configKey: inputs.configKey, media: inputs.media, filename: videoFilename(exportConfig.captions.names) });
        setNotice(`Your ${next.resolution} × ${next.resolution} video is ready${audio ? '.' : ' — without sound. Add a soundtrack in Sound if you want music.'}`);
      } else { const blob = await encoder.exportMp3(audio!, exportConfig, abort.signal, setProgress); downloadBlob(blob, 'gaylaxy-soundtrack.mp3'); setNotice('MP3 soundtrack downloaded.'); }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') setNotice('Export cancelled. Your edits are still here.');
      else setError(errorText(e));
    } finally { controller.current = null; setBusy(''); setProgress(null); }
  }
  function credits() { downloadBlob(new Blob([exportCredits(currentResult?.config ?? config)], { type: 'text/plain' }), 'gaylaxy-flag-credits.txt'); }

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href={assetUrl('')} aria-label="Gaylaxy Maker home"><span className="brand-mark"><Orbit size={25} /></span><span>gaylaxy<span className="brand-light">maker</span><span className="beta-tag">BETA</span></span></a>
      <div className="project-actions"><button className="icon-button" aria-label="Reset settings" title="Reset captions, flag, and settings; keep your uploaded media" disabled={disabled} onClick={() => { setPlaying(false); setConfig(freshConfig()); seek(8.5); setError(''); setNotice('Settings reset. Your uploaded pictures and soundtrack are still here.'); }}><RotateCcw size={16} /></button><button className="secondary-button" aria-label="Open project" title="Open project" onClick={() => projectInput.current?.click()} disabled={disabled}><FolderOpen size={16} /><span>Open project</span></button><button className="secondary-button" aria-label="Save project" title="Save project" onClick={() => void save()} disabled={disabled || !media || !selectedFlagMedia}><Save size={16} /><span>Save project</span></button></div>
      <input ref={projectInput} type="file" accept=".zip,application/zip" aria-label="Open saved project" className="sr-only" disabled={disabled} onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ''; }} />
    </header>

    <main>
      <div className="page-heading"><div><div className="eyebrow"><Sparkles size={14} /> A LITTLE LOVE. A LOT OF SPACE.</div><h1>Meet you in the gaylaxy.</h1><p>Pick your people, fly your flag, make it yours.</p></div><span className="local-badge"><ShieldCheck size={15} /> Made on your device</span></div>
      <div className="workspace">
        <Preview config={config} assets={assets} audio={audio} context={context} time={time} playing={playing} muted={muted} seekRevision={seekRevision} onTime={setTime} onPlay={() => void play()} onPause={() => setPlaying(false)} onSeek={seek} onMute={() => setMuted(!muted)} />

        <section className="editor" aria-label="Video editor">
          <div className="tabs" role="tablist" aria-label="Video settings">{TABS.map(({ id, label, icon: Icon }) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const next = TABS[(TABS.findIndex((item) => item.id === tab) + (e.key === 'ArrowRight' ? 1 : 3)) % 4].id; setTab(next); document.getElementById(`tab-${next}`)?.focus(); } }}><Icon size={17} />{label}</button>)}</div>
          <div className="editor-content" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === 'people' && <>
              <div className="section-title"><div><h2>Who's coming along?</h2><p>Two profile pictures. Endless possibilities.</p></div><button className="icon-button" onClick={swap} disabled={disabled || !media} aria-label="Swap people" title="Swap people"><ArrowLeftRight size={18} /></button></div>
              <div className="people-grid">{media ? ([0, 1] as const).map((index) => <PfpCard key={index} index={index} media={media.pfps[index]} name={index === 0 ? config.name1 : config.name2} crop={config.crops[index]} disabled={disabled} onImage={(file) => void chooseImage(file, index)} onName={(name) => changeName(index, name)} onCrop={(crop) => { const crops = [...config.crops] as VideoConfig['crops']; crops[index] = crop; change('crops', crops); }} onError={setError} />) : <p>Loading your crew…</p>}</div>
              <p className="field-hint">Drop a PNG, JPG, or WebP onto either picture. Up to 20 MB.</p>
              <label className="text-field">Your main caption<input value={config.captions.names} maxLength={160} disabled={disabled} autoComplete="off" onChange={(e) => change('captions', { ...config.captions, names: e.target.value })} /></label>
              <details className="details-panel"><summary>Edit all captions<ChevronDown size={16} /></summary><div className="details-body">{([['intro', 'Opening'], ['together', 'Together'], ['flight', 'The flight'], ['ending', 'The ending']] as const).map(([key, label]) => <label key={key} className="text-field">{label}<textarea rows={2} value={config.captions[key]} maxLength={160} disabled={disabled} onChange={(e) => change('captions', { ...config.captions, [key]: e.target.value })} /></label>)}</div></details>
            </>}

            {tab === 'flag' && <>
              <div className="section-title"><div><h2>Fly your colors.</h2><p>{FLAGS.length} flags, and space for your own.</p></div><Heart size={20} className="pink-icon" /></div>
              <label className="search-field"><Search size={17} /><input type="search" placeholder="Find your flag…" aria-label="Search flags" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <div className="flag-grid">{filteredFlags.map((item) => <button key={item.id} className={`flag-option ${config.flagId === item.id ? 'selected' : ''}`} disabled={disabled} aria-pressed={config.flagId === item.id} onClick={() => change('flagId', item.id)} title={item.variant}><span className="flag-thumb"><img src={assetUrl(item.assetPath)} alt="" />{config.flagId === item.id && <span className="flag-check"><Check size={12} /></span>}</span><span>{item.name}</span></button>)}</div>
              {!filteredFlags.length && <p className="empty-state">No flags match “{search}”. You can upload your own below.</p>}
              <button className="upload-custom" disabled={disabled || !media} onClick={() => flagInput.current?.click()}><ImagePlus size={17} />{config.flagId === 'custom' ? 'Replace your custom flag' : 'Upload your own flag'}<ArrowUpRight size={16} /></button>
              {media?.customFlag && config.flagId !== 'custom' && <button className="text-button" disabled={disabled} onClick={() => change('flagId', 'custom')}>Use {media.customFlag.name}</button>}
              <input ref={flagInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose custom flag" disabled={disabled || !media} onChange={(e) => { void chooseFlag(e.target.files?.[0]); e.target.value = ''; }} />
              <p className="field-hint">Selected: <strong>{selectedFlag?.name ?? 'Your custom flag'}</strong>{selectedFlag && <> · <a href={selectedFlag.sourceUrl} target="_blank" rel="noreferrer">Flag source</a><br />{selectedFlag.variant} · {selectedFlag.license}</>}</p>
              {flagColours.editable && <button className="text-button" onClick={() => setTab('style')}>Edit flag colours in Style →</button>}
            </>}

            {tab === 'sound' && <>
              <div className="section-title"><div><h2>Give it a soundtrack.</h2><p>The meme soundtrack is built in. Make it yours.</p></div><Music2 size={21} className="pink-icon" /></div>
              <button className="audio-dropzone" disabled={disabled || !media} onClick={() => audioInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void chooseAudio(e.dataTransfer.files[0]); }}><span className="audio-upload-icon"><Upload size={24} /></span><strong>{audio ? 'Change soundtrack' : 'Drop your audio or video here'}</strong><span>or click to browse · up to 150 MB</span><small>MP3, WAV, M4A, OGG, MP4, and WebM</small></button>
              <input ref={audioInput} type="file" className="sr-only" accept="audio/*,video/*" aria-label="Choose soundtrack" disabled={disabled || !media} onChange={(e) => { void chooseAudio(e.target.files?.[0]); e.target.value = ''; }} />
              <button className="text-button builtin-soundtrack" disabled={disabled || !media || media.audio?.name === BUILTIN_SOUNDTRACK_NAME} onClick={() => void restoreSoundtrack()}><Music2 size={14} />{media?.audio?.name === BUILTIN_SOUNDTRACK_NAME ? 'Built-in soundtrack selected' : 'Use built-in soundtrack'}</button>
              {audio && media?.audio ? <div className="audio-settings"><div className="audio-file"><Music2 size={17} /><strong title={media.audio.name}>{media.audio.name}</strong><span>{formatTime(audio.duration)}</span><button className="icon-button small" aria-label="Remove soundtrack" disabled={disabled} onClick={() => { setPlaying(false); setAudio(null); setMedia({ ...media, audio: null }); }}><X size={15} /></button></div><Waveform audio={audio} /><label className="number-field">Start in source audio<span><input aria-label="Audio trim start" type="number" min={0} max={Math.max(0, audio.duration - .05)} step=".1" value={config.audioTrimStart} disabled={disabled} onChange={(e) => change('audioTrimStart', Math.max(0, Math.min(audio.duration - .05, Number(e.target.value))))} />seconds</span></label><RangeField label="Start on video timeline" value={config.audioOffset} min={-10} max={Math.min(20, config.duration)} step={.1} suffix="s" disabled={disabled} onChange={(value) => change('audioOffset', value)} /><RangeField label="Volume" value={config.volume} min={0} max={1.5} disabled={disabled} onChange={(value) => change('volume', value)} /><p className="field-hint">Positive timing adds a delay. Negative timing skips ahead. Preview and exports use the same trim.</p></div> : <div className="quiet-note"><Music2 size={17} /><p>Your video is currently silent. Upload a file to add music. Audio stays on your device.</p></div>}
            </>}

            {tab === 'style' && <>
              <div className="section-title"><div><h2>A little more you.</h2><p>Fine-tune the flight.</p></div><Sparkles size={20} className="pink-icon" /></div>
              <ColorControls colors={config.colors} palette={flagColours.palette} flagEditable={flagColours.editable} disabled={disabled} onChange={(colors) => change('colors', colors)} />
              <div className="style-ranges">{([{ key: 'pfpScale', label: 'Picture size', min: .65, max: 1.2 }, { key: 'flightSpeed', label: 'Flight speed', min: .3, max: 2 }, { key: 'bobAmount', label: 'Bounce', min: 0, max: 2 }, { key: 'flagScale', label: 'Flag size', min: .6, max: 1.3 }, { key: 'brightness', label: 'Galaxy brightness', min: .4, max: 1.6 }, { key: 'captionScale', label: 'Caption size', min: .65, max: 1.3 }] as const).map((field) => <RangeField key={field.key} label={field.label} value={config[field.key]} min={field.min} max={field.max} disabled={disabled} onChange={(value) => change(field.key, value)} />)}</div>
              <label className="toggle-field"><span>Echoes in the finale<small>Leave a little stardust behind.</small></span><input type="checkbox" checked={config.showEchoes} disabled={disabled} onChange={(e) => change('showEchoes', e.target.checked)} /></label>
              <details className="details-panel"><summary>Scene timing<ChevronDown size={16} /></summary><div className="details-body"><RangeField label="Video duration" value={config.duration} min={8} max={30} step={1 / 30} suffix="s" disabled={disabled} onChange={(value) => { setConfig(withDuration(config, value)); if (time > value) seek(value - .1); }} /><RangeField label="Second person joins" value={config.firstSceneEnd} min={.5} max={Math.min(config.launchTime - .2, config.duration - 2)} step={1 / 30} suffix="s" disabled={disabled} onChange={(value) => change('firstSceneEnd', value)} /><RangeField label="Launch into space" value={config.launchTime} min={config.firstSceneEnd + .2} max={Math.min(config.echoTime, config.duration - 1)} step={1 / 30} suffix="s" disabled={disabled} onChange={(value) => change('launchTime', value)} /><RangeField label="Finale begins" value={config.echoTime} min={config.launchTime} max={config.duration} step={1 / 30} suffix="s" disabled={disabled} onChange={(value) => change('echoTime', value)} /></div></details>
            </>}
          </div>

          <div className="export-panel">
            <div className="export-options"><label>Video quality<select aria-label="Video quality" value={config.resolution} disabled={disabled} onChange={(e) => change('resolution', Number(e.target.value) as 720 | 1080)}><option value={1080}>1080 × 1080</option><option value={720}>720 × 720</option></select></label><span>{config.duration.toFixed(1)}s <span>·</span> 30 fps <span>·</span> MP4</span></div>
            {progress ? <div className="export-progress" role="status"><div><LoaderCircle size={17} className="spin" /><strong>{busy}</strong><span>{Math.round(progress.fraction * 100)}%</span></div><progress max="1" value={progress.fraction} /><p>{progress.stage}</p><button className="secondary-button" onClick={() => controller.current?.abort()}>Cancel export</button></div> : <button className="generate-button" disabled={disabled || !assets} onClick={() => void generate('video')}><Sparkles size={18} />{busy || 'Make my video'}<ArrowUpRight size={20} /></button>}
            <div className="export-secondary"><span>{audio ? <><CheckCircle2 size={12} /> {media?.audio?.name === BUILTIN_SOUNDTRACK_NAME ? 'Built-in soundtrack included' : 'With your soundtrack'}</> : <><Music2 size={12} /> Silent until you add audio</>}</span><button className="text-button" disabled={disabled || !audio} onClick={() => void generate('audio')}><Download size={13} /> MP3 audio</button></div>
            <details className="compatibility"><summary>Export options</summary><label><input type="checkbox" checked={software} disabled={disabled} onChange={(e) => setSoftware(e.target.checked)} /> Use software encoder (720 × 720)</label><p>Automatic uses your browser's video encoder, with a 720 × 720 software fallback. Software mode downloads about 31 MB once and can take a few minutes.</p></details>
            {currentResult && <div className="result-card"><div><CheckCircle2 size={20} /><span><strong>Your video is ready.</strong><small>{currentResult.resolution} × {currentResult.resolution} · {formatSize(currentResult.blob.size)}{currentResult.method === 'ffmpeg' ? ' · Software export' : ''}</small></span></div><p className="rendered-caption">Caption: <strong>{currentResult.config.captions.names || '(no caption)'}</strong></p><video key={currentResult.url} className="rendered-video" aria-label="Rendered video" src={currentResult.url} controls playsInline preload="metadata" onPlay={() => setPlaying(false)} /><a className="download-button" href={currentResult.url} download={currentResult.filename}><Download size={17} />Download MP4</a><button className="text-button" onClick={credits}>Download flag credits</button></div>}
          </div>
        </section>
      </div>
      {error && <div className="message error" role="alert"><span>{error}</span><button className="icon-button small" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
      <div className="message notice" role="status" aria-live="polite">{notice || (busy && !progress ? busy : '')}</div>
    </main>
    <footer><span><Heart size={13} /> For your favorite person, in every color.</span><div><span>No uploads. No accounts. Just you.</span><a href={assetUrl('FLAGS_LICENSES.md')} target="_blank" rel="noreferrer">Flag credits</a><a href={assetUrl('THIRD_PARTY_NOTICES.md')} target="_blank" rel="noreferrer">Software credits</a></div></footer>
  </div>;
}
