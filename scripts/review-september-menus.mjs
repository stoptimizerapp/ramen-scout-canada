// Item-level editorial review of the official pages captured in research/2026-09-19-quality.
// Run once to merge the reviewed facts into the persistent enrichment ledger. This does
// not grant publication approval or refresh evidence: the targeted Crawl4AI verifier
// must succeed afterwards, before data:build can use the SR1 references.
import fs from "node:fs/promises";
const file = new URL("../data/search-readiness-menu-enrichments.json", import.meta.url);
const ledger = JSON.parse(await fs.readFile(file, "utf8"));
const restaurants = JSON.parse(await fs.readFile(new URL("../data/restaurants.json", import.meta.url), "utf8"));
const updates = [];
const item = (name, price, base = [], tare = [], style = "ramen", dietary = []) => ({ name, ...(price === null ? {} : { price }), brothBase: base, brothStyle: base.includes("pork_bone") && /tonkotsu/i.test(name) ? ["tonkotsu"] : [], tare, servingStyle: [style], dietary, evidenceRefs: ["SR1"] });
const taxonomy = (tonkotsu, shoyu, miso, tsukemen, brothBases, tares, servingStyles = ["ramen"]) => ({ tonkotsu, shoyu, miso, tsukemen, brothBases, brothStyles: tonkotsu === "yes" ? ["tonkotsu"] : [], tares, servingStyles, evidenceRefs: ["SR1"] });
function add(id, data) {
  const r = restaurants.find((r) => r.id === id);
  if (!r) throw new Error(`Unknown review ID ${id}`);
  const previous = ledger.records.find((record) => record.restaurantId === id);
  const prices = data.items.flatMap((item) => item.price === undefined ? [] : [item.price]).sort((a, b) => a - b);
  const median = prices.length ? (prices[Math.floor((prices.length - 1) / 2)] + prices[Math.floor(prices.length / 2)]) / 2 : null;
  const record = { restaurantId: id, replacesMenuUrl: previous?.replacesMenuUrl ?? r.menu.url, menuUrl: r.menu.url, ...data };
  if (prices.length) record.prices = { observedCount: prices.length, min: prices[0], max: prices.at(-1), median, typical: median, band: median <= 15 ? "budget" : median <= 20 ? "mid_range" : "premium", evidenceRefs: ["SR1"] };
  const index = ledger.records.findIndex((record) => record.restaurantId === id);
  if (index < 0) ledger.records.push(record); else ledger.records[index] = record;
  updates.push(id);
}

