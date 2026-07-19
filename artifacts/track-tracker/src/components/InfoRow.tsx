// Shared label/value row used by Company Driver Details and Driver Profile.
// RTL flex-row space-between: first child → RIGHT, second child → LEFT.
// Desired: label RIGHT, value LEFT → label first in DOM, value second.
export function InfoRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      {/* label — first child → RIGHT in RTL */}
      <span className="text-xs text-muted-foreground font-medium shrink-0 pt-px">{label}</span>
      {/* value — second child → LEFT in RTL, and its text is left-aligned too */}
      <span
        className="text-[13px] font-semibold leading-snug text-left flex-1"
        style={accent ? { color: '#C97A56' } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
