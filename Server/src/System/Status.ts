import { accessSync, constants, existsSync, statSync } from 'node:fs';
import type { IntegrationStatus, SystemStatus } from '@landscape/shared';
import type { Config } from '../Config';

export type SshProbe = () => Promise<{ ok: boolean; detail: string; hint: string | null }>;

/** Checks every integration and returns a short, actionable status for each. */
export async function collectSystemStatus(config: Config, sshProbe: SshProbe | null): Promise<SystemStatus> {
  return {
    version: config.version,
    ssh: await sshStatus(config, sshProbe),
    docker: dockerStatus(config),
    hostProc: mountStatus(`${config.hostProc}/stat`, 'Host /proc is mounted.', 'Mount /proc:/host/proc:ro in docker-compose.yml.'),
    hostSys: mountStatus(`${config.hostSys}/class`, 'Host /sys is mounted.', 'Mount /sys:/host/sys:ro in docker-compose.yml.'),
    hostRoot: config.hostRoot
      ? mountStatus(`${config.hostRoot}/proc`, 'Host root is mounted; disk usage is read directly.', 'Optional: mount /:/host/root:ro for disk usage without SSH.')
      : { ok: false, detail: 'HOST_ROOT is not set.', hint: 'Optional: set HOST_ROOT and mount /:/host/root:ro.' },
  };
}

function mountStatus(probePath: string, okDetail: string, hint: string): IntegrationStatus {
  if (existsSync(probePath)) return { ok: true, detail: okDetail, hint: null };
  return { ok: false, detail: `${probePath} does not exist.`, hint };
}

function dockerStatus(config: Config): IntegrationStatus {
  const socket = config.dockerSocket;
  if (socket.startsWith('//./pipe/') || socket.startsWith('\\\\.\\pipe\\')) {
    return { ok: true, detail: `Using the Docker named pipe ${socket}.`, hint: null };
  }
  if (!existsSync(socket)) {
    return { ok: false, detail: `${socket} is not mounted.`, hint: 'Mount /var/run/docker.sock:/var/run/docker.sock (root-equivalent access).' };
  }
  try {
    if (!statSync(socket).isSocket()) return { ok: false, detail: `${socket} is not a socket.`, hint: 'Check the DOCKER_SOCKET path.' };
    accessSync(socket, constants.R_OK | constants.W_OK);
    return { ok: true, detail: 'Docker socket is accessible.', hint: null };
  } catch {
    return {
      ok: false,
      detail: `${socket} exists but is not readable/writable by the server user.`,
      hint: 'The entrypoint joins the socket group automatically; check `stat -c %g /var/run/docker.sock` or set PUID=0 on Docker Desktop.',
    };
  }
}

async function sshStatus(config: Config, probe: SshProbe | null): Promise<IntegrationStatus> {
  if (!config.ssh.user) {
    return { ok: false, detail: 'SSH_USER is not set.', hint: 'Set SSH_USER to the host user whose authorized_keys contains the LANdscape public key.' };
  }
  if (!existsSync(config.ssh.keyPath)) {
    return { ok: false, detail: `Private key not found at ${config.ssh.keyPath}.`, hint: 'Generate a key with ssh-keygen and place it in the data directory under ssh/.' };
  }
  try {
    accessSync(config.ssh.keyPath, constants.R_OK);
  } catch {
    return { ok: false, detail: `Private key at ${config.ssh.keyPath} is not readable.`, hint: 'Fix permissions: chown to the server user (PUID) and chmod 600.' };
  }
  if (!probe) return { ok: true, detail: `Key present; connecting as ${config.ssh.user}@${config.ssh.host}:${config.ssh.port}.`, hint: null };
  try {
    return await probe();
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error), hint: 'Check sshd on the host, the authorized_keys entry and SSH_HOST/SSH_PORT.' };
  }
}
