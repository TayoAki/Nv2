#!/usr/bin/env python3
"""Summarise fetched ads as Markdown. Usage: analyze.py ADS_DIR [--as-of 2026-10-07] [--top 40]"""
import argparse, collections, datetime, re, statistics as st
from common import load_ads

p = argparse.ArgumentParser()
p.add_argument('folder')
p.add_argument('--as-of')
p.add_argument('--top', type=int, default=40)
a = p.parse_args()
as_of = datetime.datetime.fromisoformat(a.as_of) if a.as_of else None
ads = [x for x in load_ads(a.folder, as_of) if not x['brand'].startswith('search_')]
search = [x for x in load_ads(a.folder, as_of) if x['brand'].startswith('search_')]

THEMES = [('price anchor ("from/starting at $")', r'(starting|starts) (at|under|from)|\bfrom \$|only \$'), ('% off', r'\d+% off'),
          ('$ off', r'\$\d+ off'), ('free shipping', r'free shipping'), ('free returns / exchanges', r'free (returns|exchanges)|returns'),
          ('custom / made to measure / tailored', r'custom|made.to.measure|tailor'), ('fit', r'\bfit\b'), ('wedding / groom', r'wedding|groom'),
          ('gift', r'\bgift'), ('urgency', r'limited|ends|last chance|today only|selling out'), ('reviews / social proof', r'review|rated|stars|customers|“|"'),
          ('quality / materials', r'italian|wool|cashmere|leather|handcrafted|craft'), ('showroom / fitting', r'showroom|fitting|book|visit|come on down')]


def themes(x):
    t = (x['title'] + ' ' + x['body']).lower()
    return {k for k, rx in THEMES if re.search(rx, t)}


def pct(n, d):
    return f'{100 * n / d:.0f}%' if d else '–'


print(f'# Competitor ads: {len(ads)} ads, as of {(as_of or datetime.datetime.now()).date()}\n')
print('## By brand\n\n| Brand | Ads | Video | Formats | Median days | Max days | Running >60 days |\n|---|---|---|---|---|---|---|')
by = collections.defaultdict(list)
for x in ads:
    by[x['brand']].append(x)
for b, l in sorted(by.items(), key=lambda kv: -len(kv[1])):
    days = [x['days'] for x in l if x['days'] is not None]
    fm = collections.Counter(x['format'] for x in l)
    print(f"| {b} | {len(l)} | {pct(sum(x['video'] for x in l), len(l))} | {', '.join(f'{k} {v}' for k, v in fm.most_common())} | "
          f"{st.median(days) if days else '–'} | {max(days) if days else '–'} | {pct(sum(d > 60 for d in days), len(days))} |")

fm = collections.Counter(x['format'] for x in ads)
print(f"\nFormats overall: {', '.join(f'{k} {pct(v, len(ads))}' for k, v in fm.most_common())}; video {pct(sum(x['video'] for x in ads), len(ads))}.")

old = [x for x in ads if (x['days'] or 0) > 60]
c_all, c_old = collections.Counter(), collections.Counter()
for x in ads:
    c_all.update(themes(x))
for x in old:
    c_old.update(themes(x))
print('\n## Message themes\n\n| Theme | All ads | Ads running >60 days |\n|---|---|---|')
for k, _ in THEMES:
    print(f'| {k} | {pct(c_all[k], len(ads))} | {pct(c_old[k], len(old))} |')

print('\n## CTAs\n')
print(', '.join(f'{k} {v}' for k, v in collections.Counter(x['cta'] for x in ads).most_common(8)))


def row(x):
    text = (x['title'] + ' — ' + x['body']).replace('\n', ' ').replace('|', '/')[:220]
    return f"| {x['brand']} | {x['days']} | {'video' if x['video'] else x['format']} | {text} | [{x['id']}]({x['url']}) |"


seen, top = set(), []
for x in sorted(ads, key=lambda x: -(x['days'] or 0)):
    k = (x['brand'], x['body'][:60])
    if k not in seen:
        seen.add(k)
        top.append(x)
print(f'\n## {a.top} longest-running ads (winner proxy)\n\n| Brand | Days | Format | Headline — text | Ad |\n|---|---|---|---|---|')
for x in top[:a.top]:
    print(row(x))
print('\n## Newest launches (under 21 days)\n\n| Brand | Days | Format | Headline — text | Ad |\n|---|---|---|---|---|')
for x in sorted([x for x in ads if (x['days'] or 99) < 21], key=lambda x: x['days'])[:30]:
    print(row(x))
if search:
    print('\n## Keyword-search results (noisy: filter by brand)\n\n| Page | Days | Format | Headline — text | Ad |\n|---|---|---|---|---|')
    for x in sorted(search, key=lambda x: -(x['days'] or 0))[:40]:
        print(row(x).replace(f"| {x['brand']} |", f"| {x['page']} |", 1))
print('\n> Running time is a proxy for performance, not proof: the Ad Library shows no spend or sales for commercial ads.')
