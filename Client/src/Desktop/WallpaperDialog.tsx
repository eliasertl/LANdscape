import { useEffect, useRef, useState } from 'react';
import { Check, Trash, UploadSimple } from '@phosphor-icons/react';
import { WALLPAPER_UPLOAD_MAX_BYTES, type WallpaperInfo } from '@landscape/shared';
import { api, errorMessage } from '../Api/Http';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { Dialog } from '../Components/Dialog';
import { Button } from '../Components/Button';
import { Spinner } from '../Components/Spinner';
import { toast } from '../Components/Toast';
import styles from './WallpaperDialog.module.css';

export function WallpaperDialog({ embedded = false }: { embedded?: boolean }) {
  const setOpen = useUiStore((s) => s.setWallpaperDialogOpen);
  const content = <WallpaperPicker />;
  if (embedded) return content;
  return (
    <Dialog title="Change Wallpaper" onClose={() => setOpen(false)} width={640}>
      {content}
    </Dialog>
  );
}

export function WallpaperPicker() {
  const settings = useDesktopStore((s) => s.settings);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const [wallpapers, setWallpapers] = useState<WallpaperInfo[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    try {
      setWallpapers(await api.get<WallpaperInfo[]>('/api/wallpapers'));
    } catch (error) {
      toast.error(errorMessage(error));
      setWallpapers([]);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const choose = async (w: WallpaperInfo) => {
    try {
      await updateSettings({ wallpaper: { kind: w.kind, file: w.file } });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const upload = async (file: File) => {
    if (file.size > WALLPAPER_UPLOAD_MAX_BYTES) {
      toast.error('Wallpapers must be 20 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const info = await api.upload<WallpaperInfo>('/api/uploads/wallpaper', file);
      await reload();
      await choose(info);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (w: WallpaperInfo) => {
    try {
      await api.delete(`/api/wallpapers/${encodeURIComponent(w.file)}`);
      await reload();
      await useDesktopStore.getState().load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const current = settings?.wallpaper;
  const bundled = wallpapers?.filter((w) => w.kind === 'bundled') ?? [];
  const uploads = wallpapers?.filter((w) => w.kind === 'upload') ?? [];

  return (
    <div className={styles.picker}>
      {wallpapers === null ? (
        <div className={styles.loading}>
          <Spinner size={22} />
        </div>
      ) : (
        <>
          <Group title="Bundled" items={bundled} current={current} onChoose={choose} />
          <Group title="Your uploads" items={uploads} current={current} onChoose={choose} onRemove={remove} empty="Upload your own image below." />
        </>
      )}
      <div className={styles.actions}>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        <Button icon={<UploadSimple />} loading={uploading} onClick={() => fileRef.current?.click()}>
          Upload image…
        </Button>
        <span className="text-footnote text-secondary">PNG, JPEG or WebP up to 20 MB. Uploaded wallpapers are only shown after login.</span>
      </div>
    </div>
  );
}

function Group({
  title,
  items,
  current,
  onChoose,
  onRemove,
  empty,
}: {
  title: string;
  items: WallpaperInfo[];
  current: { kind: string; file: string } | undefined;
  onChoose: (w: WallpaperInfo) => void | Promise<void>;
  onRemove?: (w: WallpaperInfo) => void | Promise<void>;
  empty?: string;
}) {
  return (
    <div className={styles.group}>
      <span className={styles.groupTitle}>{title}</span>
      {items.length === 0 ? (
        <span className="text-callout text-secondary">{empty ?? 'None'}</span>
      ) : (
        <div className={styles.grid} role="listbox" aria-label={title}>
          {items.map((w) => {
            const active = current?.kind === w.kind && current.file === w.file;
            return (
              <div key={`${w.kind}/${w.file}`} className={styles.cell}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`${styles.tile} ${active ? styles.active : ''}`}
                  onClick={() => void onChoose(w)}
                  title={w.name}
                >
                  <img src={w.url} alt={w.name} loading="lazy" />
                  {active && (
                    <span className={styles.checkmark}>
                      <Check weight="bold" />
                    </span>
                  )}
                </button>
                <span className={styles.name}>
                  <span className="text-truncate">{w.name}</span>
                  {onRemove && (
                    <button type="button" className={styles.remove} aria-label={`Delete ${w.name}`} onClick={() => void onRemove(w)}>
                      <Trash />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
