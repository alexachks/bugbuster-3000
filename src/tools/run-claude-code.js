import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Run Claude Code CLI for deep code analysis
 * This integrates the full Claude Code agent for complex investigations
 */
export async function runClaudeCode({ task, focus_files = [] }, context) {
  const claudeCodePath = process.env.CLAUDE_CODE_CLI_PATH || 'claude-code';
  const repoPath = context.repoPath || process.env.REPO_CLONE_PATH;

  if (!repoPath) {
    throw new Error('Repository path not configured');
  }

  try {
    // Check if Claude Code CLI is available
    try {
      await execAsync(`${claudeCodePath} --version`);
    } catch (error) {
      throw new Error('Claude Code CLI not found. Please install it or configure CLAUDE_CODE_CLI_PATH.');
    }

    // Build task prompt
    let prompt = task;

    if (focus_files.length > 0) {
      prompt += '\n\nFocus on these files:\n';
      focus_files.forEach(file => {
        prompt += `- ${file}\n`;
      });
    }

    // Create temporary file for prompt
    const tempFile = path.join('/tmp', `claude-code-prompt-${Date.now()}.txt`);
    await fs.writeFile(tempFile, prompt);

    console.log(`🤖 Running Claude Code CLI for task: ${task.substring(0, 100)}...`);

    // Run Claude Code CLI
    // Note: This is a simplified version - actual implementation may need adjustments
    const command = `cd "${repoPath}" && ${claudeCodePath} --prompt "$(cat ${tempFile})" --format json`;

    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
      timeout: 120000 // 2 minute timeout
    });

    // Clean up temp file
    await fs.unlink(tempFile).catch(() => {});

    // Parse output
    let analysis;
    try {
      analysis = JSON.parse(stdout);
    } catch {
      // If not JSON, return raw output
      analysis = {
        raw_output: stdout,
        stderr: stderr || null
      };
    }

    console.log(`✅ Claude Code CLI completed analysis`);

    return {
      tool: 'run_claude_code',
      task,
      focus_files,
      analysis,
      success: true
    };
  } catch (error) {
    console.error('❌ Claude Code CLI failed:', error);

    // If timeout, provide partial results
    if (error.killed && error.signal === 'SIGTERM') {
      return {
        tool: 'run_claude_code',
        task,
        focus_files,
        error: 'Analysis timed out after 2 minutes',
        success: false
      };
    }

    throw new Error(`Claude Code CLI failed: ${error.message}`);
  }
}
