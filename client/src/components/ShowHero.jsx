import { SHOW_ART } from '../config/showArt';
import { accentForIndex } from '../config/palette';
import { WaveMark } from './WaveMark';

// Same visual as the ShowCard on the home grid — reused here as a static
// (non-link) header so a show's page carries the same art/accent identity
// instead of dropping back to a plain text title once you've clicked in.
export function ShowHero({ show, index = 0 }) {
  const art = SHOW_ART[show.show_name];

  return (
    <div className="show-card show-hero" style={{ '--show-accent': accentForIndex(index) }}>
      {art ? (
        <img className="show-card-art" src={art} alt={show.show_name} loading="lazy" />
      ) : (
        <div className="show-card-art show-card-art-placeholder">
          <WaveMark />
        </div>
      )}
      <div className="show-card-body">
        <span className="show-card-name">{show.show_name}</span>
        <span className="spec">
          {show.episode_count} episode{Number(show.episode_count) === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
