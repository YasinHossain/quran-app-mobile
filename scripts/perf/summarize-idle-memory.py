#!/usr/bin/env python3
"""Summarize idle samples without mixing early/settled checkpoints or processes."""

import argparse
import csv
import json
from pathlib import Path
import statistics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directories', type=Path, nargs='+')
    args = parser.parse_args()
    summary = []
    for directory in args.directories:
        metadata = json.loads((directory / 'metadata.json').read_text())
        timings = list(csv.DictReader((directory / 'timings.csv').open()))
        for process, filename in [('main', 'metrics.csv'), ('widget', 'widget-metrics.csv')]:
            path = directory / filename
            if not path.exists():
                continue
            rows = list(csv.DictReader(path.open()))
            for checkpoint in [5, 15, 30, 60]:
                samples = [r for r in rows if r['label'].endswith(f'-{checkpoint}s')]
                if not samples:
                    continue
                result = {'label': metadata['label'], 'process': process, 'seconds': checkpoint,
                          'samples': len(samples), 'directory': str(directory)}
                for key in ['total_rss_kb', 'total_pss_kb', 'rss_anon_kb', 'swap_kb', 'native_heap_alloc_kb']:
                    values = [int(r[key]) / 1024 for r in samples]
                    result[key.replace('_kb', '_mib')] = {
                        'median': round(statistics.median(values), 2),
                        'min': round(min(values), 2), 'max': round(max(values), 2),
                    }
                result['views_median'] = statistics.median(int(r['views']) for r in samples)
                readiness = [int(r['readiness_proxy_ms']) for r in timings if r['sample_target_seconds'] == str(checkpoint)]
                if readiness:
                    result['readiness_proxy_ms_median'] = statistics.median(readiness)
                summary.append(result)
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
