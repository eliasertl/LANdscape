import { useEffect, useState } from 'react';
import { Check, Desktop, Moon, Sun } from '@phosphor-icons/react';
import { ACCENT_PRESETS, type DayPart, type Settings, type Theme, type WallpaperChoice, type WallpaperInfo } from '@landscape/shared';
import { api, errorMessage } from '../../Api/Http';
import { useDesktopStore } from '../../Store/DesktopStore';
import { UI_SCALES, useDeviceStore } from '../../Store/DeviceStore';
import { Segmented, Select } from '../../Components/Select';
import { Toggle } from '../../Components/Toggle';
import { WallpaperPicker } from '../../Desktop/WallpaperDialog';
import { toast } from '../../Components/Toast';
import { accentHex } from '../../Design/Accent';
import { registries } from '../../Platform/Registries';
import { useRegistry } from '../../Platform/Registry';
import { openApp } from '../../Desktop/Launch';
import { SettingRow } from './SettingRow';
import styles from './SettingsApp.module.css';
import wallpaperStyles from '../../Desktop/WallpaperDialog.module.css';

type Appearance = Settings['appearance'];

const PARTS: { key: DayPart; label: string; hours: string }[] = [
  { key: 'morning', label: 'Morning', hours: '6–11' },
  { key: 'day', label: 'Day', hours: '11–17' },
  { key: 'evening', label: 'Evening', hours: '17–21' },
  { key: 'night', label: 'Night', hours: '21–6' },
];

function sameChoice(a: WallpaperChoice | null | undefined, b: WallpaperChoice): boolean {
  return a?.kind === b.kind && a.file === b.file;
}

