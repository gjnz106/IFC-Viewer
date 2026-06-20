import { appState } from '../../state/index.js';
import { log } from '../core/ifc-category.js';

// ══════════════════════════════════════════════════════════════════════
// ── GOOGLE DRIVE INTEGRATION ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
// Browse IFC files from Google Drive, download and load into viewer.
// Uses Google Identity Services for OAuth 2.0 + Drive API v3.
//
// Setup: console.cloud.google.com → APIs & Services → Credentials
//   1. Create OAuth 2.0 Client ID (Web application)
//   2. Authorized JS origins: https://gjnz106.github.io
//   3. Enable Google Drive API
//   4. Copy CLIENT_ID below

const GD_CONFIG = {
  CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE',
  SCOPES: 'https://www.googleapis.com/auth/drive.readonly',
  ROOT_FOLDER: 'IFC-Projects'
};

let _gdToken: string | null = null;
let _gdUser: any = null;
let _gdCurrentFolder: { id: string; name: string } | null = null;
let _gdFolderStack: { id: string; name: string }[] = [];
let _odExpanded: boolean = false;
let _gdTokenClient: any = null;

window.odToggle = function (): void {
  _odExpanded = !_odExpanded;
  document.getElementById('odBody')!.classList.toggle('show', _odExpanded);
};

function odUpdateBadge(state: 'on' | 'offline'): void {
  const b = document.getElementById('odBadge')!;
  b.textContent = state === 'on' ? 'connected' : 'offline';
  b.classList.toggle('on', state === 'on');
}

window.gdLogin = function (): void {
  if (GD_CONFIG.CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
    alert('Google Drive not configured.\n\n1. Go to console.cloud.google.com\n2. Create project → Enable Google Drive API\n3. Credentials → Create OAuth 2.0 Client ID\n4. Authorized JS origins: https://gjnz106.github.io\n5. Open this HTML → search GD_CONFIG\n6. Replace YOUR_GOOGLE_CLIENT_ID_HERE');
    return;
  }
  if (!_gdTokenClient) {
    _gdTokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GD_CONFIG.CLIENT_ID,
      scope: GD_CONFIG.SCOPES,
      callback: (resp: any) => {
        if (resp.error) { log('GDrive auth error:', resp.error); return; }
        _gdToken = resp.access_token;
        odUpdateBadge('on');
        gdGetUserInfo();
        gdBrowseRoot();
      }
    });
  }
  _gdTokenClient.requestAccessToken();
};

async function gdGetUserInfo(): Promise<void> {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { 'Authorization': 'Bearer ' + _gdToken } });
    _gdUser = await r.json();
    log('GDrive: signed in as ' + _gdUser.name);
  } catch (e) {}
}

async function gdFetch(url: string): Promise<Response | null> {
  const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + _gdToken } });
  if (r.status === 401) { _gdTokenClient.requestAccessToken(); return null; }
  return r;
}

