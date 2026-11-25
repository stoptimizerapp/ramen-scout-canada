import decisions from "@/data/city-decisions.json";
type Decision = { title: string; text: string; url: string; source: string; secondUrl?: string; secondSource?: string };
const guides = decisions as Record<string, { title: string; checked: string; decisions: Decision[] }>;
export function CityDecisions({ cityKey }: { cityKey: string }) {
  const guide = guides[cityKey];
  if (!guide) return null;
  return <section className="city-decisions"><p className="section-kicker">Ramen Scout menu notes</p><h2>{guide.title}</h2><p className="source-note">Source menus checked {guide.checked}. Comparisons and arithmetic by Ramen Scout / Nocturnal Devs; no personal tasting is claimed. CAD base prices exclude tax, tip and other purchases.</p><div className="decision-grid">{guide.decisions.map(d => <article key={d.title}><h3>{d.title}</h3><p>{d.text}</p><a href={d.url} rel="noopener noreferrer" target="_blank">{d.source} ↗</a>{d.secondUrl ? <a href={d.secondUrl} rel="noopener noreferrer" target="_blank">{d.secondSource} ↗</a> : null}</article>)}</div></section>;
}
