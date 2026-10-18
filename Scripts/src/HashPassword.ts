import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline';
import { stdin, stdout, stderr, argv, exit } from 'node:process';

/**
 * Prints a bcrypt hash for LOGIN_PASSWORD_HASH.
 *   npm run hash-password -- 'my password'
 *   npm run hash-password            (prompts, input hidden when run in a TTY)
 */
async function readPassword(): Promise<string> {
  const fromArgs = argv.slice(2).join(' ');
  if (fromArgs.length > 0) return fromArgs;

  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  }

  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    stdout.write('Password: ');
    let muted = true;
    // Hide the typed characters.
    const originalWrite = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = function (text: string) {
      if (muted) return;
      originalWrite.call(this, text);
    };
    rl.question('', (answer) => {
      muted = false;
      stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

const password = await readPassword();
if (password.length === 0) {
  stderr.write('Password must not be empty.\n');
  exit(1);
}
const hash = await bcrypt.hash(password, 10);
stdout.write(`${hash}\n`);
stderr.write(
  '\nUse this as LOGIN_PASSWORD_HASH. In docker-compose.yml write every "$" as "$$":\n' +
    `  LOGIN_PASSWORD_HASH=${hash.replace(/\$/g, '$$$$')}\n`,
);
