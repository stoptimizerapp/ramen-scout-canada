import { Breadcrumbs } from "./Breadcrumbs";

export function ProsePage({ eyebrow, title, intro, children, updated = "August 24, 2026" }: { eyebrow: string; title: string; intro: string; children: React.ReactNode; updated?: string }) {
  return <main className="page-shell prose-shell"><Breadcrumbs items={[{ label: "Home", href: "/" }, { label: title }]} /><header className="page-hero compact"><p className="eyebrow"><span /> {eyebrow}</p><h1>{title}</h1><p>{intro}</p><small>Last updated {updated}</small></header><article className="prose-content">{children}</article></main>;
}
