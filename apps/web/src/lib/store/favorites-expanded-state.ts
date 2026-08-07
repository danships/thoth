import { atom } from 'nanostores';

// A single collapse/expand flag for the whole Favorites section — distinct from
// `tree-expanded-state.ts`, which tracks per-page expand state within a tree, not
// section-level collapse.
export const $favoritesSectionExpanded = atom<boolean>(true);

export const toggleFavoritesSection = () => {
  $favoritesSectionExpanded.set(!$favoritesSectionExpanded.get());
};
