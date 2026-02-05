import { simpleGit } from 'simple-git';

/**
 * Get git commit history
 */
export async function gitLog({ path: filePath, limit = 20, since }, context) {
  const repoPath = context.repoPath || process.env.REPO_CLONE_PATH;

  if (!repoPath) {
    throw new Error('Repository path not configured');
  }

  try {
    const git = simpleGit(repoPath);

    const options = {
      maxCount: limit,
      format: {
        hash: '%H',
        date: '%ai',
        message: '%s',
        author_name: '%an',
        author_email: '%ae'
      }
    };

    if (since) {
      options.since = since;
    }

    if (filePath) {
      options.file = filePath;
    }

    const log = await git.log(options);

    const commits = log.all.map(commit => ({
      hash: commit.hash.substring(0, 8), // Short hash
      full_hash: commit.hash,
      date: commit.date,
      message: commit.message,
      author: commit.author_name,
      email: commit.author_email
    }));

    return {
      tool: 'git_log',
      path: filePath || 'all',
      limit,
      since,
      total_commits: commits.length,
      commits
    };
  } catch (error) {
    throw new Error(`Git log failed: ${error.message}`);
  }
}
