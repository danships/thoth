export function findIndexAndValue<T>(
  array: T[],
  predicate: (value: T) => boolean
): { index: number; value: T } | undefined {
  const index = array.findIndex((value) => predicate(value));
  if (index === -1) {
    return undefined;
  }
  return { index, value: array[index]! };
}
