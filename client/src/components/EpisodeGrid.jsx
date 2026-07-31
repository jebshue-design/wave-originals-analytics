import { EpisodeCard } from './EpisodeCard';

const MAX_STAGGER_MS = 300;
const STAGGER_STEP_MS = 30;

// How much more retention (vs. this show's own baseline curve, at the point
// where the show typically starts to level off) counts as a real standout —
// checked against real data across several shows: 15% notably above baseline
// keeps this to a small handful of genuine outliers per show, rather than
// flagging routine episode-to-episode variation.
const STRONG_INTRO_MARGIN = 0.15;

export function EpisodeGrid({ episodes, trailingBaselines, retentionStickiness, onOpen }) {
  if (episodes.length === 0) {
    return <p className="empty-state spec">No episodes match this filter.</p>;
  }

  const stickinessByEpisode = new Map(
    (retentionStickiness?.perEpisode || []).map((e) => [e.episodeId, e])
  );

  return (
    <div className="episode-grid">
      {episodes.map((ep, index) => {
        const ownStickiness = stickinessByEpisode.get(ep.episode_id);
        const hasStrongIntro = !!ownStickiness && ownStickiness.relDelta > STRONG_INTRO_MARGIN;

        return (
          <EpisodeCard
            key={ep.episode_id}
            episode={ep}
            baseline={trailingBaselines?.get(ep.episode_id)}
            onOpen={onOpen}
            entranceDelayMs={Math.min(index * STAGGER_STEP_MS, MAX_STAGGER_MS)}
            hasStrongIntro={hasStrongIntro}
            ownStickiness={ownStickiness}
            stickinessPercentile={retentionStickiness?.percentile}
          />
        );
      })}
    </div>
  );
}
