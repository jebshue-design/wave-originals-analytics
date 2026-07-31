import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export function ShowChat({ showName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    setMessages([]);
    setInput('');
    setError(null);
  }, [showName]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  async function handleSubmit(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || isLoading) return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setError(null);
    setIsLoading(true);
    try {
      const { answer } = await api.askShow(showName, question, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="show-chat">
      {messages.length > 0 && (
        <div className="show-chat-messages" ref={scrollRef}>
          {messages.map((m, idx) => (
            <div key={idx} className={`show-chat-message ${m.role}`}>
              {m.content}
            </div>
          ))}
          {isLoading && (
            <div className="show-chat-message assistant show-chat-thinking">
              <span className="insight-analyzing-dot" />
              <span className="insight-analyzing-dot" />
              <span className="insight-analyzing-dot" />
            </div>
          )}
        </div>
      )}

      <form className="show-chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this show — e.g. what type of episode does best here?"
          disabled={isLoading}
        />
        <button type="submit" className="btn-primary" disabled={isLoading || !input.trim()}>
          {isLoading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {error && <p className="form-error spec">{error}</p>}
    </div>
  );
}
