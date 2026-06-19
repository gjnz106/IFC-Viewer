import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  reload as reloadUser
} from 'https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js';

// ⚠️  REPLACE THIS CONFIG with your Firebase project's config from
//     Firebase Console → Project settings → General → Your apps.
const firebaseConfig = {
  apiKey: "AIzaSyCrqJiIxlahcHZuwa7xS7KMX8Z5c6Ky3Oo",
  authDomain: "ifc-delta.firebaseapp.com",
  projectId: "ifc-delta",
  storageBucket: "ifc-delta.firebasestorage.app",
  messagingSenderId: "200458024135",
  appId: "1:200458024135:web:16c51183d7f8a713463ae2"
};

// Detect placeholder config so we can show a clear error in the UI
// instead of a confusing Firebase API error.
const isConfigPlaceholder = Object.values(firebaseConfig).some(v => String(v).includes('REPLACE_ME'));

let app, auth;
if(!isConfigPlaceholder){
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Persist login across page reloads/tabs (default is also LOCAL but we set
  // explicitly to be safe across browsers).
  setPersistence(auth, browserLocalPersistence).catch(e => console.warn('[auth] setPersistence failed:', e));
}

// ── Auth state (mirrors IDD Zustand store interface in vanilla JS) ──────
// user / token / hasHydrated — same shape, stored in module scope.
// setAuth / clearAuth called on sign-in success / sign-out.
let authState = { user: null, token: null, hasHydrated: false };

function setAuth(user, token = null){
  authState = { ...authState, user, token };
}
function clearAuth(){
  authState = { ...authState, user: null, token: null };
}
function setHasHydrated(){
  authState = { ...authState, hasHydrated: true };
}

// ── DOM helpers ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const overlay = $('authOverlay');
const viewLoading = $('authViewLoading');
const viewLogin  = $('authViewLogin');
const viewVerify = $('authViewVerify');
const viewReset  = $('authViewReset');

function showView(which){
  viewLoading.style.display = which === 'loading' ? '' : 'none';
  viewLogin.style.display   = which === 'login'   ? '' : 'none';
  viewVerify.style.display  = which === 'verify'  ? '' : 'none';
  viewReset.style.display   = which === 'reset'   ? '' : 'none';
}

// Start in loading state — same as AuthGuard waiting for hasHydrated.
// A 6 s timeout falls back to login if Firebase never fires (network issue).
showView('loading');
const _authInitTimeout = setTimeout(() => {
  if(!authState.hasHydrated) showView('login');
}, 6000);

function showMsg(elId, text, kind='error'){
  const el = $(elId);
  el.textContent = text;
  el.className = 'auth-msg show ' + kind;
}
function clearMsg(elId){
  const el = $(elId);
  el.className = 'auth-msg';
  el.textContent = '';
}

function setLoading(btnId, on){
  const b = $(btnId);
  if(on){ b.classList.add('loading'); b.disabled = true; }
  else  { b.classList.remove('loading'); b.disabled = false; }
}

// Map common Firebase auth error codes to friendly Vietnamese-friendly English
// (kept in English for consistency with rest of app, can be localized later).
function friendlyAuthError(e){
  const c = e?.code || '';
  switch(c){
    case 'auth/invalid-email':       return 'Invalid email address.';
    case 'auth/user-disabled':       return 'This account has been disabled. Contact your admin.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':  return 'Email or password is incorrect.';
    case 'auth/too-many-requests':   return 'Too many failed attempts. Try again later or reset your password.';
    case 'auth/network-request-failed': return 'Network error. Check your connection.';
    case 'auth/missing-password':    return 'Please enter your password.';
    case 'auth/operation-not-allowed': return 'Email/password sign-in is not enabled in Firebase. Contact your admin.';
    default: return e?.message || 'Sign-in failed. Please try again.';
  }
}

// ── Initial check: if config is missing, skip loading and show error ───
if(isConfigPlaceholder){
  showView('login');
  viewLogin.innerHTML = '<div class="auth-heading-block"><h2 class="auth-heading">Setup needed</h2></div>'
    + '<div class="auth-msg show error" style="margin-top:4px">'
    + '<b>Firebase config missing.</b><br>'
    + 'Open <code>js/auth.js</code>, find <code>firebaseConfig</code> and replace placeholder values with your Firebase project config.'
    + '</div>';
  console.error('[auth] Firebase config contains REPLACE_ME placeholders.');
}

// ── Auth state listener ────────────────────────────────────────────────
// Mirrors IDD AuthGuard: resolve hasHydrated first, then gate the UI.
// Loading view → login | verify | hidden (grant access).
if(auth){
  onAuthStateChanged(auth, user => {
    clearTimeout(_authInitTimeout);
    setHasHydrated();

    if(!user){
      clearAuth();
      overlay.classList.remove('hidden');
      showView('login');
      $('userBadge').style.display = 'none';
      $('userMenu').classList.remove('show');
      return;
    }
    setAuth(user);

    if(!user.emailVerified){
      overlay.classList.remove('hidden');
      showView('verify');
      $('verifyEmail').textContent = user.email || '';
      if(!sessionStorage.getItem('verifySent_'+user.uid)){
        sendEmailVerification(user)
          .then(() => {
            showMsg('verifyMsg', 'Verification email sent. Check your inbox (and spam folder).', 'success');
            sessionStorage.setItem('verifySent_'+user.uid, '1');
          })
          .catch(e => {
            console.warn('[auth] auto sendEmailVerification:', e?.code);
          });
      }
      return;
    }
    // Signed in AND verified → grant access
    overlay.classList.add('hidden');
    showLoggedInUser(user);
  });
}

function showLoggedInUser(user){
  // User badge: show only the part before @
  const email = user.email || '';
  const local = email.split('@')[0] || 'user';
  // Avatar = first 1-2 letters of local part (uppercased, trimmed)
  const initials = (local.replace(/[^a-zA-Z0-9]/g,'').slice(0,2) || 'U').toUpperCase();
  $('userName').textContent = local;
  $('userAvatar').textContent = initials;
  $('userBadge').style.display = '';
  $('userMenuName').textContent = local;
  $('userMenuEmail').textContent = email;
}

// ── LOGIN form ──────────────────────────────────────────────────────────
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if(!auth) return;
  clearMsg('loginMsg');
  const email = $('loginEmail').value.trim();
  const pass  = $('loginPassword').value;
  if(!email || !pass){ showMsg('loginMsg', 'Please enter both email and password.'); return; }
  setLoading('loginSubmit', true);
  try{
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged will take it from here (overlay hides, or verify view shows).
  }catch(err){
    showMsg('loginMsg', friendlyAuthError(err));
  }finally{
    setLoading('loginSubmit', false);
  }
});

