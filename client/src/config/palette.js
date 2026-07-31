// Wave's validated categorical order (blue -> red) — cycled to give each show
// on the home directory a distinct color identity for quick scanning.
export const CATEGORICAL_ACCENTS = [
  '#007dff', // azure
  '#0bdd65', // green
  '#d12670', // magenta
  '#ffc421', // yellow
  '#0ac2ff', // aqua
  '#ff8712', // orange
  '#a60aff', // violet
  '#fa3842', // red
];

export function accentForIndex(index) {
  return CATEGORICAL_ACCENTS[index % CATEGORICAL_ACCENTS.length];
}
