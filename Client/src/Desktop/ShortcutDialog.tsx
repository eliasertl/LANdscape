import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowsClockwise, CheckCircle, Question, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { ICON_CELLS, ICON_UPLOAD_MAX_BYTES, cellToPx, findFirstFree, httpUrlSchema, type EmbedCheckResult, type IconMode, type OpenMode } from '@landscape/shared';
import { occupiedCells, viewportBounds } from './DesktopGrid';
import { api, errorMessage } from '../Api/Http';
import { useDesktopStore, shortcutIconUrl } from '../Store/DesktopStore';
import { useUiStore, type ShortcutDialogState } from '../Store/UiStore';
import { Dialog } from '../Components/Dialog';
import { Button } from '../Components/Button';
import { TextField } from '../Components/TextField';
import { Segmented } from '../Components/Select';
import { Spinner } from '../Components/Spinner';
import { toast } from '../Components/Toast';
import { PlaceholderIcon } from './PlaceholderIcon';
import styles from './ShortcutDialog.module.css';

type CheckState = { status: 'idle' } | { status: 'checking' } | { status: 'done'; result: EmbedCheckResult };

export function ShortcutDialog({ state }: { state: NonNullable<ShortcutDialogState> }) {
  const close = useUiStore((s) => s.openShortcutDialog);
  const createShortcut = useDesktopStore((s) => s.createShortcut);
  const updateShortcut = useDesktopStore((s) => s.updateShortcut);
  const editing = state.mode === 'edit' ? state.shortcut : null;

  const [name, setName] = useState(editing?.name ?? '');
  const [url, setUrl] = useState(editing?.url ?? '');
  const [iconMode, setIconMode] = useState<IconMode>(editing?.iconMode ?? 'favicon');
  const [iconFile, setIconFile] = useState<string | null>(editing?.iconMode === 'upload' ? editing.iconFile : null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(editing?.iconMode === 'upload' ? shortcutIconUrl(editing) : null);
  const [uploading, setUploading] = useState(false);
  const [openMode, setOpenMode] = useState<OpenMode>(editing?.openMode ?? 'auto');
  const [check, setCheck] = useState<CheckState>(
    editing
      ? { status: 'done', result: { status: editing.embeddable, reason: editing.embedReason ?? '', finalUrl: null, title: null } }
      : { status: 'idle' },
  );
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const checkedUrlRef = useRef<string | null>(editing?.url ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalisedUrl = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
    return trimmed;
  };

  const runCheck = async (value: string) => {
    const target = normalisedUrl(value);
    const parsed = httpUrlSchema.safeParse(target);
    if (!parsed.success) {
      setUrlError(parsed.error.issues[0]?.message ?? 'Invalid URL');
      return;
    }
    setUrlError(null);
    if (checkedUrlRef.current === target && check.status === 'done') return;
    checkedUrlRef.current = target;
    setCheck({ status: 'checking' });
    try {
      const result = await api.post<EmbedCheckResult>('/api/shortcuts/check-embed', { url: target });
      if (checkedUrlRef.current !== target) return;
      setCheck({ status: 'done', result });
      if (!name.trim() && result.title) setName(result.title);
    } catch (error) {
      if (checkedUrlRef.current !== target) return;
      setCheck({ status: 'done', result: { status: 'unknown', reason: errorMessage(error), finalUrl: null, title: null } });
    }
  };

  // Debounced auto-check while typing a URL.
  useEffect(() => {
    const target = normalisedUrl(url);
    if (!target || target === checkedUrlRef.current) return;
    const timer = window.setTimeout(() => void runCheck(url), 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const onUpload = async (file: File) => {
    if (file.size > ICON_UPLOAD_MAX_BYTES) {
      toast.error('Icons must be 2 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const result = await api.upload<{ file: string; url: string }>('/api/uploads/icon', file);
      setIconFile(result.file);
      setUploadPreview(result.url);
      setIconMode('upload');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const target = normalisedUrl(url);
    const parsed = httpUrlSchema.safeParse(target);
    if (!parsed.success) {
      setUrlError(parsed.error.issues[0]?.message ?? 'Invalid URL');
      return;
    }
    if (!name.trim()) return;
    if (iconMode === 'upload' && !iconFile) {
      toast.error('Choose an image for the icon or switch back to the favicon.');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), url: target, iconMode, iconFile: iconMode === 'upload' ? iconFile : null, openMode };
      if (editing) await updateShortcut(editing.id, payload);
      else {
        // New icons take the first free grid cell, column by column from the top left.
        const spot = findFirstFree(ICON_CELLS.cols, ICON_CELLS.rows, occupiedCells(null), viewportBounds());
        await createShortcut({ ...payload, ...cellToPx(spot.col, spot.row) });
      }
      close(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const title = editing ? 'Edit Shortcut' : 'Add new Shortcut';
  const checkedUrlDiffers = editing !== null && normalisedUrl(url) !== editing.url;

  return (
    <Dialog
      title={title}
      onClose={() => close(null)}
      locked={saving}
      width={480}
      initialFocus="input[name=name]"
      footer={
        <>
          <Button onClick={() => close(null)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="shortcut-form" loading={saving} disabled={!name.trim() || !url.trim() || uploading}>
            {editing ? 'Save' : 'Add Shortcut'}
          </Button>
        </>
      }
    >
      <form id="shortcut-form" className={styles.form} onSubmit={(e) => void onSubmit(e)} noValidate>
        <div className={styles.row}>
          <div className={styles.preview}>
            {iconMode === 'upload' && uploadPreview ? (
              <img src={uploadPreview} alt="" className={styles.previewImage} />
            ) : iconMode === 'favicon' && editing?.iconMode === 'favicon' && shortcutIconUrl(editing) && !checkedUrlDiffers ? (
              <img src={shortcutIconUrl(editing) ?? undefined} alt="" className={styles.previewImage} />
            ) : (
              <PlaceholderIcon name={name || '?'} size={56} />
            )}
          </div>
          <div className={styles.fields}>
            <TextField label="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My service" maxLength={64} required />
            <TextField
              label="URL"
              name="url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError(null);
              }}
              onBlur={() => url.trim() && void runCheck(url)}
              placeholder="http://192.168.1.10:8096"
              error={urlError}
              spellCheck={false}
              autoCapitalize="none"
              inputMode="url"
            />
          </div>
        </div>

        <EmbedStatus check={check} onRecheck={() => void runCheck(url)} />

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Icon</span>
          <div className={styles.iconRow}>
            <Segmented
              ariaLabel="Icon source"
              value={iconMode}
              onChange={(value) => setIconMode(value)}
              options={[
                { value: 'favicon', label: 'Site favicon' },
                { value: 'upload', label: 'Uploaded image' },
              ]}
            />
            {iconMode === 'upload' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="visually-hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUpload(file);
                    e.target.value = '';
                  }}
                />
                <Button icon={<UploadSimple />} loading={uploading} onClick={() => fileInputRef.current?.click()}>
                  {iconFile ? 'Replace image…' : 'Choose image…'}
                </Button>
              </>
            )}
          </div>
          {iconMode === 'upload' && <span className="text-footnote text-secondary">PNG, JPEG, SVG or WebP up to 2 MB.</span>}
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Open</span>
          <Segmented
            ariaLabel="How to open"
            value={openMode}
            onChange={(value) => setOpenMode(value)}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'embed', label: 'Try embedding anyway' },
              { value: 'newtab', label: 'Always new tab' },
            ]}
          />
          <span className="text-footnote text-secondary">
            {openMode === 'auto' && 'Opens in a window when the site allows embedding, otherwise offers a new tab.'}
            {openMode === 'embed' && 'Always tries the iframe, even if the check says the site blocks it.'}
            {openMode === 'newtab' && 'Never embeds; double-click opens a new browser tab.'}
          </span>
        </div>
      </form>
    </Dialog>
  );
}

