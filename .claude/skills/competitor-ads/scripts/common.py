"""Shared helpers: ScrapeCreators requests and one normalised record per ad."""
import datetime, glob, json, os, sys, urllib.parse, urllib.request

API = 'https://api.scrapecreators.com'


def key():
    k = os.environ.get('SCRAPECREATORS_API_KEY')
    if not k:
        sys.exit('Set SCRAPECREATORS_API_KEY in the environment settings (never in a file or chat).')
    return k


def get(path, **params):
    params = {k: v for k, v in params.items() if v not in (None, '')}
    url = f'{API}{path}?{urllib.parse.urlencode(params)}'
    req = urllib.request.Request(url, headers={'x-api-key': key()})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def _text(sn, cards):
    body = sn.get('body')
    body = body.get('text') if isinstance(body, dict) else (body or '')
    if not body and cards:
        body = cards[0].get('body') or ''
    title = sn.get('title') or (cards[0].get('title') if cards else '') or ''
    link = sn.get('link_url') or (cards[0].get('link_url') if cards else '') or ''
    return body or '', title, link


def _image(sn, cards):
    for c in cards:
        u = c.get('resized_image_url') or c.get('original_image_url') or c.get('video_preview_image_url')
        if u:
            return u
    for i in sn.get('images') or []:
        u = i.get('resized_image_url') or i.get('original_image_url')
        if u:
            return u
    for v in sn.get('videos') or []:
        if v.get('video_preview_image_url'):
            return v['video_preview_image_url']
    return None


def load_ads(folder, as_of=None):
    """Every ad in the folder's raw JSON files, de-duplicated by ad id."""
    now = (as_of or datetime.datetime.now()).timestamp()
    ads = {}
    for f in sorted(glob.glob(os.path.join(folder, '*.json'))):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        if not isinstance(d, dict):
            continue
        brand = d.get('_brand') or os.path.basename(f).rsplit('_', 1)[0]
        for a in d.get('results') or d.get('searchResults') or []:
            if 'ad_archive_id' not in a:
                continue
            sn = a.get('snapshot') or {}
            cards = sn.get('cards') or []
            body, title, link = _text(sn, cards)
            start = a.get('start_date')
            end = a.get('end_date') or now
            video = bool(sn.get('videos')) or any(c.get('video_sd_url') or c.get('video_hd_url') for c in cards)
            ads[a['ad_archive_id']] = dict(
                id=a['ad_archive_id'], brand=brand, page=a.get('page_name') or sn.get('page_name') or brand,
                title=title.strip(), body=body.strip(), link=link, cta=sn.get('cta_text'),
                format='VIDEO' if video and sn.get('display_format') == 'VIDEO' else sn.get('display_format'),
                video=video, active=a.get('is_active'), start=(a.get('start_date_string') or '')[:10],
                days=round((min(end, now) - start) / 86400) if start else None,
                image=_image(sn, cards), url=f"https://www.facebook.com/ads/library/?id={a['ad_archive_id']}")
    return list(ads.values())
