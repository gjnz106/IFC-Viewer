import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  reload as reloadUser,
  createUserWithEmailAndPassword,
  updateProfile,
  type User,
} from 'firebase/auth';

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

let auth: ReturnType<typeof getAuth> | null = null;
if (!isConfigPlaceholder) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Persist login across page reloads/tabs (default is also LOCAL but we set
  // explicitly to be safe across browsers).
  setPersistence(auth, browserLocalPersistence).catch(e => console.warn('[auth] setPersistence failed:', e));
}

// ── Auth state ─────────────────────────────────────────────────────────
let authState = { user: null as User | null, token: null as string | null, hasHydrated: false };

function setAuth(user: User, token: string | null = null) {
  authState = { ...authState, user, token };
}
function clearAuth() {
  authState = { ...authState, user: null, token: null };
}
function setHasHydrated() {
  authState = { ...authState, hasHydrated: true };
}

// ── DOM helpers ────────────────────────────────────────────────────────
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const overlay = $('authOverlay');
const viewLoading = $('authViewLoading');
const viewLogin = $('authViewLogin');
const viewVerify = $('authViewVerify');
const viewReset = $('authViewReset');
const viewSignup = $('authViewSignup');

function showView(which: 'loading' | 'login' | 'verify' | 'reset' | 'signup') {
  viewLoading.style.display = which === 'loading' ? '' : 'none';
  viewLogin.style.display = which === 'login' ? '' : 'none';
  viewVerify.style.display = which === 'verify' ? '' : 'none';
  viewReset.style.display = which === 'reset' ? '' : 'none';
  viewSignup.style.display = which === 'signup' ? '' : 'none';
}

// Start in loading state — same as AuthGuard waiting for hasHydrated.
// A 6 s timeout falls back to login if Firebase never fires (network issue).
showView('loading');
const _authInitTimeout = setTimeout(() => {
  if (!authState.hasHydrated) showView('login');
}, 6000);

function showMsg(elId: string, text: string, kind = 'error') {
  const el = $(elId);
  el.textContent = text;
  el.className = 'auth-msg show ' + kind;
}
function clearMsg(elId: string) {
  const el = $(elId);
  el.className = 'auth-msg';
  el.textContent = '';
}

function setLoading(btnId: string, on: boolean) {
  const b = $(btnId) as HTMLButtonElement;
  if (on) { b.classList.add('loading'); b.disabled = true; }
  else { b.classList.remove('loading'); b.disabled = false; }
}

// Map common Firebase auth error codes to friendly messages
function friendlyAuthError(e: any): string {
  const c = e?.code || '';
  switch (c) {
    case 'auth/invalid-email': return 'Invalid email address.';
    case 'auth/user-disabled': return 'This account has been disabled. Contact your admin.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Email or password is incorrect.';
    case 'auth/too-many-requests': return 'Too many failed attempts. Try again later or reset your password.';
    case 'auth/network-request-failed': return 'Network error. Check your connection.';
    case 'auth/missing-password': return 'Please enter your password.';
    case 'auth/operation-not-allowed': return 'Email/password sign-in is not enabled in Firebase. Contact your admin.';
    default: return e?.message || 'Sign-in failed. Please try again.';
  }
}

// ── Initial check: if config is missing, skip loading and show error ───
if (isConfigPlaceholder) {
  showView('login');
  viewLogin.innerHTML = '<div class="auth-heading-block"><h2 class="auth-heading">Setup needed</h2></div>'
    + '<div class="auth-msg show error" style="margin-top:4px">'
    + '<b>Firebase config missing.</b><br>'
    + 'Open <code>frontend/src/auth.ts</code>, find <code>firebaseConfig</code> and replace placeholder values with your Firebase project config.'
    + '</div>';
  console.error('[auth] Firebase config contains REPLACE_ME placeholders.');
}