function EmbedStatus({ check, onRecheck }: { check: CheckState; onRecheck: () => void }) {
  if (check.status === 'idle') {
    return (
      <div className={`${styles.status} ${styles.statusIdle}`}>
        <Question />
        <span>Enter a URL to check whether the site can be shown in a window.</span>
      </div>
    );
  }
  if (check.status === 'checking') {
    return (
      <div className={`${styles.status} ${styles.statusIdle}`}>
        <Spinner size={14} />
        <span>Checking whether the site allows embedding…</span>
      </div>
    );
  }
  const { result } = check;
  const Icon = result.status === 'yes' ? CheckCircle : result.status === 'no' ? WarningCircle : Question;
  const cls = result.status === 'yes' ? styles.statusOk : result.status === 'no' ? styles.statusBlocked : styles.statusUnknown;
  const headline = result.status === 'yes' ? 'Can be embedded' : result.status === 'no' ? "Can't be embedded — will offer “Open in new tab”" : 'Could not be checked';
  return (
    <div className={`${styles.status} ${cls}`}>
      <Icon weight="fill" />
      <span className={styles.statusText}>
        <strong>{headline}</strong>
        {result.reason && <span className={styles.statusReason}>{result.reason}</span>}
      </span>
      <Button size="small" variant="plain" icon={<ArrowsClockwise />} onClick={onRecheck} aria-label="Re-check">
        Re-check
      </Button>
    </div>
  );
}