export default function AppearanceSection() {
  const settings = useDesktopStore((s) => s.settings);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const uiScale = useDeviceStore((s) => s.settings.uiScale);
  const updateDevice = useDeviceStore((s) => s.update);
  const [wallpapers, setWallpapers] = useState<WallpaperInfo[]>([]);
  const appearance = settings?.appearance;
  const themePacks = useRegistry(registries.themes);
  const appWallpapers = useRegistry(registries.wallpapers);

  useEffect(() => {
    api
      .get<WallpaperInfo[]>('/api/wallpapers')
      .then(setWallpapers)
      .catch(() => setWallpapers([]));
  }, []);

  const setTheme = (theme: Theme) => {
    void updateSettings({ theme }).catch((error: unknown) => toast.error(errorMessage(error)));
  };
  const patch = (value: Parameters<typeof updateSettings>[0]['appearance']) => {
    void updateSettings({ appearance: value }).catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const accent = appearance?.accent ?? 'blue';
  const isPreset = accent in ACCENT_PRESETS;
  const slideshow = appearance?.slideshow;
  const timeOfDay = appearance?.timeOfDay;
  const wallpaperOptions = [{ value: '', label: 'Use the main wallpaper' }, ...wallpapers.map((w) => ({ value: `${w.kind}/${w.file}`, label: w.name }))];
  const choiceValue = (choice: WallpaperChoice | null | undefined) => (choice ? `${choice.kind}/${choice.file}` : '');
  const parseChoice = (value: string): WallpaperChoice | null => {
    const [kind, file] = value.split('/');
    return kind === 'bundled' || kind === 'upload' ? { kind, file: file ?? '' } : null;
  };

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Theme</h3>
        <div className={styles.group}>
          <SettingRow label="Appearance" detail="System follows your operating system. Dark is pure black.">
            <Segmented
              ariaLabel="Theme"
              value={settings?.theme ?? 'system'}
              onChange={setTheme}
              options={[
                { value: 'light', label: 'Light', icon: <Sun /> },
                { value: 'dark', label: 'Dark', icon: <Moon /> },
                { value: 'system', label: 'System', icon: <Desktop /> },
              ]}
            />
          </SettingRow>
          <SettingRow label="Accent color" detail="Buttons, selection and focus rings. Text on the accent switches to black or white for contrast.">
            <div className={styles.swatches} role="radiogroup" aria-label="Accent color">
              {Object.entries(ACCENT_PRESETS).map(([name, hex]) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={accent === name}
                  aria-label={name}
                  title={name[0]?.toUpperCase() + name.slice(1)}
                  className={`${styles.swatch} ${accent === name ? styles.swatchActive : ''}`}
                  style={{ background: hex }}
                  onClick={() => patch({ accent: name as Appearance['accent'] })}
                >
                  {accent === name && <Check weight="bold" />}
                </button>
              ))}
              <label className={`${styles.swatch} ${styles.swatchCustom} ${!isPreset ? styles.swatchActive : ''}`} title="Custom color" style={!isPreset ? { background: accentHex(accent) } : undefined}>
                <input type="color" aria-label="Custom accent color" value={accentHex(accent)} onChange={(e) => patch({ accent: e.target.value as Appearance['accent'] })} />
                {!isPreset && <Check weight="bold" />}
              </label>
            </div>
          </SettingRow>
          <SettingRow label="Theme pack" detail={themePacks.length === 0 ? 'Packs come from the App Store (a theme pack recolors the desktop through the design tokens).' : 'A pack recolors the desktop through the design tokens; the accent still applies.'}>
            {themePacks.length === 0 ? (
              <button type="button" className="text-footnote" style={{ background: 'none', border: 0, color: 'var(--color-accent)' }} onClick={() => openApp('app-store')}>
                Open the App Store
              </button>
            ) : (
              <Select
                aria-label="Theme pack"
                value={appearance?.themePack ?? ''}
                onChange={(value) => patch({ themePack: value || null })}
                options={[{ value: '', label: 'LANdscape (built in)' }, ...themePacks.map((t) => ({ value: t.id, label: t.name }))]}
              />
            )}
          </SettingRow>
          <SettingRow label="Blur" detail={`Blur of the frosted materials: ${appearance?.blur ?? 24} px. Reduced transparency in your OS turns it off.`}>
            <input
              type="range"
              aria-label="Blur"
              min={0}
              max={40}
              step={2}
              value={appearance?.blur ?? 24}
              onChange={(e) => patch({ blur: Number(e.target.value) })}
              className={styles.slider}
            />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Size</h3>
        <div className={styles.group}>
          <SettingRow label="UI scale" detail="Makes everything on the desktop larger or smaller." device>
            <Select
              aria-label="UI scale"
              value={String(uiScale)}
              onChange={(value) => updateDevice({ uiScale: Number(value) })}
              options={UI_SCALES.map((scale) => ({ value: String(scale), label: `${Math.round(scale * 100)} %${scale === 1 ? ' (default)' : ''}` }))}
            />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Wallpaper</h3>
        <WallpaperPicker />
        {appWallpapers.length > 0 && (
          <>
            <span className={wallpaperStyles.groupTitle}>From apps</span>
            <div className={wallpaperStyles.grid} role="listbox" aria-label="Wallpapers from apps">
              {appWallpapers.map((w) => {
                const [appId, file] = w.url.replace('/apps/files/', '').split(/\/(.+)/);
                const choice = { kind: 'app' as const, file: `${appId}:${file}` };
                const active = settings?.wallpaper.kind === 'app' && settings.wallpaper.file === choice.file;
                return (
                  <div key={w.id} className={wallpaperStyles.cell}>
                    <button type="button" role="option" aria-selected={active} className={`${wallpaperStyles.tile} ${active ? wallpaperStyles.active : ''}`} title={w.name} onClick={() => void updateSettings({ wallpaper: choice }).catch((error: unknown) => toast.error(errorMessage(error)))}>
                      <img src={w.url} alt={w.name} loading="lazy" />
                      {active && (
                        <span className={wallpaperStyles.checkmark}>
                          <Check weight="bold" />
                        </span>
                      )}
                    </button>
                    <span className={wallpaperStyles.name}>
                      <span className="text-truncate">{w.name}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Slideshow</h3>
        <div className={styles.group}>
          <SettingRow label="Rotate wallpapers" detail="Every device shows the same picture at the same time; pick at least two below.">
            <Toggle checked={slideshow?.enabled ?? false} onChange={(enabled) => patch({ slideshow: { enabled } })} />
          </SettingRow>
          <SettingRow label="Change every">
            <Select
              aria-label="Slideshow interval"
              value={String(slideshow?.intervalMinutes ?? 30)}
              onChange={(value) => patch({ slideshow: { intervalMinutes: Number(value) } })}
              options={[1, 5, 15, 30, 60, 180, 720, 1440].map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : '1 day' }))}
            />
          </SettingRow>
          <SettingRow label="Order">
            <Segmented
              ariaLabel="Slideshow order"
              value={slideshow?.order ?? 'sequence'}
              onChange={(order) => patch({ slideshow: { order } })}
              options={[
                { value: 'sequence', label: 'In order' },
                { value: 'shuffle', label: 'Shuffle' },
              ]}
            />
          </SettingRow>
        </div>
        <div className={wallpaperStyles.grid} role="group" aria-label="Slideshow pictures">
          {wallpapers.map((w) => {
            const on = (slideshow?.wallpapers ?? []).some((c) => sameChoice(c, w));
            return (
              <div key={`${w.kind}/${w.file}`} className={wallpaperStyles.cell}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className={`${wallpaperStyles.tile} ${on ? wallpaperStyles.active : ''}`}
                  title={w.name}
                  onClick={() => {
                    const current = slideshow?.wallpapers ?? [];
                    const next = on ? current.filter((c) => !sameChoice(c, w)) : [...current, { kind: w.kind, file: w.file }];
                    patch({ slideshow: { wallpapers: next } });
                  }}
                >
                  <img src={w.url} alt={w.name} loading="lazy" />
                  {on && (
                    <span className={wallpaperStyles.checkmark}>
                      <Check weight="bold" />
                    </span>
                  )}
                </button>
                <span className={wallpaperStyles.name}>
                  <span className="text-truncate">{w.name}</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Time of day</h3>
        <div className={styles.group}>
          <SettingRow label="Wallpaper by time of day" detail="Overrides the slideshow and the main wallpaper for the parts of the day you assign.">
            <Toggle checked={timeOfDay?.enabled ?? false} onChange={(enabled) => patch({ timeOfDay: { enabled } })} />
          </SettingRow>
          {PARTS.map((part) => (
            <SettingRow key={part.key} label={part.label} detail={`${part.hours} h`}>
              <Select aria-label={`${part.label} wallpaper`} value={choiceValue(timeOfDay?.[part.key])} onChange={(value) => patch({ timeOfDay: { [part.key]: parseChoice(value) } })} options={wallpaperOptions} />
            </SettingRow>
          ))}
        </div>
      </section>
    </>
  );
}
