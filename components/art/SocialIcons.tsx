// Brand icons for social campaign links.
// GitHub mark is the official octocat silhouette (MIT-compatible simple-icons path).
// 小红书 (Xiaohongshu/RED) mark is a simplified "小红书" logomark.

export function GitHubIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function XiaohongshuIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 3h18v18H3V3zm5.5 4.5h-3v9h1.8v-3.2h1.2c1.3 0 2.2-.8 2.2-2.2v-1.4c0-1.4-.9-2.2-2.2-2.2zm-.3 1.6c.5 0 .8.3.8.8v1c0 .5-.3.8-.8.8h-.9V9.1h.9zM14 7.5h-3.2v9H14c1.2 0 2-.7 2-1.9V9.4c0-1.2-.8-1.9-2-1.9zm-.2 1.6c.4 0 .6.2.6.6v4.6c0 .4-.2.6-.6.6h-1.2V9.1h1.2zM18.5 7.5h-1.8v9h1.8v-4l1.5 4h1.9l-1.7-4.5 1.6-4.5h-1.8l-1.5 4v-4z" />
    </svg>
  );
}
