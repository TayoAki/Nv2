#!/usr/bin/env python3
"""Inspiration boards from a spec. Usage: board.py spec.json --ads ADS_DIR --out DIR

spec.json: {"boards": [{"file": "campaign1", "title": "Campaign 1 · Retargeting",
                        "items": [["<ad id>", "<our concept this inspires>"], ...]}]}
Writes <file>.png per board and links.md with every reference and its Ad Library link.
"""
import argparse, json, os
from common import load_ads
from images import download, sheet

p = argparse.ArgumentParser()
p.add_argument('spec')
p.add_argument('--ads', required=True)
p.add_argument('--out', required=True)
a = p.parse_args()
os.makedirs(a.out, exist_ok=True)
by = {x['id']: x for x in load_ads(a.ads)}
md = ['# Inspiration boards\n']
for b in json.load(open(a.spec))['boards']:
    tiles, missing = [], []
    md.append(f"## {b['title']}\n")
    for ad_id, label in b['items']:
        x = by.get(str(ad_id))
        if not x:
            missing.append(ad_id)
            continue
        tiles.append((download(x, os.path.join(a.out, 'img')), x, label))
        md.append(f"- **{label}**: {x['page']}, {x['days']} days, {x['format']}. \"{(x['title'] or x['body'])[:80]}\" {x['url']}")
    path = sheet(tiles, os.path.join(a.out, b['file'] + '.png'), b['title'])
    print(f"{b['title']}: {path} ({len(tiles)} tiles)" + (f'; not found: {missing}' if missing else ''))
    md.append('')
md.append('> Days running is a proxy for performance, not proof. 100+ days is a strong reference; under ~30 days only shows the type of ad.')
open(os.path.join(a.out, 'links.md'), 'w').write('\n'.join(md))
print(os.path.join(a.out, 'links.md'))
