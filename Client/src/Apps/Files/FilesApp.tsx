import { createElement, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowUp,
  DownloadSimple,
  File as FileIcon,
  FileCode,
  FileImage,
  FileText,
  FileZip,
  Folder,
  FolderPlus,
  LinkSimple,
  List,
  PencilSimple,
  SquaresFour,
  Trash,
  UploadSimple,
  WindowsLogo,
} from '@phosphor-icons/react';
import type { FileEntry, FileListing } from '@landscape/shared';
import type { AppWindowProps } from '../Types';
import { api, errorMessage } from '../../Api/Http';
import { useUiStore } from '../../Store/UiStore';
import { useWindowStore } from '../../Store/WindowStore';
import { Button } from '../../Components/Button';
import { Spinner } from '../../Components/Spinner';
import { PromptDialog } from '../../Components/PromptDialog';
import { toast } from '../../Components/Toast';
import type { MenuItem } from '../../Components/Menu';
import { openApp } from '../../Desktop/Launch';
import { formatBytes } from '../../Widgets/Format';
import { PreviewDialog } from './PreviewDialog';
import styles from './FilesApp.module.css';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;
const TEXT_EXT = /\.(txt|md|markdown|log|json|ya?ml|toml|ini|cfg|conf|env|sh|bash|zsh|fish|py|js|mjs|cjs|ts|tsx|jsx|css|scss|html?|xml|sql|csv|tsv|service|timer|nix|lua|go|rs|c|h|cpp|hpp|java|kt|rb|php|pl|dockerfile|gitignore|editorconfig|properties|desktop|list|rules|lock)$/i;
const CODE_EXT = /\.(sh|py|js|mjs|cjs|ts|tsx|jsx|css|scss|html?|xml|sql|go|rs|c|h|cpp|hpp|java|kt|rb|php|pl|lua|nix|json|ya?ml|toml)$/i;
const ARCHIVE_EXT = /\.(zip|tar|gz|tgz|bz2|xz|7z|rar|zst)$/i;

export function isTextLike(entry: FileEntry): boolean {
  return TEXT_EXT.test(entry.name) || entry.name.toLowerCase() === 'dockerfile' || entry.name.toLowerCase() === 'makefile' || !entry.name.includes('.');
}

