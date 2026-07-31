import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { youtubeThumbnailUrl } from '../utils/youtube';
import { formatMultiplier } from '../utils/format';
import { SegmentedToggle } from './SegmentedToggle';
import { InfoTip } from './InfoTip';

const FORMULA_EXPLANATION =
  "Each thumbnail is scored by how far its 1hr and 24hr click-through rates sit above or below this show's typical rates, weighted 60% 1hr / 40% 24hr, shown as a multiple of typical (1.0x = right at typical). Episodes too early in the show's run to judge against its history at the time (fewer than 3 prior episodes in the trailing 90 days) are instead judged against the show's current typical rates, so a strong launch episode still gets ranked.";

const MAX_PER_SIDE = 8;
// 1hr carries more weight than 24hr in the composite score.
const WEIGHT_1HR = 0.6;
const WEIGHT_24HR = 0.4;

function relDeviation(value, baseline) {
  if (value === null || value === undefined || baseline === null || baseline === undefined || baseline === 0) {
    return null;
  }
  const v = Number(value);
  if (Number.isNaN(v)) return null;
  return (v - baseline) / Math.abs(baseline);
}

// Prefers the episode's own point-in-time trailing baseline; falls back to
// the show's current (as-of-today) baseline when the episode was published
// too early in the show's run to have one of its own — e.g. a launch episode
// with no prior history to compare against at the time. Without this, a
// strong-performing launch episode would simply never be ranked, since it can
// never retroactively gain prior episodes at its own publish date.
function resolvedBaseline(key, trailingBaseline, currentBaseline) {
  const trailing = trailingBaseline?.[key];
  if (trailing !== null && trailing !== undefined) return trailing;
  return currentBaseline?.[key] ?? null;
}

// Ranks a thumbnail by how far its 1hr and 24hr click-through rates sit above
// or below this show's own typical rates, rather than raw CTR — 1hr and 24hr
// sit on very different scales (1hr skews high since it's mostly existing
// subscribers), so a plain average would just track whichever number is
// bigger, not which thumbnail is actually pulling above its own show's norm.
// Returns null (not a fallback raw number) when there's no baseline at all,
// not even a current one — mixing a raw percentage into the same sort key as
// a relative deviation would compare two different scales and produce a
// meaningless ranking.
function compositeCtrScore(episode, trailingBaseline, currentBaseline) {
  const dev1hr = relDeviation(episode.ctr_1hr, resolvedBaseline('ctr_1hr', trailingBaseline, currentBaseline));
  const dev24hr = relDeviation(episode.ctr_24hr, resolvedBaseline('ctr_24hr', trailingBaseline, currentBaseline));

  if (dev1hr !== null && dev24hr !== null) {
    return WEIGHT_1HR * dev1hr + WEIGHT_24HR * dev24hr;
  }
  if (dev24hr !== null) return dev24hr;
  if (dev1hr !== null) return dev1hr;
  return null;
}

// Per-metric deviations for the tooltip breakdown — same baseline
// resolution as the composite score, kept separate so each metric can be
// shown individually rather than just the blended total.
function metricDeviations(episode, trailingBaseline, currentBaseline) {
  return {
    dev1hr: relDeviation(episode.ctr_1hr, resolvedBaseline('ctr_1hr', trailingBaseline, currentBaseline)),
    dev24hr: relDeviation(episode.ctr_24hr, resolvedBaseline('ctr_24hr', trailingBaseline, currentBaseline)),
  };
}

export function ThumbnailLeaderboard({ showName, episodes, trailingBaselines, currentBaseline, onOpen }) {
  const [sortMode, setSortMode] = useState('best');
  const [pattern, setPattern] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getThumbnailPatterns(showName)
      .then((data) => {
        if (!cancelled) setPattern(data);
      })
      .catch(() => {
        if (!cancelled) setPattern(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showName]);

  const scored = episodes
    .filter((ep) => ep.youtube_video_id)
    .map((ep) => {
      const trailingBaseline = trailingBaselines?.get(ep.episode_id);
      return {
        ep,
        score: compositeCtrScore(ep, trailingBaseline, currentBaseline),
        ...metricDeviations(ep, trailingBaseline, currentBaseline),
      };
    })
    .filter((x) => x.score !== null)
    .sort((a, b) => b.score - a.score);

  // Best and worst are drawn from disjoint halves of the ranked list, capped
  // per side — so with a small episode count the two tabs never show the
  // same thumbnails just reversed, and with a large one each tab still shows
  // a manageable number.
  const half = Math.min(MAX_PER_SIDE, Math.floor(scored.length / 2));
  const ranked = sortMode === 'best' ? scored.slice(0, half) : scored.slice(-half).reverse();

  if (half === 0) {
    return (
      <p className="spec">Not enough thumbnails with an established baseline yet for this show.</p>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <p className="spec thumb-leaderboard-hint">
          Ranked by click-through vs. this show's typical (1hr + 24hr combined)
          <InfoTip text={FORMULA_EXPLANATION} />
        </p>
        <SegmentedToggle
          options={[
            { value: 'best', label: 'Best performing' },
            { value: 'worst', label: 'Needs attention' },
          ]}
          value={sortMode}
          onChange={setSortMode}
        />
      </div>

      {pattern?.notes && <p className="thumb-leaderboard-pattern">{pattern.notes}</p>}

      <div className="thumb-leaderboard-grid">
        {ranked.map(({ ep, score, dev1hr, dev24hr }) => (
          <button
            type="button"
            key={ep.episode_id}
            className="thumb-leaderboard-item"
            onClick={() => onOpen(ep)}
          >
            <div className="thumb-leaderboard-image-wrap">
              <img
                className="thumb-leaderboard-image"
                src={youtubeThumbnailUrl(ep.youtube_video_id)}
                alt={ep.episode_title}
                loading="lazy"
              />
              <span
                className={`thumb-leaderboard-ctr ${sortMode === 'best' ? 'good' : 'bad'}`}
                data-tooltip={`vs. typical — 1hr ${formatMultiplier(dev1hr)} · 24hr ${formatMultiplier(dev24hr)}`}
                tabIndex={0}
              >
                {formatMultiplier(score)}
              </span>
            </div>
            <span className="thumb-leaderboard-title">{ep.episode_title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
