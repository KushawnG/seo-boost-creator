// Tells Bing (and the engines that share its IndexNow feed) which URLs exist,
// straight after each production build.
//
// Why bother with Bing: ChatGPT's web search is built on Bing's index, and
// ChatGPT referrals were this site's second-largest source of signups for a
// stretch — 21 people, for free — before drying up. Being in Bing's index
// promptly is the cheapest thing we can do about that. Google ignores
// IndexNow; it still needs the sitemap submitted in Search Console.
//
// The key is not a secret. IndexNow only checks that the same string is served
// at https://chordfinderai.com/<key>.txt, which proves whoever submitted the
// URLs controls the site. Resubmitting the whole sitemap on every deploy is
// within the protocol's tolerance at this size (a few dozen URLs).
//
// Runs as part of "postbuild". Must never fail the build: a search-engine
// hiccup is not a reason to stop a deploy.
import { readFileSync } from "node:fs";

const KEY = "1ab9c4e465ff42aa116c641d96d7ff78";
const HOST = "chordfinderai.com";

async function main() {
  // Netlify sets NETLIFY=true on every build and CONTEXT to "production" only
  // for deploys of the main branch. Local builds and deploy previews would be
  // announcing URLs that don't exist yet at those addresses.
  if (!process.env.NETLIFY) {
    console.log("indexnow: not a Netlify build, skipping");
    return;
  }
  if (process.env.CONTEXT !== "production") {
    console.log(`indexnow: ${process.env.CONTEXT} deploy, skipping`);
    return;
  }

  const xml = readFileSync("public/sitemap.xml", "utf8");
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urlList.length === 0) {
    console.log("indexnow: sitemap is empty, skipping");
    return;
  }

  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList,
    }),
  });
  // 200 and 202 both mean accepted.
  console.log(`indexnow: submitted ${urlList.length} URLs → HTTP ${res.status}`);
}

main().catch((e) => console.warn("indexnow: failed, continuing:", e.message));
