// ══════════════════════════════════════════════════════════════════════
// COLORIZE — Dalux-style property-based coloring
// User picks a property (Category/Type/Name/Tag); app auto-assigns distinct
// colors to each distinct value and creates a subset per value. Legend shows
// each value with a color swatch (clickable to override) and count. Model
// elements not matching (no value for that property) stay at a faded default.
// Mutex with Compare mode — entering one exits the other.
// ══════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { appState } from '../state/index.js';
import { log, ifcClassToRevitCategory } from './ifc-category.js';

// Global state for the colorize overlay is now in appState.colorize.
// Supports two modes:
//   - 'auto'  : color by property (Category / Type); legend lists values
//   - 'rules' : user-defined rules, first match wins (OR between rules).
// `subsets` keeps references so we can dispose them cleanly when switching
// property, toggling visibility, or clearing.

// Valid operator set for Rules mode. Case-insensitive string comparisons.
// 'equals' | 'contains' | 'starts' | 'ne'
export const CZ_OPERATORS: { v: string; label: string }[] = [
  {v:'equals',   label:'equals'},
  {v:'contains', label:'contains'},
  {v:'starts',   label:'starts with'},
  {v:'ne',       label:'not equals'},
];

// Valid properties for Rules mode conditions (bigger set than Auto mode).
// Name/Tag allowed here because user enters a specific value — not enumerated.
// File lets users write rules like "everything in model A → red".
export const CZ_RULE_PROPS: { v: string; label: string }[] = [
  {v:'category', label:'Category'},
  {v:'type',     label:'Type'},
  {v:'name',     label:'Name'},
  {v:'tag',      label:'Tag / Element ID'},
  {v:'file',     label:'File (A vs B)'},
];

// Curated 24-hue palette: spread around color wheel with mixed lightness so
// adjacent values in legend always read distinct. Avoids red (reserved for
// compare-REMOVED) and pure green (compare-ADDED) where possible.
export const COLORIZE_PALETTE: string[] = [
  '#2563eb','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316',
  '#06b6d4','#a855f7','#84cc16','#f43f5e','#0ea5e9','#eab308',
  '#6366f1','#d946ef','#10b981','#ef4444','#3b82f6','#22c55e',
  '#a3e635','#fb7185','#38bdf8','#fbbf24','#c084fc','#4ade80',
];

// Deterministic hash → palette index so the same value always gets the same
// color across re-coloring cycles. Users can still override via color picker.
function colorizeHash(s: string): number {
  let h=0;
  for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
  return h;
}
function colorForValue(v: string): string {
  if(appState.colorize.valueColors[v])return appState.colorize.valueColors[v];
  return COLORIZE_PALETTE[colorizeHash(String(v))%COLORIZE_PALETTE.length];
}

// Main toggle — called from the Colorize button. Enters the mode, builds the
// property value index, and shows the legend. Mutex with compare mode.
window.toggleColorize=async function(){
  if(appState.colorize.active){colorizeClear();return}
  if(!appState.loadedModels.some(m=>!!m)){
    log('Colorize: no models loaded');return;
  }
  // If compare is active, exit it first — mutex.
  if(appState.compareResult){
    log('Colorize: exiting compare mode first (mutex)');
    try{(window as any).exitCompare&&(window as any).exitCompare()}catch(e){}
  }
  appState.colorize.active=true;
  document.getElementById('btnColorize')!.classList.add('active');
  document.getElementById('colorizePanel')!.classList.add('show');
  // Sync tab state + subview visibility based on persisted mode
  document.getElementById('czTabAuto')!.classList.toggle('active',appState.colorize.mode==='auto');
  document.getElementById('czTabRules')!.classList.toggle('active',appState.colorize.mode==='rules');
  document.getElementById('czViewAuto')!.style.display=(appState.colorize.mode==='auto')?'':'none';
  document.getElementById('czViewRules')!.style.display=(appState.colorize.mode==='rules')?'flex':'none';
  // If returning to Rules mode with existing rules, render them
  if(appState.colorize.mode==='rules')colorizeRenderRules();
  await applyColorize();
};

// Apply the current coloring. Dispatcher based on mode. Called whenever the
// coloring state should be re-rendered (mode toggle, property change, rule
// edit, color change).
window.applyColorize=async function(){
  if(!appState.colorize.active)return;
  // Always reset: clear subsets + ensure base is faded.
  colorizeDisposeSubsets();
  colorizeFadeBase(true);
  // Load props cache if missing (shared between modes).
  await colorizeLoadPropsCache();
  if(appState.colorize.mode==='rules'){
    await applyColorizeRules();
  }else{
    await applyColorizeAuto();
  }
};

