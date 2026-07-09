// A small Area tag shown on a Goal / Habit / Project card or detail — a colored dot (the
// Area's accent, if set) + its name. Presentational + server-safe (no hooks), so it drops
// straight into the server-rendered lists. `size="sm"` is the compact card variant.
export function AreaChip({
  name,
  color,
  size = 'sm',
}: {
  name: string;
  color?: string | null;
  size?: 'sm' | 'md';
}) {
  return (
    <span className={`area-chip${size === 'md' ? ' area-chip-md' : ''}`}>
      <span
        className="area-dot"
        style={color ? { background: color, boxShadow: `0 0 6px ${color}` } : undefined}
        aria-hidden="true"
      />
      {name}
    </span>
  );
}
