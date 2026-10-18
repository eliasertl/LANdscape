import { Cube, Key, Plugs } from '@phosphor-icons/react';
import styles from './SetupState.module.css';

interface SetupStateProps {
  integration: 'ssh' | 'docker' | 'hostProc' | 'hostSys';
  appName?: string;
  detail?: string | null;
}

const CONTENT = {
  ssh: {
    icon: Key,
    title: 'SSH is not configured',
    steps: [
      'Create a key pair: ssh-keygen -t ed25519 -f /DATA/AppData/landscape/ssh/id_ed25519',
      'Append the .pub file to ~/.ssh/authorized_keys of the host user',
      'Set SSH_USER (and SSH_HOST / SSH_PORT if needed) in the container environment',
      'Restart LANdscape; Settings → About shows the connection status',
    ],
  },
  docker: {
    icon: Cube,
    title: 'Docker socket is not available',
    steps: [
      'Mount /var/run/docker.sock:/var/run/docker.sock in docker-compose.yml',
      'Make sure the socket is group-accessible (the entrypoint joins its group automatically)',
      'Restart LANdscape',
    ],
  },
  hostProc: {
    icon: Plugs,
    title: 'Host /proc is not mounted',
    steps: ['Mount /proc:/host/proc:ro in docker-compose.yml', 'Restart LANdscape'],
  },
  hostSys: {
    icon: Plugs,
    title: 'Host /sys is not mounted',
    steps: ['Mount /sys:/host/sys:ro in docker-compose.yml', 'Restart LANdscape'],
  },
};

/** Friendly "how to set this up" screen shown instead of an error when an integration is missing. */
export function SetupState({ integration, appName, detail }: SetupStateProps) {
  const content = CONTENT[integration];
  const Icon = content.icon;
  return (
    <div className={styles.setup}>
      <div className={styles.icon}>
        <Icon weight="duotone" />
      </div>
      <h3 className="text-title3 emphasized">{content.title}</h3>
      {appName && <p className="text-callout text-secondary">{appName} needs this integration to work.</p>}
      {detail && <p className={`${styles.detail} text-callout`}>{detail}</p>}
      <ol className={styles.steps}>
        {content.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="text-footnote text-tertiary">See the README for details and troubleshooting.</p>
    </div>
  );
}
