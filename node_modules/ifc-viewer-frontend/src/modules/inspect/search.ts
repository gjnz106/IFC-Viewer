// ══════════════════════════════════════════════════════════════════════
// ── ELEMENT SEARCH & FILTER ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// Search elements across all loaded models by name, type, tag, property.
// Results can be clicked to highlight+zoom, or bulk isolated/hidden.

import * as THREE from 'three';
import { appState } from '../../state/index.js';
import { log } from '../core/ifc-category.js';

// Cross-module functions/values
declare const getAllProps: (modelID: number) => Promise<Record<string, any>>;
declare const IFC_NAMES: Record<number, string>;
declare const sgIfcCodeToClass: (code: number) => string;
declare const getElementBBox: (modelIdx: number, eid: number) => any;
declare const showProps: (props: any, modelIdx: number) => void;
declare const clearHighlight: () => void;
declare const escapeHtml: (s: any) => string;
declare const forEachModel: (cb: (model: any) => void) => void;

let _searchCache: { elements: any[]; propNames: string[]; typeNames: string[]; key: string } | null = null;
let _searchResults: any[] = [];
let _searchTimer: ReturnType<typeof setTimeout> | null = null;
let _searchSelectedIdx = -1;

// Build search cache from all loaded models (reuses getAllProps)
async function searchBuildCache(){
  const key = appState.loadedModels.map((m: any) => m?.modelID).join('-');
  if(_searchCache && _searchCache.key === key) return _searchCache;

  const elements: any[] = [];
  const typeSet = new Set<string>();
  const propNameSet = new Set<string>();

  for(let mi=0; mi<appState.loadedModels.length; mi++){
    const m = appState.loadedModels[mi];
    if(!m) continue;
    const props = await getAllProps(m.modelID);

    // Also batch-read psets for property search
    const mgr = appState.ifcLoader?.ifcManager;
    const api = mgr?.state?.api;
    const psetLookup = new Map<number, any[]>();
    if(api){
      try{
        const relIDs = api.GetLineIDsWithType(m.modelID, 4186316022);
        for(let ri=0; ri<relIDs.size(); ri++){
          try{
            const rel = await mgr.getItemProperties(m.modelID, relIDs.get(ri), false);
            if(!rel?.RelatingPropertyDefinition) continue;
            const pdefID = rel.RelatingPropertyDefinition.value ?? rel.RelatingPropertyDefinition;
            if(typeof pdefID !== 'number') continue;
            let relatedEIDs: number[] = [];
            if(Array.isArray(rel.RelatedObjects)) relatedEIDs = rel.RelatedObjects.map((o: any) => o.value ?? o).filter((v: any) => typeof v==='number');
            else if(rel.RelatedObjects?.value) relatedEIDs = [rel.RelatedObjects.value];
            let pset;
            try{ pset = await mgr.getItemProperties(m.modelID, pdefID, true); }catch(e){ continue; }
            if(!pset) continue;
            for(const eid of relatedEIDs){
              if(!psetLookup.has(eid)) psetLookup.set(eid, []);
              psetLookup.get(eid)!.push(pset);
            }
          }catch(e){}
        }
      }catch(e){}
    }

    for(const gid in props){
      const p = props[gid];
      const typeName = IFC_NAMES[p.type] || sgIfcCodeToClass(p.type);
      typeSet.add(typeName);

      // Collect property names + values from psets
      const psets = psetLookup.get(p.expressID) || [];
      const propMap = new Map<string, { value: any; psetName: string }>();
      for(const ps of psets){
        const psetName = ps.Name?.value || '';
        const hps = Array.isArray(ps.HasProperties) ? ps.HasProperties : (ps.HasProperties ? [ps.HasProperties] : []);
        for(const hp of hps){
          if(!hp?.Name?.value) continue;
          const pn = hp.Name.value;
          propNameSet.add(pn);
          const nv = hp.NominalValue;
          propMap.set(pn, { value: nv?.value ?? nv ?? null, psetName });
        }
        const qs = Array.isArray(ps.Quantities) ? ps.Quantities : (ps.Quantities ? [ps.Quantities] : []);
        for(const q of qs){
          if(!q?.Name?.value) continue;
          propNameSet.add(q.Name.value);
          const val = q.LengthValue?.value ?? q.AreaValue?.value ?? q.VolumeValue?.value ?? q.CountValue?.value ?? null;
          propMap.set(q.Name.value, { value: val, psetName: ps.Name?.value || '' });
        }
      }

      elements.push({
        eid: p.expressID,
        globalId: gid,
        name: (p.name || '').trim(),
        type: typeName,
        typeCode: p.type,
        tag: p.tag || '',
        modelIdx: mi,
        modelID: m.modelID,
        props: propMap,
        // Searchable text: concatenate name + type + tag + all prop values
        _text: [(p.name||''), typeName, (p.tag||''), ...Array.from(propMap.values()).map((v: any) => String(v.value||''))].join(' ').toLowerCase()
      });
    }
  }

  _searchCache = {
    elements,
    propNames: Array.from(propNameSet).sort(),
    typeNames: Array.from(typeSet).sort(),
    key
  };
  log(`Search cache: ${elements.length} elements, ${propNameSet.size} property names, ${typeSet.size} types`);
  return _searchCache;
}