const danboItems = [
  item("Classic Tonkotsu Ramen — regular", 12.95, ["pork_bone"]),
  item("Shio Tonkotsu Ramen — regular", 13.45, ["pork_bone"], ["shio"]),
  item("Miso Tonkotsu Ramen — regular", 14.45, ["pork_bone"], ["miso"]),
  item("Negi-goma Tonkotsu Ramen — regular", 14.95, ["pork_bone"], ["sesame"]),
  item("Classic Vegan Ramen — regular", 12.95, ["vegetable"], [], "ramen", ["vegan"]),
  item("Shio Vegan Ramen — regular", 13.45, ["vegetable"], ["shio"], "ramen", ["vegan"]),
  item("Miso Vegan Ramen — regular", 14.45, ["vegetable"], ["miso"], "ramen", ["vegan"]),
  item("Negi-goma Vegan Ramen — regular", 14.95, ["vegetable"], ["sesame"], "ramen", ["vegan"]),
];
const danboBranches = [
  ["ramen_ca_d065af9ea1e4bf604b82", "At 1445 Lonsdale Avenue, DANBO gives North Vancouver diners a choice between parallel pork-broth and vegan menus without crossing into Vancouver. The Classic versions both start at $12.95; choosing vegan does not add a base-price premium. The Lonsdale-specific extra on the shared menu is two-piece mochi ice cream at $4, rather than the Main Street bun or Kerrisdale fried rice. The official location page lists 11 a.m.–11 p.m. daily and no table reservations.", "For a North Shore meal, compare the Classic Vegan and Classic Tonkotsu first: the base prices match. Keep the two menus separate when selecting toppings; the regular ramen egg is not a vegan addition."],
  ["ramen_ca_61e99e2371a89cd6ff3b", "DANBO Kerrisdale at 2277 West 41st Avenue is the branch to consider if a rice side is part of the plan: the Vancouver menu restricts both its regular and vegan fried rice to this location. Each costs $6.95. A regular Classic ramen plus fried rice therefore comes to $19.90 before tax and other additions. Pork and vegan bowls have matching base prices, and the location page gives a daily 11 a.m.–11 p.m. schedule with no reservations.", "The Kerrisdale-only fried rice makes a concrete alternative to extra ramen toppings. For a smaller addition, compare the weekday $5 lunch set with a full $6.95 rice side; they are different portions and combinations, not interchangeable deals."],
  ["ramen_ca_fdf92f34dfc5f41d550d", "The Kitsilano DANBO is at 1833 West 4th Avenue. Its Vancouver menu starts at $12.95 for a regular Classic bowl and uses separate pork and vegan ordering paths. Shio adds $0.50 over Classic, Miso adds $1.50, and Negi-goma adds $2; these are changes within the same base menu rather than differences between branches. Kitsilano is listed from 11 a.m. to 11 p.m. daily. Tables cannot be reserved, so the menu is useful for deciding an order in advance, not for guaranteeing a seating time.", "Use Classic as the price baseline, then decide whether the shio, miso or sesame variation matters more than extra toppings. You can choose thin or thick noodles and firmness without confusing those choices with the broth base."],
  ["ramen_ca_2f8f8196e3117eec5b8e", "At 3982 Main Street, DANBO shares the Vancouver ramen menu but has a branch-specific snack: the $4.95 plant-based DANBO-Bun is marked Main Street only. A regular Classic Vegan ramen plus that bun is $17.90 before tax, tip or drinks. The ramen menu itself offers four permanent vegan flavours alongside four pork-broth flavours. The official branch schedule is 11 a.m.–11 p.m. every day, with no table reservations. Do not assume the bun is offered at the other Vancouver branches.", "For the Main Street combination, pair the explicitly plant-based bun with a bowl from the vegan menu. A regular Classic Vegan bowl is $6 less than its Atsuage version; the latter adds the six-slice thick-fried-tofu treatment."],
  ["ramen_ca_adc66d9fa854183d105f", "DANBO Robson operates at 1333 Robson Street, with daily 11 a.m.–11 p.m. hours on the official locations page. For a weekday daytime visit, its shared Vancouver menu offers a $5 lunch-set add-on from 11 a.m. to 5 p.m.; a $12.95 Classic base with that add-on totals $17.95 before tax and other purchases. The menu has separate vegan set combinations, so a vegan diner need not infer suitability from the regular gyoza. Reservations are not accepted.", "Robson's weekday lunch-set window is wider than a conventional noon lunch. Choose the vegan or tonkotsu menu first, then compare the four set combinations rather than assuming every set includes both a drink and gyoza."],
];
for (const [id, editorialDescription, whatToOrder] of danboBranches) add(id, {
  permanentItemCount: 8, items: danboItems,
  reservations: { status: "not_offered_confirmed", channels: [], url: "", note: "The Vancouver menu states that table reservations are not accepted.", evidenceRefs: ["SR1"] },
  taxonomy: taxonomy("yes", "no", "yes", "no", ["pork_bone", "vegetable"], ["shio", "miso", "sesame"]),
  vegan: { status: "multiple_complete_bowls", bowlCount: 4, customizationRequired: "no", itemNames: danboItems.filter((i) => i.dietary.includes("vegan")).map((i) => i.name), note: "Four permanent regular vegan flavours; seasonal ginger and topping upgrades are excluded from the count.", confidence: "high", evidenceRefs: ["SR1"] },
  content: { shortDescription: editorialDescription.split(". ").slice(0, 2).join(". ") + ".", editorialDescription, whatToOrder, caveats: "Prices below cover the eight regular permanent bowls only. Rekka spice versions, Chashu-men, Atsuage, seasonal bowls and toppings cost extra. Shared-kitchen allergen controls are not established by a vegan menu label." },
});