// Ensure props are loaded & cached for both loaded models. Shared by both
// modes. Reshapes getAllProps() output from {globalId: entity} to
// {expressID: entity} for fast rule evaluation.
async function colorizeLoadPropsCache(): Promise<void> {
  for(let mi=0;mi<2;mi++){
    if(!appState.loadedModels[mi])continue;
    if(appState.colorize.propsCache[mi])continue;
    try{
      const p=await (window as any).getAllProps(appState.loadedModels[mi]!.userData.modelID ?? (appState.loadedModels[mi] as any).modelID);
      const byEid: Record<number, any>={};
      // Source filename for "Color by file" — used as the property value for
      // the File dropdown option. Label becomes "A — name.ifc" / "B — other.ifc"
      // so user can tell which slot each bucket belongs to.
      const slotLabel=mi===0?'A':'B';
      const fname=appState.files[mi]?.name||'(Model '+slotLabel+')';
      const sourceLabel=slotLabel+' — '+fname;
      for(const gid in p){
        p[gid]._sourceFile=sourceLabel;
        byEid[p[gid].expressID]=p[gid];
      }
      appState.colorize.propsCache[mi]=byEid;
    }catch(e: any){
      log('Colorize: getAllProps failed for model '+mi,e?.message);
      appState.colorize.propsCache[mi]={};
    }
  }
}

// AUTO mode: color by single property (Category or Type). Builds
// value→expressIDs index, creates one colored subset per value, populates
// legend with swatches + eye toggles + element counts.
async function applyColorizeAuto(): Promise<void> {
  // Sync property dropdown into state
  const sel=document.getElementById('czProp') as HTMLSelectElement | null;
  if(sel)appState.colorize.property=sel.value||'category';

  // Build value → {expressIDs per model} index
  const idx: Record<string, {0: Set<number>; 1: Set<number>}> = {};
  for(let mi=0;mi<2;mi++){
    const props=appState.colorize.propsCache[mi];
    if(!props)continue;
    for(const eid in props){
      const e=props[eid];
      const v=colorizeGetValue(e, appState.colorize.property);
      if(v===null||v===undefined||v==='')continue;
      if(!idx[v])idx[v]={0:new Set(),1:new Set()};
      idx[v][mi as 0|1].add(+eid);
    }
  }

  const entries=Object.entries(idx).map(([v,perModel])=>({
    value:v,
    count:perModel[0].size+perModel[1].size,
    perModel,
  })).sort((a,b)=>b.count-a.count);

  // Unique cycleId so web-ifc-three's subset cache doesn't return stale meshes
  const cycleId=Date.now()+'_'+Math.random().toString(36).slice(2,8);

  for(const e of entries){
    if(appState.colorize.valueVisible[e.value]===false)continue;
    const hex=colorForValue(e.value);
    const mat=new THREE.MeshPhongMaterial({
      color:new THREE.Color(hex),
      transparent:false,opacity:1.0,side:THREE.DoubleSide,
      depthWrite:true,clippingPlanes:appState.clipPlanes,
    });
    for(let mi=0;mi<2;mi++){
      const ids=[...e.perModel[mi as 0|1]];
      if(!ids.length)continue;
      try{
        const sub=appState.ifcLoader.ifcManager.createSubset({
          modelID:(appState.loadedModels[mi] as any).modelID,
          ids,material:mat,scene:appState.scene,removePrevious:false,
          customID:'cz_'+cycleId+'_'+mi+'_'+colorizeHash(e.value),
        });
        if(sub){
          sub.position.copy(appState.loadedModels[mi]!.position);
          sub.updateMatrixWorld(true);
          sub.userData.colorizeValue=e.value;
          sub.userData.srcModelIdx=mi;
          sub.traverse((ch: any)=>{if(ch.isMesh){ch.userData.srcModelIdx=mi;ch.userData.colorizeValue=e.value}});
          // Honor the current model-visibility state: if user has un-checked
          // Version A/B, the new subset for that model should also be hidden.
          const visChk=document.getElementById(mi===0?'visA':'visB') as HTMLInputElement | null;
          if(visChk && !visChk.checked)sub.visible=false;
          appState.colorize.subsets.push(sub);
        }
      }catch(err: any){log('Colorize subset error for value '+e.value,err?.message)}
    }
  }

  colorizeRenderLegend(entries);
  log('Colorize[auto]: '+entries.length+' values for '+appState.colorize.property);
}

