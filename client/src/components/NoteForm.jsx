import { useState } from 'react';

const OUTCOMES = [
  { value: '', label: 'No outcome yet' },
  { value: 'worked', label: 'Worked' },
  { value: 'did_not_work', label: "Didn't work" },
  { value: 'inconclusive', label: 'Inconclusive' },
];

export function NoteForm({ onSubmit, onCancel, initialValues = null, submitLabel = 'Add note' }) {
  const isEditing = Boolean(initialValues);
  const [authorName, setAuthorName] = useState(initialValues?.author_name || '');
  const [thumbnailTried, setThumbnailTried] = useState(initialValues?.thumbnail_tried || '');
  const [hookTried, setHookTried] = useState(initialValues?.hook_tried || '');
  const [outcome, setOutcome] = useState(initialValues?.outcome || '');
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!authorName.trim() || (!thumbnailTried.trim() && !hookTried.trim())) {
      setError('Your name and at least one of Thumbnail / Hook are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        author_name: authorName,
        thumbnail_tried: thumbnailTried,
        hook_tried: hookTried,
        outcome: outcome || null,
        notes,
      });
      if (!isEditing) {
        setThumbnailTried('');
        setHookTried('');
        setOutcome('');
        setNotes('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="note-form" onSubmit={handleSubmit}>
      <div className="note-form-row">
        <label className="spec" htmlFor="author_name">
          Your name
        </label>
        <input
          id="author_name"
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="e.g. Jeb"
        />
      </div>

      <div className="note-form-row">
        <label className="spec" htmlFor="thumbnail_tried">
          Thumbnail: What Did You Try
        </label>
        <textarea
          id="thumbnail_tried"
          value={thumbnailTried}
          onChange={(e) => setThumbnailTried(e.target.value)}
          rows={2}
          placeholder="e.g. Swapped to a closer crop on the guest's face"
        />
      </div>

      <div className="note-form-row">
        <label className="spec" htmlFor="hook_tried">
          Hook: What Did You Try
        </label>
        <textarea
          id="hook_tried"
          value={hookTried}
          onChange={(e) => setHookTried(e.target.value)}
          rows={2}
          placeholder="e.g. Posted 2 hours earlier than usual"
        />
      </div>

      <div className="note-form-row">
        <label className="spec" htmlFor="outcome">
          Outcome
        </label>
        <select id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="note-form-row">
        <label className="spec" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything else worth remembering"
        />
      </div>

      {error && <p className="form-error spec">{error}</p>}

      <div className="note-form-actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
