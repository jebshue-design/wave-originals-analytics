import { Link } from 'react-router-dom';
import { SHOW_ART } from '../config/showArt';
import { accentForIndex } from '../config/palette';
import { WaveMark } from './WaveMark';

export function ShowCard({ show, index = 0, entranceDelayMs = 0 }) {
  const art = SHOW_ART[show.show_name];

  return (
    <Link
      className="show-card card-enter"
      style={{ '--show-accent': accentForIndex(index), animationDelay: `${entranceDelayMs}ms` }}
      to={`/shows/${encodeURIComponent(show.show_name)}`}
    >
      {art ? (
        <img className="show-card-art" src={art} alt={show.show_name} loading="lazy" />
      ) : (
        <div className="show-card-art show-card-art-placeholder">
          <WaveMark />
        </div>
      )}
      <div className="show-card-body">
        <span className="show-card-name">{show.show_name}</span>
        <span className="spec">{show.episode_count} episode{Number(show.episode_count) === 1 ? '' : 's'}</span>
      </div>
    </Link>
  );
}
