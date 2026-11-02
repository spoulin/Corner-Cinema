// YouTube videos play in YouTube's own embeddable player, in privacy mode
// (youtube-nocookie.com, as DuckDuckGo's Duck Player does): no YouTube page
// around it, no tracking cookies, and its official API drives it. Browsing
// YouTube (home, search, channels) stays the normal site.

/** watch?v=ID, youtu.be/ID, /shorts/ID, /embed/ID, /live/ID → ID, or null. */
function videoID(address) {
  let url;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "youtu.be" && host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  let id;
  if (host === "youtu.be") id = parts[0];
  else if (["shorts", "embed", "live"].includes(parts[0])) id = parts[1];
  else if (parts[0] === "watch") id = url.searchParams.get("v");
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

const watchURL = id => `https://www.youtube.com/watch?v=${id}`;

/** The page that replaces youtube.com for a video: the player over the whole window.
 * `language`: the player's interface language. */
function playerPage(id, language) {
  return `<!doctype html>
<html data-cc-youtube="${id}"><head><meta charset="utf-8"><title>YouTube</title>
<style>html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
#player { position: fixed; inset: 0; width: 100vw; height: 100vh; border: 0; }</style></head>
<body><div id="player"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
let player, ready = false, error = 0;
function onYouTubeIframeAPIReady() {
  player = new YT.Player("player", {
    host: "https://www.youtube-nocookie.com", videoId: "${id}",
    playerVars: { autoplay: 1, rel: 0, playsinline: 1, hl: "${language}" },
    events: {
      onReady: event => { ready = true; event.target.playVideo(); },
      onError: event => { error = event.data; },
      onStateChange: () => {
        const data = player.getVideoData && player.getVideoData();
        if (data && data.title) document.title = data.title;
      },
    },
  });
}
// Called by Corner Cinema (see preload/page.js).
window.__ccYouTube = {
  state: () => ({
    ready, error,
    t: ready ? player.getCurrentTime() || 0 : 0,
    d: ready ? player.getDuration() || 0 : 0,
    p: ready && player.getPlayerState() === 1,
    title: document.title,
  }),
  toggle: () => { if (ready) player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo(); },
  seek: seconds => { if (ready) player.seekTo(Math.max(0, seconds), true); },
  skip: seconds => { if (ready) player.seekTo(Math.max(0, player.getCurrentTime() + seconds), true); },
  pause: () => { if (ready) player.pauseVideo(); },
};
</script></body></html>`;
}

/** Loads the privacy player for a video in a page's web contents. */
function loadPlayer(contents, id, language) {
  const html = playerPage(id, language);
  return contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, {
    baseURLForDataURL: "https://www.youtube-nocookie.com/",
  });
}

module.exports = { videoID, watchURL, loadPlayer };
