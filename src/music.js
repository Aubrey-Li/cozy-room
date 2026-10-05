// Record-player song list. Audio streams through YouTube's IFrame Player API
// (the songs are copyrighted, so nothing is bundled). The video shows in the
// expanded panel; the mini player hides it and offers its own play/pause.
// Note: YouTube's API policies ask for a visible player of at least 200x200
// while playing, so hiding it is a deliberate trade-off by the site owner.

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
  const collapseBtn = document.getElementById('music-collapse');
  const playPauseBtn = document.getElementById('music-playpause');
  const summaryBtn = document.getElementById('music-summary');
  const nowTitle = panel.querySelector('.now-title');
  const nowArtist = panel.querySelector('.now-artist');

  let player = null;
  let playerReady = null;
  let current = -1;
  let playing = false;

  const setPlaying = (on) => {
    if (on === playing) return;
    playing = on;
    panel.classList.toggle('is-playing', on);
    playPauseBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    playPauseBtn.title = on ? 'Pause' : 'Play';
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
    const song = SONGS[current];
    panel.classList.toggle('has-song', Boolean(song));
    nowTitle.textContent = song ? song.title : '';
    nowArtist.textContent = song ? song.artist : '';
  }

  // minimize to a mini player; the video stays visible as YouTube requires
  function setMini(mini) {
    panel.classList.toggle('mini', mini);
    collapseBtn.setAttribute('aria-expanded', String(!mini));
    summaryBtn.setAttribute('aria-expanded', String(!mini));
    collapseBtn.setAttribute('aria-label', mini ? 'Show song list' : 'Minimize player');
    collapseBtn.title = mini ? 'Show song list' : 'Minimize';
  }
  const toggleMini = () => setMini(!panel.classList.contains('mini'));
  playPauseBtn.addEventListener('click', () => {
    if (!player) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  });
  collapseBtn.addEventListener('click', toggleMini);
  summaryBtn.addEventListener('click', toggleMini);

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
    // clicking the record player always brings up the full song list
    setMini(false);
    if (!panel.hidden) return;
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
    get mini() {
      return panel.classList.contains('mini');
    },
    setMini,
  };
}
