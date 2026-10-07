#!/usr/bin/env python3
"""Animate still frames into talking clips with an OpenRouter video model, then cut them into one
TikTok in the "remember…" colour-guide style.

  OPENROUTER_API_KEY=… python3 docs/content/video/make_video.py docs/content/video/two-generations --only 1
  OPENROUTER_API_KEY=… python3 docs/content/video/make_video.py docs/content/video/two-generations

The project folder holds shots.json and the frames. Each shot becomes one clip: the frame is the first
frame, and the prompt makes the speaker say that shot's line with lip sync. Finished clips are cached in
<project>/out, so re-running only pays for shots that aren't done. --only N renders a single shot to
check the look before paying for the rest. --assemble-only cuts whatever clips exist.

Frames are passed as public URLs (raw.githubusercontent.com on this repo's current branch), so commit
and push the frames first, or pass --inline to send them as data URLs.
"""
import argparse, base64, json, os, re, subprocess, sys, time, urllib.request, urllib.error

API = 'https://openrouter.ai/api/v1'
WH, DK = (255, 255, 255), (28, 28, 28)
COLOURS = {  # word: (fill, outline)
    'charcoal': ((70, 74, 80), WH), 'white': (WH, DK), 'waistcoat': ((214, 178, 104), DK), 'cream': ((241, 230, 207), DK),
    'denim': ((44, 64, 110), WH), 'rust': ((190, 100, 45), WH), 'ivory': ((246, 238, 220), DK), 'black': ((15, 15, 15), WH),
    'navy': ((28, 45, 92), WH), 'grey': ((128, 128, 128), WH), 'burgundy': ((110, 25, 40), WH), 'brown': ((92, 58, 35), WH),
    'teal': ((20, 100, 100), WH), 'camel': ((193, 154, 107), DK), '+': (WH, DK),
}


def ffmpeg():
    try:
        import imageio_ffmpeg
    except ImportError:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'imageio-ffmpeg'], check=True)
        import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(*args):
    subprocess.run([FF, '-y', '-loglevel', 'error', *args], check=True)


def request(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {url} → {e.code}: {e.read().decode()[:600]}')


def frame_url(project, rel, inline):
    path = os.path.join(project, rel)
    if inline:
        return 'data:image/jpeg;base64,' + base64.b64encode(open(path, 'rb').read()).decode()
    remote = subprocess.run(['git', 'remote', 'get-url', 'origin'], capture_output=True, text=True).stdout
    owner_repo = re.search(r'github\.com[:/]([^/]+/[^/.]+)', remote) or re.search(r'git/([^/]+/[^/.]+)', remote)
    branch = subprocess.run(['git', 'branch', '--show-current'], capture_output=True, text=True).stdout.strip()
    repo_path = os.path.relpath(path, subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True).stdout.strip())
    url = f'https://raw.githubusercontent.com/{owner_repo.group(1)}/{branch}/{repo_path}'
    with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=30) as r:
        if r.status != 200:
            sys.exit(f'{url} is not reachable; push the frames or use --inline')
    return url


def prompt_for(cfg, shot):
    return (
        f'Static locked-off camera, vertical 9:16, photorealistic. The two men stand in place exactly as in the first frame. '
        f'{cfg["speaker"].capitalize()} looks into the camera and says, in {cfg["voice"]}: "{shot["line"]}" '
        f'His lips move in perfect sync with the words, with one small natural hand gesture. '
        f'{cfg["listener"].capitalize()} stays silent, shifts his weight slightly and gives a subtle nod. '
        f'Keep both faces, bodies, every garment, fabric pattern, lapel and button, and the background exactly as in the first frame. '
        f'Only his voice: no music, no other voices, no added text or captions.'
    )


def render(project, cfg, n, shot, inline):
    out = os.path.join(project, 'out', f'shot{n}.mp4')
    if os.path.exists(out):
        print(f'shot {n}: cached')
        return
    body = {
        'model': cfg['model'], 'prompt': prompt_for(cfg, shot), 'duration': shot.get('duration', cfg['duration']),
        'aspect_ratio': cfg['aspect_ratio'], 'generate_audio': True,
        'frame_images': [{'type': 'image_url', 'image_url': {'url': frame_url(project, shot['frame'], inline)}, 'frame_type': 'first_frame'}],
    }
    if cfg.get('resolution'):
        body['resolution'] = cfg['resolution']
    job = json.loads(request('POST', f'{API}/videos', body))
    print(f'shot {n}: job {job["id"]} {job["status"]}')
    while True:
        time.sleep(15)
        status = json.loads(request('GET', job['polling_url']))
        if status['status'] == 'completed':
            open(out, 'wb').write(request('GET', status['unsigned_urls'][0]))
            print(f'shot {n}: saved {out}')
            return
        if status['status'] in ('failed', 'cancelled', 'expired'):
            sys.exit(f'shot {n}: {status["status"]}: {status.get("error")}')


