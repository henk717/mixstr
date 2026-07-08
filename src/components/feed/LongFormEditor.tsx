import { useEffect, useRef, useState } from 'react';
import { DefaultEditor } from 'react-simple-wysiwyg';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';
import { cn } from '@/lib/utils';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

interface LongFormEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function LongFormEditor({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: LongFormEditorProps) {
  const [html, setHtml] = useState('');
  const lastMarkdown = useRef(value);

  // Keep the editor in sync when the parent resets the markdown value.
  useEffect(() => {
    if (value === '' && lastMarkdown.current !== '') {
      setHtml('');
      lastMarkdown.current = '';
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLDivElement>) {
    const dirtyHtml = e.target.value;
    setHtml(dirtyHtml);

    const safeHtml =
      typeof window !== 'undefined'
        ? DOMPurify.sanitize(dirtyHtml, { USE_PROFILES: { html: true } })
        : dirtyHtml;

    const markdown = turndown.turndown(safeHtml);
    lastMarkdown.current = markdown;
    onChange(markdown);
  }

  return (
    <div className={cn('rsw-editor-custom', className)}>
      <DefaultEditor
        value={html}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        containerProps={{ 
          className: 'min-h-[280px] max-h-[60vh] overflow-y-auto break-words',
          style: { wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }
        }}
      />
    </div>
  );
}
