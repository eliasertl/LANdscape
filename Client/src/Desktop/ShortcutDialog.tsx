import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowsClockwise, CheckCircle, Question, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import {
  ICON_CELLS,
  ICON_UPLOAD_MAX_BYTES,
  findFirstFree,
  httpUrlSchema,
  proxyPortsFullMessage,
  shortcutWantsProxy,
  type EmbedCheckResult,
  type IconMode,
  type OpenMode,
} from '@landscape/shared';
import { occupiedCells, positionForCell, viewportBounds } from './DesktopGrid';
import { Toggle } from '../Components/Toggle';
import { Select } from '../Components/Select';
import { containerUrl } from '../Apps/Docker/ContainerShortcut';
import { api, errorMessage } from '../Api/Http';
import { useDesktopStore, shortcutIconUrl, proxyTotal } from '../Store/DesktopStore';
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

const OPEN_MODE_HELP: Record<OpenMode, string> = {
  auto: 'Opens in a window. Sites that block embedding are shown through the LANdscape proxy.',
  embed: 'Try embedding anyway: always loads the site directly, even if the check says it blocks embedding.',
  proxy: 'Always shows the site through the LANdscape proxy on its own port, without its framing restrictions.',
  newtab: 'Never embeds; double-click opens a new browser tab.',
};

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export function ShortcutDialog({ state }: { state: NonNullable<ShortcutDialogState> }) {
  const close = useUiStore((s) => s.openShortcutDialog);
  const createShortcut = useDesktopStore((s) => s.createShortcut);
  const updateShortcut = useDesktopStore((s) => s.updateShortcut);
  const total = useDesktopStore((s) => proxyTotal(s.proxy));
  const editing = state.mode === 'edit' ? state.shortcut : null;
  const prefill = state.mode === 'create' ? (state.prefill ?? null) : null;
  const portsUsedByOthers = useDesktopStore((s) => s.shortcuts.filter((x) => x.proxyPort !== null && x.id !== editing?.id).length);

  const [name, setName] = useState(editing?.name ?? prefill?.name ?? '');
  const [url, setUrl] = useState(editing?.url ?? prefill?.url ?? '');
  const [iconMode, setIconMode] = useState<IconMode>(editing?.iconMode ?? 'favicon');
  const [iconFile, setIconFile] = useState<string | null>(editing?.iconMode === 'upload' ? editing.iconFile : null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(editing?.iconMode === 'upload' ? shortcutIconUrl(editing) : null);
  const [healthCheck, setHealthCheck] = useState(editing?.healthCheck ?? true);
  const [labelIconTried, setLabelIconTried] = useState(false);
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

  // A container label icon (CasaOS etc.): fetched through the icon upload so it is stored like any upload.
  useEffect(() => {
    if (!prefill?.iconUrl || labelIconTried) return;
    setLabelIconTried(true);
    fetch(prefill.iconUrl)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('icon'))))
      .then((blob) => api.upload<{ file: string; url: string }>('/api/uploads/icon', blob))
      .then((result) => {
        setIconFile(result.file);
        setUploadPreview(result.url);
        setIconMode('upload');
      })
      .catch(() => undefined);
  }, [prefill, labelIconTried]);

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
      const payload = { name: name.trim(), url: target, iconMode, iconFile: iconMode === 'upload' ? iconFile : null, openMode, healthCheck };
      if (editing) await updateShortcut(editing.id, payload);
      else {
        // New icons take the first free grid cell, column by column from the top left.
        const spot = findFirstFree(ICON_CELLS.cols, ICON_CELLS.rows, occupiedCells(null), viewportBounds());
        await createShortcut({ ...payload, position: positionForCell({ ...spot, ...ICON_CELLS }) });
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

  // Proxy port outlook for the current choice, mirroring the server's assignment rules.
  const embeddable = check.status === 'done' ? check.result.status : 'unknown';
  const needsProxy = shortcutWantsProxy({ openMode, embeddable });
  const keptPort = editing?.proxyPort != null && sameOrigin(normalisedUrl(url), editing.url) ? editing.proxyPort : null;
  const freePorts = total - portsUsedByOthers;
  const proxyFull = needsProxy && keptPort === null && freePorts <= 0;
  let portNote: { text: string; error: boolean } | null = null;
  if (needsProxy && keptPort !== null) portNote = { text: `Shown through proxy port :${keptPort}.`, error: false };
  else if (proxyFull && openMode === 'proxy') portNote = { text: proxyPortsFullMessage(total), error: true };
  else if (proxyFull) portNote = { text: `${proxyPortsFullMessage(total)} Until then it offers a new tab.`, error: false };
  else if (needsProxy) portNote = { text: `Gets a proxy port when saved (${freePorts} of ${total} free).`, error: false };

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
          <Button
            variant="primary"
            type="submit"
            form="shortcut-form"
            loading={saving}
            disabled={!name.trim() || !url.trim() || uploading || (proxyFull && openMode === 'proxy')}
          >
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

        {prefill && prefill.ports.length > 1 && (
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Published port</span>
            <Select
              aria-label="Published port"
              value={String(prefill.ports.find((p) => url.includes(`:${p}/`)) ?? prefill.ports[0])}
              onChange={(value) => {
                setUrl(containerUrl(Number(value)));
                setUrlError(null);
              }}
              options={prefill.ports.map((p) => ({ value: String(p), label: `${p} → ${containerUrl(p)}` }))}
            />
          </div>
        )}

        <EmbedStatus check={check} openMode={openMode} onRecheck={() => void runCheck(url)} />

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
              { value: 'auto', label: 'Auto' },
              { value: 'embed', label: 'Direct' },
              { value: 'proxy', label: 'Via proxy' },
              { value: 'newtab', label: 'New tab' },
            ]}
          />
          <span className="text-footnote text-secondary">{OPEN_MODE_HELP[openMode]}</span>
          {portNote && (
            <span className={`text-footnote ${portNote.error ? styles.portError : 'text-secondary'}`} role={portNote.error ? 'alert' : undefined} data-proxy-note>
              {portNote.text}
            </span>
          )}
        </div>

        <div className={styles.section}>
          <label className={styles.toggleRow}>
            <span className={styles.rowText}>
              <span className={styles.sectionLabel}>Health check</span>
              <span className="text-footnote text-secondary">The server fetches the URL periodically; the icon shows a green, red or grey dot.</span>
            </span>
            <Toggle checked={healthCheck} onChange={setHealthCheck} />
          </label>
        </div>
      </form>
    </Dialog>
  );
}

const BLOCKED_HEADLINE: Record<OpenMode, string> = {
  auto: 'Blocks embedding — will open through the LANdscape proxy',
  proxy: 'Blocks embedding — the LANdscape proxy removes the restriction',
  embed: 'Blocks embedding — a direct window will probably stay empty',
  newtab: 'Blocks embedding',
};

function EmbedStatus({ check, openMode, onRecheck }: { check: CheckState; openMode: OpenMode; onRecheck: () => void }) {
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
  const headline = result.status === 'yes' ? 'Can be embedded' : result.status === 'no' ? BLOCKED_HEADLINE[openMode] : 'Could not be checked';
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
