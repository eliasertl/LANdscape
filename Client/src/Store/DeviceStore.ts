import { create } from 'zustand';
import { z } from 'zod';
import { applyUiScale } from '../Design/Scale';
import { isSafeMode } from '../Platform/SafeMode';

/**
 * Per-device settings: things that differ per screen or browser. Stored in
 * this browser's localStorage only (never synced, never sent to the server)
 * and labelled "This device" in Settings. Server-wide settings live in
 * Shared/src/Settings.ts instead.
 *
 * To add one: add the field with its default below; old stored values are
 * merged with the defaults, and invalid ones are dropped.
 */
export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

const deviceSettingsSchema = z.object({
  uiScale: z.number().min(0.75).max(1.5).default(1),
});

export type DeviceSettings = z.infer<typeof deviceSettingsSchema>;

const DEVICE_ID_KEY = 'landscape.deviceId';
const settingsKey = (deviceId: string) => `landscape.device.${deviceId}`;

function randomId(): string {
  // crypto.randomUUID needs a secure context; LANdscape is usually opened over plain http.
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^[0-9a-f]{8,64}$/.test(existing)) return existing;
    const id = randomId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return 'unavailable';
  }
}

export function parseDeviceSettings(raw: unknown): DeviceSettings {
  const base = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result: Record<string, unknown> = {};
  // Field by field, so one bad value does not reset the others.
  for (const [key, field] of Object.entries(deviceSettingsSchema.shape)) {
    const parsed = field.safeParse(base[key]);
    result[key] = parsed.success ? parsed.data : field.parse(undefined);
  }
  return result as DeviceSettings;
}

function load(deviceId: string): DeviceSettings {
  try {
    const raw = localStorage.getItem(settingsKey(deviceId));
    return parseDeviceSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return parseDeviceSettings({});
  }
}

function save(deviceId: string, settings: DeviceSettings): void {
  try {
    localStorage.setItem(settingsKey(deviceId), JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage: the setting still applies until reload.
  }
}

interface DeviceState {
  deviceId: string;
  settings: DeviceSettings;
  update: (patch: Partial<DeviceSettings>) => void;
}

const deviceId = readDeviceId();

export const useDeviceStore = create<DeviceState>((set, get) => ({
  deviceId,
  settings: load(deviceId),
  update(patch) {
    const settings = parseDeviceSettings({ ...get().settings, ...patch });
    save(get().deviceId, settings);
    set({ settings });
    applyDeviceSettings(settings);
  },
}));

/** Applies the per-device settings to the page (called once at start and after each change). */
export function applyDeviceSettings(settings: DeviceSettings = useDeviceStore.getState().settings): void {
  // Safe mode ignores the scale so a bad value can never make the desktop unusable.
  applyUiScale(isSafeMode() ? 1 : settings.uiScale);
}
