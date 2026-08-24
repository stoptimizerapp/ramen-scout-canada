import type { Restaurant, TriState } from "./types";

export function formatDate(value?: string) {
  if (!value) return "Not confirmed";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function formatMoney(value: number | null, currency = "CAD") {
  if (value === null || !Number.isFinite(value)) return "Not confirmed";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, minimumFractionDigits: value % 1 ? 2 : 0 }).format(value);
}

export function formatPriceRange(restaurant: Restaurant) {
  const { min, max, currency } = restaurant.prices;
  if (min === null) return "Price not confirmed";
  if (max === null || max === min) return `${formatMoney(min, currency)} per observed bowl`;
  return `${formatMoney(min, currency)}–${formatMoney(max, currency)}`;
}

export function titleCaseToken(value: string) {
  const overrides: Record<string, string> = { pork_bone: "Pork-bone broth", tori_paitan: "Tori paitan", abura_soba: "Abura soba", spicy_other: "Spicy", made_on_site: "Made on site" };
  return overrides[value] || value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function triStateLabel(value: TriState, yesLabel: string, noLabel = "Reported unavailable") {
  if (value === "yes") return yesLabel;
  if (value === "no") return noLabel;
  return "Not confirmed";
}

export function formatHours(value: string) {
  if (!value) return "Not confirmed";
  if (value === "closed") return "Closed";
  return value.split("|").map((interval) => {
    const match = interval.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})(\+1)?$/);
    if (!match) return interval;
    const toTime = (hour: string, minute: string) => {
      const hours = Number(hour);
      const suffix = hours >= 12 ? "p.m." : "a.m.";
      const displayHour = hours % 12 || 12;
      return `${displayHour}${minute === "00" ? "" : `:${minute}`} ${suffix}`;
    };
    return `${toTime(match[1], match[2])}–${toTime(match[3], match[4])}${match[5] ? " next day" : ""}`;
  }).join(", ");
}
