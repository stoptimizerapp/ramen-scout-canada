import Link from "next/link";
import { Logo } from "./Logo";

export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <Logo />
        <nav aria-label="Primary navigation">
          <Link href="/locations">Locations</Link>
          <Link href="/search">Search</Link>
          <Link href="/methodology">How we verify</Link>
          <Link className="nav-cta" href="/about">About</Link>
        </nav>
      </header>
    </>
  );
}