// ── Auth state listener ────────────────────────────────────────────────
if (auth) {
  onAuthStateChanged(auth, user => {
    clearTimeout(_authInitTimeout);
    setHasHydrated();

    if (!user) {
      clearAuth();
      (window as any).isAdmin = false;
      overlay.classList.remove('hidden');
      showView('login');
      $('userBadge').style.display = 'none';
      const menu = document.getElementById('userMenu');
      if (menu) menu.classList.remove('show');
      const acMenu = document.querySelector('.account-menu') as HTMLElement;
      if (acMenu) acMenu.style.display = 'none';
      return;
    }
    setAuth(user);
    (window as any).isAdmin = !!(user.email && ADMIN_EMAILS.has(user.email.toLowerCase()));

    if (!user.emailVerified) {
      overlay.classList.remove('hidden');
      showView('verify');
      $('verifyEmail').textContent = user.email || '';
      if (!sessionStorage.getItem('verifySent_' + user.uid)) {
        sendEmailVerification(user)
          .then(() => {
            showMsg('verifyMsg', 'Verification email sent. Check your inbox (and spam folder).', 'success');
            sessionStorage.setItem('verifySent_' + user.uid, '1');
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

function showLoggedInUser(user: User) {
  const email = user.email || '';
  const local = email.split('@')[0] || 'user';
  const initials = (local.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || 'U').toUpperCase();
  $('userAvatar').textContent = initials;
  $('userBadge').style.display = '';
  const oldName = document.getElementById('userMenuName');
  if (oldName) oldName.textContent = local;
  const oldEmail = document.getElementById('userMenuEmail');
  if (oldEmail) oldEmail.textContent = email;
  // Also populate the topbar account-menu avatar if it exists (new UI design)
  const acMenuAv = document.getElementById('acMenuAv');
  if (acMenuAv) acMenuAv.textContent = initials;
  const acName = document.querySelector('.account-menu-name');
  if (acName) acName.textContent = local;
  const acStatus = document.querySelector('.account-menu-status');
  if (acStatus) acStatus.textContent = email;
}

// ── LOGIN form ──────────────────────────────────────────────────────────
($('loginForm') as HTMLFormElement).addEventListener('submit', async e => {
  e.preventDefault();
  if (!auth) return;
  clearMsg('loginMsg');
  const email = ($('loginEmail') as HTMLInputElement).value.trim();
  const pass = ($('loginPassword') as HTMLInputElement).value;
  if (!email || !pass) { showMsg('loginMsg', 'Please enter both email and password.'); return; }
  setLoading('loginSubmit', true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    showMsg('loginMsg', friendlyAuthError(err));
  } finally {
    setLoading('loginSubmit', false);
  }
});

// ── VERIFY-EMAIL view actions ───────────────────────────────────────────
$('verifyResend').addEventListener('click', async () => {
  if (!auth?.currentUser) return;
  clearMsg('verifyMsg');
  setLoading('verifyResend', true);
  try {
    await sendEmailVerification(auth.currentUser);
    showMsg('verifyMsg', 'Verification email sent. Check your inbox.', 'success');
  } catch (err) {
    showMsg('verifyMsg', friendlyAuthError(err));
  } finally {
    setLoading('verifyResend', false);
  }
});

$('verifyCheck').addEventListener('click', async () => {
  if (!auth?.currentUser) return;
  setLoading('verifyCheck', true);
  try {
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      overlay.classList.add('hidden');
      showLoggedInUser(auth.currentUser);
    } else {
      showMsg('verifyMsg', 'Email is not verified yet. Check your inbox and click the link first.', 'info');
    }
  } catch (err) {
    showMsg('verifyMsg', friendlyAuthError(err));
  }
});

window.signOutFromVerify = async function () {
  if (!auth) return;
  try { await signOut(auth); } catch (e) { }
  sessionStorage.clear();
};

// Used by the AI chat proxy call (src/app/22-ai.ts and
// frontend/.../integrations/ai.ts) to authenticate POST /api/ai/chat.
// Firebase SDK caches the token and silently refreshes it ~5 min before
// expiry, so this is cheap to call before every request.
(window as any).getAuthToken = async function (): Promise<string | null> {
  if (!auth?.currentUser) return null;
  try { return await auth.currentUser.getIdToken(); } catch { return null; }
};

// ── Minimal role gate ────────────────────────────────────────────────────
// No backend persistence/Firestore in this app today, so there is no shared
// resource for a full RBAC system to protect — every viewer/export/delete
// action only touches the user's own loaded model, locally. The one real
// shared/billable resource is the AI proxy's provider+model choice, so that
// is the only thing gated here. `window.isAdmin` is read by the AI chat
// settings UI (src/app/22-ai.ts and frontend/.../integrations/ai.ts) to hide
// the provider/model picker from non-admins.
const ADMIN_EMAILS = new Set(['trantienthanh909@gmail.com']);
(window as any).isAdmin = false;

// ── PASSWORD-RESET view ─────────────────────────────────────────────────
(window as any).showResetView = function () {
  clearMsg('resetMsg');
  ($('resetEmail') as HTMLInputElement).value = ($('loginEmail') as HTMLInputElement).value;
  showView('reset');
};
(window as any).showLoginView = function () {
  clearMsg('resetMsg');
  clearMsg('signupMsg');
  showView('login');
};
(window as any).showSignupView = function () {
  clearMsg('signupMsg');
  showView('signup');
};

($('resetForm') as HTMLFormElement).addEventListener('submit', async e => {
  e.preventDefault();
  if (!auth) return;
  clearMsg('resetMsg');
  const email = ($('resetEmail') as HTMLInputElement).value.trim();
  if (!email) { showMsg('resetMsg', 'Please enter your email.'); return; }
  setLoading('resetSubmit', true);
  try {
    await sendPasswordResetEmail(auth, email);
    showMsg('resetMsg', 'Reset link sent. Check your inbox (and spam folder).', 'success');
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      showMsg('resetMsg', 'If that email is registered, a reset link has been sent.', 'success');
    } else {
      showMsg('resetMsg', friendlyAuthError(err));
    }
  } finally {
    setLoading('resetSubmit', false);
  }
});

// ── User menu (dropdown from header badge) ──────────────────────────────
window.toggleUserMenu = function (ev?: Event) {
  ev?.stopPropagation();
  const menu = document.querySelector('.account-menu') as HTMLElement;
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
};
document.addEventListener('click', e => {
  const menu = document.querySelector('.account-menu') as HTMLElement;
  if (!menu || menu.style.display === 'none') return;
  if ((e.target as Element).closest('.account-menu') || (e.target as Element).closest('#userBadge')) return;
  menu.style.display = 'none';
});

// ── LOGOUT confirm flow ─────────────────────────────────────────────────
(window as any).confirmLogout = function () {
  const menu = document.querySelector('.account-menu') as HTMLElement;
  if (menu) menu.style.display = 'none';
  $('confirmBackdrop').classList.add('show');
};
(window as any).cancelLogout = function () {
  $('confirmBackdrop').classList.remove('show');
};
window.doLogout = async function () {
  $('confirmBackdrop').classList.remove('show');
  if (!auth) return;
  try {
    await signOut(auth);
    sessionStorage.clear();
  } catch (e) {
    console.error('[auth] signOut failed:', e);
  }
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('confirmBackdrop').classList.contains('show')) {
    (window as any).cancelLogout();
  }
});

// ── SIGNUP form ─────────────────────────────────────────────────────────
($('signupForm') as HTMLFormElement).addEventListener('submit', async e => {
  e.preventDefault();
  if (!auth) return;
  clearMsg('signupMsg');
  const name = ($('signupName') as HTMLInputElement).value.trim();
  const email = ($('signupEmail') as HTMLInputElement).value.trim();
  const pass = ($('signupPassword') as HTMLInputElement).value;
  const pass2 = ($('signupPasswordConfirm') as HTMLInputElement).value;

  if (!name || !email || !pass || !pass2) {
    showMsg('signupMsg', 'Please fill in all fields.');
    return;
  }
  if (pass !== pass2) {
    showMsg('signupMsg', 'Passwords do not match.');
    return;
  }
  if (pass.length < 6) {
    showMsg('signupMsg', 'Password should be at least 6 characters.');
    return;
  }

  setLoading('signupSubmit', true);
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(user, { displayName: name });
    await sendEmailVerification(user).catch(() => { });
    showMsg('signupMsg', 'Account created! Please check your email for verification.', 'success');
  } catch (err: any) {
    const c = err?.code || '';
    if (c === 'auth/email-already-in-use') {
      showMsg('signupMsg', 'This email is already registered. Try signing in instead.');
    } else if (c === 'auth/weak-password') {
      showMsg('signupMsg', 'Password is too weak. Use at least 6 characters.');
    } else {
      showMsg('signupMsg', friendlyAuthError(err));
    }
  } finally {
    setLoading('signupSubmit', false);
  }
});
