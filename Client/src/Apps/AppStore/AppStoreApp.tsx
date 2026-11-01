import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise, CheckCircle, DownloadSimple, LinkSimple, MagnifyingGlass, Package, ShieldCheck, ShieldWarning, Trash, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { DANGEROUS_PERMISSIONS, PERMISSION_DESCRIPTIONS, compareVersions, type AppManifest, type CatalogEntry, type InstalledApp, type Permission } from '@landscape/shared';
import type { AppWindowProps } from '../Types';
import { ApiRequestError, api, errorMessage } from '../../Api/Http';
import { Button } from '../../Components/Button';
import { TextField } from '../../Components/TextField';
import { Toggle } from '../../Components/Toggle';
import { Spinner } from '../../Components/Spinner';
import { Dialog } from '../../Components/Dialog';
import { toast } from '../../Components/Toast';
import { useUiStore } from '../../Store/UiStore';
import { loadInstalledApps } from '../../Platform/InstalledApps';
import { eventsSocket } from '../../Api/EventsSocket';
import styles from './AppStoreApp.module.css';

type Tab = 'browse' | 'installed' | 'install';
type InstalledInfo = InstalledApp & { bundle: { sha256: string | null; size: number | null }; update: CatalogEntry | null };

interface ApprovalRequest {
  name: string;
  version: string;
  permissions: Permission[];
  /** Permissions that are new compared with the installed version (updates). */
  added?: Permission[];
  description?: string;
  size?: number | null;
  run: (approve: Permission[], trusted: boolean) => Promise<void>;
}

