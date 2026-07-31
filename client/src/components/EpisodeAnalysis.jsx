import { useEffect, useRef, useState } from 'react';
import { getEpisodeAnalysis } from '../utils/episodeAnalysis';

function fallbackNarrative(analysis) {
  const sentences = [
    analysis.headline,
    ...analysis.hook.parts.map((part) => part.text),
    ...analysis.payoff.parts.map((part) => part.text),
  ];
  if (analysis.reachFlag) sentences.push(analysis.reachFlag.text);
  return sentences.join(' ');
}

const TYPE_CHARS_PER_TICK = 3;
const TYPE_TICK_MS = 12;

export function EpisodeAnalysis({ episode, baseline, onRegenerate, isRegenerating }) {
  const analysis = getEpisodeAnalysis(episode, baseline);
  const [error, setError] = useState(null);
  const [displayedText, setDisplayedText] = useState(null);
  const wasRegeneratingRef = useRef(false);
  const typingIntervalRef = useRef(null);

  const currentText = analysis ? episode.ai_insight || fallbackNarrative(analysis) : null;

  useEffect(() => {
    const justFinished = wasRegeneratingRef.current && !isRegenerating;
    wasRegeneratingRef.current = isRegenerating;
    clearInterval(typingIntervalRef.current);

    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!justFinished || !currentText || reduceMotion) {
      setDisplayedText(currentText);
      return undefined;
    }

    setDisplayedText('');
    let i = 0;
    typingIntervalRef.current = setInterval(() => {
      i += TYPE_CHARS_PER_TICK;
      setDisplayedText(currentText.slice(0, i));
      if (i >= currentText.length) clearInterval(typingIntervalRef.current);
    }, TYPE_TICK_MS);

    return () => clearInterval(typingIntervalRef.current);
  }, [isRegenerating, currentText]);

  const isTyping = displayedText !== null && currentText !== null && displayedText.length < currentText.length;
  const paragraphs = displayedText ? displayedText.split(/\n{2,}/).filter(Boolean) : [];

  async function handleRegenerateClick() {
    setError(null);
    try {
      await onRegenerate();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="insight-tip">
      <div className="insight-tip-header">
        <span className="spec insight-tip-label">Analysis</span>
        {analysis && (
          <button
            type="button"
            className="insight-regenerate-btn"
            onClick={handleRegenerateClick}
            disabled={isRegenerating}
            title="Regenerate with AI — uses API credits"
          >
            {isRegenerating ? (
              <>
                <span className="btn-spinner" /> Analyzing…
              </>
            ) : (
              'Regenerate'
            )}
          </button>
        )}
      </div>
      {isRegenerating ? (
        <p className="insight-analyzing">
          <span className="insight-analyzing-dot" />
          <span className="insight-analyzing-dot" />
          <span className="insight-analyzing-dot" />
          Reading the thumbnail, transcript, and past episodes…
        </p>
      ) : !analysis ? (
        <p>Not enough recent episodes for this show yet to compare this one against a baseline.</p>
      ) : (
        paragraphs.map((block, idx) => {
          const isTypingBlock = isTyping && idx === paragraphs.length - 1;
          const lines = block.split('\n').filter(Boolean);
          const isBulletBlock = lines.length > 0 && lines.every((line) => line.trim().startsWith('- '));

          if (isBulletBlock) {
            return (
              <ul key={idx} className="insight-bullets">
                {lines.map((line, lineIdx) => (
                  <li
                    key={lineIdx}
                    className={isTypingBlock && lineIdx === lines.length - 1 ? 'insight-typing' : ''}
                  >
                    {line.trim().slice(2)}
                  </li>
                ))}
              </ul>
            );
          }
          return (
            <p key={idx} className={isTypingBlock ? 'insight-typing' : ''}>
              {block}
            </p>
          );
        })
      )}
      {error && <p className="form-error spec">{error}</p>}
    </div>
  );
}