// RULES mode: first matching rule wins (OR between rules, priority by order).
// Iterate elements across both models; for each element evaluate rules
// top-down; assign to the rule index that matches first. Then build one
// colored subset per rule from its assigned elements.
async function applyColorizeRules(): Promise<void> {
  // Initialize rule→{perModel Set} buckets
  const buckets: Array<{0: Set<number>; 1: Set<number>; count: number}> =
    appState.colorize.rules.map(()=>({0:new Set<number>(),1:new Set<number>(),count:0}));

  // Iterate entities, test rules in priority order
  for(let mi=0;mi<2;mi++){
    const props=appState.colorize.propsCache[mi];
    if(!props)continue;
    for(const eid in props){
      const e=props[eid];
      const ri=evaluateRules(e);
      if(ri<0)continue; // no rule matches → stays faded
      buckets[ri][mi as 0|1].add(+eid);
      buckets[ri].count++;
    }
  }

  // Update each rule's matched count in state so legend shows counts
  appState.colorize.rules.forEach((r: any,ri: number)=>{r._count=buckets[ri].count});

  // Create one subset per rule
  const cycleId=Date.now()+'_'+Math.random().toString(36).slice(2,8);
  for(let ri=0;ri<appState.colorize.rules.length;ri++){
    const rule=appState.colorize.rules[ri];
    const bucket=buckets[ri];
    if(!bucket.count)continue;
    const mat=new THREE.MeshPhongMaterial({
      color:new THREE.Color(rule.color),
      transparent:false,opacity:1.0,side:THREE.DoubleSide,
      depthWrite:true,clippingPlanes:appState.clipPlanes,
    });
    for(let mi=0;mi<2;mi++){
      const ids=[...bucket[mi as 0|1]];
      if(!ids.length)continue;
      try{
        const sub=appState.ifcLoader.ifcManager.createSubset({
          modelID:(appState.loadedModels[mi] as any).modelID,
          ids,material:mat,scene:appState.scene,removePrevious:false,
          customID:'czr_'+cycleId+'_'+mi+'_'+ri,
        });
        if(sub){
          sub.position.copy(appState.loadedModels[mi]!.position);
          sub.updateMatrixWorld(true);
          sub.userData.colorizeRuleId=rule.id;
          sub.userData.srcModelIdx=mi;
          sub.traverse((ch: any)=>{if(ch.isMesh){ch.userData.srcModelIdx=mi;ch.userData.colorizeRuleId=rule.id}});
          // Honor current model-visibility state (see applyColorizeAuto notes)
          const visChk=document.getElementById(mi===0?'visA':'visB') as HTMLInputElement | null;
          if(visChk && !visChk.checked)sub.visible=false;
          appState.colorize.subsets.push(sub);
        }
      }catch(err: any){log('Colorize rule subset error for rule '+ri,err?.message)}
    }
  }

  colorizeRenderRules();
  log('Colorize[rules]: '+appState.colorize.rules.length+' rules, '+appState.colorize.subsets.length+' subsets created');
}

// Evaluate entity against rules in priority order. Returns the index of the
// first matching rule, or -1 if none match. A rule matches if ALL its
// conditions match (AND). Empty rule (no conditions) matches nothing — by
// design, so an accidentally empty rule doesn't color everything.
function evaluateRules(entity: any): number {
  for(let i=0;i<appState.colorize.rules.length;i++){
    const rule=appState.colorize.rules[i];
    if(!rule.conditions||rule.conditions.length===0)continue;
    let allMatch=true;
    for(const c of rule.conditions){
      if(!evaluateCondition(entity,c)){allMatch=false;break}
    }
    if(allMatch)return i;
  }
  return -1;
}

// Evaluate a single condition against an entity. Case-insensitive for
// string operators. Empty condition value matches nothing.
function evaluateCondition(entity: any, cond: any): boolean {
  if(!cond||!cond.prop||!cond.op)return false;
  const want=(cond.value??'').toString().trim().toLowerCase();
  if(want==='')return false;
  let got=(colorizeGetValue(entity, cond.prop)||'').toString().trim().toLowerCase();
  // For the "file" property, `got` is formatted as "a — filename.ifc".
  // Treat 'equals A' / 'equals B' (single-letter) as a slot match so the user
  // doesn't have to type the full filename. Any longer value is treated as a
  // normal string match against the full label.
  if(cond.prop==='file' && (want==='a'||want==='b') && cond.op==='equals'){
    return got.startsWith(want+' ')||got===want;
  }
  switch(cond.op){
    case 'equals':   return got===want;
    case 'contains': return got.indexOf(want)>=0;
    case 'starts':   return got.startsWith(want);
    case 'ne':       return got!==want;
    default:         return false;
  }
}

// ── Rules mode: CRUD + render ─────────────────────────────────────────
// Rules live in appState.colorize.rules[]. Each rule: {id, name, color, conditions}.
// User edits go through these functions so state stays in sync with the DOM.

