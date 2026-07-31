import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ShowCard } from '../components/ShowCard';

export function Home() {
  const [shows, setShows] = useState([]);

  useEffect(() => {
    api.getShows().then(setShows);
  }, []);

  return (
    <div className="page-content">
      <div className="page-heading">
        <h1 className="page-title">Shows</h1>
        <p className="spec">{shows.length} show{shows.length === 1 ? '' : 's'}</p>
      </div>
      <div className="show-grid">
        {shows.map((show, index) => (
          <ShowCard key={show.show_name} show={show} index={index} entranceDelayMs={Math.min(index * 30, 300)} />
        ))}
      </div>
    </div>
  );
}
