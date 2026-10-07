#!/usr/bin/env python3
"""Contact sheets of the creatives to look at, not just read about.

  contact_sheet.py ADS_DIR --out DIR [--longest 30] [--catalog 15] [--ids ID ID ...]

Writes longest.png (longest-running, one per brand+headline), catalog.png (DPA/catalog ads, max 3 per
brand) and, with --ids, picked.png. Open them with the Read tool.
"""
import argparse, collections, os
from common import load_ads
from images import download, sheet

p = argparse.ArgumentParser()
p.add_argument('folder')
p.add_argument('--out', required=True)
p.add_argument('--longest', type=int, default=30)
p.add_argument('--catalog', type=int, default=15)
p.add_argument('--ids', nargs='*')
a = p.parse_args()
ads = [x for x in load_ads(a.folder) if x['image']]
cache = os.path.join(a.out, 'img')

seen, longest = set(), []
for x in sorted(ads, key=lambda x: -(x['days'] or 0)):
    k = (x['brand'], x['title'] or x['body'][:40])
    if k not in seen:
        seen.add(k)
        longest.append(x)
print(sheet([(download(x, cache), x, 'long-running') for x in longest[:a.longest]], os.path.join(a.out, 'longest.png'),
            'Longest-running ads', cols=6, width=260))

per = collections.Counter()
catalog = []
for x in sorted([x for x in ads if x['format'] == 'DPA'], key=lambda x: -(x['days'] or 0)):
    if per[x['brand']] < 3:
        per[x['brand']] += 1
        catalog.append(x)
print(sheet([(download(x, cache), x, 'catalog ad') for x in catalog[:a.catalog]], os.path.join(a.out, 'catalog.png'),
            'Catalog (DPA) ads', cols=6, width=260))

if a.ids:
    by = {x['id']: x for x in ads}
    picked = [by[i] for i in a.ids if i in by]
    print(sheet([(download(x, cache), x, '') for x in picked], os.path.join(a.out, 'picked.png'), None, cols=6, width=360))