async function gdBrowseRoot(): Promise<void> {
  const content = document.getElementById('odContent')!;
  content.innerHTML = '<div class="od-loading">Loading…</div>';
  try {
    const q = `name='${GD_CONFIG.ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const r = await gdFetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)');
    const data = await r!.json();
    let rootId: string;
    if (data.files && data.files.length > 0) {
      rootId = data.files[0].id;
    } else {
      const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + _gdToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: GD_CONFIG.ROOT_FOLDER, mimeType: 'application/vnd.google-apps.folder' })
      });
      const cf = await cr.json();
      rootId = cf.id;
    }
    _gdFolderStack = [{ id: rootId, name: GD_CONFIG.ROOT_FOLDER }];
    _gdCurrentFolder = { id: rootId, name: GD_CONFIG.ROOT_FOLDER };
    await gdBrowseFolder(rootId);
  } catch (e: any) {
    content.innerHTML = '<div class="od-status" style="color:var(--red)">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

async function gdBrowseFolder(folderId: string): Promise<void> {
  const content = document.getElementById('odContent')!;
  content.innerHTML = '<div class="od-loading">Loading…</div>';
  try {
    const q = "'" + folderId + "' in parents and trashed=false";
    const r = await gdFetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,size,mimeType,modifiedTime)&orderBy=folder,name&pageSize=100');
    const data = await r!.json();
    const items: any[] = data.files || [];
    let bcHtml = '<div class="od-breadcrumb">';
    _gdFolderStack.forEach((p, i) => {
      if (i > 0) bcHtml += '<span class="od-crumb-sep">›</span>';
      bcHtml += '<span class="od-crumb" onclick="gdNavigateTo(' + i + ')">' + escapeHtml(p.name) + '</span>';
    });
    bcHtml += '</div>';
    let listHtml = '<div class="od-file-list">';
    const folders = items.filter(i => i.mimeType === 'application/vnd.google-apps.folder');
    const fls = items.filter(i => i.mimeType !== 'application/vnd.google-apps.folder');
    for (const f of folders) {
      listHtml += '<div class="od-file" onclick="gdOpenFolder(\'' + f.id + '\',\'' + escapeHtml(f.name) + '\')"><span class="od-file-icon">📁</span><span class="od-file-name">' + escapeHtml(f.name) + '</span></div>';
    }
    for (const f of fls) {
      const isIfc = f.name.toLowerCase().endsWith('.ifc');
      const sz = f.size ? (Number(f.size) < 1048576 ? (Number(f.size) / 1024).toFixed(0) + 'KB' : (Number(f.size) / 1048576).toFixed(1) + 'MB') : '';
      listHtml += '<div class="od-file" ' + (isIfc ? 'ondblclick="gdLoadFile(\'' + f.id + '\',\'' + escapeHtml(f.name) + '\')"' : '') + '><span class="od-file-icon">' + (isIfc ? '📐' : '📄') + '</span><span class="od-file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</span><span class="od-file-size">' + sz + '</span>' + (isIfc ? '<button class="od-file-load" onclick="event.stopPropagation();gdLoadFile(\'' + f.id + '\',\'' + escapeHtml(f.name) + '\')">Load</button>' : '') + '</div>';
    }
    if (items.length === 0) listHtml += '<div class="od-status">Empty folder</div>';
    listHtml += '</div>';
    const userHtml = '<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;margin-bottom:4px"><span class="od-status">☁️ ' + escapeHtml(_gdUser?.name || 'Connected') + '</span><button style="font-size:9px;border:none;background:none;color:var(--text-muted);cursor:pointer;font-family:\'JetBrains Mono\'" onclick="gdLogout()">Sign out</button></div>';
    content.innerHTML = userHtml + bcHtml + listHtml;
  } catch (e: any) {
    content.innerHTML = '<div class="od-status" style="color:var(--red)">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

window.gdOpenFolder = function (folderId: string, folderName: string): void {
  _gdFolderStack.push({ id: folderId, name: folderName });
  _gdCurrentFolder = { id: folderId, name: folderName };
  gdBrowseFolder(folderId);
};

window.gdNavigateTo = function (idx: number): void {
  _gdFolderStack = _gdFolderStack.slice(0, idx + 1);
  _gdCurrentFolder = _gdFolderStack[idx];
  gdBrowseFolder(_gdCurrentFolder.id);
};

window.gdLoadFile = async function (fileId: string, fileName: string): Promise<void> {
  const content = document.getElementById('odContent')!;
  const origHtml = content.innerHTML;
  content.innerHTML = '<div class="od-loading">⏳ Downloading ' + escapeHtml(fileName) + '…</div>';
  try {
    const r = await gdFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media');
    if (!r || !r.ok) throw new Error('Download failed');
    const blob = await r.blob();
    content.innerHTML = '<div class="od-loading">⏳ Loading into viewer…</div>';
    const file = new File([blob], fileName, { type: 'application/octet-stream' });
    let targetSlot = -1;
    if (!appState.loadedModels[0]) targetSlot = 0;
    else if (!appState.loadedModels[1]) targetSlot = 1;
    else { targetSlot = appState.fedNextSlot; appState.fedNextSlot++; }
    appState.files[targetSlot] = file;
    if (targetSlot < 2) {
      const uc = document.getElementById('uc' + targetSlot);
      if (uc) uc.classList.add('loaded');
      const fn = document.getElementById('fn' + targetSlot);
      if (fn) fn.textContent = fileName;
      const fs2 = document.getElementById('fs' + targetSlot);
      if (fs2) fs2.textContent = (blob.size / 1048576).toFixed(1) + ' MB';
    }
    if (!appState.ifcLoader) {
      if (!await (window as any).initIFC?.()) { throw new Error('IFC init failed'); }
    }
    await (window as any).loadIFC?.(targetSlot);
    if (targetSlot >= 2) (window as any).fedRenderSlots?.();
    log('GDrive: ' + fileName + ' loaded into slot ' + targetSlot);
    content.innerHTML = origHtml;
  } catch (e: any) {
    log('GDrive load err:', e.message);
    content.innerHTML = origHtml;
    alert('Failed to load: ' + e.message);
  }
};

window.gdLogout = function (): void {
  if (_gdToken) try { (window as any).google.accounts.oauth2.revoke(_gdToken); } catch (e) {}
  _gdToken = null; _gdUser = null;
  odUpdateBadge('offline');
  document.getElementById('odContent')!.innerHTML = '<button class="od-login-btn" onclick="gdLogin()" style="border-color:#4285f4;color:#4285f4;background:rgba(66,133,244,.06)"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>Sign in with Google</button><div class="od-status">Connect Google Drive to browse IFC files</div>';
};

function escapeHtml(s: any): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

export { escapeHtml };
