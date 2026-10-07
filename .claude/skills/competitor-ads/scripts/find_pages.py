#!/usr/bin/env python3
"""Look up Meta Ad Library page IDs. Usage: find_pages.py "brand one" "brand two" ...
Prints the top 3 matches per name; check them by hand and keep one `slug<TAB>page_id` line per brand."""
import sys
from common import get

for q in sys.argv[1:]:
    res = get('/v1/facebook/adLibrary/search/companies', query=q).get('searchResults') or []
    print(f'# {q}')
    for r in res[:3]:
        print(f"{q.lower().replace(' ', '_').replace('&', 'and')}\t{r['page_id']}\t# {r['name']} · ig={r.get('ig_username')} "
              f"ig_followers={r.get('ig_followers')} fb_likes={r.get('likes')}")
