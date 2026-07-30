import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { env } from './env';

// The auth session (which includes access + refresh tokens) is sensitive, so
// on a real device we keep it in the OS secure keystore (Keychain / Keystore)
// via expo-secure-store. SecureStore has a ~2KB per-value limit and isn't
// available on web, so we fall back to AsyncStorage off-device.
//
// SecureStore keys must be alphanumeric + ".", "-", "_" — Supabase's storage
// keys already fit, but we sanitize defensively.
const SecureStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(sanitize(key)),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(sanitize(key), value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(sanitize(key)),
};

function sanitize(key: string) {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// A no-op storage for any non-browser context (e.g. web pre-render in Node,
// where `window` is undefined). AsyncStorage on web touches window.localStorage,
// so we only use it once we know we're actually in a browser.
const memoryStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

function webStorage() {
  return typeof window !== 'undefined' ? AsyncStorage : memoryStorage;
}

const storage = Platform.OS === 'web' ? webStorage() : SecureStorageAdapter;

export const supabase = createClient(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      // Deep-link redirect handling isn't needed for email OTP codes, which
      // are entered in-app. (Relevant if we add magic links / OAuth later.)
      detectSessionInUrl: false,
    },
  },
);
