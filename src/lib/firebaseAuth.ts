import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const REDIRECT_META_KEY = 'outspace_google_redirect_meta';

const resolvedFirebaseConfig = {
  ...firebaseConfig,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || firebaseConfig.authDomain,
};

const app = getApps().length > 0 ? getApp() : initializeApp(resolvedFirebaseConfig);
export const firebaseAuth = getAuth(app);

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/userinfo.email');
  provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export function isEmbeddedIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(navigator.userAgent);
}

export function getFirebaseProjectId(): string {
  return firebaseConfig.projectId || '';
}

export async function signInWithGooglePopup(): Promise<{ idToken: string; accessToken?: string }> {
  const provider = createGoogleProvider();
  const result = await signInWithPopup(firebaseAuth, provider);
  const idToken = await result.user.getIdToken();
  const credential = GoogleAuthProvider.credentialFromResult(result);
  return {
    idToken,
    accessToken: credential?.accessToken,
  };
}

export async function startGoogleRedirect(
  role: 'student' | 'mentor',
  returnPath: '/login' | '/signup'
): Promise<void> {
  const payload = JSON.stringify({ role, returnPath, ts: Date.now() });
  try {
    window.sessionStorage.setItem(REDIRECT_META_KEY, payload);
    window.localStorage.setItem(REDIRECT_META_KEY, payload);
  } catch {
    // ignore storage limits
  }
  const provider = createGoogleProvider();
  await signInWithRedirect(firebaseAuth, provider);
}

export async function consumeGoogleRedirectResult(): Promise<{
  idToken: string;
  accessToken?: string;
  role: 'student' | 'mentor';
  returnPath: string;
} | null> {
  const result = await getRedirectResult(firebaseAuth);
  if (!result) return null;

  let role: 'student' | 'mentor' = 'student';
  let returnPath = '/login';
  try {
    const raw =
      window.sessionStorage.getItem(REDIRECT_META_KEY) ||
      window.localStorage.getItem(REDIRECT_META_KEY);
    window.sessionStorage.removeItem(REDIRECT_META_KEY);
    window.localStorage.removeItem(REDIRECT_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { role?: string; returnPath?: string; ts?: number };
      if (parsed.ts && Date.now() - parsed.ts < 15 * 60 * 1000) {
        if (parsed.role === 'mentor') role = 'mentor';
        if (parsed.returnPath === '/signup' || parsed.returnPath === '/login') {
          returnPath = parsed.returnPath;
        }
      }
    }
  } catch {
    // ignore
  }

  const idToken = await result.user.getIdToken();
  const credential = GoogleAuthProvider.credentialFromResult(result);
  return {
    idToken,
    accessToken: credential?.accessToken,
    role,
    returnPath,
  };
}

export async function signOutFirebase(): Promise<void> {
  try {
    if (firebaseAuth.currentUser) {
      await signOut(firebaseAuth);
    }
  } catch {
    // ignore
  }
}
