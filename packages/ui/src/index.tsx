import type { CSSProperties, ReactNode } from 'react';

export interface CorePanelProps { title: string; children: ReactNode; }
export function CorePanel({ title, children }: CorePanelProps) {
  const style: CSSProperties = { border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 16 };
  return <section style={style}><h2>{title}</h2>{children}</section>;
}
