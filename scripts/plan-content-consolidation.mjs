// Editorial publication decisions, not an AdSense word-count or menu-count gate.
// The selected guides were read for a distinct ordering decision, attributable
// menu evidence and usable visit information. Short extracts remain useful in
// comparative hubs; no restaurant or source record is deleted.
import fs from 'node:fs/promises';
const restaurants = JSON.parse(await fs.readFile(new URL('../data/restaurants.json', import.meta.url)));
const ids = [
  'ramen_ca_1d358958d30659cd7b34', 'ramen_ca_5c9ac40ac8e5d19b9e8e', 'ramen_ca_d803b44fefafa757981e',
  'ramen_ca_d065af9ea1e4bf604b82', 'ramen_ca_61e99e2371a89cd6ff3b', 'ramen_ca_fdf92f34dfc5f41d550d',
  'ramen_ca_2f8f8196e3117eec5b8e', 'ramen_ca_adc66d9fa854183d105f', 'ramen_ca_f43841040f91ed0862cc',
  'ramen_ca_376b924d920c31ee2b03', 'ramen_ca_fff7ee5d989f8ea60fae', 'ramen_ca_7b0b8a1d58592b2ec48c',
  'ramen_ca_1da6c619935047d1e8d8', 'ramen_ca_51c42f34d0802e1577de', 'ramen_ca_032269276c4661356407',
  'ramen_ca_fbb1b15a482943af0647', 'ramen_ca_01c8949ce9e17eb6cb9a', 'ramen_ca_8b54514b80ab0ad1c9a8',
  'ramen_ca_230bf56cc5f74712eb72', 'ramen_ca_30739b451af55a810522', 'ramen_ca_e687fd43f6741086b553',
  'ramen_ca_83dcedc0fd4de41765a4', 'ramen_ca_ff25f125c395f1b05cb3', 'ramen_ca_489bb344b4f5cce7fe91',
  'ramen_ca_127baa60edce046d4075', 'ramen_ca_cf147eb22a9f60855b4c', 'ramen_ca_c7738b4fba26b9ec5e29',
  'ramen_ca_7c0b011576a423e9ccb7', 'ramen_ca_da96078a270ba813e3d1',
];
for (const id of ids) if (!restaurants.some(r => r.id === id)) throw new Error(`Unknown reviewed guide ${id}`);
const hasMenu = r => r.menu.status === 'verified_current' && r.menu.items.some(i => !/extra.*topping|ramenramen|kazoku ramenkazoku/i.test(i.name));
const provinces = [...new Set(restaurants.map(r => r.provinceSlug))];
const provincePaths = provinces.filter(p => restaurants.filter(r => r.provinceSlug === p && hasMenu(r)).length >= 2).map(p => `/locations/${p}`);
const cityKeys = [...new Set(restaurants.map(r => `${r.provinceSlug}/${r.citySlug}`))];
const cityPaths = cityKeys.filter(key => {
  const menus = restaurants.filter(r => `${r.provinceSlug}/${r.citySlug}` === key && hasMenu(r));
  // A comparison must compare different operators, not two outlets of one menu.
  return new Set(menus.map(r => new URL(r.menu.url).hostname.replace(/^www\./, ''))).size >= 2;
}).map(key => `/locations/${key}`);
const redirects = {};
for (const p of provinces) if (!provincePaths.includes(`/locations/${p}`)) redirects[`/locations/${p}`] = `/locations#province-${p}`;
for (const key of cityKeys) if (!cityPaths.includes(`/locations/${key}`)) {
  const [p,c] = key.split('/');
  redirects[`/locations/${key}`] = `${provincePaths.includes(`/locations/${p}`) ? `/locations/${p}` : '/locations'}#city-${p}-${c}`;
}
const reviews = restaurants.map(r => {
  const detail = ids.includes(r.id);
  const city = `/locations/${r.provinceSlug}/${r.citySlug}`;
  const parent = cityPaths.includes(city) ? city : provincePaths.includes(`/locations/${r.provinceSlug}`) ? `/locations/${r.provinceSlug}` : '/locations';
  const target = detail ? r.canonicalPath : `${parent}#${r.id}`;
  if (!detail) redirects[r.canonicalPath] = target;
  return { id:r.id, path:r.canonicalPath, target, decision:detail ? 'retain-reviewed-guide' : hasMenu(r) ? 'consolidate-menu-excerpt' : 'consolidate-contact-record' };
});
await fs.writeFile(new URL('../data/content-publication.json', import.meta.url), JSON.stringify({reviewedAt:'2026-09-19', restaurantIds:ids, provincePaths, cityPaths, redirects, reviews}, null, 2)+'\n');
console.log({guides:ids.length, cities:cityPaths.length, provinces:provincePaths.length, redirects:Object.keys(redirects).length});
