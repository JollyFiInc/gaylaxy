import { freshColors } from '../config';
import type { VideoColors } from '../types';
import './ColorControls.css';

interface Props {
  colors: VideoColors;
  palette?: string[];
  flagEditable?: boolean;
  disabled?: boolean;
  onChange: (colors: VideoColors) => void;
}

function ColorField({ label, value, disabled, onChange }: {
  label: string; value: string; disabled?: boolean; onChange: (value: string) => void;
}) {
  return <label className="color-field">
    <span className="color-field-label">{label}</span>
    <span className="color-field-value">
      <input type="color" aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      <output>{value.toUpperCase()}</output>
    </span>
  </label>;
}

export default function ColorControls({ colors, palette = [], flagEditable = true, disabled, onChange }: Props) {
  const setColor = (key: Exclude<keyof VideoColors, 'galaxy' | 'flagOverrides'>, value: string) => onChange({ ...colors, [key]: value });
  return <section className="color-controls" aria-label="Video colours">
    <div className="color-controls-heading"><h3>Make it your colours</h3><button type="button" className="text-button" disabled={disabled} onClick={() => onChange(freshColors())}>Reset colours</button></div>
    <fieldset disabled={disabled}>
      <legend>Galaxy</legend>
      <div className="color-controls-grid">
        {colors.galaxy.map((value, index) => <ColorField key={index} label={`Galaxy colour ${index + 1}`} value={value} disabled={disabled} onChange={(value) => {
          const galaxy = [...colors.galaxy] as VideoColors['galaxy']; galaxy[index] = value;
          onChange({ ...colors, galaxy });
        }} />)}
      </div>
    </fieldset>
    <fieldset disabled={disabled}>
      <legend>Intro</legend>
      <div className="color-controls-grid">
        <ColorField label="Intro background" value={colors.introBackground} disabled={disabled} onChange={(value) => setColor('introBackground', value)} />
        <ColorField label="Intro text" value={colors.introCaptionFill} disabled={disabled} onChange={(value) => setColor('introCaptionFill', value)} />
        <ColorField label="Intro accent text" value={colors.introCaptionAccent} disabled={disabled} onChange={(value) => setColor('introCaptionAccent', value)} />
      </div>
    </fieldset>
    <fieldset disabled={disabled}>
      <legend>Flight captions</legend>
      <div className="color-controls-grid">
        <ColorField label="Caption text" value={colors.captionFill} disabled={disabled} onChange={(value) => setColor('captionFill', value)} />
        <ColorField label="Caption outline" value={colors.captionOutline} disabled={disabled} onChange={(value) => setColor('captionOutline', value)} />
      </div>
    </fieldset>
    <fieldset disabled={disabled || !flagEditable}>
      <legend>Flag</legend>
      {flagEditable && palette.length > 0 ? <div className="color-controls-grid">
        {palette.slice(0, 32).map((source, index) => <ColorField key={source} label={`Flag colour ${index + 1}`} value={colors.flagOverrides[source] ?? source} disabled={disabled} onChange={(value) => {
          const flagOverrides = { ...colors.flagOverrides };
          if (value === source) delete flagOverrides[source]; else flagOverrides[source] = value;
          onChange({ ...colors, flagOverrides });
        }} />)}
      </div> : <p className="color-controls-note">{flagEditable ? 'Loading the selected flag’s colours…' : 'Choose a flag from the gallery to edit its colours.'}</p>}
      {flagEditable && palette.length > 0 && <p className="color-controls-note">Recolour the stripes and symbols while keeping the flag’s design.</p>}
    </fieldset>
  </section>;
}
