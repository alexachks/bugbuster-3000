import { simpleGit } from 'simple-git';

/**
 * Show git diff between commits or branches
 */
export async function gitDiff({ commit_or_branch, path: filePath }, context) {
  const repoPath = context.repoPath || process.env.REPO_CLONE_PATH;

  if (!repoPath) {
    throw new Error('Repository path not configured');
  }

  try {
    const git = simpleGit(repoPath);

    let diff;
    const options = ['--unified=3']; // 3 lines of context

    if (filePath) {
      options.push('--', filePath);
    }

    // Check if it's a range (e.g., "abc123..def456")
    if (commit_or_branch.includes('..')) {
      diff = await git.diff([commit_or_branch, ...options]);
    } else {
      // Single commit - show changes in that commit
      diff = await git.diff([`${commit_or_branch}^`, commit_or_branch, ...options]);
    }

    return {
      tool: 'git_diff',
      commit_or_branch,
      path: filePath || 'all',
      diff: diff || 'No changes found',
      size: diff ? diff.length : 0
    };
  } catch (error) {
    throw new Error(`Git diff failed: ${error.message}`);
  }
}
