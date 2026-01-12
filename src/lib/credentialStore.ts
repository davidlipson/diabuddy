// Credential storage using Tauri's store plugin
// Falls back to localStorage in browser environment

interface Credentials {
  email: string;
  password: string;
}

const STORE_KEY = "libre-credentials";

async function getTauriStore() {
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    return await load("credentials.json", { autoSave: true });
  } catch {
    return null;
  }
}

export async function saveCredentials(email: string, password: string): Promise<void> {
  const store = await getTauriStore();
  
  if (store) {
    await store.set(STORE_KEY, { email, password });
    await store.save();
  } else {
    // Fallback to localStorage for browser dev
    localStorage.setItem(STORE_KEY, JSON.stringify({ email, password }));
  }
}

export async function loadCredentials(): Promise<Credentials | null> {
  const store = await getTauriStore();
  
  if (store) {
    const creds = await store.get<Credentials>(STORE_KEY);
    return creds || null;
  } else {
    // Fallback to localStorage for browser dev
    const stored = localStorage.getItem(STORE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as Credentials;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function clearCredentials(): Promise<void> {
  const store = await getTauriStore();
  
  if (store) {
    await store.delete(STORE_KEY);
    await store.save();
  } else {
    localStorage.removeItem(STORE_KEY);
  }
}

