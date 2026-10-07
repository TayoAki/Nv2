# Talking TikToks from still frames

`make_video.py` turns a folder of still frames into a TikTok in the "remember…" colour-guide format:

1. Each frame is animated with an OpenRouter video model (default `kwaivgi/kling-v3.0-pro`, 9:16, 5 s, audio on). The prompt makes the speaker say that shot's line with lip sync while the other man reacts.
2. Each clip is cut where the speech ends, so the cuts land on "but".
3. The colour-coded words go above their heads, and each adjective appears as it is spoken. The first shot opens on "remember…".
4. The clips are joined and the loudness is normalised for TikTok. The result is `<project>/out/final.mp4`.

## Run it

`OPENROUTER_API_KEY` must be set in the environment settings. Never commit it or paste it into a chat.

```bash
# one shot first, to check the look (about $0.84 with Kling 3.0 Pro and audio)
python3 docs/content/video/make_video.py docs/content/video/two-generations --only 1
# then the rest; finished shots are cached in out/
python3 docs/content/video/make_video.py docs/content/video/two-generations
```

The frames are sent as public URLs from this branch on GitHub, so commit and push them first. Otherwise pass `--inline`.

## A new video

Copy `two-generations/`, replace the frames, and edit `shots.json`:
- `line`: what the speaker says.
- `words`: the colour words shown above their heads.
- `adjective`: the payoff word.

The OpenRouter video models are listed at `https://openrouter.ai/api/v1/videos/models`. Ones with audio and first-frame support include:
- `kwaivgi/kling-v3.0-pro`: $0.168/s with audio
- `kwaivgi/kling-v3.0-std`: $0.126/s with audio
- `google/veo-3.1-fast`: $0.12/s with audio
- `bytedance/seedance-2.0`
