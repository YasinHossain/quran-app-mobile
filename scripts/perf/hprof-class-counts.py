#!/usr/bin/env python3
"""Count selected Java heap instances in a standard HPROF file.

Convert Android dumps first with `hprof-conv -z input.hprof output.hprof`.
Counts are heap snapshot instances after dumpheap's forced GC, not retained bytes.
"""

import argparse
import collections
import mmap
import struct


ROOT_ID = {0xFF, 0x05, 0x07, 0x89, 0x8A, 0x8B, 0x8C, 0x8D, 0x90}
ROOT_ID_U4 = {0x04, 0x06}
ROOT_ID_U4_U4 = {0x02, 0x03, 0x08, 0x8E}


def count_classes(path):
    with open(path, "rb") as file, mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_READ) as data:
        header_end = data.find(b"\0")
        id_size = struct.unpack_from(">I", data, header_end + 1)[0]
        pos = header_end + 1 + 4 + 8
        strings = {}
        class_names = {}
        instances = collections.Counter()

        def integer(offset, size):
            return int.from_bytes(data[offset:offset + size], "big")

        def value_size(type_code):
            return {2: id_size, 4: 1, 5: 2, 6: 4, 7: 8,
                    8: 1, 9: 2, 10: 4, 11: 8}[type_code]

        while pos < len(data):
            tag = data[pos]
            length = integer(pos + 5, 4)
            body = pos + 9
            end = body + length
            if tag == 0x01:
                strings[integer(body, id_size)] = bytes(data[body + id_size:end]).decode("utf-8", "replace")
            elif tag == 0x02:
                class_names[integer(body + 4, id_size)] = integer(body + 4 + id_size + 4, id_size)
            elif tag in (0x0C, 0x1C):
                cursor = body
                while cursor < end:
                    subtag = data[cursor]
                    cursor += 1
                    if subtag in ROOT_ID:
                        cursor += id_size
                    elif subtag == 0x01:
                        cursor += 2 * id_size
                    elif subtag in ROOT_ID_U4:
                        cursor += id_size + 4
                    elif subtag in ROOT_ID_U4_U4:
                        cursor += id_size + 8
                    elif subtag == 0xFE:
                        cursor += 4 + id_size
                    elif subtag == 0x20:
                        cursor += 7 * id_size + 8  # class id, stack, six other ids
                        constant_count = integer(cursor, 2)
                        cursor += 2
                        for _ in range(constant_count):
                            kind = data[cursor + 2]
                            cursor += 3 + value_size(kind)
                        static_count = integer(cursor, 2)
                        cursor += 2
                        for _ in range(static_count):
                            kind = data[cursor + id_size]
                            cursor += id_size + 1 + value_size(kind)
                        field_count = integer(cursor, 2)
                        cursor += 2 + field_count * (id_size + 1)
                    elif subtag == 0x21:
                        class_id = integer(cursor + id_size + 4, id_size)
                        payload_size = integer(cursor + 2 * id_size + 4, 4)
                        instances[class_id] += 1
                        cursor += 2 * id_size + 8 + payload_size
                    elif subtag == 0x22:
                        count = integer(cursor + id_size + 4, 4)
                        cursor += 2 * id_size + 8 + count * id_size
                    elif subtag == 0x23:
                        count = integer(cursor + id_size + 4, 4)
                        kind = data[cursor + id_size + 8]
                        cursor += id_size + 9 + count * value_size(kind)
                    else:
                        raise ValueError(f"Unknown heap subtag 0x{subtag:02x} at {cursor - 1}")
                if cursor != end:
                    raise ValueError(f"Heap segment ended at {cursor}, expected {end}")
            pos = end

        names = collections.Counter()
        for class_id, count in instances.items():
            name_id = class_names.get(class_id)
            name = strings.get(name_id, f"unknown-class-{class_id}")
            names[name] += count
        return names


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("hprof")
    parser.add_argument("--match", default="nativesurahreader")
    args = parser.parse_args()
    names = count_classes(args.hprof)
    for name, count in sorted(names.items()):
        if args.match in name:
            print(f"{count:8d} {name}")


if __name__ == "__main__":
    main()
