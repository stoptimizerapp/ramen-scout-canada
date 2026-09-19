import publication from '../data/content-publication.json' with { type: 'json' };
export const contentPublication = publication;
const guideIds = new Set(publication.restaurantIds);
export const hasRestaurantGuide = restaurant => guideIds.has(restaurant.id);
export const hasCityGuide = path => publication.cityPaths.includes(path);
export const hasProvinceGuide = path => publication.provincePaths.includes(path);
export function publicPath(href) {
  if (!href.startsWith('/')) return href;
  const [path] = href.split(/[?#]/);
  return publication.redirects[path] || href;
}
export function usableMenuItems(restaurant) {
  return restaurant.menu.status === 'verified_current' ? restaurant.menu.items.filter(item => !/extra.*topping|ramenramen|kazoku ramenkazoku/i.test(item.name)) : [];
}
