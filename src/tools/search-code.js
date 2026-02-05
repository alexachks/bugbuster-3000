import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Search code using ripgrep (rg)
 * Falls back to grep if ripgrep is not available
 */
export async function searchCode({ query, file_pattern, context_lines = 2 }, context) {
  const repoPath = context.repoPath || process.env.REPO_CLONE_PATH;

  if (!repoPath) {
    throw new Error('Repository path not configured');
  }

  try {
    // Try ripgrep first (faster and better)
    const rgCommand = buildRipgrepCommand(query, file_pattern, context_lines, repoPath);

    try {
      const { stdout } = await execAsync(rgCommand, {
        cwd: repoPath,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      return {
        tool: 'search_code',
        query,
        file_pattern,
        results: parseRipgrepOutput(stdout),
        total_matches: countMatches(stdout)
      };
    } catch (rgError) {
      // If ripgrep not found, fall back to grep
      if (rgError.message.includes('not found') || rgError.code === 127) {
        console.log('⚠️ Ripgrep not found, falling back to grep');
        const grepCommand = buildGrepCommand(query, file_pattern, context_lines, repoPath);
        const { stdout } = await execAsync(grepCommand, {
          cwd: repoPath,
          maxBuffer: 10 * 1024 * 1024
        });

        return {
          tool: 'search_code',
          query,
          file_pattern,
          results: parseGrepOutput(stdout),
          total_matches: countMatches(stdout),
          fallback: 'grep'
        };
      }
      throw rgError;
    }
  } catch (error) {
    // No matches found is not an error
    if (error.code === 1) {
      return {
        tool: 'search_code',
        query,
        file_pattern,
        results: [],
        total_matches: 0
      };
    }
    throw new Error(`Code search failed: ${error.message}`);
  }
}

function buildRipgrepCommand(query, filePattern, contextLines, repoPath) {
  let cmd = `rg "${escapeShellArg(query)}" --line-number --column --color never`;

  if (contextLines > 0) {
    cmd += ` --context ${contextLines}`;
  }

  if (filePattern) {
    cmd += ` --glob "${escapeShellArg(filePattern)}"`;
  }

  // Exclude common directories
  cmd += ` --glob "!node_modules" --glob "!.git" --glob "!dist" --glob "!build" --glob "!.next"`;

  return cmd;
}

function buildGrepCommand(query, filePattern, contextLines, repoPath) {
  let cmd = `grep -rn "${escapeShellArg(query)}"`;

  if (contextLines > 0) {
    cmd += ` -C ${contextLines}`;
  }

  // Exclude common directories
  cmd += ` --exclude-dir={node_modules,.git,dist,build,.next}`;

  if (filePattern) {
    cmd += ` --include="${escapeShellArg(filePattern)}"`;
  }

  cmd += ' .';

  return cmd;
}

function parseRipgrepOutput(output) {
  if (!output.trim()) return [];

  const lines = output.split('\n');
  const results = [];
  let currentFile = null;
  let currentMatches = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Match format: path/to/file.ts:42:10:some code here
    const match = line.match(/^([^:]+):(\d+):(\d+):(.*)$/);
    if (match) {
      const [, filepath, lineNum, column, content] = match;

      if (currentFile !== filepath) {
        if (currentFile && currentMatches.length > 0) {
          results.push({ file: currentFile, matches: currentMatches });
        }
        currentFile = filepath;
        currentMatches = [];
      }

      currentMatches.push({
        line: parseInt(lineNum),
        column: parseInt(column),
        content: content.trim()
      });
    }
  }

  if (currentFile && currentMatches.length > 0) {
    results.push({ file: currentFile, matches: currentMatches });
  }

  return results;
}

function parseGrepOutput(output) {
  if (!output.trim()) return [];

  const lines = output.split('\n');
  const results = [];
  let currentFile = null;
  let currentMatches = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Match format: path/to/file.ts:42:some code here
    const match = line.match(/^([^:]+):(\d+):(.*)$/);
    if (match) {
      const [, filepath, lineNum, content] = match;

      if (currentFile !== filepath) {
        if (currentFile && currentMatches.length > 0) {
          results.push({ file: currentFile, matches: currentMatches });
        }
        currentFile = filepath;
        currentMatches = [];
      }

      currentMatches.push({
        line: parseInt(lineNum),
        content: content.trim()
      });
    }
  }

  if (currentFile && currentMatches.length > 0) {
    results.push({ file: currentFile, matches: currentMatches });
  }

  return results;
}

function countMatches(output) {
  return output.split('\n').filter(line => line.match(/:\d+:/)).length;
}

function escapeShellArg(arg) {
  return arg.replace(/["\\]/g, '\\$&');
}
