// Single source of truth for how a metric is labeled and explained, used
// everywhere it appears (episode cards, episode detail, correlation panel)
// so producers see the same name and definition no matter where they look.
export const METRICS = {
  total_performance_combined: {
    label: 'Total Performance',
    description: 'Audio downloads and YouTube views added together — the single headline number for how the episode did overall.',
  },
  audio_downloads_total: {
    label: 'Audio Downloads',
    description: 'Total podcast downloads across Spotify, Apple Podcasts, and other audio apps.',
  },
  youtube_views_total: {
    label: 'YouTube Views',
    description: 'Total views of the episode video on YouTube.',
  },
  avg_watch_pct: {
    label: 'Average Watch %',
    description: 'On average, how much of the episode people watched before clicking away — higher means viewers stuck around longer.',
  },
  ctr_1hr: {
    label: 'Click Through Rate (1 Hour)',
    description: 'Of everyone who saw the thumbnail and title in the first hour after posting, the percentage who clicked to watch.',
  },
  ctr_24hr: {
    label: 'Click Through Rate (24 Hours)',
    description: 'Of everyone who saw the thumbnail and title in the first day after posting, the percentage who clicked to watch.',
  },
  num_upward_spikes: {
    label: 'Attention Spikes',
    description: 'How many moments in the episode saw viewership jump back up — usually a sign something on screen grabbed people’s attention.',
  },
  max_spike_pct: {
    label: 'Biggest Attention Spike',
    description: 'The size of the single largest jump back up in viewers during the episode.',
  },
  avg_retention_vs_show_baseline: {
    label: 'Retention vs. Show Average',
    description: 'How this episode’s average retention compares to the show’s typical episode — positive means it held attention better than usual for this show.',
  },
  retention_at_point_1: {
    label: 'Retention at the Start',
    description: 'The percentage of viewers still watching near the very beginning of the episode.',
  },
  retention_at_first_dropoff: {
    label: 'Retention at ~1 Min In',
    description: 'The percentage of viewers still watching about 1 minute into the episode — right after the cold open, where a lot of people tend to leave early on.',
  },
  first_dropoff_pct: {
    label: 'Early Drop-Off',
    description: 'How much of the audience was lost right at the start, in the first big early drop-off point — a sign of whether the cold open kept people around after they clicked in.',
  },
  retention_at_second_dropoff: {
    label: 'Retention at ~2 Min In',
    description: 'The percentage of viewers still watching about 2 minutes into the episode — the next point right after that where a lot of people tend to leave early on.',
  },
  episode_length_seconds: {
    label: 'Episode Length',
    description: 'How long the episode runs, start to finish.',
  },
};

export function metricLabel(key) {
  return METRICS[key]?.label || key;
}

export function metricDescription(key) {
  return METRICS[key]?.description || '';
}
