import { useState, type FormEvent, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { TextField } from './TextField';

interface PromptDialogProps {
  title: ReactNode;
  label: ReactNode;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => Promise<void> | void;
  onCancel: () => void;
  /** Select only the part before the extension on open (for renames). */
  selectStem?: boolean;
}

/** Single text-field dialog (rename, new folder, open path). */
export function PromptDialog({ title, label, initialValue = '', placeholder, confirmLabel = 'OK', validate, onSubmit, onCancel, selectStem }: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validate?.(value) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      width={420}
      locked={busy}
      initialFocus="input"
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="prompt-form" loading={busy} disabled={!value.trim()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="prompt-form" onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          label={label}
          value={value}
          placeholder={placeholder}
          error={error}
          autoFocus
          onFocus={(e) => {
            if (selectStem) {
              const dot = value.lastIndexOf('.');
              e.target.setSelectionRange(0, dot > 0 ? dot : value.length);
            } else e.target.select();
          }}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          spellCheck={false}
          autoCapitalize="none"
        />
      </form>
    </Dialog>
  );
}