add("ramen_ca_d803b44fefafa757981e", {
  permanentItemCount: 10,
  items: [item("Tokyo Tonkotsu", 16, ["pork_bone"], ["shoyu"]), item("Black Garlic", 17, ["pork_bone"], ["shoyu"]), item("Goma Goma", 17, ["pork_bone"], ["sesame"]), item("Spicy Goma", 17.5, ["pork_bone"], ["sesame", "spicy_other"]), item("Chuka Soba", 16, ["chicken"], ["shoyu"]), item("Yuzu Shio", 17, ["chicken"], ["shio"]), item("Hokkaido Miso", 17, ["chicken"], ["miso"]), item("Spicy Miso", 17.5, ["chicken"], ["miso", "spicy_other"]), item("Aka Kara", 17.5, ["chicken"], ["spicy_other"]), item("Veggie Goma", 17.5, [], ["sesame", "miso"])],
  taxonomy: taxonomy("yes", "yes", "yes", "unknown", ["pork_bone", "chicken"], ["shoyu", "shio", "miso", "sesame", "spicy_other"]),
  content: {
    shortDescription: "Tokiwa's Edmonton menu separates ten-hour pork stock from six-hour chicken stock. Ten named bowls run $16–$17.50; payment is cash or debit, and groups of six or more face an automatic gratuity.",
    editorialDescription: "Tokiwa at 11978 104 Avenue Northwest offers a useful direct stock comparison: Tokyo Tonkotsu and Chuka Soba both cost $16, but the former is on the ten-hour pork-stock menu and the latter on the six-hour chicken-stock menu. Black Garlic, Yuzu Shio and Hokkaido Miso are $17, while the hotter Spicy Goma, Spicy Miso and Aka Kara reach $17.50. Chicken soup does not mean a pork-free bowl: the menu says those bowls are served with pork chashu unless chicken is substituted for an additional $2. Veggie Goma is named separately, but the text does not establish an entirely vegan bowl.",
    whatToOrder: "Compare Tokyo Tonkotsu with Chuka Soba when choosing between stocks on the same $16 budget. For a chicken-stock miso direction, Hokkaido Miso costs $1 more. The rotating Feature Ramen has no fixed composition or price, so it is excluded from the standing-menu count and price comparison.",
    caveats: "The restaurant specifies cash and debit only. Tables of six or more receive an automatic 18% gratuity, and bills are not split. The menu asks guests to discuss allergies with the server; a vegetable dish name is not a vegan or allergen-safety guarantee. Weekly hours below retain their separate source date."
  }
});

