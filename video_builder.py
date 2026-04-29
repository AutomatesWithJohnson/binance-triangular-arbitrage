#!/usr/bin/env python3
"""
Daily GitHub Video Builder
Reads a JSON input file, generates a voiceover + slides, assembles an MP4.
Called by n8n Execute Command node.
Usage: python video_builder.py <path_to_input.json>
"""

import sys
import os
import json
import subprocess
import asyncio
import textwrap
from pathlib import Path
from datetime import datetime

try:
    import edge_tts
except ImportError:
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'edge-tts', '--quiet'], check=True)
    import edge_tts

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'Pillow', '--quiet'], check=True)
    from PIL import Image, ImageDraw, ImageFont

# --- Constants ---
WIDTH, HEIGHT = 1280, 720
BG       = (13, 17, 23)
ACCENT   = (88, 166, 255)
WHITE    = (230, 237, 243)
GRAY     = (139, 148, 158)
GREEN    = (63, 185, 80)
YELLOW   = (210, 153, 34)

FONT_PATHS = [
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/calibri.ttf",
]

def get_font(size):
    for fp in FONT_PATHS:
        try:
            return ImageFont.truetype(fp, size)
        except Exception:
            continue
    return ImageFont.load_default()

def draw_slide(lines, work_dir, index):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, WIDTH, 5], fill=ACCENT)
    d.rectangle([0, HEIGHT - 5, WIDTH, HEIGHT], fill=ACCENT)

    y = 70
    for item in lines:
        font  = get_font(item.get("size", 36))
        color = item.get("color", WHITE)
        text  = item.get("text", "")
        gap   = item.get("gap", 24)
        if item.get("wrap"):
            for line in textwrap.fill(text, width=52).split("\n"):
                d.text((80, y), line, font=font, fill=color)
                bb = d.textbbox((0, 0), line, font=font)
                y += (bb[3] - bb[1]) + 8
            y += gap
        else:
            d.text((80, y), text, font=font, fill=color)
            bb = d.textbbox((0, 0), text, font=font)
            y += (bb[3] - bb[1]) + gap

    path = os.path.join(work_dir, f"slide_{index:03d}.png")
    img.save(path)
    return path

def get_audio_duration(audio_path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", audio_path],
        capture_output=True, text=True, check=True
    )
    return float(json.loads(r.stdout)["format"]["duration"])

async def make_audio(script_text, out_path):
    comm = edge_tts.Communicate(script_text, voice="en-US-GuyNeural")
    await comm.save(out_path)

def build_video(data):
    repo_name   = data.get("repo_name", "Unknown Repo")
    full_name   = data.get("full_name", repo_name)
    description = data.get("description", "No description available.")
    language    = data.get("language", "Unknown")
    stars       = data.get("stars", 0)
    topics      = data.get("topics", [])
    script_text = data["script"]
    output_dir  = data.get("output_dir", r"C:\Users\PRECISION\Desktop\ANTIGRAVITY\videos")

    os.makedirs(output_dir, exist_ok=True)
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe     = repo_name.replace("/", "_").replace(" ", "_")
    work_dir = os.path.join(output_dir, f"work_{ts}")
    os.makedirs(work_dir, exist_ok=True)
    final    = os.path.join(output_dir, f"{safe}_{ts}.mp4")

    # 1. Voiceover
    audio_path = os.path.join(work_dir, "voice.mp3")
    asyncio.run(make_audio(script_text, audio_path))
    duration = get_audio_duration(audio_path)

    # 2. Slides
    topics_str = "  ".join(f"#{t}" for t in topics[:7]) if topics else "No topics listed"
    star_str   = f"* {stars:,} stars"

    slides_def = [
        [
            {"text": "GitHub Spotlight", "size": 28, "color": ACCENT, "gap": 28},
            {"text": repo_name,           "size": 58, "color": WHITE,  "gap": 18},
            {"text": star_str,            "size": 38, "color": GREEN,  "gap": 18},
            {"text": f"Language: {language}", "size": 30, "color": GRAY, "gap": 0},
        ],
        [
            {"text": "What is it?",   "size": 34, "color": ACCENT, "gap": 28},
            {"text": description,     "size": 32, "color": WHITE,  "gap": 0, "wrap": True},
        ],
        [
            {"text": "Topics",        "size": 34, "color": ACCENT,  "gap": 28},
            {"text": topics_str,      "size": 30, "color": GREEN,   "gap": 28, "wrap": True},
            {"text": f"github.com/{full_name}", "size": 26, "color": GRAY, "gap": 0},
        ],
    ]

    slide_dur = duration / len(slides_def)
    slide_paths = [draw_slide(s, work_dir, i) for i, s in enumerate(slides_def)]

    # 3. Concat list
    concat_file = os.path.join(work_dir, "concat.txt")
    with open(concat_file, "w") as f:
        for p in slide_paths:
            f.write(f"file '{p}'\nduration {slide_dur:.3f}\n")
        f.write(f"file '{slide_paths[-1]}'\n")

    # 4. Slides -> raw video
    raw_video = os.path.join(work_dir, "slides_raw.mp4")
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", concat_file,
        "-vf", "fps=30,format=yuv420p",
        "-c:v", "libx264", "-preset", "fast",
        raw_video
    ], check=True, capture_output=True)

    # 5. Merge audio + color grade
    subprocess.run([
        "ffmpeg", "-y",
        "-i", raw_video,
        "-i", audio_path,
        "-vf", "eq=brightness=0.04:saturation=1.3:contrast=1.1",
        "-c:v", "libx264", "-preset", "fast",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        final
    ], check=True, capture_output=True)

    return final

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("ERROR: Usage: python video_builder.py <input_json_path>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)

    try:
        result = build_video(data)
        print(f"VIDEO_PATH:{result}")
        sys.exit(0)
    except Exception as e:
        print(f"ERROR:{e}", file=sys.stderr)
        sys.exit(1)
