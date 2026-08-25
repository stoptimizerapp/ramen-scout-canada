import type { Metadata } from "next";
import { SiteLink as Link } from "@/components/SiteLink";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() { return <main className="page-shell"><section className="empty-page"><span className="empty-bowl" aria-hidden="true" /><p className="eyebrow"><span /> 404</p><h1>This bowl is not on the menu.</h1><p>The page may have moved, or the location and filter combination may not exist.</p><div><Link className="button primary" href="/search">Search the directory</Link><Link className="button" href="/locations">Browse locations</Link></div></section></main>; }
