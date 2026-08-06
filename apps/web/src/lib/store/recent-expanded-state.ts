import { atom } from 'nanostores';

// A single collapse/expand flag for the whole Recent section — distinct from
// `tree-expanded-state.ts`, which tracks per-page expand state within a tree, not
// section-level collapse. Mirrors `favorites-expanded-state.ts`.
export const $recentSectionExpanded = atom<boolean>(true);

export const toggleRecentSection = () => {
  $recentSectionExpanded.set(!$recentSectionExpanded.get());
};
