import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';
import { BookOpen, Github, MessageSquare } from 'lucide-react';

import { APP_NAME, DOCS_TITLE } from './constants';
import { owner, repo } from './github';

/** Wordmark shown in the docs nav. */
export const logo = (
  <span
    aria-hidden
    className="flex size-6 items-center justify-center rounded-md bg-fd-primary font-semibold text-fd-primary-foreground text-xs"
  >
    {APP_NAME.slice(0, 1)}
  </span>
);

/** Nav entries shared by the docs layout and the docs search dialog. */
export const linkItems: LinkItemType[] = [
  {
    icon: <BookOpen />,
    text: 'Documentation',
    type: 'main',
    url: '/docs',
  },
  {
    icon: <MessageSquare />,
    text: 'Chat',
    type: 'main',
    url: '/chat',
  },
  {
    external: true,
    icon: <Github />,
    text: 'GitHub',
    type: 'icon',
    url: `https://github.com/${owner}/${repo}`,
  },
];

/** Options every fumadocs layout in the app starts from. */
export function baseOptions(): BaseLayoutProps {
  return {
    githubUrl: `https://github.com/${owner}/${repo}`,
    nav: {
      title: (
        <>
          {logo}
          <span className="font-medium">{DOCS_TITLE}</span>
        </>
      ),
      url: '/',
    },
  };
}