add("ramen_ca_fff7ee5d989f8ea60fae", {
  permanentItemCount: 12,
  items: [item("Spicy Chicken Tantanmen",17.25,["chicken"],["sesame","spicy_other"],"tantanmen"),item("Tokyo Salaryman",16.85,[],["shoyu"]),item("Big City Smoke",16.85,[],["miso"]),item("Meat Lover 2.0",20.85,["chicken"]),item("Yuzo Shio Chicken",17.25,["chicken"],["shio"]),item("Gryphon",17.25,["chicken"],["miso"]),item("Pitmaster's Brisket Bowl",18.75,["chicken"],["miso","spicy_other"]),item("Kaizen Warrior",17.25,[],["miso"]),item("Spicy Negi",16.85,[],["spicy_other"]),item("Beef Birria",16.85,["beef"]),item("Redeye Mazemen",14.75,[],[],"mazemen"),item("Kimchi Mazemen",14.75,[],[],"mazemen")],
  taxonomy: taxonomy("unknown","yes","yes","unknown",["chicken","vegetable","beef"],["shoyu","miso","shio","sesame","spicy_other"],["ramen","tantanmen","mazemen"]),
  content: {
    shortDescription: "Crafty Ramen's Guelph noodle shop has twelve adult bowls and mazemen from $14.75 to $20.85. Compare chilled noodles with soup bowls and choose stock and protein deliberately on its customizable dishes.",
    editorialDescription: "At 17 Macdonell Street in Guelph, Crafty Ramen separates chilled, brothless mazemen from its soup bowls. Both Redeye and Kimchi Mazemen cost $14.75, while Tokyo Salaryman's shoyu soup starts at $16.85. That $2.10 difference is a format choice, not a like-for-like discount on soup ramen. Tokyo Salaryman can be ordered with chicken, pork or tofu, and the tofu version uses veggie broth. The $20.85 Meat Lover 2.0 instead combines three meats and an egg. This is the restaurant menu attached to the Guelph address, not the separate frozen-ramen retail range.",
    whatToOrder: "For hot soup under $18 before extras, compare the $16.85 Tokyo Salaryman with the $17.25 Spicy Chicken Tantanmen. For a chilled bowl, Redeye includes pork and egg, whereas Kimchi Mazemen offers a protein choice. Selecting tofu is not, on its own, proof that every sauce and noodle ingredient is vegan.",
    caveats: "The twelve-item comparison excludes the $4.50 and $9 children's bowls. A $2.50 combo adds a half snack and a pop, not a full-size side. The page says noodles are made daily but does not explicitly locate current production; a house-made claim is not treated as independent proof of on-site production."
  },
  noodles: { status:"restaurant_claimed_unspecified",verified:"unknown",scope:"Restaurant says noodles are made daily; current production location is not explicitly stated.",makingLocation:"",styleValues:["thick","thin"],evidenceRefs:["SR1"] }
});

add("ramen_ca_376b924d920c31ee2b03", {
  permanentItemCount: 21,
  items: [item("Miso",21.10,["pork_bone"],["miso"]),item("Spicy Miso",21.45,["pork_bone"],["miso","spicy_other"]),item("Dragon",23.95,["pork_bone"],["miso","spicy_other"]),item("Vegetarian Red Miso",20.10,[],["miso"]),item("Spicy Vegetarian Red Miso",20.45,[],["miso","spicy_other"]),item("Vegetarian Roasted Garlic Shoyu",19.20,[],["shoyu"]),item("Stone Bowl Curry Cheese Tsukemen",22.95,[],["curry"],"tsukemen"),item("Stone Bowl Shoyu Kotteri Tsukemen",22.30,["pork_bone","seafood"],["shoyu"],"tsukemen"),item("Black Sesame Tan Tan Noodle",19.80,["pork_bone"],["sesame","spicy_other"],"tantanmen"),item("Beef Ramen",19.80,["chicken"]),item("Spicy White Sesame Shio",19.55,[],["shio","spicy_other"]),item("Chicken Shio Ramen",19.20,["chicken"],["shio"]),item("White Sesame Shio",19.20,[],["shio"]),item("Halal Chicken Shio Ramen",19.20,["chicken"],["shio"]),item("Gluten Free Ramen — Pork Broth",19.80,["pork_bone"]),item("Gluten Free Ramen — Chicken Broth",19.80,["chicken"]),item("Classic Shoyu",18.50,["pork_bone","seafood"],["shoyu"]),item("Kotteri Rich Shoyu",19.20,[],["shoyu"]),item("Roasted Garlic Shoyu",19.20,[],["shoyu"])],
  taxonomy: taxonomy("unknown","yes","yes","yes",["pork_bone","seafood","chicken"],["miso","shoyu","shio","sesame","curry","spicy_other"],["ramen","tsukemen","tantanmen"]),
  content: {
    shortDescription:"Isshin's Vaughan menu at 3175 Rutherford Road supports a priced comparison between red-miso ramen and stone-bowl tsukemen. Dietary wording needs care: vegetarian noodles may contain egg, and halal wording covers selected chicken ingredients.",
    editorialDescription:"Ramen Isshin's Vaughan branch at 3175 Rutherford Road, Unit 47, has two distinct routes through its menu: thick, twisty noodles with red miso, or thicker dipping noodles with a separate stone-bowl soup. Classic Shoyu is $18.50; Miso is $21.10; Stone Bowl Shoyu Kotteri Tsukemen is $22.30. The tsukemen combines pork and seafood stock, so changing a meat topping does not remove those broth ingredients. The menu states a six-minute boiling time for the dipping noodles and serves them cold unless hot noodles are requested. That is a preparation note, not a promise of total waiting time.",
    whatToOrder:"For the stone-bowl experience, the $22.30 Shoyu Kotteri is $0.65 below Curry Cheese Tsukemen. The latter includes cheese, egg and chicken cutlets, so it should not be confused with a vegetarian curry. For a less expensive soup bowl, Classic Shoyu is $3.80 below the Shoyu Kotteri dipping bowl.",
    caveats:"The vegetarian section offers egg-free noodle substitution, and kale noodles cost $2 to substitute; the default bowl is not therefore labelled vegan here. Halal Chicken Shio is the restaurant's ingredient claim, not a certificate independently checked by Ramen Scout. The menu explicitly warns that its gluten-free bowls are not suitable for guests with coeliac disease. Children's bowls, sides and noodle extras are excluded from the nineteen observed adult prices."
  }
});

