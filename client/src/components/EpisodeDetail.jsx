import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatCompactNumber, formatDate, formatPercent, formatRawPercent, formatWatchDuration } from '../utils/format';
import { metricLabel, metricDescription } from '../config/metrics';
import { trendStatus } from '../utils/stats';
import { RetentionChart } from './RetentionChart';
import { NoteList } from './NoteList';
import { NoteForm } from './NoteForm';
import { EpisodeThumbnail } from './EpisodeThumbnail';
import { InfoTip } from './InfoTip';
import { EpisodeAnalysis } from './EpisodeAnalysis';

export function EpisodeDetail({ episodeId, baseline = {}, onClose }) {
  const [episode, setEpisode] = useState(null);
  const [error, setError] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getEpisode(episodeId)
      .then((data) => {
        if (!cancelled) setEpisode(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [episodeId]);

  async function handleAddNote(note) {
    const created = await api.addNote(episodeId, note);
    setEpisode((prev) => ({ ...prev, notes: [created, ...prev.notes] }));
  }

  async function handleEditNote(noteId, note) {
    const updated = await api.updateNote(episodeId, noteId, note);
    setEpisode((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => (n.id === noteId ? updated : n)),
    }));
  }

  async function handleRegenerateInsight() {
    setIsRegenerating(true);
    try {
      const { ai_insight } = await api.regenerateInsight(episodeId);
      setEpisode((prev) => ({ ...prev, ai_insight }));
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {error && <p className="form-error spec">{error}</p>}
        {!episode && !error && <p className="spec">Loading…</p>}

        {episode && (
          <>
            <div className={`detail-thumb-wrap ${isRegenerating ? 'is-scanning' : ''}`}>
              <EpisodeThumbnail videoId={episode.youtube_video_id} alt={episode.episode_title} className="detail-thumb" />
            </div>
            <div className="detail-eyebrow spec">{episode.show_name}</div>
            <h2 className="detail-title">{episode.episode_title}</h2>
            <p className="spec detail-date">Published {formatDate(episode.published_at)}</p>

            <EpisodeAnalysis
              episode={episode}
              baseline={baseline}
              onRegenerate={handleRegenerateInsight}
              isRegenerating={isRegenerating}
            />

            <p className="stat-tile-legend spec">
              <span className="trend-indicator good">▲</span> good
              <span className="trend-indicator average">●</span> average
              <span className="trend-indicator bad">▼</span> needs attention
              <span className="stat-tile-legend-note">vs. what's typical for this show over the trailing 3 months</span>
            </p>

            <div className="stat-tile-row">
              <StatTile
                metricKey="total_performance_combined"
                rawValue={episode.total_performance_combined}
                baseline={baseline.total_performance_combined}
                value={formatCompactNumber(episode.total_performance_combined)}
              />
              <StatTile
                metricKey="audio_downloads_total"
                rawValue={episode.audio_downloads_total}
                baseline={baseline.audio_downloads_total}
                value={formatCompactNumber(episode.audio_downloads_total)}
              />
              <StatTile
                metricKey="youtube_views_total"
                rawValue={episode.youtube_views_total}
                baseline={baseline.youtube_views_total}
                value={formatCompactNumber(episode.youtube_views_total)}
              />
              <StatTile
                metricKey="avg_watch_pct"
                rawValue={episode.avg_watch_pct}
                baseline={baseline.avg_watch_pct}
                value={formatPercent(episode.avg_watch_pct)}
                subValue={formatWatchDuration(episode.avg_watch_pct, episode.episode_length_seconds)}
              />
              <StatTile
                metricKey="num_upward_spikes"
                rawValue={episode.num_upward_spikes}
                baseline={baseline.num_upward_spikes}
                value={episode.num_upward_spikes ?? '—'}
              />
              <StatTile
                metricKey="max_spike_pct"
                rawValue={episode.max_spike_pct}
                baseline={baseline.max_spike_pct}
                value={formatPercent(episode.max_spike_pct)}
              />
              <StatTile
                metricKey="ctr_1hr"
                rawValue={episode.ctr_1hr}
                baseline={baseline.ctr_1hr}
                value={formatRawPercent(episode.ctr_1hr)}
              />
              <StatTile
                metricKey="ctr_24hr"
                rawValue={episode.ctr_24hr}
                baseline={baseline.ctr_24hr}
                value={formatRawPercent(episode.ctr_24hr)}
              />
            </div>

            <div className="detail-charts">
              <div className="detail-chart-block">
                <h3 className="detail-section-title">Retention</h3>
                <RetentionChart episode={episode} />
              </div>
            </div>

            {episode.transcript_at_biggest_spike && (
              <div className="detail-transcript">
                <h3 className="detail-section-title">
                  Biggest retention spike{episode.biggest_spike_timestamp ? ` — at ${episode.biggest_spike_timestamp}` : ''}
                </h3>
                <blockquote className="transcript-quote">{episode.transcript_at_biggest_spike}</blockquote>
              </div>
            )}

            <div className="detail-notes">
              <h3 className="detail-section-title">Producer notes</h3>
              <NoteList notes={episode.notes} onEdit={handleEditNote} />
              <NoteForm onSubmit={handleAddNote} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatTile({ metricKey, value, subValue, rawValue, baseline }) {
  const status = trendStatus(rawValue, baseline);
  return (
    <div className="stat-tile">
      <span className="spec">
        {metricLabel(metricKey)}
        <InfoTip text={metricDescription(metricKey)} />
      </span>
      <span className={`stat-tile-value mono-num ${status || ''}`}>{value}</span>
      {subValue && <span className="stat-tile-subvalue mono-num">{subValue} avg. watched</span>}
    </div>
  );
}
