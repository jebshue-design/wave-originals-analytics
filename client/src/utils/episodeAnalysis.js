import { trendStatus } from './stats';
import { formatRawPercent, formatPercent } from './format';

// "The Hook" covers two distinct moments: did the thumbnail/title/timing get
// the click (CTR), and did the cold open keep people from bailing immediately
// after (early drop-off). A good hook needs both — a great thumbnail that
// leads into a slow opening still loses the audience it earned.
const CTR_PHRASES = {
  good: (value, base) => `Click rate: strong — ${value} of people clicked in within 24 hours, above this show's typical ${base}.`,
  average: (value, base) => `Click rate: typical — ${value} click-in rate, in line with this show's usual ${base}.`,
  bad: (value, base) => `Click rate: weak — ${value} click-in rate, below this show's typical ${base}.`,
};

const EARLY_DROPOFF_PHRASES = {
  good: (lost, base) => `Early drop-off: light — only ${lost} of viewers left right after the open, better than this show's typical ${base}.`,
  average: (lost, base) => `Early drop-off: typical — ${lost} of viewers left right after the open, about the same as usual (${base}).`,
  bad: (lost, base) => `Early drop-off: steep — ${lost} of viewers left right after the open, worse than this show's typical ${base}.`,
};

const PAYOFF_PHRASES = {
  good: (value, base) => `Strong — viewers watched ${value} of the episode on average, above this show's typical ${base}.`,
  average: (value, base) => `Typical — ${value} average watch-through, in line with this show's usual ${base}.`,
  bad: (value, base) => `Weak — ${value} average watch-through, below this show's typical ${base}.`,
};

const HEADLINES = {
  'good|good': 'Nailed both the hook and the payoff — a model episode for this show.',
  'good|average': 'Strong hook; the payoff was right in line with the norm.',
  'good|bad': "Got the click, but didn't hold attention — worth a look at pacing or format.",
  'average|good': 'Average hook, but the content held people well — the thumbnail, title, or timing may be leaving views on the table.',
  'average|average': "Right in line with this show's usual performance.",
  'average|bad': 'Typical hook, but engagement lagged — the content may need a rework.',
  'bad|good': 'Weak hook, strong payoff — good content that the thumbnail, title, or timing likely held back.',
  'bad|average': 'Struggled to get people in; watch-through was about average once they arrived.',
  'bad|bad': 'Missed on both fronts — low draw and low engagement.',
};

function combineStatus(statuses) {
  const present = statuses.filter(Boolean);
  if (present.length === 0) return null;
  if (present.includes('bad')) return 'bad';
  if (present.includes('good')) return 'good';
  return 'average';
}

// If the hook held up (people clicked in and didn't bail early) but total
// views still landed below what's typical, that gap isn't explained by the
// hook or the content — it's most likely a reach problem (the algorithm,
// posting time, or competition kept it from being shown to as many people),
// not a packaging or content failure. We can't measure reach directly (no
// impressions data), so this is a flagged assumption, not a hard number.
function getReachFlag(hookStatus, episode, baseline) {
  if (hookStatus === 'bad') return null;
  const viewsStatus = trendStatus(episode.youtube_views_total, baseline.youtube_views_total);
  if (viewsStatus !== 'bad') return null;
  return {
    text:
      "Views still landed below what's typical for this show, even though the hook held up (click rate and early drop-off were both fine). That points to a reach problem — the video likely wasn't shown to as many people — rather than an issue with the packaging or the content itself.",
  };
}

export function getEpisodeAnalysis(episode, baseline = {}) {
  const ctrStatus = trendStatus(episode.ctr_24hr, baseline.ctr_24hr);
  const dropoffStatus = trendStatus(episode.first_dropoff_pct, baseline.first_dropoff_pct);
  const hookStatus = combineStatus([ctrStatus, dropoffStatus]);
  const payoffStatus = trendStatus(episode.avg_watch_pct, baseline.avg_watch_pct);

  if (!hookStatus || !payoffStatus) return null;

  const reachFlag = getReachFlag(hookStatus, episode, baseline);

  const hookParts = [];
  if (ctrStatus) {
    hookParts.push({
      status: ctrStatus,
      text: CTR_PHRASES[ctrStatus](formatRawPercent(episode.ctr_24hr), formatRawPercent(baseline.ctr_24hr)),
    });
  }
  if (dropoffStatus) {
    hookParts.push({
      status: dropoffStatus,
      text: EARLY_DROPOFF_PHRASES[dropoffStatus](
        formatPercent(Math.abs(episode.first_dropoff_pct)),
        formatPercent(Math.abs(baseline.first_dropoff_pct))
      ),
    });
  }

  return {
    headline: HEADLINES[`${hookStatus}|${payoffStatus}`],
    hook: { status: hookStatus, parts: hookParts },
    payoff: {
      status: payoffStatus,
      parts: [
        {
          status: payoffStatus,
          text: PAYOFF_PHRASES[payoffStatus](formatPercent(episode.avg_watch_pct), formatPercent(baseline.avg_watch_pct)),
        },
      ],
    },
    reachFlag,
  };
}
