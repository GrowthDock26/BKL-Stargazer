#!/usr/bin/env python3
"""Validator for schriftform-und-textform-bgb plugin."""

import re
import json
import os
import sys
from pathlib import Path

BASE = Path("/home/user/workspace/claude-fuer-deutsches-recht/schriftform-und-textform-bgb")
DIGIT_COMMA_PATTERN = re.compile(r'\d\s*,\s*\d')

errors = []
warnings = []

# ── 1. plugin.json checks ──────────────────────────────────────────────────
plugin_json_path = BASE / "plugin.json"
with open(plugin_json_path, encoding="utf-8") as f:
    plugin = json.load(f)

plugin_desc = plugin.get("description", "")
if len(plugin_desc) > 300:
    errors.append(f"plugin.json description too long: {len(plugin_desc)} chars (max 300)")
else:
    print(f"[OK] plugin.json description length: {len(plugin_desc)} chars")

if DIGIT_COMMA_PATTERN.search(plugin_desc):
    errors.append(f"plugin.json description contains digit-comma-digit pattern")
else:
    print(f"[OK] plugin.json description: no digit-comma-digit pattern")

if plugin.get("name") != "schriftform-und-textform-bgb":
    errors.append(f"plugin.json name mismatch: {plugin.get('name')}")
else:
    print(f"[OK] plugin.json name: {plugin.get('name')}")

if plugin.get("version") != "3.2.0":
    errors.append(f"plugin.json version wrong: {plugin.get('version')}")
else:
    print(f"[OK] plugin.json version: {plugin.get('version')}")

expected_author = "Klotzkette <39582916+Klotzkette@users.noreply.github.com>"
if plugin.get("author") != expected_author:
    errors.append(f"plugin.json author wrong: {plugin.get('author')!r}")
else:
    print(f"[OK] plugin.json author correct")

# ── 2. SKILL.md checks ────────────────────────────────────────────────────
skills_dir = BASE / "skills"
skill_dirs = sorted([d for d in skills_dir.iterdir() if d.is_dir()])

print(f"\n[INFO] Found {len(skill_dirs)} skill directories\n")

NAME_RE = re.compile(r'^[a-z0-9-]{1,64}$')
FRONT_RE = re.compile(r'^---\n(.*?)\n---', re.DOTALL)
DESC_RE = re.compile(r'^description:\s*"(.*?)"', re.MULTILINE | re.DOTALL)
NAME_FM_RE = re.compile(r'^name:\s*(\S+)', re.MULTILINE)

skill_names_found = []

for skill_dir in skill_dirs:
    skill_slug = skill_dir.name
    skill_md = skill_dir / "SKILL.md"

    if not skill_md.exists():
        errors.append(f"[MISSING] {skill_slug}/SKILL.md")
        continue

    content = skill_md.read_text(encoding="utf-8")

    # Check frontmatter
    fm_match = FRONT_RE.match(content)
    if not fm_match:
        errors.append(f"[{skill_slug}] No valid frontmatter found")
        continue

    fm_body = fm_match.group(1)

    # Check name in frontmatter
    name_match = NAME_FM_RE.search(fm_body)
    if not name_match:
        errors.append(f"[{skill_slug}] No 'name' in frontmatter")
    else:
        fm_name = name_match.group(1).strip()
        skill_names_found.append(fm_name)

        # Name == dirname
        if fm_name != skill_slug:
            errors.append(f"[{skill_slug}] name '{fm_name}' != dirname '{skill_slug}'")
        else:
            print(f"[OK] {skill_slug}: name matches dirname")

        # Name regex
        if not NAME_RE.match(fm_name):
            errors.append(f"[{skill_slug}] name '{fm_name}' violates [a-z0-9-]{{1,64}}")

    # Extract description (handle multiline with inline check)
    # Find description line(s) in frontmatter
    desc_match = re.search(r'description:\s*"((?:[^"\\]|\\.)*)"', fm_body, re.DOTALL)
    if not desc_match:
        errors.append(f"[{skill_slug}] No valid quoted description in frontmatter")
        desc_text = ""
    else:
        desc_text = desc_match.group(1)

        # Description length ≤ 1024
        if len(desc_text) > 1024:
            errors.append(f"[{skill_slug}] description too long: {len(desc_text)} chars (max 1024)")
        else:
            print(f"[OK] {skill_slug}: description length {len(desc_text)} chars")

        # No XML tags in description
        if re.search(r'<[a-zA-Z/]', desc_text):
            errors.append(f"[{skill_slug}] description contains XML tags")

        # No digit-comma-digit in description
        if DIGIT_COMMA_PATTERN.search(desc_text):
            errors.append(f"[{skill_slug}] description contains digit-comma-digit pattern: {DIGIT_COMMA_PATTERN.search(desc_text).group()!r}")
        else:
            print(f"[OK] {skill_slug}: description no digit-comma-digit")

        # Description must be single-line (no newlines)
        if '\n' in desc_text:
            errors.append(f"[{skill_slug}] description is not single-line (contains newline)")

    # Check frontmatter only has 'name' and 'description' keys
    fm_lines = fm_body.strip().split('\n')
    # Collect top-level keys
    top_keys = []
    in_multiline = False
    for line in fm_lines:
        if re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*\s*:', line) and not in_multiline:
            key = line.split(':')[0].strip()
            top_keys.append(key)
        if line.strip().endswith('"') and not line.strip().startswith('"'):
            in_multiline = False

    allowed_fm_keys = {'name', 'description'}
    extra_keys = set(top_keys) - allowed_fm_keys
    if extra_keys:
        errors.append(f"[{skill_slug}] frontmatter has extra keys: {extra_keys}")

# ── 3. Count summary ──────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"SKILLS FOUND: {len(skill_dirs)}")
print(f"SKILL NAMES:  {len(skill_names_found)}")
for n in skill_names_found:
    print(f"  - {n}")

print(f"\n{'='*60}")
if errors:
    print(f"ERRORS ({len(errors)}):")
    for e in errors:
        print(f"  ✗ {e}")
    print("\nResult: FAIL")
    sys.exit(1)
else:
    print("RESULT: CLEAN — No errors found.")
    sys.exit(0)
