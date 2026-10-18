import { useEffect, useState } from 'react';
import { DownloadSimple, PencilSimple } from '@phosphor-icons/react';
import type { FileEntry } from '@landscape/shared';
import { api, errorMessage } from '../../Api/Http';
import { Dialog } from '../../Components/Dialog';
import { Button } from '../../Components/Button';
import { Spinner } from '../../Components/Spinner';
import { formatBytes } from '../../Widgets/Format';
import styles from './FilesApp.module.css';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;

/** Image or text preview for a file selected in the Files app. */
export function PreviewDialog({ entry, onClose, onEdit, onDownload }: { entry: FileEntry; onClose: () => void; onEdit: () => void; onDownload: () => void }) {
  const isImage = IMAGE_EXT.test(entry.name);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isImage) return;
    api
      .get<{ content: string }>(`/api/files/read?path=${encodeURIComponent(entry.path)}`)
      .then((r) => setText(r.content))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [entry.path, isImage]);

  return (
    <Dialog
      title={entry.name}
      onClose={onClose}
      width={isImage ? 900 : 760}
      footer={
        <>
          <span className={styles.previewMeta}>
            {formatBytes(entry.size)} · {entry.permissions}
          </span>
          <Button icon={<DownloadSimple />} onClick={onDownload}>
            Download
          </Button>
          {!isImage && (
            <Button
              variant="primary"
              icon={<PencilSimple />}
              onClick={() => {
                onEdit();
                onClose();
              }}
            >
              Open with Text Editor
            </Button>
          )}
        </>
      }
    >
      {isImage ? (
        <div className={styles.previewImageHost}>
          <img src={`/api/files/raw?path=${encodeURIComponent(entry.path)}`} alt={entry.name} className={styles.previewImage} />
        </div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : text === null ? (
        <div className={styles.center}>
          <Spinner size={22} />
        </div>
      ) : (
        <pre className={`${styles.previewText} scroll selectable`}>{text}</pre>
      )}
    </Dialog>
  );
}
