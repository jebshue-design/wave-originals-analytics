import { youtubeThumbnailUrl } from '../utils/youtube';
import { WaveMark } from './WaveMark';

export function EpisodeThumbnail({ videoId, alt, className }) {
  const url = youtubeThumbnailUrl(videoId);

  if (!url) {
    return (
      <div className={`thumb-placeholder ${className || ''}`}>
        <WaveMark />
      </div>
    );
  }

  return <img className={`thumb-image ${className || ''}`} src={url} alt={alt} loading="lazy" />;
}
