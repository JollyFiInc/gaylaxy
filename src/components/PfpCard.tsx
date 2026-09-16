import { useEffect, useRef, useState } from 'react';
import { ImagePlus, SlidersHorizontal } from 'lucide-react';
import type { CropConfig, StoredMedia } from '../types';
import { validateImage } from '../lib/media';

interface Props {
  index: 0 | 1; media: StoredMedia; name: string; crop: CropConfig; disabled: boolean;
  onImage: (file: File) => void; onName: (name: string) => void;
  onCrop: (crop: CropConfig) => void; onError: (message: string) => void;
}
export default function PfpCard({ index, media, name, crop, disabled, onImage, onName, onCrop, onError }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  useEffect(() => { const value = URL.createObjectURL(media.blob); setUrl(value); return () => URL.revokeObjectURL(value); }, [media]);
  function choose(file?: File) {
    if (!file || disabled) return;
    try { validateImage(file); onImage(file); } catch (error) { onError((error as Error).message); }
  }
  return <div className="pfp-card">
    <div className="field-heading"><span>Person {index + 1}</span><button type="button" className="icon-button small" title="Adjust picture" aria-label={`Adjust person ${index + 1} picture`} aria-expanded={adjusting} disabled={disabled} onClick={() => setAdjusting(!adjusting)}><SlidersHorizontal size={15} /></button></div>
    <button type="button" className={`image-upload ${dragging ? 'dragging' : ''}`} disabled={disabled} aria-label={`Upload profile picture ${index + 1}`} onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}>
      {url && <img src={url} alt={`Profile picture for ${name || `person ${index + 1}`}`} />}
      <span className="upload-overlay"><ImagePlus size={17} /><span>Change picture</span></span>
    </button>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Choose profile picture ${index + 1}`} disabled={disabled} onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
    <label className="sr-only" htmlFor={`name-${index}`}>Person {index + 1} name</label>
    <input id={`name-${index}`} className="name-input" value={name} maxLength={40} disabled={disabled} placeholder="Their name" onChange={(e) => onName(e.target.value)} />
    {adjusting && <div className="crop-controls">
      <label>Frame<select value={crop.framing} disabled={disabled} onChange={(e) => onCrop({ ...crop, framing: e.target.value as CropConfig['framing'] })}><option value="contain">Original</option><option value="square">Square crop</option><option value="circle">Circle crop</option></select></label>
      {(['zoom', 'x', 'y'] as const).map((field) => <label key={field}>{field === 'zoom' ? 'Zoom' : field === 'x' ? 'Horizontal' : 'Vertical'}<input type="range" min={field === 'zoom' ? 1 : -1} max={field === 'zoom' ? 3 : 1} step="0.05" value={crop[field]} disabled={disabled} onChange={(e) => onCrop({ ...crop, [field]: Number(e.target.value) })} /></label>)}
      <button className="text-button" disabled={disabled} onClick={() => onCrop({ framing: 'contain', zoom: 1, x: 0, y: 0 })}>Reset framing</button>
    </div>}
  </div>;
}