// Switch between Auto and Rules modes. Shows/hides the right subview and
// re-applies coloring so the viewport updates.
window.colorizeSetMode=async function(mode: string){
  appState.colorize.mode=(mode==='rules')?'rules':'auto';
  // Update tab active class
  document.getElementById('czTabAuto')!.classList.toggle('active',appState.colorize.mode==='auto');
  document.getElementById('czTabRules')!.classList.toggle('active',appState.colorize.mode==='rules');
  // Swap subviews
  document.getElementById('czViewAuto')!.style.display=(appState.colorize.mode==='auto')?'':'none';
  document.getElementById('czViewRules')!.style.display=(appState.colorize.mode==='rules')?'flex':'none';
  await applyColorize();
};

// Add a new rule at the end of the list. Auto-assigns a color from palette
// based on current rule count so new rules don't clash.
window.colorizeAddRule=async function(){
  const id='r_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const idx=appState.colorize.rules.length;
  // Pick a palette color the user hasn't used yet (cycles through palette)
  const used=new Set(appState.colorize.rules.map((r: any)=>r.color?.toLowerCase()));
  let color=COLORIZE_PALETTE[idx%COLORIZE_PALETTE.length];
  for(const c of COLORIZE_PALETTE){if(!used.has(c.toLowerCase())){color=c;break}}
  appState.colorize.rules.push({
    id,
    name:'Rule '+(idx+1),
    color,
    conditions:[{prop:'category',op:'equals',value:''}],
  });
  colorizeRenderRules();
  await applyColorize();
};

// Delete a rule by its index in appState.colorize.rules. Triggers re-render + re-apply.
window.colorizeDeleteRule=async function(ruleIdx: number){
  if(ruleIdx<0||ruleIdx>=appState.colorize.rules.length)return;
  appState.colorize.rules.splice(ruleIdx,1);
  colorizeRenderRules();
  await applyColorize();
};

// Set the color for a rule (called from the swatch <input type="color">).
// Patches matching subsets' materials in-place for instant feedback — same
// pattern as colorizeSetColor in Auto mode.
window.colorizeSetRuleColor=function(ruleIdx: number, hex: string){
  const rule=appState.colorize.rules[ruleIdx];
  if(!rule)return;
  rule.color=hex;
  const color=new THREE.Color(hex);
  for(const sub of appState.colorize.subsets){
    if(sub.userData.colorizeRuleId===rule.id){
      sub.traverse((ch: any)=>{if(ch.isMesh){
        const ms=Array.isArray(ch.material)?ch.material:[ch.material];
        ms.forEach((m: any)=>{m.color=color;m.needsUpdate=true});
      }});
    }
  }
  // Also update the DOM swatch so the picker stays in sync
  const sw=document.querySelector(`.cz-rule[data-rule-idx="${ruleIdx}"] .cz-swatch`) as HTMLElement | null;
  if(sw)sw.style.background=hex;
};

// Rename a rule (user typed in the name input). Pure state update, no re-apply.
window.colorizeSetRuleName=function(ruleIdx: number, name: string){
  const rule=appState.colorize.rules[ruleIdx];
  if(!rule)return;
  rule.name=name;
};

// Add a new condition to a rule. Default: Category equals "".
window.colorizeAddCondition=function(ruleIdx: number){
  const rule=appState.colorize.rules[ruleIdx];
  if(!rule)return;
  rule.conditions.push({prop:'category',op:'equals',value:''});
  colorizeRenderRules();
  // Don't re-apply on add (empty condition makes rule match nothing). User
  // will fill in value; the onchange will trigger apply.
};

// Remove a condition from a rule. If it was the last one, remove the rule
// entirely (an empty rule is useless).
window.colorizeRemoveCondition=async function(ruleIdx: number, condIdx: number){
  const rule=appState.colorize.rules[ruleIdx];
  if(!rule)return;
  rule.conditions.splice(condIdx,1);
  if(rule.conditions.length===0){
    appState.colorize.rules.splice(ruleIdx,1);
  }
  colorizeRenderRules();
  await applyColorize();
};

// Update a single condition field (prop / op / value). Called from all 3
// condition inputs' onchange.
window.colorizeUpdateCondition=async function(ruleIdx: number, condIdx: number, field: string, value: string){
  const rule=appState.colorize.rules[ruleIdx];
  if(!rule)return;
  const cond=rule.conditions[condIdx];
  if(!cond)return;
  cond[field]=value;
  // When the PROPERTY is changed, the value picker may need to switch between
  // a dropdown and free-text input (Category/File = dropdown, others = text).
  // Reset the old value and force a re-render of the rule cards.
  if(field==='prop'){
    cond.value='';
    colorizeRenderRules();
  }
  await applyColorize();
  // Don't re-render rule cards on value edit (would steal focus from input).
  // Count badge will update next time a full render happens; acceptable trade.
};