add("ramen_ca_f43841040f91ed0862cc", {
  permanentItemCount:10,
  items:[item("Basic Ramen",null,["pork_bone","chicken"]),item("Basic Bakamori Ramen",null,["pork_bone","chicken"]),item("Spicy Ramen",null,["pork_bone","chicken"],["spicy_other"]),item("Spicy Bakamori Ramen",null,["pork_bone","chicken"],["spicy_other"]),item("Yokohama Iekei Ramen",null,["pork_bone","chicken"],["shoyu"]),item("Shoyu Ramen",null,["pork_bone","chicken"],["shoyu"]),item("Miso Ramen",null,["pork_bone","chicken"],["miso"]),item("Tsukemen",null,[],[],"tsukemen"),item("Spicy Tsukemen",null,[],["spicy_other"],"tsukemen"),item("Vegetarian Ramen",null,["soy_milk"],["miso"])],
  content:{
    shortDescription:"Gojiro's Vancouver menu distinguishes Basic from larger Bakamori portions and offers separate tsukemen. Chicken toppings do not imply pork-free stock: its core soup blends chicken and pork.",
    editorialDescription:"Ramen Gojiro offers a portion decision before a broth decision. Its Basic and Spicy bowls each have a Bakamori version, described as adding meat, noodles and toppings. The core soup combines pork and chicken whether the topping choice is karaage or chashu. Rich and light settings are offered for those bowls; the spicy versions then add a separate heat selection. If dipping noodles matter more than a large soup bowl, Tsukemen offers hot or cold noodles, while Spicy Tsukemen puts its sauce on the noodles. Published prices are absent from this menu page, so the larger portion is not assigned an assumed surcharge.",
    whatToOrder:"Choose between a standard portion and Bakamori first, then select richness and topping. For a different format, compare the hot-or-cold noodle choice in regular Tsukemen with the sauce-tossed Spicy Tsukemen. The chicken-chashu Shoyu also uses pork in its broth.",
    caveats:"Vegetarian Ramen is described with miso and soy-milk stock plus vegetables, but the page does not verify a complete vegan recipe. The noodle wording says house-made without an explicit production address. Obtain a branch price before budgeting an upgrade; no price is inferred from photos or another restaurant in the same group."
  }
});

