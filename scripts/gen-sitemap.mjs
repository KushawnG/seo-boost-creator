// Generates public/sitemap.xml from the published chord-library songs.
// Runs automatically before every build (npm "prebuild" lifecycle). Resilient:
// if the DB is unreachable it still writes a base sitemap so the build succeeds.
import { writeFileSync } from "node:fs";

const SUPABASE_URL = "https://wthnnwnggvvktrnglxqj.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0aG5ud25nZ3Z2a3RybmdseHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzOTAwMDgsImV4cCI6MjA5ODk2NjAwOH0.fHnAGezWky4Xhp0g7saixpzzciIfPI_unHsSWvEnAMo";
const SITE = "https://chordfinderai.com";

const staticPaths = ["/", "/songs"];

async function main() {
  let slugs = [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/public_songs?select=slug&published=eq.true`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
    );
    if (res.ok) slugs = (await res.json()).map((s) => s.slug);
  } catch (e) {
    console.warn("gen-sitemap: could not fetch songs, writing base sitemap:", e.message);
  }

  const paths = [...staticPaths, ...slugs.map((s) => `/songs/${s}`)];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n") +
    `\n</urlset>\n`;

  writeFileSync("public/sitemap.xml", xml);
  console.log(`gen-sitemap: wrote ${paths.length} URLs (${slugs.length} songs)`);
}

main();
