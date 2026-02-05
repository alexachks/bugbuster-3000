/**
 * Server Exec Tool
 * Execute commands on remote servers via SSH
 */

import { Client } from 'ssh2';

// Whitelist of allowed command prefixes
const ALLOWED_COMMANDS = [
  // Docker read-only
  'docker ps',
  'docker logs',
  'docker inspect',
  'docker stats',
  'docker top',
  'docker exec',

  // Docker safe actions
  'docker restart',

  // System diagnostics
  'free',
  'df',
  'top',
  'htop',
  'uptime',
  'ps',
  'du',

  // Network
  'netstat',
  'ss',
  'lsof',
  'ping',
  'curl',
  'wget',
  'traceroute',

  // File reading
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'grep',
  'find',
  'ls',
  'tree',

  // System info
  'uname',
  'whoami',
  'hostname',
  'date',
  'env',
  'printenv'
];

export const definition = {
  name: 'server_exec',
  description: `Execute diagnostic commands on remote servers via SSH.

Available servers are configured via SERVER_* environment variables.

Allowed commands (whitelist):
- Docker: ps, logs, inspect, stats, top, restart, exec
- System: free, df, top, htop, uptime, ps, du
- Network: netstat, ss, lsof, ping, curl, wget
- Files: cat, head, tail, ls, grep, find, tree
- Info: uname, whoami, hostname, date, env

Examples:
- "docker ps -a" - list all containers
- "docker logs app-name --tail 100" - recent logs
- "free -h" - memory usage
- "curl http://localhost:3000/health" - check endpoint`,

  input_schema: {
    type: 'object',
    properties: {
      server: {
        type: 'string',
        description: 'Server name from SERVER_* env variables (e.g., "production", "staging")'
      },
      command: {
        type: 'string',
        description: 'Command to execute (must start with allowed command from whitelist)'
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
 * Validate command against whitelist
 */
function validateCommand(command) {
  const trimmed = command.trim();

  // Check if command starts with any allowed prefix
  const isAllowed = ALLOWED_COMMANDS.some(allowed =>
    trimmed.startsWith(allowed)
  );

  if (!isAllowed) {
    throw new Error(
      `Command not allowed: "${trimmed}"\n\n` +
      `Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`
    );
  }

  return trimmed;
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
