---
name: competitor-ads
description: Research competitors' Meta (Facebook/Instagram) ads through the Meta Ad Library, find what is working, and build labelled inspiration boards that tie each of our ad concepts to the competitor ads behind it. Use when asked to analyse competitor advertising, find winning ads, plan ad concepts or creatives from competitor evidence, or make an inspiration / mood board of competitor ads.
---

# Competitor ad research and inspiration boards

This pulls live competitor ads from the Meta Ad Library (through the ScrapeCreators API), finds the ones that are probably working, looks at the actual images, and produces:
1. an analysis;
2. one inspiration board per campaign or concept, with Ad Library links.

## Before you start

- **API key:** read it from the `SCRAPECREATORS_API_KEY` environment variable.
  - If it isn't set, ask the person to add it in the environment settings. Never ask for it in chat.
  - Never write the key into a file. The repo is public.
- **Credits:** each request costs 1 ScrapeCreators credit. One brand with 60 ads costs about 3 credits. Say roughly how many you'll spend before a big run.
- **Working folder:** a scratch folder outside the repo, e.g. `$SCRATCH/ads`. Ad data and images are research material, not repo content.
- **Scripts:** in `scripts/` next to this file. They need Python 3 and Pillow (`pip install pillow` if missing).

## Workflow

### 1. Choose competitors

Pick 8–15 brands that sell the same thing at a similar price, including both direct-to-consumer brands and established ones. For Nyoni these were:
- Indochino, Suitsupply, SuitShop, Hockerty, Proper Cloth, Spier & Mackay, Black Lapel, Beckett Simonon, Buck Mason, Jos. A. Bank, Brooks Brothers and Bonobos;
- Parijan, which sells its own clothes with AI models.

Also look up **our own page**: whether we've ever advertised changes the plan.

### 2. Find their ad-library page IDs

```bash
python3 scripts/find_pages.py "indochino" "suitsupply" "beckett simonon" > pages.tsv
```

This prints the top matches per name: name, page ID, Instagram handle, followers. **Check the matches by hand**, since search returns lookalikes ("The Black Lapels", fan pages). Keep one line per brand in `pages.tsv`, as `slug<TAB>page_id`.

### 3. Fetch their active ads

```bash
python3 scripts/fetch_ads.py pages.tsv --out $SCRATCH/ads --country US --max-pages 2
```

This saves raw JSON per brand page and prints how many ads were fetched against the total active.

**Last year's seasonal ads:** keyword search is noisy (it matches novels, apps and so on), so filter by brand afterwards:

```bash
python3 scripts/fetch_ads.py --search "black friday menswear" --start 2025-11-01 --end 2025-12-31 --out $SCRATCH/ads
```

### 4. Analyse

```bash
python3 scripts/analyze.py $SCRATCH/ads > $SCRATCH/ads/analysis.md
```

It reports:
- **per brand:** ad count, video share, formats (DCO = dynamic creative, DPA = catalog), median and maximum age, and the share of ads running more than 60 days;
- **message themes:** price anchors, % off, free shipping, custom/fit, wedding, urgency, reviews;
- **the 40 longest-running ads, which are the winner proxy:** a brand rarely keeps paying for an ad that loses money;
- **the newest launches:** what competitors are doing this season;
- **CTA and landing-page mix.**

### 5. Look at the images (don't skip)

Text data alone misses the creative.

```bash
python3 scripts/contact_sheet.py $SCRATCH/ads --longest 30 --catalog 15 --out $SCRATCH/ads/sheets
```

Then **open the sheets with the Read tool and look at them**. Note:
- the headline style (serif or sans; one line or many);
- where text sits;
- people or product;
- real setting or studio;
- the offer treatment;
- what catalog ads look like.

Zoom into the best 6 with `--ids <id> <id> …` to read their text.

### 6. Build the inspiration boards

Write a board spec mapping each of our concepts to the reference ads (IDs come from the analysis and the sheets):

```json
{
  "boards": [
    {"file": "campaign1-retargeting", "title": "Campaign 1 · Retargeting",
     "items": [["2672051369847365", "R1b \"Not sure of your size?\""],
               ["1762153695170595", "R1b variant B: tape measure"]]}
  ]
}
```

```bash
python3 scripts/board.py spec.json --ads $SCRATCH/ads --out $SCRATCH/boards
```

This writes one PNG per board, with each tile labelled by concept, brand, days running, format and ID. It also writes `links.md`, listing every reference with its Ad Library link (`https://www.facebook.com/ads/library/?id=<id>`).

**Then look at every board before sending it.** Replace any tile that shows something we shouldn't copy, such as misleading "we're closing" ads, fake urgency, or another brand's logo as the hero.

### 7. Report

Send the boards with `SendUserFile` and give the links grouped by campaign. Always state:
- **Running time is a proxy, not proof.** The Ad Library shows no spend or sales for commercial ads. Ads running 100+ days are strong references; under about 30 days, they only show the type of ad.
- **The as-of date** of the data.
- **Any concept without a competitor example.** Say so, rather than force a weak match.

## Turning research into creative briefs

For each concept, write the brief from what the references share:
- The **one-line headline**, which usually answers an objection.
- The **small supporting line**: price, address or benefit.
- **Typeface and placement:** paid long-runners mostly use a white editorial serif, centred.
- **Setting and light.**
- **Products, with links.**
- **Sizes:** 4:5 for Feed, and 9:16 for Reels with text kept out of the top 14% and bottom 35%.

When writing image-generation prompts:
- Describe the **real** product exactly (check the product photos; the AI will guess details such as single- vs double-breasted).
- Keep characters consistent with reference images.
- Ask for no logos, and add the real logo afterwards.

## Optional: our own account

If the Meta Ads connector is available, read our ad account and pixel first:
- lifetime spend;
- datasets and event counts: purchases, add-to-carts, fitting bookings;
- existing audiences.

This changes the budget and which campaigns make sense. **Read-only by default.** Creating campaigns, ad sets or audiences needs the person's explicit go-ahead. Create them as drafts or paused, and never with a budget unless asked.

## Examples

- `examples/nyoni-pages.tsv`: the Nyoni competitor set, with page IDs checked by hand.
- `examples/nyoni-q4-2026-boards.json`: the four Q4 2026 campaign boards, mapping each Nyoni concept to its reference ads. Re-run `board.py` on it after a fresh fetch. Ads that have stopped running drop out of an active-only fetch, so fetch with `--status ALL` to rebuild old boards.
