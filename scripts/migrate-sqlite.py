#!/usr/bin/env python3
"""
Migrate snippets from prompt-workbench SQLite to Obsidian vault markdown files.

Usage:
  python3 migrate-sqlite.py --dry-run     # Preview what would be created
  python3 migrate-sqlite.py               # Actually write files
  python3 migrate-sqlite.py --flat        # All snippets to Inbox (ignore folders)
"""

import sqlite3
import os
import re
import sys
import json
from pathlib import Path

DB_PATH = Path.home() / ".prompt-workbench" / "data.db"
VAULT_PATH = Path.home() / "obsidian" / "prompts"
DRY_RUN = "--dry-run" in sys.argv
FLAT = "--flat" in sys.argv


def sanitize_filename(name: str) -> str:
    """Clean a string for use as filename/dirname."""
    # Strip markdown formatting
    name = re.sub(r'\*\*([^*]+)\*\*', r'\1', name)  # **bold**
    name = re.sub(r'`([^`]+)`', r'\1', name)         # `code`
    name = name.strip('*`/ ')
    # Replace problematic chars
    name = re.sub(r'[<>:"/\\|?*]', '-', name)
    # Collapse multiple spaces/dashes
    name = re.sub(r'[-\s]+', ' ', name).strip()
    # Truncate long names
    if len(name) > 80:
        name = name[:80].rsplit(' ', 1)[0]
    return name or "untitled"


def sanitize_snippet_name(name: str) -> str:
    """Clean snippet name for use as filename."""
    name = sanitize_filename(name)
    # Remove characters that cause filesystem issues
    name = re.sub(r'[{}]', '', name)
    return name or "untitled"


def make_unique(path: Path, seen: set) -> Path:
    """Ensure path is unique by appending a number if needed."""
    if str(path) not in seen:
        seen.add(str(path))
        return path
    i = 2
    while True:
        new_path = path.parent / f"{path.stem} {i}{path.suffix}"
        if str(new_path) not in seen:
            seen.add(str(new_path))
            return new_path
        i += 1


def build_frontmatter(snippet: dict) -> str:
    """Build YAML frontmatter from snippet metadata."""
    lines = ["---"]
    if snippet["keyword"]:
        lines.append(f"keyword: {snippet['keyword']}")

    tags = []
    if snippet["tags"] and snippet["tags"] != "[]":
        try:
            tags = json.loads(snippet["tags"])
        except (json.JSONDecodeError, TypeError):
            pass
    if tags:
        lines.append(f"tags: [{', '.join(tags)}]")
    else:
        lines.append("tags: []")

    lines.append("---")
    return "\n".join(lines)


def main():
    if not DB_PATH.exists():
        print(f"Database not found: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    # Load folders
    folders = conn.execute("SELECT id, name, parent_id FROM folders").fetchall()
    folder_map = {f["id"]: dict(f) for f in folders}

    def folder_name(fid):
        if not fid or fid not in folder_map:
            return None
        return sanitize_filename(folder_map[fid]["name"])

    # Load snippets
    snippets = conn.execute(
        "SELECT id, name, text, keyword, folder_id, tags, created_at "
        "FROM snippets ORDER BY created_at"
    ).fetchall()

    print(f"Found {len(snippets)} snippets in database")
    print(f"Vault: {VAULT_PATH}")
    print(f"Mode: {'DRY RUN' if DRY_RUN else 'WRITE'}")
    if FLAT:
        print("Flat mode: all snippets go to Inbox/")
    print()

    seen_paths: set = set()
    created = 0
    skipped = 0

    for s in snippets:
        s = dict(s)

        # Determine target directory
        if FLAT or not s["folder_id"]:
            dir_name = "Inbox"
        else:
            dir_name = folder_name(s["folder_id"]) or "Inbox"

        # Build file path
        snippet_filename = sanitize_snippet_name(s["name"]) + ".md"
        target_dir = VAULT_PATH / dir_name
        target_path = make_unique(target_dir / snippet_filename, seen_paths)

        # Skip if file already exists in vault (don't overwrite manual edits)
        if target_path.exists():
            print(f"  SKIP (exists): {target_path.relative_to(VAULT_PATH)}")
            skipped += 1
            continue

        # Build content
        frontmatter = build_frontmatter(s)
        body = s["text"].rstrip("\n")
        content = f"{frontmatter}\n\n{body}\n"

        if DRY_RUN:
            print(f"  CREATE: {target_path.relative_to(VAULT_PATH)}")
            if s["keyword"]:
                print(f"          keyword: {s['keyword']}")
        else:
            target_dir.mkdir(parents=True, exist_ok=True)
            target_path.write_text(content, encoding="utf-8")
            print(f"  CREATED: {target_path.relative_to(VAULT_PATH)}")

        created += 1

    print()
    print(f"{'Would create' if DRY_RUN else 'Created'}: {created}")
    print(f"Skipped (already exist): {skipped}")

    if DRY_RUN:
        print()
        print("Run without --dry-run to write files.")
        print("Run with --flat to put everything in Inbox/ instead of folders.")

    conn.close()


if __name__ == "__main__":
    main()
