// Server-side copy of client/src/config/showArtColor.js — kept in sync
// manually (same pattern as server/utils/stats.js) since the meeting-deck
// HTML is rendered here rather than in the browser bundle.
export const SHOW_ART_COLOR = {
  '7PM in Brooklyn with Carmelo Anthony': '#f09008',
  'Almost Athletes with Dude Perfect': '#f0f050',
  'Big Bro with Kid Cudi': '#d84890',
  'House of Maher': '#f0c0c0',
  'Not Gonna Lie with Kylie Kelce': '#2898e0',
  'Open Thoughts with Funny Marco': '#707070',
  'So True with Caleb Hearon': '#50a8f0',
  'The Right Time with Bomani Jones': '#1f8a76',
  'Whiskey Ginger with Andrew Santino': '#08e0b8',
  'Wingmen with Matthew & Brady Tkachuk': '#083058',
};

export const CATEGORICAL_ACCENTS = [
  '#007dff',
  '#0bdd65',
  '#d12670',
  '#ffc421',
  '#0ac2ff',
  '#ff8712',
  '#a60aff',
  '#fa3842',
];

export function accentForShow(showName, fallbackIndex) {
  return SHOW_ART_COLOR[showName] || CATEGORICAL_ACCENTS[fallbackIndex % CATEGORICAL_ACCENTS.length];
}
