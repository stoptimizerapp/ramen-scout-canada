import type { Metadata } from "next";
import { SiteLink as Link } from "@/components/SiteLink";
import { NearbyFinder } from "@/components/NearbyFinder";
import { RestaurantList } from "@/components/RestaurantList";
import { diverseMenuSelections } from "@/lib/menu-planning";
import { directoryRestaurants, summary } from "@/lib/directory";
import { absoluteUrl, buildPageMetadata, PUBLISHER } from "@/lib/site";
import styles from "./home.module.css";

export const metadata: Metadata = buildPageMetadata({ title: "Find ramen near you across Canada", description: `Explore ${summary.restaurantCount} ramen restaurants in ${summary.cityCount} Canadian cities. Compare verified menu styles, price evidence, late-night hours, vegan bowls and reservations.`, path: "/" });

const featuredCityNames = ["Toronto", "Montreal", "Vancouver", "Calgary"];
const featuredCities = featuredCityNames.map((name) => {
  for (const province of summary.provinces) {
    const city = province.cities.find((item) => item.name === name);
    if (city) return { ...city, province };
  }
  return null;
}).filter(Boolean) as Array<{ name: string; slug: string; count: number; verifiedMenus: number; province: (typeof summary.provinces)[number] }>;
const featuredRestaurants = diverseMenuSelections(directoryRestaurants);

export default function Home() {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${PUBLISHER.url}#organization`, name: PUBLISHER.name, url: PUBLISHER.url, email: PUBLISHER.email, telephone: PUBLISHER.phone, address: { "@type": "PostalAddress", streetAddress: PUBLISHER.address.street, addressLocality: PUBLISHER.address.city, addressRegion: PUBLISHER.address.regionCode, postalCode: PUBLISHER.address.postalCode, addressCountry: PUBLISHER.address.countryCode } },
      { "@type": "WebSite", "@id": `${absoluteUrl("/")}#website`, name: "Ramen Scout Canada", url: absoluteUrl("/"), publisher: { "@id": `${PUBLISHER.url}#organization` }, brand: { "@type": "Brand", name: "Ramen Scout Canada", logo: absoluteUrl("/logo-mark.svg") }, potentialAction: { "@type": "SearchAction", target: `${absoluteUrl("/search")}?q={search_term_string}`, "query-input": "required name=search_term_string" } },
    ],
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Independent Canadian ramen guide</p>
          <h1>Find ramen near you—without the guesswork.</h1>
          <p className="hero-intro">Search {summary.restaurantCount} ramen spots across {summary.cityCount} Canadian cities, then compare source-backed menu styles, price evidence, vegan choices, late-night hours and more.</p>
          <form className="search-shell" action="/search" role="search">
            <label htmlFor="home-search">Restaurant, city, neighbourhood or postal code</label>
            <div><span aria-hidden="true">⌖</span><input id="home-search" name="q" type="search" placeholder="Try “miso ramen Toronto”" /><button type="submit">Find ramen</button></div>
          </form>
          <NearbyFinder />
          <div className="quick-links" aria-label="Popular searches"><span>Popular:</span><Link href="/styles/tonkotsu">Tonkotsu</Link><Link href="/styles/tsukemen">Tsukemen</Link><Link href="/features/vegan">Vegan bowls</Link><Link href="/features/late-night">Late night</Link></div>
        </div>
        <aside className="hero-card" aria-label="Directory coverage">
          <figure className={styles.heroArtwork}>
            <picture>
              <source srcSet="/images/ramen-scout-hero.avif" type="image/avif" />
              <img
                src="/images/ramen-scout-hero.jpg"
                width="900"
                height="900"
                alt="Editorial illustration of a steaming ramen bowl with egg, scallions, nori and mushrooms"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </figure>
          <div className={`coverage-card ${styles.coverageCard}`}><span className="tiny-label">Coast to coast</span><strong className={styles.coverageCount}>{summary.restaurantCount}</strong><p className={styles.coverageCopy}>source-linked restaurant listings</p><div className={styles.coverageMeta}><span>{summary.provinceCount} provinces &amp; territories</span><span>{summary.cityCount} cities</span></div></div>
        </aside>
      </section>

      <section className="trust-strip" aria-label="Directory features">
        <div><strong>{summary.verifiedMenuCount}</strong><span>menus checked</span></div><div><strong>{summary.pricedMenuCount}</strong><span>priced menus</span></div><div><strong>{summary.lateNightCount}</strong><span>late-night spots</span></div>
        <p>Every factual filter shows what is confirmed, what remains unknown and when the supporting source was checked.</p>
      </section>

      <section className="section" id="cities">
        <div className="section-heading"><div><p className="eyebrow"><span /> Start with a city</p><h2>Ramen, neighbourhood by neighbourhood.</h2></div><Link href="/locations">Browse all locations <span aria-hidden="true">→</span></Link></div>
        <div className="location-grid">
          {featuredCities.map((city, index) => <Link className="location-card" href={`/locations/${city.province.slug}/${city.slug}`} key={city.name}><span className="card-index">0{index + 1}</span><div><p>{city.province.name}</p><h3>{city.name}</h3><span>{city.verifiedMenus ? `${city.verifiedMenus} current menus checked` : "Restaurant details available"}</span></div><strong>{city.count}<small> spots</small></strong></Link>)}
        </div>
      </section>

      <section className="section featured-section">
        <div className="section-heading"><div><p className="eyebrow"><span /> Useful starting points</p><h2>Menu-rich listings to explore.</h2></div><Link href="/search">Search all restaurants <span aria-hidden="true">→</span></Link></div>
        <p>Different cities and restaurant brands, with named bowls and recorded prices. This is a browsing selection, not a taste ranking or a report of personal visits.</p>
        <RestaurantList restaurants={featuredRestaurants} />
      </section>

      <section className="section decision-feature"><div><p className="eyebrow"><span /> From menu to meal</p><h2>What the menu name doesn’t tell you.</h2><p>Chicken toppings can sit in pork broth. A vegetarian bowl may use egg noodles. And a low headline price can exclude the toppings you want. Our researched guide compares actual Canadian menus, including base-price calculations and branch-specific exceptions.</p><Link className="button primary" href="/guides/choosing-ramen">Compare bowls, budgets &amp; dietary claims →</Link></div><ul><li>DANBO: vegan versus pork bowls at the same base price</li><li>Tokiwa: chicken soup with pork toppings</li><li>Isshin: soup ramen versus stone-bowl tsukemen</li><li>Shiki Menya: how upgrades change the budget</li></ul></section>

      <section className="method" id="how-it-works">
        <div><p className="eyebrow light"><span /> Useful by design</p><h2>Less guessing. Better bowls.</h2></div>
        <div className="method-grid">
          <article><span>01</span><h3>Menu-led filters</h3><p>Broth and style filters come from current menu evidence—not assumptions based on a restaurant name.</p><Link href="/methodology">Read the methodology →</Link></article>
          <article><span>02</span><h3>Honest unknowns</h3><p>Halal certification, vegan suitability and house-made noodles stay unknown until a source supports the claim.</p><Link href="/editorial-standards">See our standards →</Link></article>
          <article><span>03</span><h3>Plan the visit</h3><p>See service hours, price evidence, reservation details and practical caveats together on one page.</p><Link href="/corrections">Report a change →</Link></article>
        </div>
      </section>
    </main>
  );
}
