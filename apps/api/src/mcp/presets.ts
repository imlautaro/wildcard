// Curated official remote MCP servers offered as presets in Account → Connections.
// A preset only prefills the existing connect flow: consent, endpoint checks, OAuth
// discovery and per-tool approvals are unchanged, and the client still sends the
// URL like any custom server. Clients map `id` to a bundled logo, so a new entry
// also needs a logo in both clients (see docs/connectors.md#connector-library).
//
// Every OAuth entry advertised RFC 9728 resource metadata, a matching issuer, S256
// and Client ID Metadata Documents or Dynamic Client Registration when probed on
// 2026-10-30; public entries also returned a catalog accepted by schema.ts. Servers
// can change without notice, so this is a curated starting point, not a guarantee.
export type McpPreset = {
  id: string;
  name: string;
  description: string;
  category: 'Productivity' | 'Google Workspace' | 'Development' | 'Data and analytics' | 'Customer support' | 'Payments' | 'Knowledge';
  url: string;
  authType: 'none' | 'bearer' | 'oauth';
  // Pre-registered OAuth settings for providers without automatic client registration.
  issuer?: string;
  scope?: string;
  ownClient?: boolean;
  // Extra setup the user must do before connecting.
  note?: string;
};

const google = 'This Google MCP server is in preview: your Google Workspace account and Google Cloud project must first be approved in the Google Workspace Developer Preview Program, or its tools fail with a permission error. It also needs your own Web OAuth client marked for an AI-powered agent, with the API and its MCP API enabled in that project. Enter its Client ID and secret under Advanced.';