// Render the rule cards list. Called on every structural change (add/delete
// rule or condition, mode switch). Typing in input fields does NOT trigger
// render — would steal focus. Counts update on next apply cycle.
function colorizeRenderRules(): void {
  const host=document.getElementById('czRules');
  if(!host)return;
  if(!appState.colorize.rules.length){
    host.innerHTML='<div class="cz-list-empty">No rules yet.<br>Click <b>+ Add rule</b> to create one.<br><span style="font-size:11px">First matching rule wins.</span></div>';
    return;
  }
  const safeAttr=(s: any)=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Pre-compute distinct values for enumerable props. Only Category and File
  // have a bounded, short set of values — Type/Name/Tag are too granular and
  // stay as free-text inputs. Build once per render for efficiency.
  const distinctByProp: Record<string, string[]> = {
    category: colorizeGetDistinctValues('category'),
    file:     colorizeGetDistinctValues('file'),
  };

  let html='';
  appState.colorize.rules.forEach((rule: any,ri: number)=>{
    const cnt=rule._count||0;
    // Build conditions rows
    let condsHtml='';
    rule.conditions.forEach((cond: any,ci: number)=>{
      const prefix=ci===0 ? '<span class="cz-cond-and"></span>' : '<span class="cz-cond-and">AND</span>';
      const propOpts=CZ_RULE_PROPS.map(p=>`<option value="${p.v}"${cond.prop===p.v?' selected':''}>${p.label}</option>`).join('');
      const opOpts=CZ_OPERATORS.map(o=>`<option value="${o.v}"${cond.op===o.v?' selected':''}>${o.label}</option>`).join('');
      // Value input: dropdown for enumerable props (Category, File), free text
      // for the rest (Type/Name/Tag — too many unique values to enumerate).
      // For enumerable props, we also support 'contains'/'starts'/'ne' — the
      // dropdown just lets user pick a known value; the operator still applies.
      let valueHtml: string;
      const enumVals=distinctByProp[cond.prop];
      if(enumVals && enumVals.length){
        const valOpts=['<option value="">— pick —</option>']
          .concat(enumVals.map(v=>`<option value="${safeAttr(v)}"${cond.value===v?' selected':''}>${safeAttr(v)}</option>`))
          .join('');
        valueHtml=`<select class="cz-cond-val" onchange="colorizeUpdateCondition(${ri},${ci},'value',this.value)">${valOpts}</select>`;
      }else{
        valueHtml=`<input class="cz-cond-val" type="text" value="${safeAttr(cond.value||'')}" placeholder="value"
          onchange="colorizeUpdateCondition(${ri},${ci},'value',this.value)">`;
      }
      condsHtml+=`<div class="cz-cond">
        ${prefix}
        <select class="cz-cond-prop" onchange="colorizeUpdateCondition(${ri},${ci},'prop',this.value)">${propOpts}</select>
        <select class="cz-cond-op" onchange="colorizeUpdateCondition(${ri},${ci},'op',this.value)">${opOpts}</select>
        ${valueHtml}
        <button class="cz-cond-del" onclick="colorizeRemoveCondition(${ri},${ci})" title="Remove condition">×</button>
      </div>`;
    });
    html+=`<div class="cz-rule" data-rule-idx="${ri}">
      <div class="cz-rule-head">
        <span class="cz-rule-prio">#${ri+1}</span>
        <label class="cz-swatch" style="background:${rule.color}" title="Change color">
          <input type="color" value="${rule.color}" oninput="colorizeSetRuleColor(${ri}, this.value)">
        </label>
        <input class="cz-rule-name" type="text" value="${safeAttr(rule.name)}"
          onchange="colorizeSetRuleName(${ri}, this.value)" placeholder="Rule name">
        <span class="cz-rule-cnt" title="Matched elements">${cnt}</span>
        <button class="cz-rule-del" onclick="colorizeDeleteRule(${ri})" title="Delete rule">🗑</button>
      </div>
      <div class="cz-rule-conds">
        ${condsHtml}
        <button class="cz-cond-add" onclick="colorizeAddCondition(${ri})">+ condition</button>
      </div>
    </div>`;
  });
  host.innerHTML=html;
}

// Collect distinct values present in the loaded models for a given property.
// Used to populate dropdown value pickers for Category and File conditions
// in Rules mode. Returns sorted (by count desc where applicable, else alpha).
// For non-enumerable props (Type/Name/Tag) we intentionally return [] so the
// renderer falls back to a free-text input.
function colorizeGetDistinctValues(prop: string): string[] {
  if(prop!=='category' && prop!=='file')return [];
  const set=new Set<string>();
  for(let mi=0;mi<2;mi++){
    const props=appState.colorize.propsCache[mi];
    if(!props)continue;
    for(const eid in props){
      const v=colorizeGetValue(props[eid], prop);
      if(v)set.add(v);
    }
  }
  const arr=[...set];
  arr.sort((a,b)=>a.localeCompare(b));
  return arr;
}

