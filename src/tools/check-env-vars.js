import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if environment variables are configured in Docker containers
 * Note: For security, only checks if variables are SET, not their values
 */
export async function checkEnvVars({ service, var_names }, context) {
  const containerMap = {
    'main-app': process.env.MAIN_APP_CONTAINER_NAME || 'awkward-crm-app',
    'seo-engine': process.env.SEO_ENGINE_CONTAINER_NAME || 'awkward-crm-seo-engine'
  };

  const containerName = containerMap[service];
  if (!containerName) {
    throw new Error(`Unknown service: ${service}`);
  }

  try {
    const results = {};

    for (const varName of var_names) {
      try {
        // Check if variable is set (not showing actual value for security)
        const command = `docker exec ${containerName} sh -c 'test -n "$${varName}" && echo "SET" || echo "NOT_SET"'`;
        const { stdout } = await execAsync(command);

        const isSet = stdout.trim() === 'SET';
        results[varName] = {
          configured: isSet,
          status: isSet ? 'present' : 'missing'
        };
      } catch (error) {
        results[varName] = {
          configured: false,
          status: 'error',
          error: error.message
        };
      }
    }

    const allConfigured = Object.values(results).every(r => r.configured);

    return {
      tool: 'check_env_vars',
      service,
      variables: results,
      all_configured: allConfigured,
      summary: {
        total: var_names.length,
        configured: Object.values(results).filter(r => r.configured).length,
        missing: Object.values(results).filter(r => !r.configured).length
      }
    };
  } catch (error) {
    if (error.message.includes('No such container')) {
      throw new Error(`Container not running: ${containerName}`);
    }
    throw new Error(`Failed to check environment variables: ${error.message}`);
  }
}
