#!/usr/bin/env python3
"""
scripts/image_gen.py - Image Generation & Editing CLI fallback script

Exposes three subcommands:
  - generate: Generate a new image from a prompt
  - edit: Edit an existing image with a prompt and input image
  - generate-batch: Generate multiple image assets or variants from a batch of prompts

Designed to operate seamlessly with GEMINI_API_KEY or OPENAI_API_KEY.
"""

import os
import sys
import json
import base64
import argparse
import urllib.request
import urllib.error
from pathlib import Path

DEFAULT_OUTPUT_DIR = Path("public/generated-images")
DEFAULT_WORKSPACE_DIR = Path(os.path.expanduser("~/.aanya/workspace/Images"))

def get_api_key():
    gemini_key = os.environ.get("GEMINI_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    return gemini_key, openai_key

def generate_gemini(prompt: str, api_key: str, aspect_ratio="1:1", input_image_path=None, transparent=False):
    """Generates or edits an image using Gemini / Imagen REST API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key={api_key}"
    
    # If transparent, enforce clean isolation
    full_prompt = prompt
    if transparent:
        full_prompt = f"{prompt}, isolated on transparent pure white background, cutout subject, clean edges"
    
    headers = {"Content-Type": "application/json"}
    
    payload = {
        "instances": [{"prompt": full_prompt}],
        "parameters": {
            "aspectRatio": aspect_ratio,
            "sampleCount": 1
        }
    }
    
    # If editing with input image, use gemini-3.1-flash-image
    if input_image_path and os.path.exists(input_image_path):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key={api_key}"
        with open(input_image_path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode("utf-8")
        
        mime = "image/png"
        if input_image_path.lower().endswith((".jpg", ".jpeg")):
            mime = "image/jpeg"
        elif input_image_path.lower().endswith(".webp"):
            mime = "image/webp"

        payload = {
            "contents": [{
                "parts": [
                    {"inlineData": {"data": img_b64, "mimeType": mime}},
                    {"text": f"Edit this image according to: {full_prompt}"}
                ]
            }],
            "generationConfig": {
                "imageConfig": {
                    "aspectRatio": aspect_ratio,
                    "imageSize": "1K"
                }
            }
        }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            
            # Check predict response (Imagen)
            if "predictions" in body and len(body["predictions"]) > 0:
                b64 = body["predictions"][0].get("bytesBase64Encoded")
                if b64:
                    return base64.b64decode(b64)
                    
            # Check generateContent response (Gemini Flash Image)
            if "candidates" in body and len(body["candidates"]) > 0:
                parts = body["candidates"][0].get("content", {}).get("parts", [])
                for part in parts:
                    inline = part.get("inlineData", {})
                    if "data" in inline:
                        return base64.b64decode(inline["data"])
                        
            raise RuntimeError(f"Unexpected API response format: {json.dumps(body)[:200]}")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        raise RuntimeError(f"API request failed ({e.code}): {err_msg}")

def generate_openai(prompt: str, api_key: str, aspect_ratio="1:1", input_image_path=None, transparent=False):
    """Generates or edits an image using OpenAI DALL-E / Images API."""
    size = "1024x1024"
    if aspect_ratio == "16:9":
        size = "1792x1024"
    elif aspect_ratio == "9:16":
        size = "1024x1792"
        
    full_prompt = prompt
    if transparent:
        full_prompt = f"{prompt}, isolated subject with transparent background cutout"

    url = "https://api.openai.com/v1/images/generations"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "model": "dall-e-3",
        "prompt": full_prompt,
        "n": 1,
        "size": size,
        "response_format": "b64_json"
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            if "data" in body and len(body["data"]) > 0:
                b64 = body["data"][0].get("b64_json")
                if b64:
                    return base64.b64decode(b64)
            raise RuntimeError(f"Unexpected OpenAI response: {json.dumps(body)[:200]}")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        raise RuntimeError(f"OpenAI API request failed ({e.code}): {err_msg}")

def save_image(img_bytes: bytes, output_path: str = None, prefix: str = "img"):
    import time
    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DEFAULT_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = int(time.time() * 1000)
    filename = f"{prefix}_{timestamp}.png"

    if output_path:
        out_p = Path(output_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with open(out_p, "wb") as f:
            f.write(img_bytes)
        print(f"Saved image to: {out_p.resolve()}")
        # Also copy to web directory
        web_p = DEFAULT_OUTPUT_DIR / out_p.name
        with open(web_p, "wb") as f:
            f.write(img_bytes)
        return str(out_p)
    else:
        web_p = DEFAULT_OUTPUT_DIR / filename
        ws_p = DEFAULT_WORKSPACE_DIR / filename
        with open(web_p, "wb") as f:
            f.write(img_bytes)
        with open(ws_p, "wb") as f:
            f.write(img_bytes)
        print(f"Saved image to:\n  - {web_p.resolve()}\n  - {ws_p.resolve()}")
        return str(ws_p)

def cmd_generate(args):
    gemini_key, openai_key = get_api_key()
    if not gemini_key and not openai_key:
        sys.exit("Error: No API key found. Set GEMINI_API_KEY or OPENAI_API_KEY in your environment.")

    print(f"Generating image: '{args.prompt}' (Aspect Ratio: {args.aspect_ratio}, Transparent: {args.transparent})")
    try:
        if gemini_key:
            img_bytes = generate_gemini(args.prompt, gemini_key, args.aspect_ratio, transparent=args.transparent)
        else:
            img_bytes = generate_openai(args.prompt, openai_key, args.aspect_ratio, transparent=args.transparent)
            
        save_image(img_bytes, args.output, prefix="gen")
    except Exception as e:
        sys.exit(f"Generation error: {e}")

def cmd_edit(args):
    gemini_key, openai_key = get_api_key()
    if not gemini_key and not openai_key:
        sys.exit("Error: No API key found. Set GEMINI_API_KEY or OPENAI_API_KEY in your environment.")

    if not os.path.exists(args.image):
        sys.exit(f"Error: Target image file '{args.image}' not found.")

    print(f"Editing image '{args.image}' with prompt: '{args.prompt}' (Transparent: {args.transparent})")
    try:
        if gemini_key:
            img_bytes = generate_gemini(args.prompt, gemini_key, aspect_ratio=args.aspect_ratio, input_image_path=args.image, transparent=args.transparent)
        else:
            img_bytes = generate_openai(args.prompt, openai_key, aspect_ratio=args.aspect_ratio, input_image_path=args.image, transparent=args.transparent)
            
        save_image(img_bytes, args.output, prefix="edit")
    except Exception as e:
        sys.exit(f"Edit error: {e}")

def cmd_generate_batch(args):
    gemini_key, openai_key = get_api_key()
    if not gemini_key and not openai_key:
        sys.exit("Error: No API key found. Set GEMINI_API_KEY or OPENAI_API_KEY in your environment.")

    prompts = []
    if args.prompts_file:
        with open(args.prompts_file, "r") as f:
            prompts = [line.strip() for line in f if line.strip() and not line.startswith("#")]
    elif args.prompts:
        prompts = args.prompts
    else:
        sys.exit("Error: Specify either --prompts or --prompts-file.")

    out_dir = Path(args.output_dir) if args.output_dir else DEFAULT_OUTPUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Starting batch generation of {len(prompts)} assets...")
    for idx, prompt in enumerate(prompts, start=1):
        print(f"[{idx}/{len(prompts)}] Generating: '{prompt}'")
        try:
            if gemini_key:
                img_bytes = generate_gemini(prompt, gemini_key, args.aspect_ratio, transparent=args.transparent)
            else:
                img_bytes = generate_openai(prompt, openai_key, args.aspect_ratio, transparent=args.transparent)
            
            dest = out_dir / f"batch_{idx}_{int(os.getpid())}.png"
            with open(dest, "wb") as f:
                f.write(img_bytes)
            print(f"  -> Saved: {dest}")
        except Exception as e:
            print(f"  -> Failed for '{prompt}': {e}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(
        description="Aanya Image Studio - CLI Image Generation & Editing Tool"
    )
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # Subcommand: generate
    p_gen = subparsers.add_parser("generate", help="Generate a new image")
    p_gen.add_argument("--prompt", "-p", required=True, help="Image description prompt")
    p_gen.add_argument("--aspect-ratio", "-ar", default="1:1", choices=["1:1", "16:9", "9:16", "4:3", "3:4"], help="Aspect ratio")
    p_gen.add_argument("--use-case", default="photorealistic-natural", help="Taxonomy slug")
    p_gen.add_argument("--transparent", "-t", action="store_true", help="Generate with transparent background cutout")
    p_gen.add_argument("--output", "-o", help="Target output file path")
    p_gen.set_defaults(func=cmd_generate)

    # Subcommand: edit
    p_edit = subparsers.add_parser("edit", help="Edit an existing image")
    p_edit.add_argument("--image", "-i", required=True, help="Path to input image to edit")
    p_edit.add_argument("--prompt", "-p", required=True, help="Edit instruction prompt")
    p_edit.add_argument("--aspect-ratio", "-ar", default="1:1", choices=["1:1", "16:9", "9:16", "4:3", "3:4"])
    p_edit.add_argument("--transparent", "-t", action="store_true", help="Preserve or create transparent background")
    p_edit.add_argument("--output", "-o", help="Target output file path")
    p_edit.set_defaults(func=cmd_edit)

    # Subcommand: generate-batch
    p_batch = subparsers.add_parser("generate-batch", help="Generate multiple assets in batch")
    p_batch.add_argument("--prompts", "-p", nargs="+", help="List of prompt strings")
    p_batch.add_argument("--prompts-file", "-f", help="File containing one prompt per line")
    p_batch.add_argument("--aspect-ratio", "-ar", default="1:1", choices=["1:1", "16:9", "9:16", "4:3", "3:4"])
    p_batch.add_argument("--transparent", "-t", action="store_true", help="Transparent background")
    p_batch.add_argument("--output-dir", "-o", help="Output directory")
    p_batch.set_defaults(func=cmd_generate_batch)

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
