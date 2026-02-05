/**
 * Check available Jira issue types for the project
 */

import dotenv from 'dotenv';
dotenv.config();

const jiraBaseUrl = process.env.JIRA_BASE_URL;
const jiraEmail = process.env.JIRA_EMAIL;
const jiraApiToken = process.env.JIRA_API_TOKEN;
const projectKey = process.env.JIRA_PROJECT_KEY;

console.log('🔍 Checking available issue types for project:', projectKey);
console.log('');

const authToken = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');

// Get project metadata including issue types
fetch(`${jiraBaseUrl}/rest/api/3/project/${projectKey}`, {
  headers: {
    'Authorization': `Basic ${authToken}`,
    'Accept': 'application/json'
  }
})
.then(response => {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
})
.then(project => {
  console.log('✅ Project found:', project.name);
  console.log('');
  console.log('📋 Available issue types:');
  console.log('');

  if (project.issueTypes && project.issueTypes.length > 0) {
    project.issueTypes.forEach((type, index) => {
      console.log(`  ${index + 1}. ${type.name}`);
      console.log(`     ID: ${type.id}`);
      console.log(`     Description: ${type.description || 'N/A'}`);
      console.log('');
    });

    console.log('💡 Tip: Update create-jira-ticket.js to use one of these types');
    console.log(`    For example: issuetype: { name: '${project.issueTypes[0].name}' }`);
  } else {
    console.log('  ⚠️  No issue types found');
  }
})
.catch(err => {
  console.error('❌ Error:', err.message);
  console.error('');
  console.error('💡 Troubleshooting:');
  console.error('  - Check PROJECT_KEY is correct');
  console.error('  - Verify you have access to this project');
  console.error('  - Ensure API token is valid');
});
