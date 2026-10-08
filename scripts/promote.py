#!/usr/bin/env python3
"""Promote ideas from Tallyn Ideas to Tallyn Board (Backlog).

  python3 scripts/promote.py 23            promote idea #23 as a feature
  python3 scripts/promote.py 23 design     promote as type:design (feature|bug|design|docs|tech-debt)

What promotion does: Ideas Stage → Promoted, add to Tallyn Board with Stage = Backlog,
swap label type:idea → type:<kind>, and comment on the issue. sync_board.py calls
auto_promote() so cards dragged to "Promoted" on GitHub are moved on the next sync.
"""
import datetime, functools, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
KINDS = {"feature", "bug", "design", "docs", "tech-debt"}


def load_env():
    return dict(l.split("=", 1) for l in (ROOT / "scripts/board.env").read_text().split() if "=" in l)


def gh(*args, as_json=False):
    r = subprocess.run(["gh", *map(str, args)], capture_output=True, text=True, cwd=ROOT)
    if r.returncode:
        sys.exit(f"gh {' '.join(map(str, args))} failed:\n{r.stderr}")
    return json.loads(r.stdout) if as_json else r.stdout.strip()


@functools.lru_cache(None)
def meta(number, owner):
    """(project id, Stage field id, {option name: option id})"""
    pid = gh("project", "view", number, "--owner", owner, "--format", "json", as_json=True)["id"]
    fields = gh("project", "field-list", number, "--owner", owner, "--format", "json", as_json=True)["fields"]
    stage = next(f for f in fields if f["name"] == "Stage")
    return pid, stage["id"], {o["name"]: o["id"] for o in stage["options"]}


def items(number, owner):
    return gh("project", "item-list", number, "--owner", owner, "--format", "json", "--limit", "500",
              as_json=True).get("items", [])


def set_stage(item_id, number, owner, stage):
    pid, fid, opts = meta(number, owner)
    gh("project", "item-edit", "--id", item_id, "--project-id", pid, "--field-id", fid,
       "--single-select-option-id", opts[stage])


def move_to_board(e, url, number, labels, kind="feature"):
    owner = e["BOARD_OWNER"]
    item = gh("project", "item-add", e["BOARD_NUMBER"], "--owner", owner, "--url", url,
              "--format", "json", as_json=True)["id"]
    set_stage(item, e["BOARD_NUMBER"], owner, "Backlog")
    edit = ["issue", "edit", number, "--add-label", f"type:{kind}"]
    if "type:idea" in (labels or []):
        edit += ["--remove-label", "type:idea"]
    gh(*edit)
    gh("issue", "comment", number, "--body",
       f"Promoted to **Tallyn Board** (Backlog) on {datetime.date.today()}. "
       f"Label `type:idea` → `type:{kind}`.")


def board_urls(e):
    return {(i.get("content") or {}).get("url") for i in items(e["BOARD_NUMBER"], e["BOARD_OWNER"])}


def auto_promote(e=None):
    """Move every idea in Stage 'Promoted' that isn't on Tallyn Board yet. Returns promoted numbers."""
    e = e or load_env()
    if "IDEAS_NUMBER" not in e:
        return []
    on_board, done = board_urls(e), []
    for it in items(e["IDEAS_NUMBER"], e["BOARD_OWNER"]):
        c = it.get("content") or {}
        stage = next((v for k, v in it.items() if k.lower() == "stage"), None)
        if stage == "Promoted" and c.get("url") and c["url"] not in on_board:
            move_to_board(e, c["url"], c["number"], it.get("labels"))
            done.append(c["number"])
            print(f"↑ promoted #{c['number']} {c.get('title', '')} → Tallyn Board (Backlog)")
    return done


def main():
    if len(sys.argv) < 2 or not sys.argv[1].lstrip("#").isdigit():
        sys.exit(__doc__)
    number = int(sys.argv[1].lstrip("#"))
    kind = sys.argv[2] if len(sys.argv) > 2 else "feature"
    if kind not in KINDS:
        sys.exit(f"type must be one of: {', '.join(sorted(KINDS))}")
    e = load_env()
    idea = next((i for i in items(e["IDEAS_NUMBER"], e["BOARD_OWNER"])
                 if (i.get("content") or {}).get("number") == number), None)
    if not idea:
        sys.exit(f"#{number} is not on Tallyn Ideas")
    set_stage(idea["id"], e["IDEAS_NUMBER"], e["BOARD_OWNER"], "Promoted")
    url = idea["content"]["url"]
    if url in board_urls(e):
        print(f"#{number} is already on Tallyn Board. Ideas Stage set to Promoted")
        return
    move_to_board(e, url, number, idea.get("labels"), kind)
    print(f"✓ #{number} {idea['content'].get('title', '')} → Tallyn Board (Backlog) as type:{kind}")


if __name__ == "__main__":
    main()
