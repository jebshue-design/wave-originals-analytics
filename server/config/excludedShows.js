// Shows hidden from the app entirely — kept out of both the show directory
// and direct episode lookups, so they stay excluded across BigQuery re-syncs
// rather than needing to be deleted from the database each time.
export const EXCLUDED_SHOWS = [
  'Fitz & Whit | Ryan Fitzpatrick & Andrew Whitworth',
  'New Heights with Jason and Travis Kelce',
  'Closed on Sundays with Pat Surtain & Terrion Arnold',
];
