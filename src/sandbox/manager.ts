import { execa } from 'execa';
import { platform } from 'os';
import which from 'which';

export type SandboxMode = 'none' | 'bwrap' | 'seatbelt' | 'docker';

export async function detectSandbox(): Promise<SandboxMode> {
  const os = platform();
  if (os === 'darwin') return 'seatbelt'; // sandbox-exec is built into macOS
  if (os === 'linux') {
    try {
      await which('bwrap');
      return 'bwrap';
    } catch {
      try {
        await which('docker');
        return 'docker';
      } catch {
        return 'none';
      }
    }
  }
  return 'none';
}

export async function runSandboxed(
  command: string,
  cwd: string,
  mode: SandboxMode
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  switch (mode) {
    case 'bwrap': {
      const bwrapArgs = [
        '--ro-bind', '/usr', '/usr',
        '--ro-bind', '/lib', '/lib',
        '--bind', cwd, cwd,
        '--proc', '/proc',
        '--dev', '/dev',
        '--unshare-net',
        '--die-with-parent',
        'bash', '-c', command,
      ];
      const result = await execa('bwrap', bwrapArgs, { cwd, reject: false, all: true });
      return { stdout: result.all ?? '', stderr: '', exitCode: result.exitCode ?? 0 };
    }
    case 'seatbelt': {
      // macOS sandbox-exec with a permissive-but-contained profile
      const profile = `(version 1)(allow default)(deny network-outbound)`;
      const result = await execa('sandbox-exec', ['-p', profile, 'bash', '-c', command], { cwd, reject: false, all: true });
      return { stdout: result.all ?? '', stderr: '', exitCode: result.exitCode ?? 0 };
    }
    case 'docker': {
      const result = await execa('docker', ['run', '--rm', '-v', `${cwd}:${cwd}`, '-w', cwd, 'node:20', 'bash', '-c', command], { reject: false, all: true });
      return { stdout: result.all ?? '', stderr: '', exitCode: result.exitCode ?? 0 };
    }
    default: {
      const result = await execa('bash', ['-c', command], { cwd, reject: false, all: true });
      return { stdout: result.all ?? '', stderr: '', exitCode: result.exitCode ?? 0 };
    }
  }
}
