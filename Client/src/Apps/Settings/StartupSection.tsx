import { useRef, useState } from 'react';
import { Play, Trash, UploadSimple } from '@phosphor-icons/react';
import { STARTUP_IMAGE_MAX_BYTES, STARTUP_SOUND_MAX_BYTES, STARTUP_VIDEO_MAX_BYTES, type Settings } from '@landscape/shared';
import { api, errorMessage } from '../../Api/Http';
import { useDesktopStore } from '../../Store/DesktopStore';
import { useDeviceStore } from '../../Store/DeviceStore';
import { Segmented, Select } from '../../Components/Select';
import { Toggle } from '../../Components/Toggle';
import { Button } from '../../Components/Button';
import { TextField } from '../../Components/TextField';
import { toast } from '../../Components/Toast';
import { registries } from '../../Platform/Registries';
import { useRegistry } from '../../Platform/Registry';
import { StartupAnimation } from '../../Startup/StartupAnimation';
import { SettingRow } from './SettingRow';
import styles from './SettingsApp.module.css';

type Startup = Settings['startup'];

export default function StartupSection() {
  const startup = useDesktopStore((s) => s.settings?.startup);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const soundOn = useDeviceStore((s) => s.settings.startupSound);
  const updateDevice = useDeviceStore((s) => s.update);
  const presets = useRegistry(registries.startupAnimations);
  const [previewing, setPreviewing] = useState(false);
  const [text, setText] = useState(startup?.text ?? '');
  const logoRef = useRef<HTMLInputElement>(null);
  const soundRef = useRef<HTMLInputElement>(null);

  const patch = (value: Parameters<typeof updateSettings>[0]['startup']) => {
    void updateSettings({ startup: value }).catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const uploadLogo = async (file: File) => {
    const video = file.type.startsWith('video/');
    const limit = video ? STARTUP_VIDEO_MAX_BYTES : STARTUP_IMAGE_MAX_BYTES;
    if (file.size > limit) {
      toast.error(`${video ? 'Videos' : 'Images'} must be ${Math.round(limit / 1024 / 1024)} MB or smaller.`);
      return;
    }
    try {
      const result = await api.upload<{ file: string }>(`/api/uploads/media/${video ? 'video' : 'image'}`, file);
      if (startup?.logoFile) await api.delete(`/api/uploads/media/${/\.(webm|mp4)$/i.test(startup.logoFile) ? 'video' : 'image'}/${startup.logoFile}`).catch(() => undefined);
      patch({ logoFile: result.file });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const uploadSound = async (file: File) => {
    if (file.size > STARTUP_SOUND_MAX_BYTES) {
      toast.error('Sounds must be 2 MB or smaller.');
      return;
    }
    try {
      const result = await api.upload<{ file: string }>('/api/uploads/media/sound', file);
      if (startup?.sound.file) await api.delete(`/api/uploads/media/sound/${startup.sound.file}`).catch(() => undefined);
      patch({ sound: { kind: 'upload', file: result.file } });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (!startup) return null;

  return (
    <>
      {previewing && <StartupAnimation settings={startup} userGesture preview onDone={() => setPreviewing(false)} />}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Startup animation</h3>
          <Button size="small" variant="primary" icon={<Play weight="fill" />} onClick={() => setPreviewing(true)} data-startup-preview>
            Preview
          </Button>
        </div>
        <div className={styles.group}>
          <SettingRow label="Play" detail="On page load it shows before the lock screen; after login it plays once you are in.">
            <Select
              aria-label="When to play"
              value={startup.when}
              onChange={(when) => patch({ when: when as Startup['when'] })}
              options={[
                { value: 'never', label: 'Never' },
                { value: 'load', label: 'On page load' },
                { value: 'login', label: 'After login' },
                { value: 'both', label: 'Both' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Preset" detail="Apps from the catalog can add their own.">
            <Select aria-label="Preset" value={startup.preset} onChange={(preset) => patch({ preset })} options={presets.map((p) => ({ value: p.id, label: p.name }))} />
          </SettingRow>
          <SettingRow label="Duration" detail={`${(startup.durationMs / 1000).toFixed(1)} s`}>
            <input type="range" aria-label="Duration" min={500} max={8000} step={100} value={startup.durationMs} onChange={(e) => patch({ durationMs: Number(e.target.value) })} className={styles.slider} />
          </SettingRow>
          <SettingRow label="Speed" detail="For presets with motion (boot log, particles).">
            <Segmented
              ariaLabel="Speed"
              value={String(startup.speed)}
              onChange={(speed) => patch({ speed: Number(speed) })}
              options={[
                { value: '0.5', label: 'Slow' },
                { value: '1', label: 'Normal' },
                { value: '2', label: 'Fast' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Skippable" detail="A click or key ends it early.">
            <Toggle checked={startup.skippable} onChange={(skippable) => patch({ skippable })} />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Look</h3>
        <div className={styles.group}>
          <SettingRow label="Text" detail="Shown by the text presets; the logo replaces it when uploaded.">
            <TextField aria-label="Startup text" value={text} maxLength={64} onChange={(e) => setText(e.target.value)} onBlur={() => text !== startup.text && patch({ text })} />
          </SettingRow>
          <SettingRow label="Colors">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className={styles.colorField}>
                <input type="color" aria-label="Background color" value={startup.background} onChange={(e) => patch({ background: e.target.value })} />
                Background
              </label>
              <label className={styles.colorField}>
                <input type="color" aria-label="Foreground color" value={startup.foreground} onChange={(e) => patch({ foreground: e.target.value })} />
                Text
              </label>
            </div>
          </SettingRow>
          <SettingRow label="Logo" detail={startup.logoFile ? startup.logoFile : 'PNG, JPEG, WebP, SVG or GIF up to 5 MB, or a short WebM/MP4 video up to 15 MB.'}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,video/webm,video/mp4" className="visually-hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ''; }} />
              <Button size="small" icon={<UploadSimple />} onClick={() => logoRef.current?.click()}>
                Upload…
              </Button>
              {startup.logoFile && (
                <Button size="small" variant="plain" icon={<Trash />} aria-label="Remove logo" onClick={() => patch({ logoFile: null })} />
              )}
            </div>
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Sound</h3>
        <p className="text-footnote text-secondary">Browsers only play sound after you interacted with the page. On page load it plays when the browser allows it and stays silent otherwise.</p>
        <div className={styles.group}>
          <SettingRow label="Sound">
            <Segmented
              ariaLabel="Startup sound"
              value={startup.sound.kind}
              onChange={(kind) => patch({ sound: { kind } })}
              options={[
                { value: 'none', label: 'None' },
                { value: 'chime', label: 'Chime' },
                { value: 'upload', label: 'Your file' },
              ]}
            />
          </SettingRow>
          {startup.sound.kind === 'upload' && (
            <SettingRow label="File" detail={startup.sound.file ?? 'MP3, OGG or WAV up to 2 MB.'}>
              <input ref={soundRef} type="file" accept="audio/mpeg,audio/ogg,audio/wav" className="visually-hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSound(f); e.target.value = ''; }} />
              <Button size="small" icon={<UploadSimple />} onClick={() => soundRef.current?.click()}>
                Upload…
              </Button>
            </SettingRow>
          )}
          <SettingRow label="Volume" detail={`${startup.sound.volume} %`}>
            <input type="range" aria-label="Volume" min={0} max={100} step={5} value={startup.sound.volume} onChange={(e) => patch({ sound: { volume: Number(e.target.value) } })} className={styles.slider} />
          </SettingRow>
          <SettingRow label="Play sound on this device" device>
            <Toggle checked={soundOn} onChange={(startupSound) => updateDevice({ startupSound })} />
          </SettingRow>
        </div>
      </section>
    </>
  );
}
