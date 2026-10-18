import { existsSync } from 'node:fs';
import Docker from 'dockerode';
import type { ContainerInfo } from '@landscape/shared';
import type { Config } from '../Config';

/** Lazily constructed dockerode client bound to the configured socket. */
export class DockerClient {
  private client: Docker | null = null;

  constructor(private readonly config: Config) {}

  get available(): boolean {
    const socket = this.config.dockerSocket;
    if (socket.startsWith('//./pipe/') || socket.startsWith('\\\\.\\pipe\\')) return true;
    return existsSync(socket);
  }

  get docker(): Docker {
    if (!this.client) this.client = new Docker({ socketPath: this.config.dockerSocket });
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async listContainers(): Promise<ContainerInfo[]> {
    const list = await this.docker.listContainers({ all: true });
    const infos = await Promise.all(
      list.map(async (c) => {
        let startedAt: string | null = null;
        if (c.State === 'running') {
          try {
            const inspect = await this.docker.getContainer(c.Id).inspect();
            startedAt = inspect.State.StartedAt ?? null;
          } catch {
            startedAt = null;
          }
        }
        return {
          id: c.Id,
          name: (c.Names[0] ?? c.Id.slice(0, 12)).replace(/^\//, ''),
          image: c.Image,
          state: c.State,
          status: c.Status,
          createdAt: new Date(c.Created * 1000).toISOString(),
          startedAt,
          ports: (c.Ports ?? []).map((p) => ({ ip: p.IP ?? null, privatePort: p.PrivatePort, publicPort: p.PublicPort ?? null, type: p.Type })),
        } satisfies ContainerInfo;
      }),
    );
    return infos.sort((a, b) => a.name.localeCompare(b.name));
  }

  async count(): Promise<{ running: number; total: number }> {
    const list = await this.docker.listContainers({ all: true });
    return { running: list.filter((c) => c.State === 'running').length, total: list.length };
  }

  async action(id: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
    const container = this.docker.getContainer(id);
    if (action === 'start') await container.start();
    else if (action === 'stop') await container.stop({ t: 10 });
    else await container.restart({ t: 10 });
  }
}