// Extract the property value for an entity record from props cache.
// Normalization: trim strings, return null for empty.
function colorizeGetValue(e: any, prop: string): string | null {
  if(!e)return null;
  let v: any;
  switch(prop){
    case 'category':
      // Translate raw IFC class to Revit category name (e.g. 'IfcDoor' → 'Doors').
      // Falls back to the raw IFC class if no mapping exists.
      v=ifcClassToRevitCategory(e.type);
      break;
    case 'type':     v=e.objectType||e.type; break; // falls back to category if no ObjectType
    case 'name':     v=e.name; break;
    case 'tag':      v=e.tag; break;
    case 'file':
      // Source file name (model A vs B). Bucketing happens in applyColorizeAuto
      // using the per-entity srcModelIdx; this function is only used for
      // display/filter-condition purposes. File prop on entity is set inside
      // colorizeLoadPropsCache.
      v=e._sourceFile;
      break;
    default:         v=e[prop];
  }
  if(v===null||v===undefined)return null;
  v=String(v).trim();
  return v===''?null:v;
}

// Render the legend: one row per value with swatch (clickable color picker),
// eye toggle for visibility, label, and element count.
function colorizeRenderLegend(entries: Array<{value: string; count: number; perModel: any}>): void {
  const list=document.getElementById('czList')!;
  if(!entries.length){
    list.innerHTML='<div class="cz-list-empty">No values found for this property.</div>';
    return;
  }
  const safeHtml=(s: any)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  let html='';
  for(const e of entries){
    const hex=colorForValue(e.value);
    const hidden=appState.colorize.valueVisible[e.value]===false;
    const encVal=encodeURIComponent(e.value);
    html+=`<div class="cz-row${hidden?' hidden-value':''}" data-value="${encVal}">
      <span class="cz-row-visible" onclick="colorizeToggleValue('${encVal}')" title="${hidden?'Show':'Hide'}">${hidden?'○':'●'}</span>
      <label class="cz-swatch" style="background:${hex}" title="Click to change color">
        <input type="color" value="${hex}" oninput="colorizeSetColor('${encVal}', this.value)">
      </label>
      <span class="cz-val" title="${safeHtml(e.value)}">${safeHtml(e.value)}</span>
      <span class="cz-cnt">${e.count}</span>
    </div>`;
  }
  list.innerHTML=html;
}

// User picked a new color for a value via <input type=color>. Persist and
// rebuild just that subset's material for efficiency.
window.colorizeSetColor=function(encVal: string, hex: string){
  const v=decodeURIComponent(encVal);
  appState.colorize.valueColors[v]=hex;
  // Update swatch style immediately (don't wait for full rebuild)
  const row=document.querySelector(`.cz-row[data-value="${encVal}"] .cz-swatch`) as HTMLElement | null;
  if(row)row.style.background=hex;
  // Patch the color on matching subsets' material in-place — cheap
  const color=new THREE.Color(hex);
  for(const sub of appState.colorize.subsets){
    if(sub.userData.colorizeValue===v){
      sub.traverse((ch: any)=>{if(ch.isMesh){
        const ms=Array.isArray(ch.material)?ch.material:[ch.material];
        ms.forEach((m: any)=>{m.color=color;m.needsUpdate=true});
      }});
    }
  }
};

// User clicked the eye icon on a legend row. Toggle visibility of all
// elements with that value (remove the subset or recreate it).
window.colorizeToggleValue=async function(encVal: string){
  const v=decodeURIComponent(encVal);
  const cur=appState.colorize.valueVisible[v]!==false;
  appState.colorize.valueVisible[v]=!cur;
  // Easiest implementation: rebuild the whole colorize layer so visibility
  // state is re-applied consistently. With typical <100 distinct values this
  // is fast enough (< few hundred ms).
  await applyColorize();
};

// Re-set colors depending on current mode.
// - Auto mode : wipe value-color overrides (deterministic hash fills in again)
// - Rules mode: wipe all rules so user starts over
window.colorizeResetColors=async function(){
  if(appState.colorize.mode==='rules'){
    appState.colorize.rules=[];
    colorizeRenderRules();
  }else{
    appState.colorize.valueColors={};
  }
  await applyColorize();
};

// Clear — exits colorize mode, restores base materials, closes panel.
export function colorizeClear(): void {
  colorizeDisposeSubsets();
  colorizeFadeBase(false);
  appState.colorize.active=false;
  appState.colorize.valueVisible={}; // reset visibility overrides on exit
  document.getElementById('btnColorize')!.classList.remove('active');
  document.getElementById('colorizePanel')!.classList.remove('show');
  document.getElementById('colorizePanel')!.classList.remove('collapsed');
  // Close any open schemes sub-panel too
  const sp=document.getElementById('czSchemesPanel');if(sp)sp.style.display='none';
}
window.colorizeClear=colorizeClear;

