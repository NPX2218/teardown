#!/usr/bin/env python3
"""Check the specification bundle without installing or running the future app.

Run: python3 docs/specs/check_contracts.py
This checks document structure and shared fixtures, not TypeScript or device behavior.
"""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[2]
spec_dir = root / "docs/specs"
specs = sorted(spec_dir.glob("[0-9][0-9]-*.spec.md"))
assert [int(p.name[:2]) for p in specs] == list(range(14)), "Expected stages 00 through 13 exactly once"


def fences(text):
    marker = None
    body = []
    language = ""
    for line in text.splitlines():
        match = re.fullmatch(r"(`{3,})(\w*)\s*", line)
        if marker:
            if match and len(match[1]) >= len(marker):
                yield language, "\n".join(body)
                marker = None
                body = []
            else:
                body.append(line)
        elif match:
            marker, language = match[1], match[2]
    assert marker is None, "Unclosed code fence"


literal_json = []
for path in specs:
    text = path.read_text()
    for language, body in fences(text):
        if language == "json":
            # Deliberate templates contain <id>, <uuid>, or ellipses and are not data files.
            if re.search(r"<[^>]+>|\.\.\.", body):
                continue
            literal_json.append((path.name, json.loads(body)))
    assert not re.search(r"(?im)^\s*Co-authored-by:\s*", text), path.name

setup = (spec_dir / "01-setup-contract.spec.md").read_text()
practice = next(value for name, value in literal_json if name.startswith("01-") and isinstance(value, dict) and value.get("id") == "practice")
events = {event["id"]: event for event in practice["events"]}
assert events["fairing_sep"]["t"] == 190
assert events["entry_burn"]["t"] == 419
assert "complete" in events["entry_burn"]["say"].lower()
assert practice["booster"]["serial"] == "SAMPLE"
times = [event["t"] for event in practice["events"]]
assert times == sorted(times) and times[0] == 0
assert "react@18.3.1" in setup and "@react-three/fiber@8.17.10" in setup
assert "@react-three/drei@9.114.0" in setup and "tsx@4.19.2" in setup
assert "create-next-app@latest" not in setup

for stage in ("01-setup-contract", "05-voice", "10-phone-rocket", "11-rocket-link"):
    text = (spec_dir / f"{stage}.spec.md").read_text()
    for kind in ("say", "said", "stopSay", "listen", "stopListen"):
        assert kind in text, f"{stage} is missing {kind}"

for path in [spec_dir / "README.md", root / "docs/GUIDE.md", root / "docs/plans/00-index.md"]:
    text = path.read_text()
    for link in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
        if "://" in link or link.startswith("#"):
            continue
        target = path.parent / link.split("#")[0]
        assert target.exists(), f"Broken documentation link: {path.name}: {link}"

print(f"PASS: {len(specs)} stage specs, {len(literal_json)} literal JSON blocks, shared timeline, dependency pins, voice message vocabulary, and entry-point links")
