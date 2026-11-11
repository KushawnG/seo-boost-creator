// Writes a real HTML file per chord-library song, so the pages work for
// readers that never run JavaScript.
//
// The app is a single-page app: Netlify serves the same index.html for every
// route and React fills in the title and meta tags afterwards. Google's
// renderer copes, but nothing else does — and index.html hardcodes
// <link rel="canonical" href="https://chordfinderai.com/">, so before the JS
// ran, all ~100 song pages were declaring the homepage as their canonical
// version, which is an instruction to treat them as duplicates and not index
// them. Social scrapers (Facebook, WhatsApp, iMessage, Slack, Discord, X)
// never run JS at all, so every shared song link previewed as the generic
// homepage.
//
// Runs after vite build (npm "postbuild"). Each file is the built index.html
// with the head rewritten, so the SPA still boots and behaves exactly as
// before — only what a non-JS reader sees changes. Resilient by design: if the
// database is unreachable the build still succeeds with the SPA as it was.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = "https://wthnnwnggvvktrnglxqj.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0aG5ud25nZ3Z2a3RybmdseHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzOTAwMDgsImV4cCI6MjA5ODk2NjAwOH0.fHnAGezWky4Xhp0g7saixpzzciIfPI_unHsSWvEnAMo";
const SITE = "https://chordfinderai.com";
const DIST = "dist";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Mirrors the copy SongDetail renders, so the two don't drift apart visibly. */
function describe(song) {
  const bits = [`${song.title} by ${song.artist}`];
  if (song.song_key) bits.push(`is in the key of ${song.song_key}`);
  if (song.bpm) bits.push(`${song.song_key ? "at" : "is"} ${song.bpm} BPM`);
  let text = bits.join(" ") + ".";
  const prog = Array.isArray(song.main_progression) ? song.main_progression : [];
  if (prog.length) text += ` Main chord progression: ${prog.join(" – ")}.`;
  return (
    text +
    " Play along with the chords synced to the music, with guitar & piano diagrams."
  );
}

/**
 * What a reader that never runs JavaScript sees in the body. Until now that
 * was an empty <div id="root">: fine for Google, which renders the page, but
 * the crawlers behind ChatGPT, Claude and Perplexity mostly don't, and they
 * were the only search channel that ever sent anyone here. React replaces
 * this on mount (createRoot clears the container), so nothing is shown twice.
 * The classes are ones SongDetail already uses, so the built stylesheet
 * covers them and the half-second before React mounts looks like the page.
 */
function body(song) {
  const prog = Array.isArray(song.main_progression) ? song.main_progression : [];
  const chords = Array.isArray(song.main_chords) ? song.main_chords : [];
  const facts = [
    song.song_key ? `Key: ${song.song_key}` : null,
    song.bpm ? `${song.bpm} BPM` : null,
    song.time_signature || null,
  ].filter(Boolean);

  const badge = (t) =>
    `<span class="rounded-lg border bg-muted/40 px-4 py-2 text-sm font-semibold">${esc(t)}</span>`;

  return `
<main class="max-w-7xl mx-auto px-4 py-10">
  <p class="text-sm text-muted-foreground"><a href="/songs" class="underline">Chord library</a></p>
  <h1 class="text-3xl font-bold leading-tight">${esc(song.title)} Chords, Key &amp; BPM</h1>
  ${song.artist ? `<p class="mt-1 text-lg text-muted-foreground">${esc(song.artist)}</p>` : ""}
  ${facts.length ? `<div class="mt-5 flex flex-wrap gap-2">${facts.map(badge).join("")}</div>` : ""}
  ${
    prog.length
      ? `<section class="mt-6 rounded-lg border p-6">
    <h2 class="text-sm uppercase tracking-wide text-muted-foreground">Main chord progression</h2>
    <p class="mt-3 text-xl font-bold">${prog.map(esc).join(" → ")}</p>
    <p class="mt-4 text-sm text-muted-foreground">This ${prog.length}-chord loop repeats through most of “${esc(song.title)}”${song.song_key ? ` in ${esc(song.song_key)}` : ""} — learn it and you can play along with the bulk of the song.</p>
  </section>`
      : ""
  }
  ${
    chords.length
      ? `<section class="mt-4 rounded-lg border p-6">
    <h2 class="text-sm uppercase tracking-wide text-muted-foreground">All main chords</h2>
    <p class="mt-3 text-xl font-bold">${chords.map(esc).join(" · ")}</p>
  </section>`
      : ""
  }
  <section class="mt-6 rounded-lg border p-6">
    <h2 class="text-xl font-bold">Play along with the chords synced to the music</h2>
    <p class="mt-2 text-muted-foreground">Open “${esc(song.title)}” in Chord Finder AI to watch the chords change in time with the song, with guitar and piano diagrams for every chord. Your first song is free.</p>
    <p class="mt-4"><a href="/auth?signup=true" class="underline font-semibold">Start free — analyze this song →</a></p>
  </section>
</main>`;
}

