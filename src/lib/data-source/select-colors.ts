import { selectColorSchema, type SelectColor } from '@/types/schemas/entities/container';

/**
 * Fixed 11-color palette for single-select column options, matching Mantine's named theme
 * colors so text/background contrast can be computed consistently via the `color` prop on
 * `Badge`/`Pill`. Reused by the color picker UI and by `getRandomSelectColor` below.
 */
export const SELECT_COLOR_OPTIONS: { value: SelectColor; label: string }[] = selectColorSchema.options.map((color) => ({
  value: color,
  label: color.charAt(0).toUpperCase() + color.slice(1),
}));

/**
 * Picks a pseudo-random color from the palette, used when inline-creating an option
 * (e.g. from the dropdown cell editor) where the user hasn't explicitly picked a color.
 */
export function getRandomSelectColor(): SelectColor {
  const options = SELECT_COLOR_OPTIONS;
  const index = Math.floor(Math.random() * options.length);
  // Non-null assertion is safe: SELECT_COLOR_OPTIONS is a fixed, non-empty array.
  return options[index]!.value;
}
