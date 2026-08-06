import { describe, it, expect } from 'vitest';
import {
  slotIndexToKey, keyToSlotIndex, orderFilesForAutoLoad,
  formatUploadProgress, shouldConfirmOverwrite, syncChipLabel, buildCloudFileDoc,
  exceedsUploadQuota, sumStorageUsage, formatBytes, MAX_UPLOAD_BYTES,
  fileHistory, nextFileVersion, appendFileVersion, MAX_FILE_HISTORY,
} from './cloud-files.js';
import type { CloudProjectFile } from './cloud-projects.js';

function mkFile(slot: 'A' | 'B' | number, name = 'f.ifc'): CloudProjectFile {
  return { id: String(slot), name, size: 100, slot, storagePath: 'p', contentType: 'application/x-step', uploadedBy: 'a@b.com', uploadedAt: 1 };
}

describe('slotIndexToKey / keyToSlotIndex', () => {
  it('maps 0/1 to A/B and back', () => {
    expect(slotIndexToKey(0)).toBe('A');
    expect(slotIndexToKey(1)).toBe('B');
    expect(keyToSlotIndex('A')).toBe(0);
    expect(keyToSlotIndex('B')).toBe(1);
  });
  it('keeps federation slots as raw numbers', () => {
    expect(slotIndexToKey(2)).toBe(2);
    expect(slotIndexToKey(5)).toBe(5);
    expect(keyToSlotIndex(3)).toBe(3);
  });
});

describe('orderFilesForAutoLoad', () => {
  it('loads A/B before federation slots, federation ascending', () => {
    const files = [mkFile(3), mkFile('B'), mkFile(2), mkFile('A')];
    const order = orderFilesForAutoLoad(files).map(f => f.slot);
    expect(order).toEqual(['A', 'B', 2, 3]);
  });
  it('does not mutate the input array', () => {
    const files = [mkFile('B'), mkFile('A')];
    const copy = [...files];
    orderFilesForAutoLoad(files);
    expect(files).toEqual(copy);
  });
});

describe('formatUploadProgress', () => {
  it('rounds and clamps to 0-100', () => {
    expect(formatUploadProgress(1, 3)).toBe(33);
    expect(formatUploadProgress(0, 0)).toBe(0);
    expect(formatUploadProgress(100, 100)).toBe(100);
    expect(formatUploadProgress(150, 100)).toBe(100);
  });
});

describe('shouldConfirmOverwrite', () => {
  it('prompts only when a cloud file already exists for the slot', () => {
    expect(shouldConfirmOverwrite(mkFile('A'))).toBe(true);
    expect(shouldConfirmOverwrite(null)).toBe(false);
    expect(shouldConfirmOverwrite(undefined)).toBe(false);
  });
});

describe('syncChipLabel', () => {
  it('formats each status', () => {
    expect(syncChipLabel('synced')).toBe('☁ synced');
    expect(syncChipLabel('uploading', 42)).toBe('⬆ uploading 42%');
    expect(syncChipLabel('error')).toBe('⚠ upload failed');
    expect(syncChipLabel('local-only')).toBe('⚠ local-only');
  });
});