// ── Collapse / expand toggle ──────────────────────────────────────────
// When collapsed, the panel shows only the header bar. CSS handles the
// actual hiding via `.collapsed` class; this just toggles it and updates
// the button glyph so user always knows current state.
window.colorizeToggleCollapse=function(){
  const panel=document.getElementById('colorizePanel')!;
  const btn=document.getElementById('czCollapseBtn')!;
  const title=document.getElementById('czTitle')!;
  const collapsed=panel.classList.toggle('collapsed');
  btn.textContent = collapsed ? '+' : '–';
  btn.title       = collapsed ? 'Expand' : 'Collapse';
  // When collapsed, adjust title to include mode/rule-count hint so the bar
  // still carries useful info at a glance.
  if(collapsed){
    const hint = appState.colorize.mode==='rules'
      ? `Colorize — ${appState.colorize.rules.length} rule${appState.colorize.rules.length===1?'':'s'}`
      : `Colorize — ${(appState.colorize.property||'category')}`;
    title.textContent = hint;
  }else{
    title.textContent = 'Colorize';
  }
};

// ── Saved color schemes (LocalStorage) ────────────────────────────────
// Schemes persist in the browser (per-origin) under a single JSON blob.
// Each scheme captures mode + rules + Auto-mode value-color overrides, so
// loading restores the exact coloring the user set up previously.
const CZ_STORAGE_KEY='ifc-delta-color-schemes-v1';

function colorizeReadSchemes(): Record<string, any> {
  try{
    const raw=localStorage.getItem(CZ_STORAGE_KEY);
    if(!raw)return {};
    const obj=JSON.parse(raw);
    return (obj && typeof obj==='object') ? obj : {};
  }catch(e: any){log('Colorize: schemes read error',e?.message);return {}}
}
function colorizeWriteSchemes(schemes: Record<string, any>): boolean {
  try{
    localStorage.setItem(CZ_STORAGE_KEY, JSON.stringify(schemes));
    return true;
  }catch(e: any){
    log('Colorize: schemes write error',e?.message);
    // Most likely quota exceeded (5MB). Surface this rather than silently failing.
    alert('Could not save scheme: browser storage is full or blocked.');
    return false;
  }
}

// Save the current state (mode + rules + auto-mode value colors) as a named
// scheme. Prompts the user for a name. If a scheme with that name exists,
// ask whether to overwrite.
window.colorizeSaveScheme=function(){
  if(!appState.colorize.active){alert('Turn on Colorize first, then save.');return}
  const name=(prompt('Name for this color scheme:','My scheme') || '').trim();
  if(!name)return;
  const schemes=colorizeReadSchemes();
  if(schemes[name]){
    if(!confirm('A scheme named "'+name+'" already exists. Overwrite?'))return;
  }
  schemes[name]={
    mode: appState.colorize.mode,
    property: appState.colorize.property,
    rules: JSON.parse(JSON.stringify(appState.colorize.rules||[])), // deep clone
    valueColors: {...(appState.colorize.valueColors||{})},
    savedAt: Date.now(),
  };
  if(colorizeWriteSchemes(schemes)){
    log('Colorize: saved scheme "'+name+'"');
    // If schemes panel is open, refresh it
    const sp=document.getElementById('czSchemesPanel');
    if(sp && sp.style.display!=='none')colorizeRenderSchemes();
  }
};

// Toggle the schemes sub-panel (shows list of saved schemes below the rules/
// legend area, above the footer). Clicking Load a second time closes it.
window.colorizeToggleSchemesPanel=function(){
  const sp=document.getElementById('czSchemesPanel');
  if(!sp)return;
  if(sp.style.display==='none'||!sp.style.display){
    colorizeRenderSchemes();
    sp.style.display='block';
  }else{
    sp.style.display='none';
  }
};

// Render the list of saved schemes. Each row: name + saved-date + delete btn.
// Click the row (outside the delete button) to load.
function colorizeRenderSchemes(): void {
  const sp=document.getElementById('czSchemesPanel');
  if(!sp)return;
  const schemes=colorizeReadSchemes();
  const names=Object.keys(schemes).sort((a,b)=>(schemes[b].savedAt||0)-(schemes[a].savedAt||0));
  if(!names.length){
    sp.innerHTML='<div class="cz-schemes-empty">No saved schemes yet.<br><span style="font-size:11px">Click 💾 Save to save the current setup.</span></div>';
    return;
  }
  const safeAttr=(s: any)=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let html='';
  for(const n of names){
    const s=schemes[n];
    const when = s.savedAt ? new Date(s.savedAt).toLocaleDateString() : '';
    const modeLabel = s.mode==='rules' ? ((s.rules||[]).length+'r') : (s.property||'auto');
    html+=`<div class="cz-scheme-row" onclick="colorizeLoadScheme('${safeAttr(n)}')">
      <span class="cz-scheme-name" title="${safeAttr(n)}">${safeAttr(n)}</span>
      <span class="cz-scheme-meta" title="${when}">${modeLabel}</span>
      <button class="cz-scheme-del" onclick="event.stopPropagation();colorizeDeleteScheme('${safeAttr(n)}')" title="Delete">🗑</button>
    </div>`;
  }
  sp.innerHTML=html;
}