export const mcpPresets: McpPreset[] = [
  { id: 'notion', name: 'Notion', category: 'Productivity', url: 'https://mcp.notion.com/mcp', authType: 'oauth', description: 'Search, read and update pages and databases.' },
  { id: 'linear', name: 'Linear', category: 'Productivity', url: 'https://mcp.linear.app/mcp', authType: 'oauth', description: 'Find, create and update issues, projects and comments.' },
  { id: 'todoist', name: 'Todoist', category: 'Productivity', url: 'https://ai.todoist.net/mcp', authType: 'oauth', description: 'Manage tasks, projects and due dates.' },
  { id: 'monday', name: 'monday.com', category: 'Productivity', url: 'https://mcp.monday.com/mcp', authType: 'oauth', description: 'Work with boards, items and updates.' },
  { id: 'clickup', name: 'ClickUp', category: 'Productivity', url: 'https://mcp.clickup.com/mcp', authType: 'oauth', description: 'Manage tasks, lists, docs and time tracking.' },
  { id: 'airtable', name: 'Airtable', category: 'Productivity', url: 'https://mcp.airtable.com/mcp', authType: 'oauth', description: 'Read and edit records in your bases.' },
  { id: 'miro', name: 'Miro', category: 'Productivity', url: 'https://mcp.miro.com/', authType: 'oauth', description: 'Read boards and add content to them.' },
  { id: 'coda', name: 'Coda', category: 'Productivity', url: 'https://coda.io/apis/mcp', authType: 'oauth', description: 'Read and update docs, tables and pages.' },
  { id: 'dropbox', name: 'Dropbox', category: 'Productivity', url: 'https://mcp.dropbox.com/mcp', authType: 'oauth', description: 'Search, read and organize your files.' },
  { id: 'zapier', name: 'Zapier', category: 'Productivity', url: 'https://mcp.zapier.com/api/mcp/mcp', authType: 'oauth', description: 'Run the actions you configure across thousands of apps.' },
  { id: 'gmail', name: 'Gmail', category: 'Google Workspace', url: 'https://gmailmcp.googleapis.com/mcp/v1', authType: 'oauth', ownClient: true, issuer: 'https://accounts.google.com',
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose', description: 'Search and read email and write drafts.', note: google },
  { id: 'google-calendar', name: 'Google Calendar', category: 'Google Workspace', url: 'https://calendarmcp.googleapis.com/mcp/v1', authType: 'oauth', ownClient: true, issuer: 'https://accounts.google.com',
    scope: 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events', description: 'See and manage events and suggest meeting times.', note: google },
  { id: 'google-drive', name: 'Google Drive', category: 'Google Workspace', url: 'https://drivemcp.googleapis.com/mcp/v1', authType: 'oauth', ownClient: true, issuer: 'https://accounts.google.com',
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file', description: 'Search and read files and create new ones.', note: google },
  { id: 'github', name: 'GitHub', category: 'Development', url: 'https://api.githubcopilot.com/mcp/', authType: 'bearer', description: 'Work with repositories, issues and pull requests.',
    note: 'GitHub does not support automatic OAuth registration. Create a fine-grained personal access token limited to the repositories and permissions you need, and paste it as the Bearer token.' },
  { id: 'gitlab', name: 'GitLab', category: 'Development', url: 'https://gitlab.com/api/v4/mcp', authType: 'oauth', description: 'Work with projects, issues and merge requests on GitLab.com.' },
  { id: 'sentry', name: 'Sentry', category: 'Development', url: 'https://mcp.sentry.dev/mcp', authType: 'oauth', description: 'Investigate errors, issues and releases.' },
  { id: 'vercel', name: 'Vercel', category: 'Development', url: 'https://mcp.vercel.com', authType: 'oauth', description: 'Inspect projects, deployments and logs.' },
  { id: 'netlify', name: 'Netlify', category: 'Development', url: 'https://netlify-mcp.netlify.app/mcp', authType: 'oauth', description: 'Manage sites, deploys and environment settings.' },
  { id: 'supabase', name: 'Supabase', category: 'Development', url: 'https://mcp.supabase.com/mcp', authType: 'oauth', description: 'Query and manage your Supabase projects.' },
  { id: 'neon', name: 'Neon', category: 'Development', url: 'https://mcp.neon.tech/mcp', authType: 'oauth', description: 'Manage Postgres projects, branches and queries.' },
  { id: 'prisma', name: 'Prisma Postgres', category: 'Development', url: 'https://mcp.prisma.io/mcp', authType: 'oauth', description: 'Create and manage Prisma Postgres databases.' },
  { id: 'postman', name: 'Postman', category: 'Development', url: 'https://mcp.postman.com/mcp', authType: 'oauth', description: 'Work with collections, workspaces and APIs.' },
  { id: 'posthog', name: 'PostHog', category: 'Data and analytics', url: 'https://mcp.posthog.com/mcp', authType: 'oauth', description: 'Query product analytics, feature flags and experiments.' },
  { id: 'amplitude', name: 'Amplitude', category: 'Data and analytics', url: 'https://mcp.amplitude.com/mcp', authType: 'oauth', description: 'Explore charts, events and user behavior.' },
  { id: 'intercom', name: 'Intercom', category: 'Customer support', url: 'https://mcp.intercom.com/mcp', authType: 'oauth', description: 'Search conversations and customer contacts.' },
  { id: 'zendesk', name: 'Zendesk', category: 'Customer support', url: 'https://mcp.zendesk.com/mcp', authType: 'oauth', description: 'Read and update support tickets.' },
  { id: 'stripe', name: 'Stripe', category: 'Payments', url: 'https://mcp.stripe.com', authType: 'oauth', description: 'Look up customers, payments and invoices, and create payment links.' },
  { id: 'paypal', name: 'PayPal', category: 'Payments', url: 'https://mcp.paypal.com/mcp', authType: 'oauth', description: 'Manage invoices, orders and transactions.' },
  { id: 'square', name: 'Square', category: 'Payments', url: 'https://mcp.squareup.com/mcp', authType: 'oauth', description: 'Work with payments, orders, catalog and customers.' },
  { id: 'cloudflare-docs', name: 'Cloudflare Docs', category: 'Knowledge', url: 'https://docs.mcp.cloudflare.com/mcp', authType: 'none', description: 'Search the Cloudflare developer documentation.' },
  { id: 'microsoft-learn', name: 'Microsoft Learn', category: 'Knowledge', url: 'https://learn.microsoft.com/api/mcp', authType: 'none', description: 'Search Microsoft documentation and code samples.' },
  { id: 'aws-knowledge', name: 'AWS Knowledge', category: 'Knowledge', url: 'https://knowledge-mcp.global.api.aws', authType: 'none', description: 'Search AWS documentation and regional availability.' },
  { id: 'hugging-face', name: 'Hugging Face', category: 'Knowledge', url: 'https://huggingface.co/mcp', authType: 'none', description: 'Search models, datasets and Spaces on the Hub.' },
  { id: 'exa', name: 'Exa', category: 'Knowledge', url: 'https://mcp.exa.ai/mcp', authType: 'none', description: 'Search the web and fetch page contents.' },
];