describe('buildCloudFileDoc', () => {
  it('derives slot from idx and stamps a fixed contentType', () => {
    const doc = buildCloudFileDoc('a.ifc', 123, 0, 'projects/p/x.ifc', 'me@x.com');
    expect(doc.slot).toBe('A');
    expect(doc.contentType).toBe('application/x-step');
    expect(doc.uploadedBy).toBe('me@x.com');
  });

  it('starts a first upload at v1 with a one-entry history', () => {
    const doc = buildCloudFileDoc('a.ifc', 123, 0, 'projects/p/x.ifc', 'me@x.com', null, 1000);
    expect(doc.version).toBe(1);
    expect(doc.history).toEqual([{ version: 1, name: 'a.ifc', size: 123, uploadedBy: 'me@x.com', uploadedAt: 1000 }]);
  });

  it('carries earlier versions forward, newest first', () => {
    const v1 = { id: 'f', ...buildCloudFileDoc('a.ifc', 100, 0, 'p', 'alice@x.com', null, 1000) };
    const v2 = { id: 'f', ...buildCloudFileDoc('b.ifc', 200, 0, 'p', 'bob@x.com', v1, 2000) };
    expect(v2.version).toBe(2);
    expect(v2.history!.map(h => [h.version, h.uploadedBy, h.uploadedAt])).toEqual([
      [2, 'bob@x.com', 2000],
      [1, 'alice@x.com', 1000],
    ]);
    // Top-level fields always describe the CURRENT version (what auto-load reads).
    expect([v2.name, v2.size, v2.uploadedBy]).toEqual(['b.ifc', 200, 'bob@x.com']);
  });

  it('treats a pre-history record as v1 so its replacement is v2', () => {
    const legacy = mkFile('A'); // no version/history fields, as written before this shipped
    const next = buildCloudFileDoc('new.ifc', 5, 0, 'p', 'bob@x.com', legacy, 2000);
    expect(next.version).toBe(2);
    expect(next.history!.map(h => h.version)).toEqual([2, 1]);
    expect(next.history![1].uploadedBy).toBe('a@b.com'); // the legacy record's own upload
  });
});

describe('fileHistory', () => {
  it('synthesizes a single entry for a record written before history existed', () => {
    expect(fileHistory(mkFile('A', 'legacy.ifc'))).toEqual([
      { version: 1, name: 'legacy.ifc', size: 100, uploadedBy: 'a@b.com', uploadedAt: 1 },
    ]);
  });
  it('returns the stored history when present', () => {
    const entries = [{ version: 2, name: 'b', size: 2, uploadedBy: 'b@x', uploadedAt: 20 }];
    expect(fileHistory({ ...mkFile('A'), version: 2, history: entries })).toBe(entries);
  });
  it('returns nothing for a missing record', () => {
    expect(fileHistory(null)).toEqual([]);
    expect(fileHistory(undefined)).toEqual([]);
  });
});

describe('nextFileVersion', () => {
  it('is 1 with no existing record and increments otherwise', () => {
    expect(nextFileVersion(null)).toBe(1);
    expect(nextFileVersion(mkFile('A'))).toBe(2); // legacy record counts as v1
    expect(nextFileVersion({ ...mkFile('A'), version: 7 })).toBe(8);
  });
});

describe('appendFileVersion', () => {
  const entry = (v: number) => ({ version: v, name: 'f', size: 1, uploadedBy: 'a@x', uploadedAt: v });

  it('prepends so the newest version reads first', () => {
    expect(appendFileVersion([entry(1)], entry(2)).map(e => e.version)).toEqual([2, 1]);
  });
  it('caps the log so a long-lived slot cannot outgrow the Firestore doc limit', () => {
    let history = [entry(1)];
    for (let v = 2; v <= MAX_FILE_HISTORY + 5; v++) history = appendFileVersion(history, entry(v));
    expect(history).toHaveLength(MAX_FILE_HISTORY);
    expect(history[0].version).toBe(MAX_FILE_HISTORY + 5); // newest kept
    expect(history[history.length - 1].version).toBe(6);   // oldest dropped
  });
});

describe('exceedsUploadQuota', () => {
  it('matches the Storage rules 500MB cap', () => {
    expect(exceedsUploadQuota(MAX_UPLOAD_BYTES - 1)).toBe(false);
    expect(exceedsUploadQuota(MAX_UPLOAD_BYTES)).toBe(true);
    expect(exceedsUploadQuota(MAX_UPLOAD_BYTES + 1)).toBe(true);
  });
});

describe('sumStorageUsage', () => {
  it('sums the size field across records', () => {
    const files = [mkFile('A'), mkFile('B'), mkFile(2)].map((f, i) => ({ ...f, size: (i + 1) * 100 }));
    expect(sumStorageUsage(files)).toBe(600);
  });
  it('returns 0 for an empty list', () => {
    expect(sumStorageUsage([])).toBe(0);
  });
});

describe('formatBytes', () => {
  it('formats across unit ranges', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
  });
});
