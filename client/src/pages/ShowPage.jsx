import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { CorrelationPanel } from '../components/CorrelationPanel';
import { CurrentBaselines } from '../components/CurrentBaselines';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { EpisodeGrid } from '../components/EpisodeGrid';
import { EpisodeTable } from '../components/EpisodeTable';
import { EpisodeDetail } from '../components/EpisodeDetail';
import { ThumbnailLeaderboard } from '../components/ThumbnailLeaderboard';
import { ShowChat } from '../components/ShowChat';
import { ShowHero } from '../components/ShowHero';
import { EpisodeTrendChart } from '../components/EpisodeTrendChart';
import { computeTrailingBaselines, computeCurrentBaselines, TREND_METRIC_KEYS } from '../utils/stats';

export function ShowPage() {
  const { showName } = useParams();
  const decodedShowName = decodeURIComponent(showName);

  const [episodes, setEpisodes] = useState([]);
  const [shows, setShows] = useState([]);
  const [retentionStickiness, setRetentionStickiness] = useState(null);
  const [view, setView] = useState('cards');
  const [openEpisodeId, setOpenEpisodeId] = useState(null);

  function refreshEpisodes() {
    api.getEpisodes(decodedShowName).then(setEpisodes);
  }

  useEffect(() => {
    refreshEpisodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedShowName]);

  // Fetched so the hero card can match the same show-art/accent-color
  // identity shown on the home grid, rather than picking its own.
  useEffect(() => {
    api.getShows().then(setShows);
  }, []);

  const showIndex = shows.findIndex((s) => s.show_name === decodedShowName);
  const showMeta = showIndex >= 0 ? shows[showIndex] : { show_name: decodedShowName, episode_count: episodes.length };

  useEffect(() => {
    let cancelled = false;
    setRetentionStickiness(null);
    api
      .getRetentionStickiness(decodedShowName)
      .then((result) => {
        if (!cancelled) setRetentionStickiness(result);
      })
      .catch(() => {
        if (!cancelled) setRetentionStickiness(null);
      });
    return () => {
      cancelled = true;
    };
  }, [decodedShowName]);

  const trailingBaselines = useMemo(
    () => computeTrailingBaselines(episodes, TREND_METRIC_KEYS),
    [episodes]
  );

  // Thumbnail ranking only, as a fallback: an episode published right at a
  // show's launch has no prior episodes to judge it against at the time, but
  // by now the show likely has enough recent history to say what's typical
  // for it today — so a launch episode that did well isn't stuck unranked
  // forever just because the show was brand new when it went out.
  const currentBaseline = useMemo(
    () => computeCurrentBaselines(episodes, TREND_METRIC_KEYS).baselines,
    [episodes]
  );

  function handleCloseDetail() {
    setOpenEpisodeId(null);
    refreshEpisodes();
  }

  return (
    <div className="page-content">
      <Link className="back-link" to="/">
        ← All shows
      </Link>
      <div className="show-hero-row">
        <ShowHero show={showMeta} index={Math.max(showIndex, 0)} />
        <div className="show-hero-baseline">
          <h2 className="detail-section-title">Current baseline</h2>
          <CurrentBaselines episodes={episodes} />
        </div>
      </div>

      <section className="show-section">
        <h2 className="detail-section-title">Performance Over Time</h2>
        <EpisodeTrendChart
          episodes={episodes}
          trailingBaselines={trailingBaselines}
          currentBaseline={currentBaseline}
        />
      </section>

      <section className="show-section">
        <h2 className="detail-section-title">Ask about this show</h2>
        <ShowChat showName={decodedShowName} />
      </section>

      <section className="show-section">
        <h2 className="detail-section-title">Top correlations</h2>
        <CorrelationPanel episodes={episodes} showName={decodedShowName} retentionStickiness={retentionStickiness} />
      </section>

      <section className="show-section">
        <h2 className="detail-section-title">Thumbnails</h2>
        <ThumbnailLeaderboard
          showName={decodedShowName}
          episodes={episodes}
          trailingBaselines={trailingBaselines}
          currentBaseline={currentBaseline}
          onOpen={(ep) => setOpenEpisodeId(ep.episode_id)}
        />
      </section>

      <section className="show-section">
        <div className="toolbar">
          <h2 className="detail-section-title">Episodes</h2>
          <SegmentedToggle
            options={[
              { value: 'cards', label: 'Cards' },
              { value: 'table', label: 'Table' },
            ]}
            value={view}
            onChange={setView}
          />
        </div>

        {view === 'cards' ? (
          <EpisodeGrid
            episodes={episodes}
            trailingBaselines={trailingBaselines}
            retentionStickiness={retentionStickiness}
            onOpen={(ep) => setOpenEpisodeId(ep.episode_id)}
          />
        ) : (
          <EpisodeTable episodes={episodes} onOpen={(ep) => setOpenEpisodeId(ep.episode_id)} />
        )}
      </section>

      {openEpisodeId && (
        <EpisodeDetail
          episodeId={openEpisodeId}
          baseline={trailingBaselines.get(openEpisodeId)}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}
