import { describe, it, expect } from "vitest";
import { crc32, makeZip } from "../src/zip";

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("writes a stored archive with a readable central directory", () => {
    const a = new TextEncoder().encode("hello");
    const b = new Uint8Array([1, 2, 3]);
    const zip = makeZip([{ name: "a.txt", data: a }, { name: "ünï/b.bin", data: b }]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const eocd = zip.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    expect(v.getUint16(eocd + 10, true)).toBe(2);
    const cd = v.getUint32(eocd + 16, true);
    expect(v.getUint32(cd, true)).toBe(0x02014b50);
    expect(v.getUint32(cd + 16, true)).toBe(crc32(a));
    expect(v.getUint32(cd + 20, true)).toBe(a.length);
    const nameLen = v.getUint16(cd + 28, true);
    expect(new TextDecoder().decode(zip.subarray(cd + 46, cd + 46 + nameLen))).toBe("a.txt");
    // The first entry's data sits right after its local header.
    expect(new TextDecoder().decode(zip.subarray(30 + 5, 30 + 5 + a.length))).toBe("hello");
  });
});