function render(shell, song) {
  const url = `${SITE}/songs/${song.slug}`;
  const title = `${song.title} by ${song.artist} — Chords, Key & BPM | Chord Finder AI`;
  const description = describe(song);

  return (
    shell
      .replace('<div id="root"></div>', `<div id="root">${body(song)}</div>`)
      // Replace rather than append: a second <title> or canonical would leave
      // the generic one still present and ambiguous.
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
      .replace(
        /<meta name="description" content="[\s\S]*?"\s*\/?>/,
        `<meta name="description" content="${esc(description)}" />`,
      )
      .replace(
        /<link rel="canonical" href="[\s\S]*?"\s*\/?>/,
        `<link rel="canonical" href="${esc(url)}" />`,
      )
      .replace(
        /<meta property="og:title" content="[\s\S]*?"\s*\/?>/,
        `<meta property="og:title" content="${esc(title)}" />`,
      )
      .replace(
        /<meta property="og:description" content="[\s\S]*?"\s*\/?>/,
        `<meta property="og:description" content="${esc(description)}" />`,
      )
      .replace(
        /<meta property="og:url" content="[\s\S]*?"\s*\/?>/,
        `<meta property="og:url" content="${esc(url)}" />`,
      )
      .replace(
        /<meta name="twitter:title" content="[\s\S]*?"\s*\/?>/,
        `<meta name="twitter:title" content="${esc(title)}" />`,
      )
      .replace(
        /<meta name="twitter:description" content="[\s\S]*?"\s*\/?>/,
        `<meta name="twitter:description" content="${esc(description)}" />`,
      )
  );
}

async function main() {
  const shellPath = join(DIST, "index.html");
  if (!existsSync(shellPath)) {
    console.warn("prerender-songs: no dist/index.html — skipping");
    return;
  }
  const shell = readFileSync(shellPath, "utf8");

  let songs = [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/public_songs?select=slug,title,artist,song_key,bpm,time_signature,main_chords,main_progression&published=eq.true`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
    );
    if (res.ok) songs = await res.json();
    else console.warn("prerender-songs: fetch failed", res.status);
  } catch (e) {
    console.warn("prerender-songs: could not fetch songs:", e.message);
  }

  // Write songs/<slug>.html, NOT songs/<slug>/index.html. Netlify serves the
  // former directly at /songs/<slug>; the latter makes it 301 to a trailing
  // slash, which would put a redirect in front of every page in the sitemap
  // and disagree with the canonical URL we just set.
  mkdirSync(join(DIST, "songs"), { recursive: true });
  let written = 0;
  for (const song of songs) {
    if (!song.slug) continue;
    writeFileSync(join(DIST, "songs", `${song.slug}.html`), render(shell, song));
    written++;
  }

  console.log(`prerender-songs: wrote ${written} song pages`);
}

main();