// Load a scheme by name. Restores mode + rules + Auto overrides and re-applies.
window.colorizeLoadScheme=async function(name: string){
  const schemes=colorizeReadSchemes();
  const s=schemes[name];
  if(!s){alert('Scheme not found: '+name);return}
  appState.colorize.mode = s.mode==='rules' ? 'rules' : 'auto';
  appState.colorize.property = s.property || 'category';
  appState.colorize.rules = JSON.parse(JSON.stringify(s.rules||[]));
  appState.colorize.valueColors = {...(s.valueColors||{})};
  // Sync UI: tab active class, view visibility, dropdown value, render rules
  document.getElementById('czTabAuto')!.classList.toggle('active',appState.colorize.mode==='auto');
  document.getElementById('czTabRules')!.classList.toggle('active',appState.colorize.mode==='rules');
  document.getElementById('czViewAuto')!.style.display =(appState.colorize.mode==='auto')?'':'none';
  document.getElementById('czViewRules')!.style.display=(appState.colorize.mode==='rules')?'flex':'none';
  const sel=document.getElementById('czProp') as HTMLSelectElement | null;
  if(sel && appState.colorize.mode==='auto')sel.value=appState.colorize.property;
  if(appState.colorize.mode==='rules')colorizeRenderRules();
  // Hide schemes panel
  document.getElementById('czSchemesPanel')!.style.display='none';
  // If Colorize wasn't active yet, turn it on
  if(!appState.colorize.active){
    if(appState.compareResult){try{(window as any).exitCompare&&(window as any).exitCompare()}catch(e){}}
    appState.colorize.active=true;
    document.getElementById('btnColorize')!.classList.add('active');
    document.getElementById('colorizePanel')!.classList.add('show');
  }
  await applyColorize();
  log('Colorize: loaded scheme "'+name+'"');
};

// Delete a scheme (with confirm).
window.colorizeDeleteScheme=function(name: string){
  if(!confirm('Delete scheme "'+name+'"?'))return;
  const schemes=colorizeReadSchemes();
  delete schemes[name];
  colorizeWriteSchemes(schemes);
  colorizeRenderSchemes();
};

// Dispose subsets: remove each from the scene. We don't call
// ifcManager.removeSubset because of a known web-ifc-three issue (#83) where
// it sometimes leaves visuals behind, and because we pass a fresh material
// to createSubset each apply cycle anyway — so the internal cache lookup
// keys are unique per cycle and GC handles them on next frame.
// We also don't call geometry.dispose() because web-ifc-three subsets can
// share geometry buffers with the main model — disposing them would break
// the main render.
export function colorizeDisposeSubsets(): void {
  for(const sub of appState.colorize.subsets){
    if(sub.parent)sub.parent.remove(sub);
  }
  appState.colorize.subsets=[];
}

// Fade / un-fade the base models so colored subsets pop. Mirrors the pattern
// in applyDiffColors() so behavior is consistent between the two modes.
export function colorizeFadeBase(fade: boolean): void {
  for(let i=0;i<2;i++){
    if(!appState.loadedModels[i])continue;
    appState.loadedModels[i]!.traverse((c: any)=>{
      if(!c.isMesh)return;
      if(fade){
        // Back up materials once
        if(!c.userData._origMaterials){
          c.userData._origMaterials=Array.isArray(c.material)
            ? c.material.map((m: any)=>m.clone())
            : c.material.clone();
        }
        const ms=Array.isArray(c.material)?c.material:[c.material];
        ms.forEach((m: any)=>{
          m.color=new THREE.Color(0xc0c4cc);
          m.transparent=true;m.opacity=0.15;m.depthWrite=false;m.needsUpdate=true;
        });
      }else{
        // Restore
        if(c.userData._origMaterials){
          c.material=c.userData._origMaterials;
          delete c.userData._origMaterials;
          const ms=Array.isArray(c.material)?c.material:[c.material];
          ms.forEach((m: any)=>{m.needsUpdate=true});
        }
      }
    });
  }
}

// Invalidate props cache when a model is (un)loaded so we rescan next time.
// Hook this into the existing load handler by exposing a small helper.
window._colorizeInvalidate=function(mi?: number){
  if(mi===undefined){appState.colorize.propsCache=[null,null]}
  else appState.colorize.propsCache[mi]=null;
};
