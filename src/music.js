// Record-player song list. Audio streams through YouTube's IFrame Player API
// (the songs are copyrighted, so nothing is bundled). YouTube requires the
// player to stay visible while it plays, so it lives inside the panel and
// closing the panel stops the music.

export const SONGS = [
  { id: 'JYuyWrkwpok', title: 'Fly Me to the Moon', artist: 'Frank Sinatra', sleeve: '#e4ad4c' },
  { id: 'mhpRipG9Zss', title: 'Katawaredoki', artist: 'RADWIMPS', sleeve: '#4f7a9c' },
  { id: '0Uhh62MUEic', title: 'One Last Kiss', artist: 'Hikaru Utada', sleeve: '#b3462f' },
];

let apiPromise = null;
function loadYouTubeAPI() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('Could not load the YouTube player'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

export function createMusicPanel({ onPlayingChange }) {
  const panel = document.getElementById('music');
  const list = document.getElementById('music-list');
  const status = document.getElementById('music-status');
  const closeBtn = document.getElementById('music-close');
  const playerHost = document.getElementById('music-player');

  let player = null;
  let playerReady = null;
  let current = -1;
  let playing = false;

  const setPlaying = (on) => {
    if (on === playing) return;
    playing = on;
    panel.classList.toggle('is-playing', on);
    onPlayingChange?.(on);
  };

  const setStatus = (html) => {
    status.innerHTML = html;
    status.hidden = !html;
  };

  // track buttons
  const buttons = SONGS.map((song, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'track';
    b.innerHTML = `
      <span class="sleeve" style="--sleeve:${song.sleeve}"><span class="disc"></span></span>
      <span class="meta"><span class="title"></span><span class="artist"></span></span>
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>`;
    b.querySelector('.title').textContent = song.title;
    b.querySelector('.artist').textContent = song.artist;
    b.addEventListener('click', () => select(i));
    li.appendChild(b);
    list.appendChild(li);
    return b;
  });

  function markCurrent() {
    buttons.forEach((b, i) => {
      b.classList.toggle('current', i === current);
      b.setAttribute('aria-pressed', String(i === current));
    });
  }

  function ensurePlayer(videoId) {
    if (playerReady) return playerReady;
    playerHost.hidden = false;
    playerReady = loadYouTubeAPI().then(
      (YT) =>
        new Promise((resolve) => {
          const mount = document.createElement('div');
          playerHost.appendChild(mount);
          player = new YT.Player(mount, {
            width: '100%',
            height: '100%',
            videoId,
            playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
            events: {
              onReady: () => resolve(player),
              onStateChange: (e) => {
                const S = YT.PlayerState;
                if (e.data === S.PLAYING) {
                  setPlaying(true);
                  setStatus('');
                } else if (e.data === S.PAUSED || e.data === S.ENDED || e.data === S.CUED) {
                  setPlaying(false);
                }
              },
              onError: (e) => {
                setPlaying(false);
                const song = SONGS[current];
                const blocked = e.data === 101 || e.data === 150 || e.data === 100;
                const msg = blocked ? 'This one can’t play inside the room.' : 'The player hit a snag.';
                setStatus(`${msg} <a href="https://www.youtube.com/watch?v=${song.id}" target="_blank" rel="noopener">Listen on YouTube ↗</a>`);
              },
            },
          });
        }),
    );
    playerReady.catch((err) => {
      playerReady = null;
      setStatus(`${err.message}. Check your connection and try again.`);
    });
    return playerReady;
  }

  async function select(i) {
    setStatus('');
    if (i === current && player) {
      // toggle the record that is already on the platter
      if (playing) player.pauseVideo();
      else player.playVideo();
      return;
    }
    current = i;
    markCurrent();
    const isFirst = !player;
    try {
      const p = await ensurePlayer(SONGS[i].id);
      if (!isFirst) p.loadVideoById(SONGS[i].id);
      else p.playVideo();
    } catch {
      /* status already shown */
    }
  }

  function open() {
    panel.hidden = false;
    // warm the API so the first song starts quickly
    loadYouTubeAPI().catch(() => {});
    requestAnimationFrame(() => panel.classList.add('open'));
  }

  function close() {
    if (player) player.stopVideo();
    setPlaying(false);
    panel.classList.remove('open');
    panel.hidden = true;
  }

  closeBtn.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  return {
    open,
    close,
    toggle: () => (panel.hidden ? open() : close()),
    get isOpen() {
      return !panel.hidden;
    },
    get playing() {
      return playing;
    },
  };
}
