"use client";
import { useId, useState } from "react";
import { bowlSubtotal, filterBowls, type BowlOption } from "@/lib/bowl-planner";
import { formatDate, formatMoney } from "@/lib/format";

export function BowlPlanner({ bowls }: { bowls: BowlOption[] }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("");
  const [maximum, setMaximum] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const matches = filterBowls(bowls, query, style, maximum);
  const choices = selected.flatMap(key => bowls.find(b => b.id === key) || []);
  const totals = choices.map(b => bowlSubtotal(b, quantity));
  const difference = totals.length === 2 && totals.every(t => t !== null) ? Math.abs(totals[0]! - totals[1]!) : null;
  function choose(key: string) {
    setSelected(previous => previous.includes(key) ? previous.filter(x => x !== key) : previous.length < 2 ? [...previous, key] : previous);
  }
  return <section className="bowl-planner" aria-labelledby={`${id}-heading`}>
    <p className="section-kicker">Make your own comparison</p>
    <h2 id={`${id}-heading`}>Find a bowl that fits your plan</h2>
    <p>Search the documented dishes, set a base-price ceiling, and choose two bowls to compare. Each option keeps its branch address and source date. This is a menu comparison, not a taste ranking.</p>
    <div className="planner-controls">
      <label htmlFor={`${id}-query`}>Restaurant, address or dish<input id={`${id}-query`} value={query} onChange={e => { setQuery(e.target.value); setExpanded(false); }} type="search" placeholder="Try chicken, miso or a street" /></label>
      <label htmlFor={`${id}-style`}>Menu choice<select id={`${id}-style`} value={style} onChange={e => { setStyle(e.target.value); setExpanded(false); }}><option value="">All documented bowls</option><option value="tonkotsu">Tonkotsu</option><option value="shoyu">Shoyu</option><option value="miso">Miso</option><option value="tsukemen">Tsukemen</option><option value="vegan">Explicitly vegan bowl</option></select></label>
      <label htmlFor={`${id}-max`}>Maximum base price (CAD)<input id={`${id}-max`} type="number" min="0" step="0.50" placeholder="No limit" value={maximum} onChange={e => { setMaximum(e.target.value); setExpanded(false); }} /></label>
    </div>
    <p className="source-note">A price ceiling excludes unknown prices and records with unresolved branch pricing. Shared, starting and delivery prices are labelled. Vegan means an explicit dish claim; it does not establish allergy safety.</p>
    <div className="planner-summary" role="status">{matches.length} matching {matches.length === 1 ? "bowl" : "bowls"} · {selected.length} of 2 comparison places filled</div>
    {choices.length ? <div className="planner-shortlist">
      <div className="planner-shortlist-heading"><h3>Your two alternatives</h3><label htmlFor={`${id}-quantity`}>Same bowls per option<select id={`${id}-quantity`} value={quantity} onChange={e => setQuantity(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label><button type="button" onClick={() => setSelected([])}>Clear comparison</button></div>
      <div className="planner-options">{choices.map((b, i) => <article key={b.id}><h4>{b.restaurant}</h4><p>{b.name}</p><p className="source-note">{b.address}, {b.city}</p><strong>{totals[i] === null ? "Confirm price before budgeting" : `${quantity} × ${formatMoney(b.price!)} = ${formatMoney(totals[i]!)}`}</strong><p>{b.context}</p><small>Menu checked {formatDate(b.checked)}</small>{b.source ? <a href={b.source} target="_blank" rel="noopener noreferrer">Check source menu ↗</a> : null}<button type="button" onClick={() => choose(b.id)}>Remove {i + 1 === 1 ? "first" : "second"} option</button></article>)}</div>
      {difference !== null ? <p className="planner-difference">Base-price difference for {quantity} {quantity === 1 ? "bowl" : "bowls"}: <strong>{formatMoney(Math.round(difference * 100) / 100)}</strong>.</p> : null}
      <p className="source-note">Each total is an alternative order at the named restaurant. Totals exclude tax, tip, extras, drinks and delivery fees. Starting prices are lower bounds. This does not reserve a table or place an order.</p>
    </div> : null}
    {!matches.length ? <p className="unknown-callout">No documented bowls match these choices. Clear the price ceiling or change the search; missing evidence does not mean a restaurant cannot offer the dish.</p> : <div className="planner-results">{matches.slice(0, expanded ? undefined : 8).map(b => <article key={b.id} className="planner-bowl"><div><h3>{b.name}</h3><a href={b.path}>{b.restaurant}</a><p>{b.address}, {b.city}</p><small>{b.context} Menu checked {formatDate(b.checked)}.</small></div><div className="planner-bowl-action"><strong>{typeof b.price === "number" ? formatMoney(b.price) : "Price unknown"}</strong><button type="button" aria-pressed={selected.includes(b.id)} disabled={!selected.includes(b.id) && selected.length >= 2} onClick={() => choose(b.id)}>{selected.includes(b.id) ? "Selected — remove" : "Compare bowl"}</button></div></article>)}</div>}
    {matches.length > 8 ? <button className="planner-more" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer bowls" : `Show all ${matches.length} matching bowls`}</button> : null}
    <noscript><p>Enable JavaScript to use the comparison controls. The source-linked menu table and restaurant records below remain available.</p></noscript>
  </section>;
}