function iconFor(entry: FileEntry) {
  if (entry.type === 'directory') return <Folder weight="fill" color="var(--system-blue)" />;
  if (entry.type === 'symlink') return <LinkSimple />;
  if (IMAGE_EXT.test(entry.name)) return <FileImage weight="duotone" color="var(--system-purple)" />;
  if (ARCHIVE_EXT.test(entry.name)) return <FileZip weight="duotone" color="var(--system-brown)" />;
  if (CODE_EXT.test(entry.name)) return <FileCode weight="duotone" color="var(--system-green)" />;
  if (isTextLike(entry)) return <FileText weight="duotone" color="var(--system-gray)" />;
  return <FileIcon weight="duotone" color="var(--system-gray)" />;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

type DialogState = { kind: 'rename'; entry: FileEntry } | { kind: 'mkdir' } | { kind: 'preview'; entry: FileEntry } | null;

/** SFTP file manager with breadcrumbs, list/icon views, uploads, previews and the usual operations. */
export default function FilesApp({ windowId, params, phone }: AppWindowProps) {
  const [path, setPath] = useState<string | null>(typeof params.path === 'string' ? params.path : null);
  const [listing, setListing] = useState<FileListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'icons'>(() => (localStorage.getItem('landscape.files.view') as 'list' | 'icons' | null) ?? 'list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const requestConfirm = useUiStore((s) => s.requestConfirm);
  const setTitle = useWindowStore((s) => s.setTitle);

  const load = useCallback(async (target: string, pushHistory = true) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<FileListing>(`/api/files/list?path=${encodeURIComponent(target)}`);
      if (pushHistory && path && path !== result.path) setHistory((h) => [...h.slice(-50), path]);
      setListing(result);
      setPath(result.path);
      setSelected(new Set());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (path !== null) {
      void load(path, false);
      return;
    }
    api
      .get<{ path: string }>('/api/files/home')
      .then((home) => load(home.path, false))
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (path) setTitle(windowId, `Files — ${path === '/' ? '/' : path.split('/').pop()}`);
  }, [path, windowId, setTitle]);

  useEffect(() => {
    localStorage.setItem('landscape.files.view', view);
  }, [view]);

  const segments = useMemo(() => {
    if (!path) return [];
    const parts = path.split('/').filter(Boolean);
    return [{ name: '/', path: '/' }, ...parts.map((name, i) => ({ name, path: `/${parts.slice(0, i + 1).join('/')}` }))];
  }, [path]);

  const goBack = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    void load(previous, false);
  };
  const goUp = () => {
    if (!path || path === '/') return;
    void load(path.replace(/\/[^/]+$/, '') || '/');
  };

  const download = (entry: FileEntry) => {
    const a = document.createElement('a');
    a.href = `/api/files/download?path=${encodeURIComponent(entry.path)}`;
    a.download = entry.name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const openEntry = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      void load(entry.path);
      return;
    }
    if (IMAGE_EXT.test(entry.name) || (isTextLike(entry) && entry.size <= 512 * 1024)) {
      setDialog({ kind: 'preview', entry });
      return;
    }
    download(entry);
  };

  const openInEditor = (entry: FileEntry) => openApp('text-editor', { path: entry.path });

  const remove = (entries: FileEntry[]) => {
    requestConfirm({
      title: entries.length === 1 ? `Delete “${entries[0]?.name}”?` : `Delete ${entries.length} items?`,
      message: entries.some((e) => e.type === 'directory') ? 'Folders are deleted with everything inside them. This cannot be undone.' : 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        const result = await api.post<{ results: { path: string; ok: boolean; error?: string }[] }>('/api/files/delete', { paths: entries.map((e) => e.path) });
        const failed = result.results.filter((r) => !r.ok);
        if (failed.length > 0) toast.error(failed.map((f) => f.error).join('\n'));
        if (path) void load(path, false);
      },
    });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!path) return;
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        await api.upload(`/api/files/upload?dir=${encodeURIComponent(path)}`, file);
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err)}`);
      }
    }
    setUploading(null);
    toast.success(files.length === 1 ? 'Upload finished' : `${files.length} files uploaded`);
    void load(path, false);
  };

  const entryMenu = (entry: FileEntry): MenuItem[] => [
    { label: entry.type === 'directory' ? 'Open' : 'Open / Preview', icon: createElement(WindowsLogo), onSelect: () => openEntry(entry) },
    ...(entry.type !== 'directory' ? [{ label: 'Open with Text Editor', icon: createElement(FileText), onSelect: () => openInEditor(entry) }] : []),
    ...(entry.type !== 'directory' ? [{ label: 'Download', icon: createElement(DownloadSimple), onSelect: () => download(entry) }] : []),
    { type: 'separator' as const },
    { label: 'Rename…', icon: createElement(PencilSimple), onSelect: () => setDialog({ kind: 'rename', entry }) },
    {
      label: selected.size > 1 && selected.has(entry.path) ? `Delete ${selected.size} items…` : 'Delete…',
      icon: createElement(Trash),
      danger: true,
      onSelect: () => remove(selected.size > 1 && selected.has(entry.path) ? (listing?.entries.filter((e) => selected.has(e.path)) ?? [entry]) : [entry]),
    },
  ];

  const onEntryClick = (entry: FileEntry, event: React.MouseEvent) => {
    setSelected((current) => {
      if (event.ctrlKey || event.metaKey) {
        const next = new Set(current);
        if (next.has(entry.path)) next.delete(entry.path);
        else next.add(entry.path);
        return next;
      }
      return new Set([entry.path]);
    });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) void uploadFiles(event.dataTransfer.files);
  };

  const selectedEntries = listing?.entries.filter((e) => selected.has(e.path)) ?? [];

  return (
    <div
      className={`${styles.app} ${phone ? styles.phone : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={onDrop}
      onKeyDown={(e) => {
        if (e.key === 'Delete' && selectedEntries.length > 0) remove(selectedEntries);
        if (e.key === 'Backspace' && (e.altKey || e.metaKey)) goUp();
        if (e.key === 'F5') {
          e.preventDefault();
          if (path) void load(path, false);
        }
      }}
      tabIndex={-1}
    >
      <div className={styles.toolbar}>
        <Button variant="plain" icon={<ArrowLeft />} aria-label="Back" title="Back" onClick={goBack} disabled={history.length === 0} />
        <Button variant="plain" icon={<ArrowUp />} aria-label="Up one level" title="Up" onClick={goUp} disabled={!path || path === '/'} />
        <nav className={`${styles.breadcrumb} scroll`} aria-label="Path">
          {segments.map((segment, i) => (
            <span key={segment.path} className={styles.crumbWrap}>
              {i > 0 && <span className={styles.crumbSeparator}>›</span>}
              <button type="button" className={`${styles.crumb} ${i === segments.length - 1 ? styles.crumbCurrent : ''}`} onClick={() => void load(segment.path)}>
                {segment.name}
              </button>
            </span>
          ))}
        </nav>
        <div className={styles.toolbarActions}>
          <Button variant="plain" icon={<ArrowClockwise />} aria-label="Refresh" title="Refresh" onClick={() => path && void load(path, false)} />
          <Button variant="plain" icon={<FolderPlus />} aria-label="New folder" title="New folder" onClick={() => setDialog({ kind: 'mkdir' })} />
          <Button variant="plain" icon={<UploadSimple />} aria-label="Upload" title="Upload files" loading={uploading !== null} onClick={() => fileInputRef.current?.click()} />
          <Button
            variant="plain"
            icon={view === 'list' ? <SquaresFour /> : <List />}
            aria-label={view === 'list' ? 'Icon view' : 'List view'}
            title={view === 'list' ? 'Icon view' : 'List view'}
            onClick={() => setView((v) => (v === 'list' ? 'icons' : 'list'))}
          />
          <input ref={fileInputRef} type="file" multiple className="visually-hidden" onChange={(e) => e.target.files && void uploadFiles(e.target.files)} />
        </div>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
          {path && (
            <Button size="small" onClick={() => void load(path, false)}>
              Retry
            </Button>
          )}
        </div>
      )}

      <div
        className={`${styles.body} scroll`}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('[data-entry]')) return;
          e.preventDefault();
          openContextMenu(
            [
              { label: 'New folder…', icon: createElement(FolderPlus), onSelect: () => setDialog({ kind: 'mkdir' }) },
              { label: 'Upload files…', icon: createElement(UploadSimple), onSelect: () => fileInputRef.current?.click() },
              { label: 'Refresh', icon: createElement(ArrowClockwise), onSelect: () => path && void load(path, false) },
            ],
            { x: e.clientX, y: e.clientY },
          );
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected(new Set());
        }}
      >
        {loading && !listing ? (
          <div className={styles.center}>
            <Spinner size={22} />
          </div>
        ) : listing && listing.entries.length === 0 ? (
          <div className={styles.center}>This folder is empty.</div>
        ) : view === 'list' ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th className={styles.colSize}>Size</th>
                <th className={styles.colDate}>Modified</th>
                <th className={styles.colPerm}>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {listing?.entries.map((entry) => (
                <tr
                  key={entry.path}
                  data-entry
                  className={selected.has(entry.path) ? styles.selected : ''}
                  onClick={(e) => onEntryClick(entry, e)}
                  onDoubleClick={() => openEntry(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!selected.has(entry.path)) setSelected(new Set([entry.path]));
                    openContextMenu(entryMenu(entry), { x: e.clientX, y: e.clientY });
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && openEntry(entry)}
                  tabIndex={0}
                >
                  <td className={styles.nameCell}>
                    <div className={styles.nameInner}>
                      <span className={styles.rowIcon}>{iconFor(entry)}</span>
                      <span className="text-truncate">{entry.name}</span>
                    </div>
                  </td>
                  <td className={styles.colSize}>{entry.type === 'directory' ? '—' : formatBytes(entry.size)}</td>
                  <td className={styles.colDate}>{dateFormat.format(new Date(entry.modifiedAt))}</td>
                  <td className={`${styles.colPerm} text-mono`}>{entry.permissions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.grid}>
            {listing?.entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                data-entry
                className={`${styles.tile} ${selected.has(entry.path) ? styles.selected : ''}`}
                onClick={(e) => onEntryClick(entry, e)}
                onDoubleClick={() => openEntry(entry)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!selected.has(entry.path)) setSelected(new Set([entry.path]));
                  openContextMenu(entryMenu(entry), { x: e.clientX, y: e.clientY });
                }}
                title={`${entry.name}\n${entry.type === 'directory' ? 'Folder' : formatBytes(entry.size)} · ${entry.permissions}`}
              >
                <span className={styles.tileIcon}>{iconFor(entry)}</span>
                <span className={styles.tileName}>{entry.name}</span>
              </button>
            ))}
          </div>
        )}
        {dragOver && (
          <div className={styles.dropOverlay}>
            <UploadSimple size={40} weight="duotone" />
            <span>Drop files to upload to {path}</span>
          </div>
        )}
      </div>

      <div className={styles.statusBar}>
        <span>{listing ? `${listing.entries.length} item${listing.entries.length === 1 ? '' : 's'}` : ''}</span>
        <span>{uploading ? `Uploading ${uploading}…` : selected.size > 0 ? `${selected.size} selected` : ''}</span>
      </div>

      {dialog?.kind === 'mkdir' && path && (
        <PromptDialog
          title="New folder"
          label="Folder name"
          placeholder="Untitled folder"
          confirmLabel="Create"
          validate={(v) => (v.includes('/') ? 'Names cannot contain "/"' : null)}
          onSubmit={async (name) => {
            await api.post('/api/files/mkdir', { dir: path, name: name.trim() });
            setDialog(null);
            void load(path, false);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'rename' && path && (
        <PromptDialog
          title={`Rename “${dialog.entry.name}”`}
          label="New name"
          initialValue={dialog.entry.name}
          confirmLabel="Rename"
          selectStem={dialog.entry.type !== 'directory'}
          validate={(v) => (v.includes('/') ? 'Names cannot contain "/"' : null)}
          onSubmit={async (name) => {
            await api.post('/api/files/rename', { path: dialog.entry.path, name: name.trim() });
            setDialog(null);
            void load(path, false);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'preview' && <PreviewDialog entry={dialog.entry} onClose={() => setDialog(null)} onEdit={() => openInEditor(dialog.entry)} onDownload={() => download(dialog.entry)} />}
    </div>
  );
}
