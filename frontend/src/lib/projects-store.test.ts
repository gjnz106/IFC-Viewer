import { describe, it, expect } from 'vitest';
import {
  createProject, renameProject, deleteProject, setActive, getActiveProject,
  updateProjectState, type ProjectRegistry,
} from './projects-store.js';

function emptyReg(): ProjectRegistry {
  return { activeId: '', list: [] };
}

describe('projects-store', () => {
  it('createProject adds a project and makes it active', () => {
    const reg = createProject(emptyReg(), 'City Tower', 'CT-P1');
    expect(reg.list).toHaveLength(1);
    expect(reg.activeId).toBe(reg.list[0].id);
    expect(reg.list[0].name).toBe('City Tower');
    expect(reg.list[0].code).toBe('CT-P1');
  });

  it('renameProject updates name/code without touching other projects', () => {
    let reg = createProject(emptyReg(), 'A', 'A1');
    reg = createProject(reg, 'B', 'B1');
    const idA = reg.list[0].id;
    reg = renameProject(reg, idA, 'A renamed', 'A2');
    expect(reg.list[0].name).toBe('A renamed');
    expect(reg.list[0].code).toBe('A2');
    expect(reg.list[1].name).toBe('B');
  });

  it('renameProject with blank name keeps the previous name', () => {
    let reg = createProject(emptyReg(), 'Keep Me', 'K1');
    const id = reg.list[0].id;
    reg = renameProject(reg, id, '   ', 'K2');
    expect(reg.list[0].name).toBe('Keep Me');
    expect(reg.list[0].code).toBe('K2');
  });

  it('updateProjectState merges partial state', () => {
    let reg = createProject(emptyReg(), 'A', 'A1');
    const id = reg.list[0].id;
    reg = updateProjectState(reg, id, { units: 'm' });
    expect(reg.list[0].state.units).toBe('m');
  });

  it('deleteProject on the active project promotes the first remaining project', () => {
    let reg = createProject(emptyReg(), 'A', 'A1');
    reg = createProject(reg, 'B', 'B1'); // B becomes active
    const idA = reg.list[0].id;
    const idB = reg.list[1].id;
    expect(reg.activeId).toBe(idB);
    reg = deleteProject(reg, idB);
    expect(reg.list).toHaveLength(1);
    expect(reg.activeId).toBe(idA);
  });

  it('deleteProject on a non-active project leaves activeId untouched', () => {
    let reg = createProject(emptyReg(), 'A', 'A1');
    reg = createProject(reg, 'B', 'B1');
    const idA = reg.list[0].id;
    const idB = reg.list[1].id;
    reg = deleteProject(reg, idA);
    expect(reg.list).toHaveLength(1);
    expect(reg.activeId).toBe(idB);
  });

  it('deleteProject on the last project recreates a fresh Default Project', () => {
    let reg = createProject(emptyReg(), 'Only', 'O1');
    const id = reg.list[0].id;
    reg = deleteProject(reg, id);
    expect(reg.list).toHaveLength(1);
    expect(reg.list[0].name).toBe('Default Project');
    expect(reg.activeId).toBe(reg.list[0].id);
    expect(reg.list[0].id).not.toBe(id);
  });

  it('setActive switches the active project', () => {
    let reg = createProject(emptyReg(), 'A', 'A1');
    reg = createProject(reg, 'B', 'B1');
    const idA = reg.list[0].id;
    reg = setActive(reg, idA);
    expect(reg.activeId).toBe(idA);
  });

  it('setActive on an unknown id is a no-op', () => {
    const reg = createProject(emptyReg(), 'A', 'A1');
    const before = reg.activeId;
    const after = setActive(reg, 'does-not-exist');
    expect(after.activeId).toBe(before);
    expect(after).toBe(reg); // unchanged reference — true no-op
  });

  it('getActiveProject returns the active project, falling back to the first', () => {
    let reg = createProject(emptyReg(), 'A', 'A1');
    reg = createProject(reg, 'B', 'B1');
    expect(getActiveProject(reg)?.name).toBe('B');
    reg = { ...reg, activeId: 'missing' };
    expect(getActiveProject(reg)?.name).toBe('A'); // falls back to list[0]
  });
});
