#!/usr/bin/env python3
"""Summarize the paired native reader parse/reuse diagnostic artifacts."""

import csv
import json
import re
import statistics
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RUNS = ROOT / ".artifacts/performance/reader-sdk57/reuse-isolate"
EVENT = re.compile(
    r"state action=(\w+) reuse=(true|false) revision=(\S+) "
    r"verses=(\d+) words=(\d+) parse_us=(\d+) parse_bytes=(-?\d+) "
    r"hash_us=(\d+) hash_bytes=(-?\d+) total_us=(\d+) total_bytes=(-?\d+)"
)


def median(values):
    return round(statistics.median(values), 2) if values else None


def read_variant(name):
    runs = []
    all_events = []
    for directory in sorted((RUNS / name).glob("run-*")):
        log = directory / "reader-perf.log"
        if not log.is_file():
            continue
        events = []
        for match in EVENT.finditer(log.read_text()):
            action, reuse, revision, *numbers = match.groups()
            verse_count, word_count, parse_us, parse_bytes, hash_us, hash_bytes, total_us, total_bytes = map(int, numbers)
            events.append({"action": action, "reused": reuse == "true", "revision": revision,
                           "verses": verse_count, "words": word_count, "parse_us": parse_us,
                           "parse_bytes": parse_bytes, "hash_us": hash_us,
                           "hash_bytes": hash_bytes, "total_us": total_us,
                           "total_bytes": total_bytes})
        all_events.extend(events)
        metrics = {row["label"]: row for row in csv.DictReader((directory / "metrics.csv").open())}
        memory = {label: {key: round(int(row[key]) / 1024, 2)
                          for key in ("total_rss_kb", "total_pss_kb", "rss_anon_kb", "native_heap_alloc_kb")}
                  for label, row in metrics.items()}
        runs.append({"run": directory.name, "events": len(events),
                     "full_parses": sum(not event["reused"] for event in events),
                     "reuses": sum(event["reused"] for event in events),
                     "memory_mib": memory})

    initial = [event for event in all_events if event["action"] == "initial"]
    unchanged = [event for event in all_events if event["action"] == "unchanged"]
    reused = [event for event in unchanged if event["reused"]]
    parsed = [event for event in unchanged if not event["reused"]]
    return {"variant": name, "run_count": len(runs), "runs": runs,
            "event_count": len(all_events), "initial_events": len(initial),
            "unchanged_events": len(unchanged), "unchanged_parsed": len(parsed),
            "unchanged_reused": len(reused),
            "initial_parse_us_median": median([e["parse_us"] for e in initial]),
            "initial_parse_bytes_median": median([e["parse_bytes"] for e in initial]),
            "unchanged_parse_us_median": median([e["parse_us"] for e in parsed]),
            "unchanged_parse_bytes_median": median([e["parse_bytes"] for e in parsed]),
            "unchanged_reuse_total_us_median": median([e["total_us"] for e in reused]),
            "unchanged_reuse_total_bytes_median": median([e["total_bytes"] for e in reused]),
            "unchanged_parse_total_us_median": median([e["total_us"] for e in parsed]),
            "unchanged_parse_total_bytes_median": median([e["total_bytes"] for e in parsed]),
            "initial_verse_counts": sorted(set(e["verses"] for e in initial)),
            "initial_word_counts": sorted(set(e["words"] for e in initial))}


def main():
    result = {name: read_variant(name) for name in ("control", "reuse")}
    (RUNS / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
    for name, row in result.items():
        print(name, "runs", row["run_count"], "initial", row["initial_events"],
              "unchanged parsed/reused", row["unchanged_parsed"], row["unchanged_reused"],
              "parse us/bytes", row["unchanged_parse_us_median"],
              row["unchanged_parse_bytes_median"],
              "reuse total us/bytes", row["unchanged_reuse_total_us_median"],
              row["unchanged_reuse_total_bytes_median"])


if __name__ == "__main__":
    main()
