export type BowlOption = {
  id: string; restaurant: string; address: string; city: string; path: string;
  name: string; price?: number; styles: string[]; vegan: boolean;
  source?: string; checked?: string; context: string; budgetEligible: boolean;
};

export function filterBowls(bowls: BowlOption[], query: string, style: string, maximum: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const ceiling = maximum.trim() === "" ? null : Number(maximum);
  return bowls.filter(bowl => {
    const text = `${bowl.restaurant} ${bowl.address} ${bowl.city} ${bowl.name}`.toLocaleLowerCase();
    return terms.every(term => text.includes(term))
      && (!style || (style === "vegan" ? bowl.vegan : bowl.styles.includes(style)))
      && (ceiling === null || (Number.isFinite(ceiling) && ceiling >= 0 && bowl.budgetEligible && typeof bowl.price === "number" && Number.isFinite(bowl.price) && bowl.price > 0 && bowl.price <= ceiling));
  });
}

// Integer cents prevent rounding drift; unknown prices must never become zero.
export function bowlSubtotal(bowl: BowlOption | undefined, quantity: number) {
  if (!bowl?.budgetEligible || typeof bowl.price !== "number" || !Number.isFinite(bowl.price) || bowl.price <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 12) return null;
  return Math.round(bowl.price * 100) * quantity / 100;
}
