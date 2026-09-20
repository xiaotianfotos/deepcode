import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { Context } from '@deepseek-ai/cordis';
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools';

export const name = 'dsh-android-debian';
export const inject = ['tools', 'sandboxPolicy'] as const;
export interface Config { dnsServers?: string[] }
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const objectSchema = { type: 'object', additionalProperties: true, properties: {} } as const;
const output = { schema: objectSchema, render: (_args: unknown, value: unknown) => [
  { type: 'text' as const, text: JSON.stringify(value, null, 2) },
] };
type RecordValue = Record<string, any>;

export function apply(ctx: Context, config: Config = {}) {
  const prefix = process.env.TERMUX__PREFIX;
  if (!prefix || process.platform !== 'android') throw new Error('Debian plugin requires embedded Android runtime');
  const appFiles = path.dirname(prefix);
  const home = path.join(appFiles, 'home');
  const bundle = path.join(prefix, 'share/dsh-debian');
  const environment = path.join(home, '.dsh/debian');
  const jobs = path.join(environment, 'jobs');
  const helper = fileURLToPath(new URL('./runner.py', import.meta.url));
  fs.mkdirSync(jobs, { recursive: true, mode: 0o700 });
  const owner = (exec: ToolRunContext) => {
    const id = exec.agent?.session.id;
    if (!id) throw new Error('A session is required for Debian tools');
    return String(id);
  };
  const read = (file: string): RecordValue => JSON.parse(fs.readFileSync(file, 'utf8'));
  const stateFile = (id: string) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid task id');
    return path.join(jobs, id + '.state.json');
  };
  const running = (record: RecordValue) => {
    try {
      if (record.bootId !== fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()) return false;
      const stat = fs.readFileSync(`/proc/${record.pid}/stat`, 'utf8');
      const tick = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/)[19];
      const argv = fs.readFileSync(`/proc/${record.pid}/cmdline`, 'utf8').split('\0');
      return tick === record.startTick && argv.includes(helper) && argv.includes(path.join(jobs, record.id + '.json'));
    } catch { return false; }
  };
  const list = (session: string) => fs.readdirSync(jobs).filter(f => f.endsWith('.state.json')).flatMap(f => {
    try {
      const record = read(path.join(jobs, f));
      if (record.owner !== session) return [];
      if (record.status === 'running' && !running(record)) {
        record.status = 'interrupted';
        record.finishedAt = Date.now() / 1000;
        const file = path.join(jobs, f);
        fs.writeFileSync(file + '.tmp', JSON.stringify(record));
        fs.renameSync(file + '.tmp', file);
      }
      return [record];
    } catch { return []; }
  });
  const dnsServers = () => {
    let values = config.dnsServers;
    if (!values) {
      try { values = read(path.join(appFiles, 'network-dns.json')).servers; } catch { /* explicit failure below */ }
    }
    if (!values?.length || values.some(value => !isIP(value))) {
      throw new Error('No valid Android DNS servers; reconnect network/restart app or configure dnsServers');
    }
    return values;
  };
  const execute = async (operation: 'install' | 'exec', args: RecordValue, exec: ToolRunContext) => {
    const session = owner(exec);
    const policy = (ctx.get('sandboxPolicy') as unknown as { resolve(v: unknown): { mode: string; workspaceRoot: string } })
      .resolve({ session: exec.agent!.session });
    if (!['workspace-write', 'danger-full-access'].includes(policy.mode)) {
      throw new Error('Debian commands/install are unavailable in read-only mode: this backend has partial enforcement');
    }
    const cwd = exec.agent!.session.header.cwd;
    if (!cwd) throw new Error('Select a project before using Debian');
    const workspace = fs.realpathSync(cwd);
    const relativeToApp = path.relative(fs.realpathSync(appFiles), workspace);
    const external = relativeToApp === '..' || relativeToApp.startsWith('../') || path.isAbsolute(relativeToApp);
    if (external) {
      const native = read(path.join(appFiles, 'network-dns.json'));
      if (typeof native.allFilesAccessRequired !== 'boolean' ||
          (native.allFilesAccessRequired && native.allFilesAccessGranted !== true)) {
        throw new Error('EACCES: grant All Files Access in Android settings and return to the app before using external Debian projects');
      }
    }
    if (!fs.statSync(workspace).isDirectory() || workspace.includes(':')) throw new Error('Unsupported project path');
    if (policy.mode === 'workspace-write') {
      const allowed = fs.realpathSync(policy.workspaceRoot);
      const relative = path.relative(allowed, workspace);
      if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Project is outside the current workspace policy');
    }
    if (!fs.existsSync(path.join(bundle, 'manifest.json'))) throw new Error('Debian bundle is not installed in this APK');
    const timeoutMs = args.timeoutMs ?? (operation === 'install' ? 600000 : 120000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3600000) throw new Error('timeoutMs must be 1000..3600000');
    if (operation === 'exec' && (typeof args.command !== 'string' || !args.command.trim())) throw new Error('Command must be non-empty');
    const id = randomUUID();
    const request = { id, owner: session, ownerPid: process.pid, operation, environment, bundle, workspace,
      reset: args.reset === true, command: args.command ?? '', timeoutMs,
      nativeLoader: operation === 'exec' ? path.join(read(path.join(appFiles, 'network-dns.json')).nativeLibraryDir, 'libdsh_proot_loader.so') : '',
      dnsServers: operation === 'exec' ? dnsServers() : [] };
    const file = path.join(jobs, id + '.json');
    fs.writeFileSync(file, JSON.stringify(request), { mode: 0o600, flag: 'wx' });
    // Delegate through the real Bash tool policy/approval/job pipeline. Never
    // invoke a child directly from the model-facing tool or bypass its guards.
    const result = await ctx.tools.execute({
      callId: `${exec.callId}/debian` as typeof exec.callId, name: 'bash',
      arguments: { command: 'exec ' + [path.join(prefix, 'bin/python3'), helper, file].map(quote).join(' '),
        description: operation === 'install' ? '安装或重建 Debian 执行环境' : 'Debian: ' + args.command.slice(0, 160),
        workdir: workspace, timeoutMs: timeoutMs + 5000,
        run_in_background: args.background ?? operation === 'install' },
      agent: exec.agent, signal: exec.signal, parent: exec.token,
    });
    if (result.isError) {
      throw new Error(JSON.stringify(result.content));
    }
    return { taskId: id, enforcement: 'partial', result: result.value,
      guidance: 'Use debian_tasks for durable state; job_output/job_kill for returned Bash background jobId. /workspace maps to this session project. PRoot is not a security sandbox.' };
  };
  ctx.tools.register(defineTool({
    name: 'debian_status', description: '查看 Debian 兼容环境、来源与 DNS。PRoot 只有部分隔离，不是安全容器。',
    parameters: {}, output,
    execute: async (_args, exec) => ({ installed: fs.existsSync(path.join(environment, 'current/.dsh-debian.json')),
      bundle: fs.existsSync(path.join(bundle, 'manifest.json')) ? read(path.join(bundle, 'manifest.json')) : null,
      environment, enforcement: 'partial', tasks: list(owner(exec)),
      hostArch: process.arch,
      dns: (() => { try { return dnsServers(); } catch { return []; } })() }) as never,
  }));
  ctx.tools.register(defineTool({
    name: 'debian_install',
    description: '从 APK 内已校验的 rootfs 安装 Debian，无需下载。reset=true 创建全新环境并保留旧版本，不触碰项目。默认后台执行，使用 job_output 查看进度。',
    parameters: { reset: { type: 'boolean' }, background: { type: 'boolean' } }, output,
    execute: async (args, exec) => await execute('install', args, exec) as never,
  }));
  ctx.tools.register(defineTool({
    name: 'debian_exec',
    description: '在 Debian 中执行 bash 命令，可用 apt 安装软件；/workspace 就是当前项目原目录，HOME=/root。不要使用安卓绝对路径访问项目。工具/缓存放 /root，产物放 /workspace。支持后台任务，最长一小时；共享盘可能不支持执行位和符号链接。环境共享且隔离为 partial，不用于不可信代码安全隔离。',
    parameters: { command: { type: 'string', required: true }, background: { type: 'boolean' }, timeoutMs: { type: 'integer' } }, output,
    execute: async (args, exec) => await execute('exec', args, exec) as never,
  }));
  ctx.tools.register(defineTool({
    name: 'debian_tasks', description: '查看本会话 Debian 任务持久状态，或取消指定 taskId；重启后不自动重放任务。',
    parameters: { cancelTaskId: { type: 'string' } }, output,
    execute: async ({ cancelTaskId }, exec) => {
      const session = owner(exec);
      if (cancelTaskId) {
        const record = read(stateFile(cancelTaskId));
        if (record.owner !== session) throw new Error('Task belongs to another session');
        if (record.status === 'running' && running(record)) process.kill(record.pid, 'SIGTERM');
      }
      return { tasks: list(session) } as never;
    },
  }));
}
