import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { languages } from '@codemirror/language-data';
import { FloppyDisk, FolderOpen } from '@phosphor-icons/react';
import type { AppWindowProps } from '../Types';
import { api, errorMessage } from '../../Api/Http';
import { useWindowStore } from '../../Store/WindowStore';
import { confirmAsync } from '../../Store/UiStore';
import { Button } from '../../Components/Button';
import { PromptDialog } from '../../Components/PromptDialog';
import { Spinner } from '../../Components/Spinner';
import { toast } from '../../Components/Toast';
import { useMediaQuery } from '../../Hooks/UseMediaQuery';
import styles from './TextEditorApp.module.css';

interface FileState {
  path: string;
  content: string;
  modifiedAt: string;
}

/** CodeMirror 6 editor for text files over SFTP, with syntax highlighting and an unsaved-changes guard. */
export default function TextEditorApp({ windowId, params }: AppWindowProps) {
  const [path, setPath] = useState<string | null>(typeof params.path === 'string' ? params.path : null);
  const [file, setFile] = useState<FileState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // Launched without a file: ask for a path right away.
  const [openDialog, setOpenDialog] = useState(typeof params.path !== 'string');
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const dirtyRef = useRef(false);
  const languageCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const setTitle = useWindowStore((s) => s.setTitle);
  const registerBeforeClose = useWindowStore((s) => s.registerBeforeClose);
  const requestClose = useWindowStore((s) => s.requestClose);
  const osDark = useMediaQuery('(prefers-color-scheme: dark)');
  const isDark = (document.documentElement.dataset.theme ?? (osDark ? 'dark' : 'light')) === 'dark';

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<{ path: string; content: string; modifiedAt: string }>(`/api/files/read?path=${encodeURIComponent(target)}`);
      setFile({ path: result.path, content: result.content, modifiedAt: result.modifiedAt });
      setPath(result.path);
      setDirty(false);
      dirtyRef.current = false;
    } catch (err) {
      setError(errorMessage(err));
      setFile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (path) void load(path);
  }, [path, load]);

  useEffect(() => {
    const name = path ? path.split('/').pop() : 'Untitled';
    setTitle(windowId, `${dirty ? '• ' : ''}${name} — Text Editor`);
  }, [path, dirty, windowId, setTitle]);

  const save = useCallback(async () => {
    const view = viewRef.current;
    if (!view || !path) return;
    setSaving(true);
    try {
      const result = await api.put<{ modifiedAt: string }>('/api/files/write', { path, content: view.state.doc.toString() });
      setFile((f) => (f ? { ...f, content: view.state.doc.toString(), modifiedAt: result.modifiedAt } : f));
      setDirty(false);
      dirtyRef.current = false;
      toast.success('Saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [path]);

  // Unsaved-changes guard on close.
  useEffect(() => {
    registerBeforeClose(windowId, async () => {
      if (!dirtyRef.current) return true;
      return confirmAsync({
        title: 'Discard unsaved changes?',
        message: `${path ?? 'This file'} has unsaved changes. Close without saving?`,
        confirmLabel: 'Discard',
        danger: true,
      });
    });
    return () => registerBeforeClose(windowId, null);
  }, [windowId, path, registerBeforeClose]);

  // Create the editor whenever a file is loaded.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !file) return;
    const state = EditorState.create({
      doc: file.content,
      extensions: [
        basicSetup,
        keymap.of([
          indentWithTab,
          {
            key: 'Mod-s',
            run: () => {
              void save();
              return true;
            },
          },
        ]),
        languageCompartment.current.of([]),
        themeCompartment.current.of(isDark ? oneDark : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !dirtyRef.current) {
            dirtyRef.current = true;
            setDirty(true);
          }
        }),
        EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: '12.5px' } }),
      ],
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    const description = languages.find((l) => l.extensions.some((ext) => file.path.toLowerCase().endsWith(`.${ext}`)) || l.filename?.test(file.path.split('/').pop() ?? ''));
    if (description) {
      void description.load().then((support) => {
        if (viewRef.current === view) view.dispatch({ effects: languageCompartment.current.reconfigure(support) });
      });
    }
    view.focus();
    return () => {
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeCompartment.current.reconfigure(isDark ? oneDark : []) });
  }, [isDark]);

  return (
    <div className={styles.app}>
      <div className={styles.toolbar}>
        <Button variant="plain" icon={<FolderOpen />} onClick={() => setOpenDialog(true)}>
          Open…
        </Button>
        <Button variant={dirty ? 'primary' : 'plain'} icon={<FloppyDisk />} onClick={() => void save()} loading={saving} disabled={!file || !dirty} title="Save (Ctrl+S)">
          Save
        </Button>
        <span className={`${styles.path} text-truncate`} title={path ?? ''}>
          {path ?? 'No file open'}
          {dirty ? ' — modified' : ''}
        </span>
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <div className={styles.editorHost}>
        {loading ? (
          <div className={styles.center}>
            <Spinner size={22} />
          </div>
        ) : !file ? (
          <div className={styles.center}>
            <p className="text-callout text-secondary">Open a text file from the Files app, or enter a path.</p>
            <Button variant="primary" icon={<FolderOpen />} onClick={() => setOpenDialog(true)}>
              Open file…
            </Button>
          </div>
        ) : (
          <div ref={hostRef} className={styles.editor} />
        )}
      </div>
      {openDialog && (
        <PromptDialog
          title="Open file"
          label="Absolute path on the host"
          initialValue={path ?? '/etc/'}
          placeholder="/etc/hostname"
          confirmLabel="Open"
          validate={(v) => (v.trim().startsWith('/') ? null : 'Enter an absolute path')}
          onSubmit={async (value) => {
            if (dirtyRef.current) {
              const ok = await confirmAsync({ title: 'Discard unsaved changes?', message: 'Opening another file discards your edits.', confirmLabel: 'Discard', danger: true });
              if (!ok) return;
            }
            setOpenDialog(false);
            const target = value.trim();
            if (target === path) await load(target);
            else setPath(target);
          }}
          onCancel={() => {
            setOpenDialog(false);
            if (!file && !path) void requestClose(windowId);
          }}
        />
      )}
    </div>
  );
}
