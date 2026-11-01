import { useRef, useState } from 'react';
import { UploadSimple } from '@phosphor-icons/react';
import { CURSOR_STATES, CURSOR_UPLOAD_MAX_BYTES } from '@landscape/shared';
import { api, errorMessage } from '../../Api/Http';
import { useDesktopStore } from '../../Store/DesktopStore';
import { CURSOR_SCALES, useDeviceStore } from '../../Store/DeviceStore';
import { Select } from '../../Components/Select';
import { Button } from '../../Components/Button';
import { toast } from '../../Components/Toast';
import { registries, type CursorState } from '../../Platform/Registries';
import { useRegistry } from '../../Platform/Registry';
import { SettingRow } from './SettingRow';
import styles from './SettingsApp.module.css';

const STATE_LABELS: Record<CursorState, string> = { default: 'Default', pointer: 'Pointer (links, buttons)', text: 'Text', move: 'Move', resize: 'Resize', busy: 'Busy' };

export default function CursorSection() {
  const cursor = useDesktopStore((s) => s.settings?.cursor);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const scale = useDeviceStore((s) => s.settings.cursorScale);
  const updateDevice = useDeviceStore((s) => s.update);
  const sets = useRegistry(registries.cursorSets);
  const [uploadingState, setUploadingState] = useState<CursorState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (value: Parameters<typeof updateSettings>[0]['cursor']) => {
    void updateSettings({ cursor: value }).catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const upload = async (state: CursorState, file: File) => {
    if (file.size > CURSOR_UPLOAD_MAX_BYTES) {
      toast.error('Cursor images must be 256 KB or smaller.');
      return;
    }
    try {
      const result = await api.upload<{ file: string }>('/api/uploads/media/cursor', file);
      const previous = cursor?.custom[state]?.file;
      if (previous) await api.delete(`/api/uploads/media/cursor/${previous}`).catch(() => undefined);
      patch({ custom: { ...cursor?.custom, [state]: { file: result.file, hotspotX: 0, hotspotY: 0 } }, set: 'custom' });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const setHotspot = (state: CursorState, axis: 'hotspotX' | 'hotspotY', value: number) => {
    const current = cursor?.custom[state];
    if (!current) return;
    patch({ custom: { ...cursor?.custom, [state]: { ...current, [axis]: Math.max(0, Math.min(128, Math.round(value))) } } });
  };

  if (!cursor) return null;

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Cursor</h3>
        <p className="text-callout text-secondary">Embedded sites inside windows keep their own cursor; a page cannot change the cursor of another page.</p>
        <div className={styles.group}>
          <SettingRow label="Cursor set" detail="Built-in sets are drawn for LANdscape; apps can add their own.">
            <Select
              aria-label="Cursor set"
              value={cursor.set}
              onChange={(set) => patch({ set })}
              options={[...sets.map((s) => ({ value: s.id, label: s.name })), { value: 'custom', label: 'Your uploads' }]}
            />
          </SettingRow>
          <SettingRow label="Size" detail="Scales the custom cursor on this screen." device>
            <Select aria-label="Cursor size" value={String(scale)} onChange={(value) => updateDevice({ cursorScale: Number(value) })} options={CURSOR_SCALES.map((s) => ({ value: String(s), label: `${Math.round(s * 100)} %` }))} />
          </SettingRow>
        </div>
        <div className={styles.cursorPreview} aria-label="Cursor preview">
          {sets
            .filter((s) => s.id === cursor.set)
            .flatMap((s) =>
              (Object.keys(s.cursors) as CursorState[]).map((state) => {
                const image = s.cursors[state];
                return image ? <img key={state} src={image.url} alt={STATE_LABELS[state]} title={STATE_LABELS[state]} width={32 * scale} height={32 * scale} /> : null;
              }),
            )}
          {cursor.set === 'system' && <span className="text-footnote text-secondary">The operating system's own cursor.</span>}
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Your uploads</h3>
        <p className="text-footnote text-secondary">PNG or SVG per state, up to 256 KB, drawn at 32 × 32. The hotspot is the pixel that clicks. Missing states use the system cursor.</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/svg+xml"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && uploadingState) void upload(uploadingState, file);
            e.target.value = '';
          }}
        />
        <div className={styles.group}>
          {CURSOR_STATES.map((state) => {
            const entry = cursor.custom[state];
            return (
              <SettingRow key={state} label={STATE_LABELS[state]} detail={entry ? entry.file : 'Not uploaded'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {entry && (
                    <>
                      <img src={`/cursors/${entry.file}`} alt="" width={24} height={24} />
                      <label className={styles.hotspot}>
                        x <input type="number" min={0} max={128} value={entry.hotspotX} aria-label={`${STATE_LABELS[state]} hotspot x`} onChange={(e) => setHotspot(state, 'hotspotX', Number(e.target.value))} />
                      </label>
                      <label className={styles.hotspot}>
                        y <input type="number" min={0} max={128} value={entry.hotspotY} aria-label={`${STATE_LABELS[state]} hotspot y`} onChange={(e) => setHotspot(state, 'hotspotY', Number(e.target.value))} />
                      </label>
                    </>
                  )}
                  <Button
                    size="small"
                    icon={<UploadSimple />}
                    onClick={() => {
                      setUploadingState(state);
                      fileRef.current?.click();
                    }}
                  >
                    {entry ? 'Replace…' : 'Upload…'}
                  </Button>
                </div>
              </SettingRow>
            );
          })}
        </div>
      </section>
    </>
  );
}
