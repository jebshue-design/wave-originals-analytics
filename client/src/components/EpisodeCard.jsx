import { formatCompactNumber, formatDate } from '../utils/format';
import { metricLabel } from '../config/metrics';
import { EpisodeThumbnail } from './EpisodeThumbnail';
import { TrendIndicator } from './TrendIndicator';

export function EpisodeCard({
  episode,
  baseline = {},
  onOpen,
  entranceDelayMs = 0,
  hasStrongIntro = false,
  ownStickiness = null,
  stickinessPercentile = null,
}) {
  const noteCount = Number(episode.note_count || 0);
  const strongIntroTooltip =
    hasStrongIntro && ownStickiness
      ? `At the ${stickinessPercentile}% mark, where this show typically starts to level off, ${(
          ownStickiness.retention * 100
        ).toFixed(0)}% of viewers were still watching — vs. this show's usual ${(
          ownStickiness.baseline * 100
        ).toFixed(0)}%. More of the audience stuck around than usual, suggesting a stronger-than-usual intro.`
      : null;

  return (
    <button
      className="episode-card card-enter"
      style={{ animationDelay: `${entranceDelayMs}ms` }}
      onClick={() => onOpen(episode)}
    >
      <EpisodeThumbnail videoId={episode.youtube_video_id} alt={episode.episode_title} className="card-thumb" />
      <div className="card-eyebrow spec">{episode.show_name}</div>
      <div className="card-title">{episode.episode_title}</div>
      <div className="card-meta spec">
        <span>{formatDate(episode.published_at)}</span>
        <span className="card-meta-pills">
          {hasStrongIntro && (
            <span className="strong-intro-pill" tabIndex={0} data-tooltip={strongIntroTooltip}>
              Strong intro
            </span>
          )}
          {noteCount > 0 && <span className="note-pill">{noteCount} note{noteCount === 1 ? '' : 's'}</span>}
        </span>
      </div>

      <div className="card-hero">
        <span className="spec">{metricLabel('total_performance_combined')}</span>
        <span className="card-hero-value mono-num">
          {formatCompactNumber(episode.total_performance_combined)}
          <TrendIndicator value={episode.total_performance_combined} baseline={baseline.total_performance_combined} />
        </span>
      </div>

      <div className="card-channels">
        <div className="card-channel">
          <span className="channel-swatch" style={{ background: 'var(--series-downloads)' }} />
          <span className="spec">{metricLabel('audio_downloads_total')}</span>
          <span className="mono-num">
            {formatCompactNumber(episode.audio_downloads_total)}
            <TrendIndicator value={episode.audio_downloads_total} baseline={baseline.audio_downloads_total} />
          </span>
        </div>
        <div className="card-channel">
          <span className="channel-swatch" style={{ background: 'var(--series-views)' }} />
          <span className="spec">{metricLabel('youtube_views_total')}</span>
          <span className="mono-num">
            {formatCompactNumber(episode.youtube_views_total)}
            <TrendIndicator value={episode.youtube_views_total} baseline={baseline.youtube_views_total} />
          </span>
        </div>
      </div>
    </button>
  );
}
