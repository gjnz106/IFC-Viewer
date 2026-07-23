import { describe, it, expect } from 'vitest';
import { visibleCategories, toggleCategorySelection } from './navigation-panel.js';

const ALL = ['IfcWall', 'IfcSlab', 'IfcColumn'];

describe('visibleCategories', () => {
  it('empty set = all visible', () => {
    expect(visibleCategories(new Set(), ALL)).toEqual(new Set(ALL));
  });
  it('__none__ sentinel = all hidden', () => {
    expect(visibleCategories(new Set(['__none__']), ALL)).toEqual(new Set());
  });
  it('explicit subset = just those (intersected with known cats)', () => {
    expect(visibleCategories(new Set(['IfcWall', 'IfcGhost']), ALL)).toEqual(new Set(['IfcWall']));
  });
});

describe('toggleCategorySelection', () => {
  it('hiding one from "all" yields the remaining subset', () => {
    expect(toggleCategorySelection(new Set(), ALL, 'IfcWall')).toEqual(new Set(['IfcSlab', 'IfcColumn']));
  });
  it('hiding the last visible category yields the __none__ sentinel', () => {
    // from all-hidden-but-one → hide it → none
    expect(toggleCategorySelection(new Set(['IfcWall']), ALL, 'IfcWall')).toEqual(new Set(['__none__']));
  });
  it('showing one from "none" yields a single-item subset', () => {
    expect(toggleCategorySelection(new Set(['__none__']), ALL, 'IfcSlab')).toEqual(new Set(['IfcSlab']));
  });
  it('showing the last missing category collapses back to empty (= all)', () => {
    // IfcWall+IfcSlab visible, add IfcColumn → all three → normalise to empty
    expect(toggleCategorySelection(new Set(['IfcWall', 'IfcSlab']), ALL, 'IfcColumn')).toEqual(new Set());
  });
  it('round-trips: hide then show returns to all-visible', () => {
    const afterHide = toggleCategorySelection(new Set(), ALL, 'IfcColumn');
    expect(afterHide).toEqual(new Set(['IfcWall', 'IfcSlab']));
    expect(toggleCategorySelection(afterHide, ALL, 'IfcColumn')).toEqual(new Set());
  });
});
