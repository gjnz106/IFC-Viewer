import { describe, it, expect } from 'vitest';
import {
  slotIndexToKey, keyToSlotIndex, orderFilesForAutoLoad,
  formatUploadProgress, shouldConfirmOverwrite, syncChipLabel, buildCloudFileDoc,
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
});
