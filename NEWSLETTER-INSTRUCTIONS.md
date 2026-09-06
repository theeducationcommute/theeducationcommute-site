# How to add a new episode's newsletter one-pagers

**Fast path (25 Aug 2026 addition):** `infographic-generator/add_episode.py` does steps 1–5 below in one call. Write a small per-episode content file (see the docstring at the top of that script for the exact shape), then run:

```bash
python3 add_episode.py content/ep20.json
```

That generates the QR, updates both JSON files, renders both PNGs, rewrites the site's newsletter arrays, bumps the cache-buster, and produces a deploy-ready zip. All that's left is step 6: upload the zip in the Cloudflare dashboard. Once an episode's real rss.com URL exists, `python3 add_episode.py content/ep20.json --qr-only` (with `rss_url` filled in) patches just the QR code without re-writing the rest.

The manual six-step process below still works and is worth knowing if the script ever needs debugging, but isn't the path to reach for day to day.

---

For whoever (or whichever assistant) is doing this next. Two one-pagers get made per episode — one for the staffroom, one for parents & carers — then both get wired into the website and redeployed.

Everything referenced here lives in `infographic-generator/` (the JSON content files, the two HTML templates, and `render.py`) and `site/` (the live website).

## 1. Add the episode's content

**Staffroom** — open `infographic-generator/data.json`, copy the last `{...}` entry, append a new one, and fill in:

- `id` — e.g. `"ep11"`
- `ep` — episode number
- `strand` — `Staff` / `Teachers` / `Leaders` / `Global Pioneers` / `Parents & Carers`
- `title`, `hook` — episode title and one-line hook
- `stat`, `statlabel` — the headline evidence figure and its source line
- `actions` — 4–5 short, practical prompts for staff
- `source` — where the evidence comes from
- `qr` — see step 2
- `overheard` — 2 lines of dialogue (A then B) illustrating the message — this fills the space at the bottom of the page

**Parents** — open `infographic-generator/parent-data.json`, same idea, new entry with:

- `id` — e.g. `"pep11"`, `ep`, `title`, `sub`
- `what` — plain-English paragraph explaining the research
- `child` — 3 bullets: what the child will notice at school
- `home` — 3 bullets: what a parent can do at home
- `scene` — pick one of the existing cartoon scenes in `parent-template.html`'s `SCENES` object (`learn`, `send`, `safe`, `routine`, `online`, `group`, `report`, `home`) that best matches the topic
- `scenario` — `set` (where/when), `bubbles` (a short back-and-forth: `who` is `parent`, `parent2`, `teacher`, or `child`), `caption` (one line: "Why it works")
- `qr` — see step 2

## 2. Generate the QR code

Each one-pager has a QR code linking to the episode's page on rss.com. Run this once you know the episode's rss.com URL:

```bash
pip install qrcode[pil] --break-system-packages   # first time only
python3 -c "
import qrcode, base64, io
url = 'https://rss.com/podcasts/the-education-commute/EPISODE_SLUG/'
img = qrcode.make(url)
buf = io.BytesIO(); img.save(buf, format='PNG')
print('data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode())
"
```

Paste the printed `data:image/png;base64,...` string into that episode's `qr` field in both `data.json` and `parent-data.json` (same QR code, same link, in both).

## 3. Render the PNGs

```bash
cd infographic-generator
pip install playwright --break-system-packages   # first time only
playwright install chromium                       # first time only (skip if Chromium is already present)
python3 render.py staff ep11
python3 render.py parents pep11
```

This writes `ep11.png` into `site/assets/newsletter/` and `pep11.png` into `site/assets/newsletter-parents/` automatically — sized and laid out correctly, text auto-fit to the page.

To re-render everything (e.g. after a template change), drop the episode ID: `python3 render.py all`.

Open both PNGs and sanity-check: text not cut off, QR code scans, no awkward gaps.

## 4. Wire it into the website

Open `site/index.html` and find the `NEWSLETTER` array (staffroom) and `NEWSLETTER_PARENTS` array (parents). Add one line to each, matching the existing pattern, e.g.:

```js
{ id:'ep11', ep:11, strand:'Teachers', title:'…', img:'assets/newsletter/ep11.png' },
```

```js
{ id:'pep11', ep:11, title:'…', img:'assets/newsletter-parents/pep11.png' },
```

**Then bump the cache-buster** — find `const NL_V = '7';` near the top of the newsletter code and increment it (e.g. `'8'`). This is what forces visitors' browsers to fetch the new images instead of showing a stale cached copy. Skipping this step is the single most common cause of "the website isn't showing my new newsletter."

## 5. Rebuild and redeploy

```bash
cd site
zip -r ../education-commute-site.zip . -x ".*"
```

Then in the Cloudflare dashboard: **Workers & Pages → theeducationcommute → Create deployment**, upload the zip, and wait for "Success! Your site was built and deployed to: https://theeducationcommute.pages.dev". The custom domain (theeducationcommute.co.uk) picks it up automatically — no separate step.

## 6. Check it live

Visit `https://theeducationcommute.co.uk`, open the Newsletter section, both tabs, and confirm the new episode's card appears with the right image, and that clicking it opens the correct one-pager in the lightbox.

## Notes

- The episode itself (audio, RSS listing) is separate and always manual — this whole process only covers the two newsletter one-pagers, not publishing the episode.
- Strand categorisation on the main episode grid is automatic (live RSS feed) and doesn't need any of this — it's only the newsletter images that need hand-building.
- If a template (`template.html` / `parent-template.html`) is edited, re-render every episode with `python3 render.py all`, not just the new one, so all the PNGs stay visually consistent — then bump `NL_V` again.