add("ramen_ca_1d358958d30659cd7b34", {
  permanentItemCount:9,
  linkedDocuments:["https://cdn.shopify.com/s/files/1/0274/9713/6200/files/12_Year_Honda_Edit.jpg?v=1781531142"],
  items:[item("Chili Goma Ramen",22,[],["sesame","spicy_other"]),item("Tonkotsu Black",22,["pork_bone"]),item("Kara Miso Garlic",22,[],["miso","spicy_other"]),item("The O.G. Mazemen",21,[],[],"mazemen"),item("Veggie Classic",23),item("Veggie Goma",23,[],["sesame","spicy_other"]),item("The Authentic Traditional",23,["pork_bone"]),item("The Authentic Shoyu",23,["chicken"],["shoyu"]),item("The Authentic Miso",24,["chicken","pork_bone"],["miso"])],
  taxonomy:taxonomy("yes","yes","yes","unknown",["pork_bone","chicken"],["shoyu","miso","sesame","spicy_other"],["ramen","mazemen"]),
  content:{
    shortDescription:"Shiki Menya's Calgary menu has nine adult ramen and mazemen choices at $21–$24 before upgrades. The two goma bowls flag peanuts, and its low-broth O.G. Mazemen includes pork and egg.",
    editorialDescription:"Shiki Menya's published SS2026 anniversary menu puts a low-broth noodle bowl alongside its soup ramen. The O.G. Mazemen costs $21 and includes pork belly, onsen egg and greens; a grilled-cheese variation adds $2. The $22 Tonkotsu Black instead combines pork belly with black garlic oil and a squid-ink addition. In the other column, Authentic Shoyu is $23 with chicken broth, while Authentic Miso is $24 with mixed chicken and pork stock. The chicken-broth name is not a pork-free guarantee: the Shoyu lists two kinds of chashu, with a chicken-chashu substitution priced separately at $1.",
    whatToOrder:"The base O.G. Mazemen is $3 below Authentic Miso. Adding the $2 grilled-cheese variation narrows that gap to $1, so compare the format and toppings rather than the lowest printed number alone. Chili Goma at $22 can become Goma DX with chashu and egg for an additional $6.",
    caveats:"Both Chili Goma and Veggie Goma explicitly flag peanuts. Veggie wording is not evidence of a complete vegan bowl or allergy-safe kitchen. The nine adult-item comparison excludes the two $11 children's bowls for ages twelve and under and all paid variations. Facts were read from the menu image linked by the official page; this is not a report of an in-person meal."
  }
});

// The nineteen explicitly priced adult Isshin dishes above are the observed set;
// do not count variants or kids' dishes as extra permanent adult bowls.
ledger.records.find((r) => r.restaurantId === "ramen_ca_376b924d920c31ee2b03").permanentItemCount = 19;
// Remove obsolete negative statements left ahead of previously verified menu facts.
// This is a copy correction only: keep those restaurants' existing evidence dates.
const obsolete = {
  ramen_ca_5c9ac40ac8e5d19b9e8e: ["Individual bowl names, broths and prices are not dependable enough to publish here. "],
  ramen_ca_1b69f8021e67f3dacf92: ["The official menu page does not clearly tie bowl names, broth styles or prices to the Elm Street branch. ", "Diners should therefore consult that live page before choosing an order. ", "An official menu page exists, although its branch-specific dishes, prices and dietary choices remain unclear. "],
  ramen_ca_290af28142e3dc9c30a8: ["A restaurant page is linked as a menu source, yet it does not supply dependable current bowl names, broth styles or prices. "],
  ramen_ca_f1c9bcc6b7eea60aba64: ["Its official menu is ramen-led and lists many permanent bowls, although dependable dish names, prices and style tags were not available here. "],
};
for (const [id, sentences] of Object.entries(obsolete)) {
  const record = ledger.records.find((r) => r.restaurantId === id);
  if (!record) throw new Error(`Missing copy correction ${id}`);
  for (const field of ["editorialDescription", "shortDescription"]) {
    if (record.content?.[field]) for (const sentence of sentences) record.content[field] = record.content[field].replace(sentence, "");
  }
}
// Miso identifies seasoning, not a stock: the menu does not explicitly establish
// pork-bone stock for these three bowls, so retain only their known tare.
for (const entry of ledger.records.find((r) => r.restaurantId === "ramen_ca_376b924d920c31ee2b03").items) {
  if (["Miso", "Spicy Miso", "Dragon"].includes(entry.name)) entry.brothBase = [];
}
await fs.writeFile(file, JSON.stringify(ledger, null, 2) + "\n");
console.log(updates.join(","));
