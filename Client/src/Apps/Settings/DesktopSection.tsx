import { useState } from 'react';
import { ArrowsOutCardinal } from '@phosphor-icons/react';
import type { Settings } from '@landscape/shared';
import { useDesktopStore } from '../../Store/DesktopStore';
import { Segmented, Select } from '../../Components/Select';
import { Toggle } from '../../Components/Toggle';
import { Button } from '../../Components/Button';
import { toast } from '../../Components/Toast';
import { errorMessage } from '../../Api/Http';
import { reanchorForThisScreen } from '../../Desktop/DesktopGrid';
import { layoutViewport } from '../../Design/Scale';
import { SettingRow } from './SettingRow';
import styles from './SettingsApp.module.css';

type DesktopSettings = Settings['desktop'];

export default function DesktopSection() {
  const desktop = useDesktopStore((s) => s.settings?.desktop);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const [reanchored, setReanchored] = useState<number | null>(null);

  const patch = (value: Partial<DesktopSettings>) => {
    void updateSettings({ desktop: value }).catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const reanchor = () => {
    const moved = reanchorForThisScreen();
    setReanchored(moved);
    toast.success(moved === 0 ? 'The layout already fits this screen.' : `Re-anchored ${moved} item${moved === 1 ? '' : 's'} to this screen.`);
  };
  const viewport = layoutViewport();

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Icons</h3>
        <div className={styles.group}>
          <SettingRow label="Icon size" detail="The grid cell follows the icon size, so the layout stays aligned.">
            <Segmented
              ariaLabel="Icon size"
              value={desktop?.iconSize ?? 'm'}
              onChange={(iconSize) => patch({ iconSize })}
              options={[
                { value: 's', label: 'Small' },
                { value: 'm', label: 'Medium' },
                { value: 'l', label: 'Large' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Grid density" detail="Space between icons and widgets.">
            <Segmented
              ariaLabel="Grid density"
              value={desktop?.density ?? 'normal'}
              onChange={(density) => patch({ density })}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'normal', label: 'Normal' },
                { value: 'roomy', label: 'Roomy' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Labels">
            <Select
              aria-label="Labels"
              value={desktop?.labels ?? 'show'}
              onChange={(labels) => patch({ labels: labels as DesktopSettings['labels'] })}
              options={[
                { value: 'show', label: 'Show' },
                { value: 'shadow', label: 'Show with background' },
                { value: 'hide', label: 'Hide' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Open with" detail="How a desktop icon opens its window or folder.">
            <Segmented
              ariaLabel="Open with"
              value={desktop?.openWith ?? 'double'}
              onChange={(openWith) => patch({ openWith })}
              options={[
                { value: 'single', label: 'Single click' },
                { value: 'double', label: 'Double click' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Show desktop icons" detail="Hides shortcuts and folders; widgets stay. The launcher still lists everything.">
            <Toggle checked={desktop?.showIcons ?? true} onChange={(showIcons) => patch({ showIcons })} />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Layout</h3>
        <p className="text-callout text-secondary">
          Items are anchored to the edge or the center of the screen they were placed on, so the layout keeps its shape on other screen sizes. If this screen shows
          something in the wrong place, re-anchor from here: every item is pinned again from where it is right now, on this {Math.round(viewport.width)} × {Math.round(viewport.height)} px screen.
        </p>
        <div className={styles.group}>
          <SettingRow label="Re-anchor layout for this screen" detail={reanchored === null ? 'Rewrites the anchors of all icons, folders and widgets.' : `${reanchored} item${reanchored === 1 ? '' : 's'} re-anchored.`}>
            <Button icon={<ArrowsOutCardinal />} onClick={reanchor} data-reanchor>
              Re-anchor
            </Button>
          </SettingRow>
        </div>
      </section>
    </>
  );
}