// Initialize search panel: populate type dropdown and property datalist
async function searchInit(){
  if(!appState.loadedModels.some((m: any) => !!m)){
    document.getElementById('searchStatsText')!.textContent = 'Load a model to search';
    return;
  }
  document.getElementById('searchStatsText')!.textContent = '⏳ Building search index…';
  await new Promise(r => setTimeout(r, 10));

  const cache = await searchBuildCache();

  // Populate type dropdown
  const sel = document.getElementById('searchTypeFilter') as HTMLSelectElement;
  const curVal = sel.value;
  sel.innerHTML = '<option value="">All types (' + cache.typeNames.length + ')</option>';
  for(const t of cache.typeNames){
    sel.innerHTML += '<option value="' + escapeHtml(t) + '">' + t.replace('Ifc','') + '</option>';
  }
  sel.value = curVal;

  // Populate property datalist for advanced filter
  const dl = document.getElementById('searchPropList')!;
  dl.innerHTML = cache.propNames.slice(0, 200).map(n => '<option value="' + escapeHtml(n) + '">').join('');

  document.getElementById('searchStatsText')!.textContent = cache.elements.length + ' elements indexed';
}

// Debounced search trigger
function searchDebounce(){
  if(_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(searchRun, 250);
}

// Run search with current filters
async function searchRun(){
  if(!_searchCache) await searchBuildCache();
  if(!_searchCache) return;

  const query = ((document.getElementById('searchInput') as HTMLInputElement).value || '').trim().toLowerCase();
  const typeFilter = (document.getElementById('searchTypeFilter') as HTMLSelectElement).value;
  const advProp = ((document.getElementById('searchAdvProp') as HTMLInputElement).value || '').trim();
  const advOp = (document.getElementById('searchAdvOp') as HTMLSelectElement).value;
  const advVal = ((document.getElementById('searchAdvVal') as HTMLInputElement).value || '').trim();
  const advActive = document.getElementById('searchAdv')!.classList.contains('show') && advProp;

  // Check chip states
  const chips = document.querySelectorAll('#searchPanel .search-chip');
  const missingMode = chips[0]?.classList.contains('on');
  const hasMode = chips[1]?.classList.contains('on');
  const chipProp = missingMode || hasMode ? advProp : '';

  let results = _searchCache.elements;

  // Text search
  if(query){
    const terms = query.split(/\s+/);
    results = results.filter(e => terms.every(t => e._text.includes(t)));
  }

  // Type filter
  if(typeFilter){
    results = results.filter(e => e.type === typeFilter);
  }

  // Missing/Has property chip
  if(chipProp && (missingMode || hasMode)){
    results = results.filter(e => {
      const has = e.props.has(chipProp);
      const val = e.props.get(chipProp)?.value;
      const hasValue = has && val !== null && val !== undefined && val !== '';
      return missingMode ? !hasValue : hasValue;
    });
  }

  // Advanced property filter
  if(advActive && !missingMode && !hasMode){
    results = results.filter(e => {
      const p = e.props.get(advProp);
      const val = p?.value;
      switch(advOp){
        case 'exists': return val !== null && val !== undefined && val !== '';
        case 'empty': return val === null || val === undefined || val === '';
        case 'eq': return String(val).toLowerCase() === advVal.toLowerCase();
        case 'neq': return String(val).toLowerCase() !== advVal.toLowerCase();
        case 'contains': return String(val||'').toLowerCase().includes(advVal.toLowerCase());
        case 'gt': return Number(val) > Number(advVal);
        case 'lt': return Number(val) < Number(advVal);
        case 'gte': return Number(val) >= Number(advVal);
        case 'lte': return Number(val) <= Number(advVal);
        default: return true;
      }
    });
  }

  _searchResults = results;
  _searchSelectedIdx = -1;
  searchRenderResults();
}

function searchRenderResults(){
  const container = document.getElementById('searchResults')!;
  const statsText = document.getElementById('searchStatsText')!;
  const countBadge = document.getElementById('searchCount')!;
  const actionsBar = document.getElementById('searchActions')!;

  const total = _searchCache?.elements?.length || 0;
  const count = _searchResults.length;
  statsText.textContent = count + ' / ' + total + ' elements';
  countBadge.textContent = String(count);
  countBadge.style.display = count > 0 ? '' : 'none';
  actionsBar.style.display = count > 0 ? '' : 'none';

  // Render max 500 results
  const maxShow = Math.min(count, 500);
  let html = '';
  for(let i=0; i<maxShow; i++){
    const e = _searchResults[i];
    const shortType = e.type.replace('Ifc','');
    const tagHtml = e.tag ? '<span class="search-item-tag">#'+escapeHtml(e.tag)+'</span>' : '';
    html += `<div class="search-item" onclick="searchSelect(${i})" data-idx="${i}">
      <div class="search-item-name">${escapeHtml(e.name || '(unnamed)')}</div>
      <div class="search-item-meta"><span>${shortType}</span>${tagHtml}<span style="opacity:.5">M${e.modelIdx}</span></div>
    </div>`;
  }
  if(count > maxShow) html += `<div class="search-item" style="text-align:center;color:var(--text-muted);font-size:10px">… and ${count-maxShow} more (narrow your search)</div>`;
  if(count === 0) html = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:11px">No elements match</div>';
  container.innerHTML = html;
}

// Select and focus a search result
window.searchSelect = async function(idx: number){
  if(idx < 0 || idx >= _searchResults.length) return;
  _searchSelectedIdx = idx;
  const e = _searchResults[idx];

  // Update selection styling
  document.querySelectorAll('.search-item').forEach((el, i) => el.classList.toggle('selected', i===idx));

  // Highlight element in 3D
  if(!appState.loadedModels[e.modelIdx]) return;
  const modelID = appState.loadedModels[e.modelIdx].modelID;

  // Show properties
  try{
    const props = await appState.ifcLoader!.ifcManager.getItemProperties(modelID, e.eid, true);
    if(props) showProps(props, e.modelIdx);
  }catch(err){}

  // Highlight
  try{
    clearHighlight();
    if(!window._hlMat) window._hlMat = new THREE.MeshPhongMaterial({color:0x2563eb,transparent:true,opacity:0.6,side:THREE.DoubleSide,depthTest:true,clippingPlanes:appState.clipPlanes});
    const sub = appState.ifcLoader!.ifcManager.createSubset({modelID, ids:[e.eid], material:window._hlMat, scene:appState.scene, removePrevious:true, customID:'userHighlight'});
    if(sub){ sub.position.copy(appState.loadedModels[e.modelIdx].position); sub.updateMatrixWorld(true); window._lastHL={subset:sub,mid:modelID}; }
  }catch(err){}

  // Zoom to element
  const bbox = getElementBBox(e.modelIdx, e.eid);
  if(bbox?.center){
    const size = Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
    const d = Math.max(size*2.5, 3);
    appState.camera!.position.set(bbox.center.x+d*0.5, bbox.center.y+d*0.4, bbox.center.z+d*0.5);
    appState.controls!.target.copy(bbox.center);
    appState.controls!.update();
  }
};

// Bulk actions on search results
window.searchIsolateAll = function(){
  if(!_searchResults.length) return;
  // Hide everything, then show only results
  forEachModel((model: any) => {
    model.traverse((c: any) => { if(c.isMesh) c.visible=false; });
  });
  // Show matched elements via subsets
  const byModel = new Map<number, number[]>();
  for(const e of _searchResults){
    if(!byModel.has(e.modelIdx)) byModel.set(e.modelIdx, []);
    byModel.get(e.modelIdx)!.push(e.eid);
  }
  for(const [mi, eids] of byModel){
    if(!appState.loadedModels[mi]) continue;
    try{
      const mat = new THREE.MeshPhongMaterial({color:0x22c55e,transparent:true,opacity:0.8,side:THREE.DoubleSide,depthTest:true,clippingPlanes:appState.clipPlanes});
      const sub = appState.ifcLoader!.ifcManager.createSubset({modelID:appState.loadedModels[mi].modelID, ids:eids, material:mat, scene:appState.scene, removePrevious:false, customID:'searchIsolate_'+mi});
      if(sub){ sub.position.copy(appState.loadedModels[mi].position); sub.updateMatrixWorld(true); }
    }catch(e){}
  }
  document.getElementById('btnShowAll')!.style.display='';
  log(`Search: isolated ${_searchResults.length} elements`);
};

window.searchHideAll = function(){
  if(!_searchResults.length) return;
  const hideSet = new Set(_searchResults.map(e => e.eid));
  forEachModel((model: any) => {
    model.traverse((c: any) => {
      if(!c.isMesh) return;
      if(c.geometry?.attributes?.expressID){
        const arr = c.geometry.attributes.expressID.array;
        const eids = new Set<number>();
        for(let i=0; i<arr.length; i++) eids.add(arr[i]);
        for(const eid of eids){
          if(hideSet.has(eid)){ c.visible=false; break; }
        }
      }
    });
  });
  document.getElementById('btnShowAll')!.style.display='';
  log(`Search: hidden ${_searchResults.length} elements`);
};

window.searchSelectAll = function(){
  // Select all results — scroll to first
  if(_searchResults.length > 0) (window as any).searchSelect(0);
};

window.searchClear = function(){
  (document.getElementById('searchInput') as HTMLInputElement).value = '';
  (document.getElementById('searchTypeFilter') as HTMLSelectElement).value = '';
  (document.getElementById('searchAdvProp') as HTMLInputElement).value = '';
  (document.getElementById('searchAdvVal') as HTMLInputElement).value = '';
  document.querySelectorAll('#searchPanel .search-chip').forEach(c => c.classList.remove('on'));
  document.getElementById('searchAdv')!.classList.remove('show');
  _searchResults = [];
  _searchSelectedIdx = -1;
  document.getElementById('searchResults')!.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:11px">Type to search elements</div>';
  document.getElementById('searchCount')!.style.display = 'none';
  document.getElementById('searchActions')!.style.display = 'none';
  document.getElementById('searchStatsText')!.textContent = (_searchCache?.elements?.length||0) + ' elements indexed';
};

window.searchToggleChip = function(el: HTMLElement, mode: string){
  // Toggle chip, ensure mutual exclusivity between missing/has
  const wasOn = el.classList.contains('on');
  document.querySelectorAll('#searchPanel .search-chip').forEach(c => c.classList.remove('on'));
  if(!wasOn){
    el.classList.add('on');
    // Show advanced panel for property name input
    document.getElementById('searchAdv')!.classList.add('show');
    (document.getElementById('searchAdvProp') as HTMLInputElement).focus();
    // Set appropriate operator
    (document.getElementById('searchAdvOp') as HTMLSelectElement).value = mode === 'missing' ? 'empty' : 'exists';
  }
  searchRun();
};

window.searchToggleAdvanced = function(){
  document.getElementById('searchAdv')!.classList.toggle('show');
};

// Export public functions for use in main.ts or HTML
export { searchInit, searchDebounce, searchRun };
