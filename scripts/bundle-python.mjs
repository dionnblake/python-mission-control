import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(root, 'work', 'python-build');
const environment = path.join(work, '.venv');
const windows = process.platform === 'win32';
const python = path.join(environment, windows ? 'Scripts/python.exe' : 'bin/python');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, PYINSTALLER_CONFIG_DIR: path.join(work, 'cache'), PIP_CACHE_DIR: path.join(work, 'pip-cache') } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

mkdirSync(work, { recursive: true });
if (!existsSync(python)) run(windows ? 'python' : 'python3', ['-m', 'venv', environment]);
run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', path.join(root, 'python', 'requirements-build.txt')]);
run(python, ['-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--console',
  '--name', 'mission-python', '--distpath', path.join(root, 'src-tauri', 'resources'),
  '--workpath', path.join(work, 'build'), '--specpath', work,
  path.join(root, 'python', 'runner.py')]);

const helper = path.join(root, 'src-tauri', 'resources', 'mission-python', windows ? 'mission-python.exe' : 'mission-python');
const smoke = spawnSync(helper, [], {
  input: JSON.stringify({ code: 'x = 4\nx += 3\nprint(x)' }),
  encoding: 'utf8', windowsHide: true, timeout: 15_000,
  env: { ...process.env, PYTHONHOME: '', PYTHONPATH: '',
    PATH: windows ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : '/usr/bin:/bin' },
});
if (smoke.error || smoke.status !== 0) throw smoke.error ?? new Error(smoke.stderr || 'Bundled Python failed to start');
const result = JSON.parse(smoke.stdout);
if (result.output !== '7\n' || result.error || result.events[0]?.locals?.x !== '4') {
  throw new Error('Bundled CPython semantic smoke check failed');
}
console.log(`Bundled CPython verified: ${helper}`);
