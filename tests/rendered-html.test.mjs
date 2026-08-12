import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the integration cost model", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Integration Cost Studio<\/title>/i);
  assert.doesNotMatch(html, /See what integration changes/);
  assert.match(html, /Current annual cost/);
  assert.match(html, /Current vertical programmes/);
  assert.match(html, /Merged service cost/);
  assert.match(html, /Merge costs do not apply/);
  assert.match(html, /When the investment turns into savings/);
  assert.match(html, /Year-by-year payoff table/);
  assert.match(html, /Proposed operating model/);
  assert.match(html, /Merged attributes/);
  assert.match(html, /Saves annually/);
  assert.match(html, /Kept in vertical programmes/);
  assert.match(html, /No startup or merged-service cost/);
  assert.match(html, /http:\/\/localhost\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/);
});

test("ships without disposable starter assets", async () => {
  const [page, layout, packageJson, css, costModel] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/cost-model.ts", import.meta.url), "utf8"),
  ]);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.match(costModel, /"separate" \| "merged"/);
  assert.match(page, /programmeCosts/);
  assert.match(page, /startupCost/);
  assert.match(page, /mergedCost/);
  assert.match(page, /PayoffChart/);
  assert.match(page, /Costs more annually/);
  assert.match(layout, /generateMetadata/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /prefers-color-scheme:\s*dark/);
});
