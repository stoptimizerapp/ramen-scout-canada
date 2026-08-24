import Link from "next/link";
import { Logo } from "./Logo";

const explore = [
  ["Locations", "/locations"], ["Search", "/search"], ["Tonkotsu", "/styles/tonkotsu"],
  ["Miso", "/styles/miso"], ["Late night", "/features/late-night"], ["Reservations", "/features/reservations"],
];
const trust = [
  ["About", "/about"], ["Methodology", "/methodology"], ["Editorial standards", "/editorial-standards"],
  ["Corrections", "/corrections"], ["Contact", "/contact"], ["Accessibility", "/accessibility"],
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-lead">
        <Logo />
        <p>A practical, evidence-led guide to ramen restaurants across Canada.</p>
        <span>Facts checked against source material. Unknowns stay unknown.</span>
      </div>
      <div><h2>Explore</h2>{explore.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</div>
      <div><h2>Trust</h2>{trust.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</div>
      <div><h2>Legal</h2><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/editorial-standards#advertising">Advertising policy</Link></div>
      <p className="footer-fineprint">© {new Date().getFullYear()} Ramen Scout Canada. Restaurant details change; confirm critical information with the restaurant before travelling.</p>
    </footer>
  );
}
