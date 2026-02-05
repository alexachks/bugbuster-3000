import fs from 'fs/promises';
import path from 'path';

/**
 * List files in a directory
 * Supports glob pattern filtering
 */
export async function listFiles({ path: dirPath = '.', pattern }, context) {
  const repoPath = context.repoPath || process.env.REPO_CLONE_PATH;

  if (!repoPath) {
    throw new Error('Repository path not configured');
  }

  const fullPath = path.join(repoPath, dirPath);

  try {
    // Security check: prevent path traversal
    const resolvedPath = path.resolve(fullPath);
    const resolvedRepoPath = path.resolve(repoPath);
    if (!resolvedPath.startsWith(resolvedRepoPath)) {
      throw new Error('Access denied: path traversal detected');
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    let files = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: path.join(dirPath, entry.name)
    }));

    // Apply pattern filter if provided
    if (pattern) {
      const regex = globToRegex(pattern);
      files = files.filter(file => regex.test(file.name));
    }

    // Sort: directories first, then files, alphabetically
    files.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      tool: 'list_files',
      path: dirPath,
      pattern,
      total_entries: files.length,
      files
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    if (error.code === 'ENOTDIR') {
      throw new Error(`Not a directory: ${dirPath}`);
    }
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

/**
 * Convert glob pattern to regex
 * Simple implementation - supports * and ?
 */
function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '.*') // * matches anything
    .replace(/\?/g, '.'); // ? matches single char

  return new RegExp(`^${escaped}$`);
}
