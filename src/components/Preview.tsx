import { useEffect, useRef } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { renderFrame } from '../lib/renderer';
import { getSceneLabel } from '../lib/timeline';
import { formatTime } from '../lib/media';
import type { LoadedAssets, VideoConfig } from '../types';

interface Props {
  config: VideoConfig; assets: LoadedAssets | null; audio: AudioBuffer | null;
  context: AudioContext | null; time: number; playing: boolean; muted: boolean;
  seekRevision: number; onTime: (time: number) => void; onPlay: () => void;
  onPause: () => void; onSeek: (time: number) => void; onMute: () => void;
}
export default function Preview({ config, assets, audio, context, time, playing, muted, seekRevision, onTime, onPlay, onPause, onSeek, onMute }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(time);
  const callbacks = useRef({ onTime, onPause });
  useEffect(() => { callbacks.current = { onTime, onPause }; });
  useEffect(() => { timeRef.current = time; }, [time]);
  useEffect(() => {
    if (!canvas.current || !assets || playing) return;
    const ctx = canvas.current.getContext('2d');
    if (ctx) renderFrame(ctx, time, config, assets);
  }, [assets, config, time, playing]);

  useEffect(() => {
    if (!playing || !assets || !canvas.current) return;
    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;
    const start = timeRef.current;
    const startClock = context?.state === 'running' ? context.currentTime : performance.now() / 1000;
    const clock = context?.state === 'running' ? () => context.currentTime : () => performance.now() / 1000;
    let source: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    if (context && audio) {
      const delay = Math.max(0, config.audioOffset - start);
      const sourceStart = config.audioTrimStart + Math.max(0, start - config.audioOffset);
      const remaining = Math.min(audio.duration - sourceStart, config.duration - start - delay);
      if (remaining > 0) {
        source = context.createBufferSource(); source.buffer = audio;
        gain = context.createGain(); gain.gain.value = muted ? 0 : config.volume;
        source.connect(gain); gain.connect(context.destination);
        source.start(context.currentTime + delay, sourceStart, remaining);
      }
    }
    let raf = 0; let lastUi = -1;
    function draw() {
      const next = Math.min(config.duration, start + clock() - startClock);
      timeRef.current = next;
      renderFrame(ctx!, Math.min(next, config.duration - 1 / 30), config, assets!);
      if (next - lastUi > .08 || next >= config.duration) { callbacks.current.onTime(next); lastUi = next; }
      if (next >= config.duration) callbacks.current.onPause();
      else raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); try { source?.stop(); } catch { /* already stopped */ } source?.disconnect(); gain?.disconnect(); };
  }, [playing, assets, config, context, audio, muted, seekRevision]);

  return <section className="preview-section" aria-label="Video preview">
    <div className="preview-heading"><h2>Your flight</h2><span>{getSceneLabel(time, config)}</span></div>
    <div className="canvas-frame"><canvas ref={canvas} width={540} height={540} aria-label="Live preview of your galaxy meme" role="img" />{!assets && <div className="preview-loading"><span className="spinner" />Preparing your galaxy…</div>}</div>
    <div className="transport">
      <button className="play-button" onClick={playing ? onPause : onPlay} disabled={!assets} aria-label={playing ? 'Pause preview' : 'Play preview'}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
      <input type="range" min="0" max={config.duration} step={1 / 30} value={time} aria-label="Preview position" onChange={(e) => onSeek(Number(e.target.value))} />
      <button className="icon-button" onClick={() => onSeek(0)} aria-label="Replay from beginning"><RotateCcw size={18} /></button>
      <button className="icon-button" onClick={onMute} aria-label={muted ? 'Unmute preview' : 'Mute preview'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
    </div>
    <div className="timeline-labels"><span>{formatTime(time)}</span><span>{formatTime(config.duration)}</span></div>
    <div className="scene-shortcuts" aria-label="Jump to scene">{[['The intro', .3], ['Takeoff', config.launchTime - .05], ['Gaylaxy', config.launchTime + 1.5], ['The finale', Math.min(config.duration - .2, config.echoTime + 2)]] .map(([label, at]) => <button key={label} type="button" onClick={() => onSeek(Number(at))}>{label}<span>↗</span></button>)}</div>
    <p className="preview-note">Two people. One flag. Absolutely no chill.</p>
  </section>;
}
