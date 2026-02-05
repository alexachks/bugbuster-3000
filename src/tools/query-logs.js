import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Query Docker container logs
 * Supports filtering by search pattern
 */
export async function queryLogs({ container, query, tail = 100 }, context) {
  const containerMap = {
    'main-app': process.env.MAIN_APP_CONTAINER_NAME || 'awkward-crm-app',
    'seo-engine': process.env.SEO_ENGINE_CONTAINER_NAME || 'awkward-crm-seo-engine'
  };

  const containerName = containerMap[container];
  if (!containerName) {
    throw new Error(`Unknown container: ${container}`);
  }

  try {
    // Get container logs
    let command = `docker logs --tail ${tail} ${containerName}`;

    if (query) {
      command += ` 2>&1 | grep -i "${escapeShellArg(query)}"`;
    }

    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const logs = (stdout + stderr).trim();
    const lines = logs ? logs.split('\n') : [];

    return {
      tool: 'query_logs',
      container,
      query: query || 'all',
      tail,
      total_lines: lines.length,
      logs: lines.slice(-100) // Return last 100 lines max
    };
  } catch (error) {
    // If grep finds no matches, it returns exit code 1
    if (error.code === 1 && error.stdout === '') {
      return {
        tool: 'query_logs',
        container,
        query: query || 'all',
        tail,
        total_lines: 0,
        logs: []
      };
    }

    // Check if Docker is available
    if (error.message.includes('docker: not found') || error.code === 127) {
      throw new Error('Docker is not available. Cannot query container logs.');
    }

    // Check if container exists
    if (error.message.includes('No such container')) {
      throw new Error(`Container not found: ${containerName}`);
    }

    throw new Error(`Failed to query logs: ${error.message}`);
  }
}

function escapeShellArg(arg) {
  return arg.replace(/["\\]/g, '\\$&');
}
