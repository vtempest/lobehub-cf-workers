'use client';

import { Check, ChevronDown, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CHAT_MODELS } from '@/lib/ai/models';
import { cn } from '@/lib/utils';

interface ModelPickerProps {
  value: string;
  onChange: (model: string) => void;
}

export function ModelPicker({ onChange, value }: ModelPickerProps) {
  const selected = CHAT_MODELS.find((model) => model.id === value) ?? CHAT_MODELS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1.5" size="sm" variant="ghost">
          <Sparkles className="h-3.5 w-3.5" />
          {selected.displayName}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        {CHAT_MODELS.map((model) => (
          <DropdownMenuItem
            className="flex flex-col items-start gap-0.5 py-2"
            key={model.id}
            onSelect={() => onChange(model.id)}
          >
            <span className="flex w-full items-center gap-2 text-sm font-medium">
              {model.displayName}
              <Check
                className={cn('ml-auto h-4 w-4', model.id === selected.id ? 'opacity-100' : 'opacity-0')}
              />
            </span>
            <span className="text-xs text-muted-foreground">{model.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
