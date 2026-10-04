/**
 * Server Exec Tool
 * Execute commands on remote servers via SSH
 */

import { Client } from 'ssh2';

const FORBIDDEN_CHARACTERS = /[;|&$`<>(){}\\\x00-\x1f\x7f]/;
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]+$/;
const CONTAINER_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const LINE_COUNT = /^[1-9][0-9]{0,4}$/;
const LOG_SINCE = /^(?:[0-9]+[smh])+$|^[0-9]{4}-[0-9]{2}-[0-9]{2}(?:T[0-9]{2}:[0-9]{2}(?::[0-9]{2})?Z?)?$/;

const DOCKER_LOGS_VALUE_OPTIONS = new Map([['--tail', LINE_COUNT], ['-n', LINE_COUNT], ['--since', LOG_SINCE]]);
const DOCKER_LOGS_FLAGS = new Set(['-t', '--timestamps']);
const DOCKER_STATS_FLAGS = new Set(['--no-stream', '-a', '--all', '--no-trunc']);

function onlyFlags(...allowed) {
  const flags = new Set(allowed);
  return (args) => args.every(arg => flags.has(arg));
}

function isDockerLogsArgs(args) {
  let container = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const valuePattern = DOCKER_LOGS_VALUE_OPTIONS.get(arg);
    if (valuePattern) {
      i++;
      if (i >= args.length || !valuePattern.test(args[i])) return false;
    } else if (DOCKER_LOGS_FLAGS.has(arg)) {
      continue;
    } else if (container === null && CONTAINER_NAME.test(arg)) {
      container = arg;
    } else {
      return false;
    }
  }
  return container !== null;
}

function isDockerStatsArgs(args) {
  return args.includes('--no-stream') &&
    args.every(arg => DOCKER_STATS_FLAGS.has(arg) || CONTAINER_NAME.test(arg));
}

// Read-only diagnostics only: nothing here can write, exec into a container or print env/config.
const ALLOWED_FORMS = [
  {
    usage: 'docker ps [-a] [-s] [-q] [--no-trunc]',
    prefix: ['docker', 'ps'],
    isValidArgs: onlyFlags('-a', '--all', '-s', '--size', '-q', '--quiet', '--no-trunc')
  },
  {
    usage: 'docker logs <container> [--tail N] [--since 30m|2026-01-31T12:00:00Z] [-t]',
    prefix: ['docker', 'logs'],
    isValidArgs: isDockerLogsArgs
  },
  {
    usage: 'docker stats --no-stream [-a] [--no-trunc] [container ...]',
    prefix: ['docker', 'stats'],
    isValidArgs: isDockerStatsArgs
  },
  { usage: 'df [-h] [-i] [-T]', prefix: ['df'], isValidArgs: onlyFlags('-h', '-i', '-T') },
  { usage: 'free [-h|-m|-g]', prefix: ['free'], isValidArgs: onlyFlags('-h', '-m', '-g') },
  { usage: 'uptime [-p]', prefix: ['uptime'], isValidArgs: onlyFlags('-p') }
];

const ALLOWED_USAGE = ALLOWED_FORMS.map(form => `- ${form.usage}`).join('\n');

function rejectCommand(command, reason) {
  return new Error(
    `Command not allowed: ${JSON.stringify(command)} (${reason})\n\n` +
    `Only these read-only commands are accepted (no pipes, redirects, chaining or substitution):\n${ALLOWED_USAGE}`
  );
}

/**
 * Validate a command against the read-only allowlist.
 * Returns the canonical command (validated tokens joined by single spaces); throws if not allowed.
 */
export function validateCommand(command) {
  if (typeof command !== 'string') {
    throw rejectCommand(command, 'command must be a string');
  }
  if (FORBIDDEN_CHARACTERS.test(command)) {
    throw rejectCommand(command, 'shell metacharacters or control characters');
  }

  const tokens = command.trim().split(/ +/);
  if (!tokens.every(token => SAFE_TOKEN.test(token))) {
    throw rejectCommand(command, 'unexpected characters in arguments');
  }

  const form = ALLOWED_FORMS.find(candidate =>
    candidate.prefix.every((word, i) => tokens[i] === word)
  );
  if (!form || !form.isValidArgs(tokens.slice(form.prefix.length))) {
    throw rejectCommand(command, 'not an allowed command form');
  }

  return tokens.join(' ');
}

export const definition = {
  name: 'server_exec',
  description: `Run a read-only diagnostic command on a remote server via SSH.

Available servers are configured via SERVER_* environment variables.

Only these exact command forms are accepted (no pipes, redirects, chaining or substitution):
${ALLOWED_USAGE}

Examples:
- "docker ps -a" - list all containers
- "docker logs awkward-seo-engine --tail 100 --since 30m" - recent logs
- "docker stats --no-stream" - CPU/memory per container
- "free -m" - memory usage`,

  input_schema: {
    type: 'object',
    properties: {
      server: {
        type: 'string',
        description: 'Server name from SERVER_* env variables (e.g., "production", "staging")'
      },
      command: {
        type: 'string',
        description: 'One of the allowed read-only command forms listed above'
      }
    },
    required: ['server', 'command']
  }
};

/**
 * Get available servers from environment variables
 */
function getAvailableServers() {
  const servers = {};

  Object.keys(process.env).forEach(key => {
    const match = key.match(/^SERVER_([A-Z_]+)_HOST$/);
    if (match) {
      const serverName = match[1].toLowerCase();
      const prefix = `SERVER_${match[1]}`;

      servers[serverName] = {
        host: process.env[`${prefix}_HOST`],
        user: process.env[`${prefix}_USER`],
        password: process.env[`${prefix}_PASSWORD`]
      };
    }
  });

  return servers;
}

/**
 * Execute command via SSH
 */
async function executeSSH(serverConfig, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let errorOutput = '';

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        stream.on('close', (code, signal) => {
          conn.end();

          if (code !== 0) {
            reject(new Error(`Command exited with code ${code}\n${errorOutput}`));
          } else {
            resolve(output || errorOutput);
          }
        });

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    // Connect with password auth
    conn.connect({
      host: serverConfig.host,
      port: 22,
      username: serverConfig.user,
      password: serverConfig.password,
      readyTimeout: 10000
    });
  });
}

/**
 * Execute tool
 */
export async function execute({ server, command }) {
  try {
    // Get available servers
    const servers = getAvailableServers();

    if (Object.keys(servers).length === 0) {
      return '❌ No servers configured. Add SERVER_* environment variables.';
    }

    // Check if server exists
    if (!servers[server]) {
      const available = Object.keys(servers).join(', ');
      return `❌ Server "${server}" not found.\n\nAvailable servers: ${available}`;
    }

    // Validate command
    const validatedCommand = validateCommand(command);

    // Get server config
    const serverConfig = servers[server];

    console.log(`🔧 Executing on ${server}: ${validatedCommand}`);

    // Execute via SSH
    const output = await executeSSH(serverConfig, validatedCommand);

    if (!output || output.trim() === '') {
      return `✅ Command executed successfully (no output)`;
    }

    return `📋 Output from ${server}:\n\n${output}`;

  } catch (error) {
    console.error('❌ server_exec error:', error);
    return `❌ Error: ${error.message}`;
  }
}
