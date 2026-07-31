// Maps show_name (exactly as it appears in the episodes table) to that show's
// YouTube channel ID, so title lookups can be scoped to the right channel and
// avoid matching a reaction/clip channel that reposted the same title.
// Fill in as channel IDs become available — shows left unmapped fall back to
// an unscoped title search.
export const SHOW_CHANNEL_IDS = {
  'Big Bro with Kid Cudi': 'UCy1iruS87WaAxn3w_aysQ_Q',
  'Closed on Sundays with Pat Surtain & Terrion Arnold': 'UCtyrk9P4aY6ZyTPuH5nFDhg',
  '7PM in Brooklyn with Carmelo Anthony': 'UCT3wF21Qx0d0HmuiCzji8Lg',
  'Almost Athletes with Dude Perfect': 'UCJrWyyCRROi8NlQ6Xd9dx5Q',
  'Fitz & Whit | Ryan Fitzpatrick & Andrew Whitworth': 'UCKltyhaOSwq0bB3JVIOVdBw',
  'House of Maher': 'UCrlOeUHgXPlaF2bxCwBdJMg',
  'My Momma Told Me': 'UCm1wMf8iYG-imuTwqje2PNg',
  'New Heights with Jason and Travis Kelce': 'UCVRm2Ho8cL3lvWDyp2ayuFw',
  'Not Gonna Lie with Kylie Kelce': 'UCmCEofjQiLDJYUCFu_zlfPA',
  'Open Thoughts with Funny Marco': 'UCNWHllkNIWv1MSvKcOzLsow',
  'So True with Caleb Hearon': 'UC-_AkLn4A5iBr6BXN6waR_Q',
  'The Right Time with Bomani Jones': 'UCuNXr0Y4_ILuAYykBE4wCwQ',
  'Whiskey Ginger with Andrew Santino': 'UCNGbPFX8UOm7qk6kvnHKr0w',
  'Wingmen with Matthew & Brady Tkachuk': 'UCuIc9-ayrFuDBdaY5M0gDqw',
};