function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Browse the catalog, manage installed apps, install from a URL or a zip. */
export default function AppStoreApp({ params, phone }: AppWindowProps) {
  const [tab, setTab] = useState<Tab>(typeof params.tab === 'string' && ['browse', 'installed', 'install'].includes(params.tab) ? (params.tab as Tab) : 'browse');
  const [catalog, setCatalog] = useState<{ apps: CatalogEntry[]; source: string; error: string | null } | null>(null);
  const [installed, setInstalled] = useState<InstalledInfo[] | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [selected, setSelected] = useState<string | null>(typeof params.appId === 'string' ? params.appId : null);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    const [cat, inst] = await Promise.all([
      api.get<{ apps: CatalogEntry[]; source: string; error: string | null }>(`/api/catalog${refresh ? '?refresh=1' : ''}`).catch((error: unknown) => ({ apps: [], source: 'bundled', error: errorMessage(error) })),
      api.get<{ apps: InstalledInfo[] }>('/api/apps').catch(() => ({ apps: [] })),
    ]);
    setCatalog(cat);
    setInstalled(inst.apps);
  }, []);

  useEffect(() => {
    void load();
    return eventsSocket.subscribe((message) => {
      if (message.type === 'apps-changed') void load();
    });
  }, [load]);

  const installedById = useMemo(() => new Map((installed ?? []).map((a) => [a.id, a])), [installed]);
  const categories = useMemo(() => ['all', ...new Set((catalog?.apps ?? []).flatMap((a) => a.categories))], [catalog]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog?.apps ?? []).filter((a) => (category === 'all' || a.categories.includes(category)) && (!q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.id.includes(q)));
  }, [catalog, query, category]);

  const afterChange = async () => {
    await load();
    await loadInstalledApps();
  };

  const installFromCatalog = (entry: CatalogEntry) => {
    const current = installedById.get(entry.id);
    const added = current ? entry.permissions.filter((p) => !current.granted.includes(p) && !current.trusted) : entry.permissions;
    setApproval({
      name: entry.name,
      version: entry.version,
      permissions: entry.permissions,
      added: current ? added : undefined,
      description: entry.description,
      size: entry.size,
      run: async (approve, trusted) => {
        setBusy(entry.id);
        try {
          await api.post('/api/apps/install', { source: 'catalog', id: entry.id, approve, trusted });
          toast.success(`${entry.name} ${current ? 'updated' : 'installed'}.`);
          await afterChange();
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const uninstall = (app: InstalledInfo) => {
    useUiStore.getState().requestConfirm({
      title: `Uninstall ${app.manifest.name}?`,
      message: 'Its files, stored data, monitor targets, pins and desktop widgets are removed.',
      confirmLabel: 'Uninstall',
      danger: true,
      onConfirm: async () => {
        await api.delete(`/api/apps/${app.id}`);
        toast.success(`${app.manifest.name} uninstalled.`);
        if (selected === app.id) setSelected(null);
        await afterChange();
      },
    });
  };

  const setTrust = async (app: InstalledInfo, patch: { trusted?: boolean; granted?: Permission[] }) => {
    try {
      await api.patch(`/api/apps/${app.id}`, patch);
      await afterChange();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const selectedEntry = selected ? (catalog?.apps.find((a) => a.id === selected) ?? null) : null;
  const selectedInstalled = selected ? (installedById.get(selected) ?? null) : null;

  return (
    <div className={`${styles.app} ${phone ? styles.phone : ''}`} data-app-store>
      <div className={styles.tabs} role="tablist">
        {(
          [
            ['browse', 'Browse'],
            ['installed', `Installed${installed && installed.length > 0 ? ` (${installed.length})` : ''}`],
            ['install', 'Install from URL or file'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`} onClick={() => setTab(id)} data-store-tab={id}>
            {label}
            {id === 'installed' && installed?.some((a) => a.update) && <span className={styles.updateDot} title="Updates available" />}
          </button>
        ))}
      </div>

      {tab === 'browse' && (
        <div className={styles.split}>
          <div className={styles.listPane}>
            <div className={styles.toolbar}>
              <TextField placeholder="Search apps…" value={query} onChange={(e) => setQuery(e.target.value)} leading={<MagnifyingGlass />} aria-label="Search apps" className={styles.search} />
              <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === 'all' ? 'All categories' : c}
                  </option>
                ))}
              </select>
              <Button variant="plain" icon={<ArrowsClockwise />} aria-label="Refresh catalog" title="Refresh catalog" onClick={() => void load(true)} />
            </div>
            {catalog?.error && (
              <p className={`${styles.note} text-footnote`}>
                {catalog.source === 'bundled' ? 'Showing the catalog bundled with this image; the live catalog could not be fetched.' : catalog.error}
              </p>
            )}
            <div className={`${styles.list} scroll`}>
              {catalog === null ? (
                <div className={styles.center}>
                  <Spinner size={22} />
                </div>
              ) : shown.length === 0 ? (
                <div className={styles.center}>{catalog.apps.length === 0 ? 'The catalog is empty.' : 'No matches.'}</div>
              ) : (
                shown.map((entry) => {
                  const current = installedById.get(entry.id);
                  const update = current && compareVersions(entry.version, current.version) > 0;
                  return (
                    <button key={entry.id} type="button" className={`${styles.row} ${selected === entry.id ? styles.rowActive : ''}`} onClick={() => setSelected(entry.id)} data-catalog-app={entry.id}>
                      <AppIcon src={entry.icon} name={entry.name} />
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>
                          {entry.name} <span className={styles.version}>v{entry.version}</span>
                        </span>
                        <span className={`${styles.rowDetail} text-truncate`}>{entry.description || entry.author}</span>
                      </span>
                      {current ? (
                        update ? (
                          <span className={`${styles.tag} ${styles.tagUpdate}`}>Update</span>
                        ) : (
                          <span className={styles.tag}>
                            <CheckCircle weight="fill" /> Installed
                          </span>
                        )
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className={`${styles.detailPane} scroll`}>
            {selectedEntry ? (
              <Detail
                name={selectedEntry.name}
                version={selectedEntry.version}
                author={selectedEntry.author}
                description={selectedEntry.description}
                icon={selectedEntry.icon}
                permissions={selectedEntry.permissions}
                size={selectedEntry.size}
                homepage={selectedEntry.homepage}
                installed={selectedInstalled}
                busy={busy === selectedEntry.id}
                onInstall={() => installFromCatalog(selectedEntry)}
                onUninstall={selectedInstalled ? () => uninstall(selectedInstalled) : undefined}
              />
            ) : (
              <div className={styles.center}>Pick an app to see what it does and what it needs.</div>
            )}
          </div>
        </div>
      )}

      {tab === 'installed' && (
        <div className={`${styles.installed} scroll`}>
          {installed === null ? (
            <Spinner size={22} />
          ) : installed.length === 0 ? (
            <div className={styles.center}>No apps installed yet. Browse the catalog or install from a file.</div>
          ) : (
            installed.map((app) => (
              <div key={app.id} className={styles.card} data-installed-app={app.id}>
                <div className={styles.cardHeader}>
                  <AppIcon src={app.manifest.icon ? `/apps/files/${app.id}/${app.manifest.icon}` : null} name={app.manifest.name} />
                  <div className={styles.rowText}>
                    <span className={styles.rowTitle}>
                      {app.manifest.name} <span className={styles.version}>v{app.version}</span>
                      {app.source === 'bundled' && <span className={styles.tag}>Bundled</span>}
                    </span>
                    <span className={`${styles.rowDetail} text-truncate`}>
                      {app.manifest.author} · {formatBytes(app.bundle.size)} · {app.source}
                    </span>
                  </div>
                  <div className={styles.cardActions}>
                    {app.update && (
                      <Button size="small" variant="primary" icon={<DownloadSimple />} loading={busy === app.id} onClick={() => installFromCatalog(app.update as CatalogEntry)} data-update-app={app.id}>
                        Update to {app.update.version}
                      </Button>
                    )}
                    <Button size="small" variant="plain" icon={<Trash />} onClick={() => uninstall(app)} data-uninstall-app={app.id}>
                      Uninstall
                    </Button>
                  </div>
                </div>
                <label className={styles.trustRow}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>
                      {app.trusted ? <ShieldCheck weight="fill" className={styles.trusted} /> : <ShieldWarning />} Trusted
                    </span>
                    <span className={styles.rowDetail}>Grants every permission, including fetching any host, without asking. The app stays sandboxed. Only for apps you built or fully trust.</span>
                  </span>
                  <Toggle checked={app.trusted} onChange={(trusted) => void setTrust(app, { trusted })} />
                </label>
                {app.manifest.permissions.length > 0 && (
                  <div className={styles.permissions}>
                    {app.manifest.permissions.map((p) => (
                      <label key={p} className={styles.permissionRow}>
                        <span className={styles.rowText}>
                          <span className={`${styles.permissionName} ${DANGEROUS_PERMISSIONS.includes(p) ? styles.dangerous : ''}`}>
                            {DANGEROUS_PERMISSIONS.includes(p) && <WarningCircle weight="fill" />} {p}
                          </span>
                          <span className={styles.rowDetail}>{PERMISSION_DESCRIPTIONS[p]}</span>
                        </span>
                        <Toggle checked={app.trusted || app.granted.includes(p)} disabled={app.trusted} onChange={(on) => void setTrust(app, { granted: on ? [...app.granted, p] : app.granted.filter((g) => g !== p) })} />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'install' && <InstallFrom setApproval={setApproval} afterChange={afterChange} />}

      {approval && (
        <ApprovalDialog
          request={approval}
          onClose={() => setApproval(null)}
          onConfirm={async (approve, trusted) => {
            try {
              await approval.run(approve, trusted);
              setApproval(null);
            } catch (error) {
              if (error instanceof ApiRequestError && error.code === 'permissions_required') {
                const added = ((error.details as { permissions?: Permission[] } | undefined)?.permissions ?? []) as Permission[];
                setApproval({ ...approval, added });
                toast.error(error.message);
              } else toast.error(errorMessage(error));
            }
          }}
        />
      )}
    </div>
  );
}

function AppIcon({ src, name }: { src: string | null; name: string }) {
  if (src) return <img className={styles.icon} src={src} alt="" width={40} height={40} />;
  return (
    <span className={styles.iconPlaceholder} aria-hidden="true">
      <Package weight="duotone" />
      <span>{name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

function Detail(props: {
  name: string;
  version: string;
  author: string;
  description: string;
  icon: string | null;
  permissions: Permission[];
  size: number | null;
  homepage?: string;
  installed: InstalledInfo | null;
  busy: boolean;
  onInstall: () => void;
  onUninstall?: () => void;
}) {
  const update = props.installed && compareVersions(props.version, props.installed.version) > 0;
  return (
    <div className={styles.detail} data-catalog-detail>
      <div className={styles.detailHeader}>
        <AppIcon src={props.icon} name={props.name} />
        <div className={styles.rowText}>
          <h2 className="text-title3 emphasized">{props.name}</h2>
          <span className={styles.rowDetail}>
            {props.author} · v{props.version}
            {props.size ? ` · ${formatBytes(props.size)}` : ''}
          </span>
        </div>
      </div>
      <p className="text-callout">{props.description || 'No description.'}</p>
      {props.homepage && (
        <a href={props.homepage} target="_blank" rel="noreferrer noopener" className="text-footnote">
          {props.homepage}
        </a>
      )}
      <div className={styles.detailActions}>
        {!props.installed || update ? (
          <Button variant="primary" icon={<DownloadSimple />} loading={props.busy} onClick={props.onInstall} data-install-app>
            {update ? `Update to ${props.version}` : 'Install'}
          </Button>
        ) : (
          <span className={styles.tag}>
            <CheckCircle weight="fill" /> Installed v{props.installed.version}
          </span>
        )}
        {props.onUninstall && (
          <Button variant="plain" icon={<Trash />} onClick={props.onUninstall}>
            Uninstall
          </Button>
        )}
      </div>
      <PermissionList permissions={props.permissions} />
    </div>
  );
}

function PermissionList({ permissions, highlight }: { permissions: Permission[]; highlight?: Permission[] }) {
  if (permissions.length === 0) return <p className="text-footnote text-secondary">This app needs no permissions.</p>;
  return (
    <div className={styles.permissions}>
      <span className={styles.permissionsTitle}>Permissions</span>
      {permissions.map((p) => (
        <div key={p} className={styles.permissionRow} data-permission={p}>
          <span className={styles.rowText}>
            <span className={`${styles.permissionName} ${DANGEROUS_PERMISSIONS.includes(p) ? styles.dangerous : ''}`}>
              {DANGEROUS_PERMISSIONS.includes(p) && <WarningCircle weight="fill" />} {p}
              {highlight?.includes(p) && <span className={`${styles.tag} ${styles.tagUpdate}`}>New</span>}
            </span>
            <span className={styles.rowDetail}>{PERMISSION_DESCRIPTIONS[p]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ApprovalDialog({ request, onClose, onConfirm }: { request: ApprovalRequest; onClose: () => void; onConfirm: (approve: Permission[], trusted: boolean) => Promise<void> }) {
  const [trusted, setTrusted] = useState(false);
  const [busy, setBusy] = useState(false);
  const dangerous = request.permissions.filter((p) => DANGEROUS_PERMISSIONS.includes(p));
  const isUpdate = request.added !== undefined;
  return (
    <Dialog
      title={isUpdate ? `Update ${request.name} to ${request.version}` : `Install ${request.name} ${request.version}`}
      onClose={onClose}
      width={480}
      locked={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            data-approve-install
            onClick={() => {
              setBusy(true);
              void onConfirm(request.permissions, trusted).finally(() => setBusy(false));
            }}
          >
            {isUpdate ? 'Update' : 'Install'}
          </Button>
        </>
      }
    >
      <div className={styles.approval}>
        {request.description && <p className="text-callout">{request.description}</p>}
        {isUpdate && request.added && request.added.length > 0 && (
          <p className={`${styles.note} text-callout`}>
            <WarningCircle weight="fill" /> This version asks for permissions the installed one did not have. Review them before updating.
          </p>
        )}
        {dangerous.length > 0 && (
          <p className={`${styles.danger} text-callout`}>
            <ShieldWarning weight="fill" /> This app can change things on your host ({dangerous.join(', ')}). Only install it if you trust its author.
          </p>
        )}
        <PermissionList permissions={request.permissions} highlight={request.added} />
        <label className={styles.trustRow}>
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>Trusted</span>
            <span className={styles.rowDetail}>Grants every permission, including fetching any host, without further prompts. The sandbox stays. Leave this off unless you built the app.</span>
          </span>
          <Toggle checked={trusted} onChange={setTrusted} />
        </label>
      </div>
    </Dialog>
  );
}

function InstallFrom({ setApproval, afterChange }: { setApproval: (r: ApprovalRequest | null) => void; afterChange: () => Promise<void> }) {
  const [url, setUrl] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fromUrl = async () => {
    setInspecting(true);
    try {
      const info = await api.post<{ manifest: AppManifest; sha256: string; size: number }>('/api/apps/inspect', { url: url.trim() });
      setApproval({
        name: info.manifest.name,
        version: info.manifest.version,
        permissions: info.manifest.permissions,
        description: info.manifest.description,
        size: info.size,
        run: async (approve, trusted) => {
          await api.post('/api/apps/install', { source: 'url', url: url.trim(), approve, trusted });
          toast.success(`${info.manifest.name} installed.`);
          setUrl('');
          await afterChange();
        },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setInspecting(false);
    }
  };

  const fromFile = async (file: File) => {
    // The server validates the bundle; read the manifest here only to show the approval dialog.
    let manifest: AppManifest | null = null;
    try {
      const { readManifestFromZip } = await import('./ZipManifest');
      manifest = await readManifestFromZip(file);
    } catch {
      manifest = null;
    }
    if (!manifest) {
      toast.error('This file is not an app bundle (no readable manifest.json).');
      return;
    }
    const m = manifest;
    setApproval({
      name: m.name,
      version: m.version,
      permissions: m.permissions,
      description: m.description,
      size: file.size,
      run: async (approve, trusted) => {
        const form = new FormData();
        form.append('approve', JSON.stringify(approve));
        form.append('trusted', trusted ? '1' : '0');
        form.append('file', file, file.name);
        await api.post('/api/apps/upload', form);
        toast.success(`${m.name} installed.`);
        await afterChange();
      },
    });
  };

  return (
    <div className={`${styles.installFrom} scroll`}>
      <section className={styles.block}>
        <h3 className="text-headline">From a URL</h3>
        <p className="text-footnote text-secondary">A direct link to a bundle zip (http or https). The bundle is checked before you see what it asks for.</p>
        <div className={styles.urlRow}>
          <TextField placeholder="https://example.com/my-app-1.0.0.zip" value={url} onChange={(e) => setUrl(e.target.value)} leading={<LinkSimple />} aria-label="Bundle URL" spellCheck={false} />
          <Button variant="primary" loading={inspecting} disabled={!url.trim()} onClick={() => void fromUrl()}>
            Check
          </Button>
        </div>
      </section>
      <section className={styles.block}>
        <h3 className="text-headline">From a file</h3>
        <p className="text-footnote text-secondary">A bundle zip built with the SDK (see Docs/AppSdk.md). Up to 20 MB.</p>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="visually-hidden"
          data-bundle-file
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void fromFile(file);
            e.target.value = '';
          }}
        />
        <Button icon={<UploadSimple />} onClick={() => fileRef.current?.click()}>
          Choose zip…
        </Button>
      </section>
    </div>
  );
}
