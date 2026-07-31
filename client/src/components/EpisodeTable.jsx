import { formatCompactNumber, formatDate } from '../utils/format';

export function EpisodeTable({ episodes, onOpen }) {
  if (episodes.length === 0) {
    return <p className="empty-state spec">No episodes match this filter.</p>;
  }

  return (
    <div className="episode-table-wrap">
      <table className="episode-table">
        <thead>
          <tr>
            <th>Episode</th>
            <th>Show</th>
            <th>Published</th>
            <th>Total performance</th>
            <th>Downloads</th>
            <th>YouTube views</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {episodes.map((ep) => (
            <tr key={ep.episode_id} onClick={() => onOpen(ep)}>
              <td className="episode-table-title">{ep.episode_title}</td>
              <td>{ep.show_name}</td>
              <td className="mono-num">{formatDate(ep.published_at)}</td>
              <td className="mono-num">{formatCompactNumber(ep.total_performance_combined)}</td>
              <td className="mono-num">{formatCompactNumber(ep.audio_downloads_total)}</td>
              <td className="mono-num">{formatCompactNumber(ep.youtube_views_total)}</td>
              <td className="mono-num">{ep.note_count || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
