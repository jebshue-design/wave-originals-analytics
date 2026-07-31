import { useState } from 'react';
import { formatDate } from '../utils/format';
import { OutcomeBadge } from './OutcomeBadge';
import { NoteForm } from './NoteForm';

export function NoteList({ notes, onEdit }) {
  const [editingId, setEditingId] = useState(null);

  if (notes.length === 0) {
    return <p className="empty-state spec">No notes yet — be the first to log what you tried.</p>;
  }

  async function handleSaveEdit(noteId, fields) {
    await onEdit(noteId, fields);
    setEditingId(null);
  }

  return (
    <ul className="note-list">
      {notes.map((note) => (
        <li key={note.id} className="note-item">
          {editingId === note.id ? (
            <NoteForm
              initialValues={note}
              submitLabel="Save"
              onCancel={() => setEditingId(null)}
              onSubmit={(fields) => handleSaveEdit(note.id, fields)}
            />
          ) : (
            <>
              <div className="note-item-head">
                <span className="note-author">{note.author_name}</span>
                <span className="spec">
                  {formatDate(note.updated_at || note.created_at)}
                  {note.updated_at && ' (edited)'}
                </span>
              </div>
              {note.thumbnail_tried && (
                <p className="note-what-tried">
                  <span className="note-tried-label">Thumbnail:</span> {note.thumbnail_tried}
                </p>
              )}
              {note.hook_tried && (
                <p className="note-what-tried">
                  <span className="note-tried-label">Hook:</span> {note.hook_tried}
                </p>
              )}
              {note.outcome && <OutcomeBadge outcome={note.outcome} />}
              {note.notes && <p className="note-freeform">{note.notes}</p>}
              <button type="button" className="note-edit-btn" onClick={() => setEditingId(note.id)}>
                Edit
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
