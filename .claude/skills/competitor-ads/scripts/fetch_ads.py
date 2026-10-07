#!/usr/bin/env python3
"""Fetch ads from the Meta Ad Library via ScrapeCreators.

  fetch_ads.py pages.tsv --out DIR [--country US] [--status ACTIVE] [--max-pages 2]
  fetch_ads.py --search "black friday menswear" --start 2025-11-01 --end 2025-12-31 --out DIR

pages.tsv: one `slug<TAB>page_id` per line (# comments allowed). Each page of 30 ads costs 1 credit.
"""
import argparse, json, os, re
from common import get

p = argparse.ArgumentParser()
p.add_argument('pages', nargs='?')
p.add_argument('--out', required=True)
p.add_argument('--country', default='US')
p.add_argument('--status', default='ACTIVE', help='ACTIVE, INACTIVE or ALL')
p.add_argument('--max-pages', type=int, default=2)
p.add_argument('--search')
p.add_argument('--start')
p.add_argument('--end')
a = p.parse_args()
os.makedirs(a.out, exist_ok=True)

if a.search:
    d = get('/v1/facebook/adLibrary/search/ads', query=a.search, status='ALL', country=a.country,
            start_date=a.start, end_date=a.end)
    slug = 'search_' + re.sub(r'\W+', '_', a.search.lower()).strip('_')
    d['_brand'] = slug
    json.dump(d, open(os.path.join(a.out, f'{slug}_1.json'), 'w'))
    print(f"{slug}: {len(d.get('searchResults') or [])} ads, credits left {d.get('credits_remaining')}")
else:
    for line in open(a.pages):
        line = line.split('#')[0].strip()
        if not line:
            continue
        slug, page_id = line.split('\t')[:2] if '\t' in line else line.split()[:2]
        cursor, n, total = None, 0, None
        for i in range(1, a.max_pages + 1):
            d = get('/v1/facebook/adLibrary/company/ads', pageId=page_id, status=a.status, country=a.country, cursor=cursor)
            d['_brand'] = slug
            json.dump(d, open(os.path.join(a.out, f'{slug}_{i}.json'), 'w'))
            n += len(d.get('results') or [])
            total = d.get('searchResultsCount', total)
            cursor = d.get('cursor')
            if not cursor or not d.get('results'):
                break
        print(f'{slug:20} fetched {n:4}  total {a.status.lower()} {total}  credits left {d.get("credits_remaining")}')
