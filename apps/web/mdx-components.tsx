import { Accordion, Accordions } from 'fumadocs-ui/components/accordion'
import { Banner } from 'fumadocs-ui/components/banner'
import { Callout } from 'fumadocs-ui/components/callout'
import * as FilesComponents from 'fumadocs-ui/components/files'
import * as TabsComponents from 'fumadocs-ui/components/tabs'
import { TypeTable } from 'fumadocs-ui/components/type-table'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import * as icons from 'lucide-react'
import type { MDXComponents } from 'mdx/types'
import type { ComponentProps, FC } from 'react'
import { APIPage } from '@/components/docs/api-page'
import { Update, Updates } from '@/components/fumadocs/updates'

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...(icons as unknown as MDXComponents),
    ...defaultMdxComponents,
    ...TabsComponents,
    ...FilesComponents,
    Accordion,
    Accordions,
    Updates,
    Update,
    TypeTable,
    Callout,
    blockquote: Callout as unknown as FC<ComponentProps<'blockquote'>>,
    APIPage,
    Banner,
    ...components,
  } satisfies MDXComponents
}

// @types/mdx already resolves its JSX namespace to React, so no augmentation
// is needed here — declaring one duplicates those identifiers.

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
