"""Download ad images and lay them out as labelled sheets."""
import os, textwrap, urllib.request
from PIL import Image, ImageDraw, ImageFont

FONTS = ['/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
FONTS_R = ['/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']


def font(size, bold=True):
    for f in (FONTS if bold else FONTS_R):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def download(ad, folder):
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{ad['id']}.jpg")
    if not os.path.exists(path) and ad.get('image'):
        try:
            req = urllib.request.Request(ad['image'], headers={'User-Agent': 'Mozilla/5.0'})
            open(path, 'wb').write(urllib.request.urlopen(req, timeout=30).read())
        except Exception as e:
            print(f"image failed for {ad['id']}: {e}")
            return None
    return path if os.path.exists(path) else None


def sheet(tiles, out, title=None, cols=4, width=300):
    """tiles: list of (image_path, ad, label). Saves a PNG with one captioned tile per ad."""
    tiles = [t for t in tiles if t[0]]
    if not tiles:
        return None
    cols = min(cols, len(tiles))
    th, cap, gap, top = int(width * 1.25), 86, 16, (70 if title else 16)
    rows = (len(tiles) + cols - 1) // cols
    c = Image.new('RGB', (cols * (width + gap) + gap, top + rows * (th + cap + gap)), 'white')
    d = ImageDraw.Draw(c)
    if title:
        d.text((gap, 20), title, font=font(30), fill='black')
    for i, (path, ad, label) in enumerate(tiles):
        x, y = gap + (i % cols) * (width + gap), top + (i // cols) * (th + cap + gap)
        try:
            im = Image.open(path).convert('RGB')
        except Exception:
            continue
        im.thumbnail((width, th))
        d.rectangle([x, y, x + width, y + th], fill=(245, 245, 245))
        c.paste(im, (x + (width - im.width) // 2, y + (th - im.height) // 2))
        d.text((x, y + th + 6), textwrap.shorten(label or '', 40), font=font(15), fill=(160, 110, 20))
        d.text((x, y + th + 26), f"{ad['page']} · {ad['days']} days · {ad['format']}", font=font(14), fill='black')
        d.text((x, y + th + 46), textwrap.shorten(ad['title'] or ad['body'] or '', 44), font=font(13, False), fill=(90, 90, 90))
        d.text((x, y + th + 64), f"ID {ad['id']}", font=font(12, False), fill=(120, 120, 120))
    c.save(out)
    return out
