export default function RangeField({ label, value, min, max, step = .05, suffix = '×', onChange, disabled }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void; disabled?: boolean }) {
  return <label className="range-field"><span>{label}<output>{Number(value.toFixed(2))}{suffix}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}