def speech_end(path):
    """Seconds where the last speech ends (start of the trailing silence)."""
    log = subprocess.run([FF, '-i', path, '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-'], capture_output=True, text=True).stderr
    h, m, sec = re.search(r'Duration: (\d+):(\d+):([\d.]+)', log).groups()
    total = int(h) * 3600 + int(m) * 60 + float(sec)
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
    trailing = starts[-1] if starts and len(starts) > len(ends) else None
    return (trailing if trailing and trailing > 1.0 else total), total


def overlay(path, words, adjective, opener):
    from PIL import Image, ImageDraw, ImageFont
    font_path = os.path.join(os.path.dirname(OUT), 'Montserrat.ttf')
    if not os.path.exists(font_path):
        try:
            urllib.request.urlretrieve('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/Montserrat%5Bwght%5D.ttf', font_path)
        except Exception:
            font_path = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'

    def font(size):
        f = ImageFont.truetype(font_path, size)
        try:
            f.set_variation_by_axes([800])
        except Exception:
            pass
        return f

    im = Image.new('RGBA', (1080, 1920), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if opener:
        f = font(62)
        d.text(((1080 - d.textlength(opener, font=f)) / 2, 200), opener, font=f, fill=WH, stroke_width=5, stroke_fill=DK)
    elif words:
        parts = []
        for i, w in enumerate(words):
            parts += (['+'] if i else []) + [w]
        size = 70
        while True:
            f = font(size)
            gap = d.textlength(' ', font=f)
            width = sum(d.textlength(p, font=f) for p in parts) + gap * (len(parts) - 1)
            if width < 1000 or size < 40:
                break
            size -= 4
        x = (1080 - width) / 2
        for p in parts:
            fill, outline = COLOURS.get(p, (WH, DK))
            d.text((x, 190), p, font=f, fill=fill, stroke_width=5, stroke_fill=outline)
            x += d.textlength(p, font=f) + gap
        if adjective:
            f = font(50)
            d.text(((1080 - d.textlength(adjective, font=f)) / 2, 282), adjective, font=f, fill=WH, stroke_width=4, stroke_fill=DK)
    im.save(path)


def assemble(project, cfg):
    parts = []
    for n, shot in enumerate(cfg['shots'], 1):
        clip = os.path.join(project, 'out', f'shot{n}.mp4')
        if not os.path.exists(clip):
            print(f'shot {n}: not rendered, skipped')
            continue
        end, total = speech_end(clip)
        length = min(total, end + 0.25 + shot.get('hold', 0))
        adj_at = max(0.5, end - 0.6)
        cards = [os.path.join(OUT, f'card{n}{k}.png') for k in 'oaw']
        overlay(cards[0], None, None, 'remember…' if shot.get('opener') else None)
        overlay(cards[1], shot['words'], None, None)
        overlay(cards[2], shot['words'], shot['adjective'], None)
        opener_until = 1.0 if shot.get('opener') else 0
        seg = os.path.join(OUT, f'seg{n}.mp4')
        has_audio = 'Audio:' in subprocess.run([FF, '-i', clip], capture_output=True, text=True).stderr
        audio = ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'] if not has_audio else []
        a_in = '4:a' if not has_audio else '0:a'
        run('-i', clip, '-loop', '1', '-i', cards[0], '-loop', '1', '-i', cards[1], '-loop', '1', '-i', cards[2], *audio, '-filter_complex',
            f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1[b];"
            f"[b][1]overlay=enable='lt(t,{opener_until})'[b1];[b1][2]overlay=enable='between(t,{opener_until},{adj_at:.2f})'[b2];"
            f"[b2][3]overlay=enable='gte(t,{adj_at:.2f})',format=yuv420p[v];[{a_in}]aresample=44100,aformat=channel_layouts=stereo[a]",
            '-map', '[v]', '-map', '[a]', '-t', f'{length:.2f}', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', seg)
        parts.append(seg)
        print(f'shot {n}: speech ends {end:.2f}s, cut at {length:.2f}s')
    if not parts:
        sys.exit('no clips to assemble')
    inputs = sum((['-i', p] for p in parts), [])
    joined = ''.join(f'[{i}:v][{i}:a]' for i in range(len(parts)))
    final = os.path.join(project, 'out', 'final.mp4')
    run(*inputs, '-filter_complex', f'{joined}concat=n={len(parts)}:v=1:a=1[v][a];[a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100[an]',
        '-map', '[v]', '-map', '[an]', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final)
    print(f'final: {final}')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('project')
    p.add_argument('--only', type=int, help='render just this shot number (1-based)')
    p.add_argument('--inline', action='store_true', help='send frames as data URLs instead of public URLs')
    p.add_argument('--assemble-only', action='store_true')
    a = p.parse_args()
    FF = ffmpeg()
    cfg = json.load(open(os.path.join(a.project, 'shots.json')))
    os.makedirs(os.path.join(a.project, 'out'), exist_ok=True)
    OUT = os.path.join(a.project, 'out', 'work')
    os.makedirs(OUT, exist_ok=True)
    if not a.assemble_only:
        KEY = os.environ.get('OPENROUTER_API_KEY') or sys.exit('Set OPENROUTER_API_KEY in the environment settings.')
        for n, shot in enumerate(cfg['shots'], 1):
            if a.only in (None, n):
                render(a.project, cfg, n, shot, a.inline)
    assemble(a.project, cfg)
