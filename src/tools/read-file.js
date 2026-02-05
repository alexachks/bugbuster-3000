import fs from 'fs/promises';
import path from 'path';

/**
 * Read file contents from repository
 * Supports reading full file or specific line range
 */
export async function readFile({ path: filePath, start_line, end_line }, context) {
  const repoPath = context.repoPath || process.env.REPO_CLONE_PATH;

  if (!repoPath) {
    throw new Error('Repository path not configured');
  }

  const fullPath = path.join(repoPath, filePath);

  try {
    // Security check: prevent path traversal
    const resolvedPath = path.resolve(fullPath);
    const resolvedRepoPath = path.resolve(repoPath);
    if (!resolvedPath.startsWith(resolvedRepoPath)) {
      throw new Error('Access denied: path traversal detected');
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // If line range specified, extract only those lines
    if (start_line !== undefined || end_line !== undefined) {
      const startIdx = (start_line || 1) - 1; // Convert to 0-indexed
      const endIdx = end_line || lines.length;

      const selectedLines = lines.slice(startIdx, endIdx);

      return {
        tool: 'read_file',
        file: filePath,
        start_line: start_line || 1,
        end_line: endIdx,
        total_lines: lines.length,
        content: selectedLines.join('\n'),
        lines: selectedLines.map((line, idx) => ({
          number: startIdx + idx + 1,
          content: line
        }))
      };
    }

    // Return full file
    return {
      tool: 'read_file',
      file: filePath,
      total_lines: lines.length,
      content,
      lines: lines.map((line, idx) => ({
        number: idx + 1,
        content: line
      }))
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw new Error(`Failed to read file: ${error.message}`);
  }
}