// ── VERIFY-EMAIL view actions ───────────────────────────────────────────
$('verifyResend').addEventListener('click', async () => {
  if(!auth?.currentUser) return;
  clearMsg('verifyMsg');
  setLoading('verifyResend', true);
  try{
    await sendEmailVerification(auth.currentUser);
    showMsg('verifyMsg', 'Verification email sent. Check your inbox.', 'success');
  }catch(err){
    showMsg('verifyMsg', friendlyAuthError(err));
  }finally{
    setLoading('verifyResend', false);
  }
});

// "I've verified — refresh" button: re-fetch user state from server. If the
// user clicked the verification link in their email, reloadUser() picks up the
// new emailVerified=true status without requiring a hard page refresh.
window.checkVerifiedNow = async function(){
  if(!auth?.currentUser) return;
  clearMsg('verifyMsg');
  try{
    await reloadUser(auth.currentUser);
    if(auth.currentUser.emailVerified){
      // Trigger the gate logic by manually invoking the same flow
      overlay.classList.add('hidden');
      showLoggedInUser(auth.currentUser);
    }else{
      showMsg('verifyMsg', 'Email is not verified yet. Check your inbox and click the link first.', 'info');
    }
  }catch(err){
    showMsg('verifyMsg', friendlyAuthError(err));
  }
};

window.signOutFromVerify = async function(){
  if(!auth) return;
  try{ await signOut(auth); }catch(e){}
  // Clear the auto-send flag so next user gets one
  sessionStorage.clear();
};

// ── PASSWORD-RESET view ─────────────────────────────────────────────────
window.showResetView = function(){
  clearMsg('resetMsg');
  $('resetEmail').value = $('loginEmail').value;
  showView('reset');
};
window.showLoginView = function(){
  clearMsg('resetMsg');
  showView('login');
};

$('resetForm').addEventListener('submit', async e => {
  e.preventDefault();
  if(!auth) return;
  clearMsg('resetMsg');
  const email = $('resetEmail').value.trim();
  if(!email){ showMsg('resetMsg', 'Please enter your email.'); return; }
  setLoading('resetSubmit', true);
  try{
    await sendPasswordResetEmail(auth, email);
    showMsg('resetMsg', 'Reset link sent. Check your inbox (and spam folder).', 'success');
  }catch(err){
    // For privacy, Firebase no longer reveals "user not found" by default;
    // show a generic success-like message even on user-not-found to avoid leaking
    // which emails are registered.
    if(err?.code === 'auth/user-not-found'){
      showMsg('resetMsg', 'If that email is registered, a reset link has been sent.', 'success');
    }else{
      showMsg('resetMsg', friendlyAuthError(err));
    }
  }finally{
    setLoading('resetSubmit', false);
  }
});

// ── User menu (dropdown from header badge) ──────────────────────────────
window.toggleUserMenu = function(ev){
  ev?.stopPropagation();
  const menu = $('userMenu');
  if(menu.classList.contains('show')){ menu.classList.remove('show'); return; }
  // Position under the badge
  const badge = $('userBadge').getBoundingClientRect();
  menu.style.top  = (badge.bottom + 4) + 'px';
  menu.style.right = (window.innerWidth - badge.right) + 'px';
  menu.style.left = '';
  menu.classList.add('show');
};
// Click-outside to close
document.addEventListener('click', e => {
  const menu = $('userMenu');
  if(!menu.classList.contains('show')) return;
  if(e.target.closest('#userMenu') || e.target.closest('#userBadge')) return;
  menu.classList.remove('show');
});

// ── LOGOUT confirm flow ─────────────────────────────────────────────────
window.confirmLogout = function(){
  $('userMenu').classList.remove('show');
  $('confirmBackdrop').classList.add('show');
};
window.cancelLogout = function(){
  $('confirmBackdrop').classList.remove('show');
};
window.doLogout = async function(){
  $('confirmBackdrop').classList.remove('show');
  if(!auth) return;
  try{
    await signOut(auth);
    sessionStorage.clear();
    // onAuthStateChanged will show the login overlay automatically
  }catch(e){
    console.error('[auth] signOut failed:', e);
  }
};
// Esc closes confirm dialog
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && $('confirmBackdrop').classList.contains('show')){
    cancelLogout();
  }
});
