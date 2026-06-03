import type { ElementType, ReactNode } from 'react';

type Tone = 'blue' | 'green' | 'red' | 'amber' | 'indigo' | 'neutral';

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'green',
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ElementType;
  tone?: Tone;
}) {
  return (
    <article className={`metric uiMetricCard metricTone-${tone}`}>
      <div className="metricTop">
        {Icon ? <div className="metricIcon"><Icon size={18} /></div> : <span />}
        {note ? <span>{note}</span> : null}
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel uiPanel ${className}`.trim()}>{children}</section>;
}

export function TableBlock({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`tableBlock uiTableBlock ${className}`.trim()}>{children}</section>;
}

export function FilterToolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`filterToolbar uiFilterToolbar ${className}`.trim()}>{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="emptyState uiEmptyState">{children}</div>;
}

export function StatusBadge({ children, tone = 'green' }: { children: ReactNode; tone?: Tone }) {
  const toneClass = tone === 'neutral' ? 'statusPillNeutral' : `status-${tone}`;
  return <span className={`statusPill uiStatusBadge ${toneClass}`}>{children}</span>;
}
