import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Render Markdown (GFM: bảng, task list, gạch ngang, autolink) an toàn:
 * - react-markdown dựng React element, KHÔNG dùng dangerouslySetInnerHTML.
 * - Không bật rehype-raw -> HTML thô trong nội dung hiển thị như text, không được thực thi.
 * - `urlTransform` mặc định của react-markdown chặn URL nguy hiểm (javascript:, data:...).
 * Style bằng Tailwind thuần (không cần @tailwindcss/typography).
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- tách `node` (cây hast) ra để không lọt vào thuộc tính DOM */
const components: Components = {
  h1: ({ node: _node, className, ...props }) => (
    <h1 className={cn('mb-2 mt-4 text-xl font-bold text-gray-900 first:mt-0', className)} {...props} />
  ),
  h2: ({ node: _node, className, ...props }) => (
    <h2 className={cn('mb-2 mt-4 text-lg font-semibold text-gray-900 first:mt-0', className)} {...props} />
  ),
  h3: ({ node: _node, className, ...props }) => (
    <h3 className={cn('mb-1.5 mt-3 text-base font-semibold text-gray-900 first:mt-0', className)} {...props} />
  ),
  h4: ({ node: _node, className, ...props }) => (
    <h4 className={cn('mb-1 mt-3 text-sm font-semibold text-gray-900 first:mt-0', className)} {...props} />
  ),
  h5: ({ node: _node, className, ...props }) => (
    <h5 className={cn('mb-1 mt-3 text-sm font-semibold text-gray-700 first:mt-0', className)} {...props} />
  ),
  h6: ({ node: _node, className, ...props }) => (
    <h6 className={cn('mb-1 mt-3 text-xs font-semibold uppercase text-gray-600 first:mt-0', className)} {...props} />
  ),
  p: ({ node: _node, className, ...props }) => <p className={cn('my-2 first:mt-0 last:mb-0', className)} {...props} />,
  a: ({ node: _node, className, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('break-words text-blue-600 hover:text-blue-700 hover:underline', className)}
    />
  ),
  strong: ({ node: _node, className, ...props }) => (
    <strong className={cn('font-semibold text-gray-900', className)} {...props} />
  ),
  // remark-gfm gắn class "contains-task-list" cho list có checkbox -> bỏ bullet, thụt lề ít hơn
  ul: ({ node: _node, className, ...props }) => (
    <ul
      className={cn(
        'my-2 list-disc space-y-1 pl-6 first:mt-0 last:mb-0',
        className?.includes('contains-task-list') && 'list-none pl-1',
        className,
      )}
      {...props}
    />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol className={cn('my-2 list-decimal space-y-1 pl-6 first:mt-0 last:mb-0', className)} {...props} />
  ),
  li: ({ node: _node, className, ...props }) => (
    <li
      className={cn(
        '[&>ol]:my-1 [&>ul]:my-1',
        className?.includes('task-list-item') && 'flex items-start gap-2 [&>input]:mt-[0.3em]',
        className,
      )}
      {...props}
    />
  ),
  // Checkbox của task list: chỉ hiển thị (remark-gfm đặt disabled) — sửa bằng cách đổi [ ] / [x] trong mô tả
  input: ({ node: _node, className, ...props }) => (
    <input className={cn('size-3.5 shrink-0 accent-blue-600', className)} {...props} />
  ),
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote
      className={cn('my-2 border-l-4 border-gray-300 pl-3 italic text-gray-600 first:mt-0 last:mb-0', className)}
      {...props}
    />
  ),
  hr: ({ node: _node, className, ...props }) => <hr className={cn('my-4 border-gray-200', className)} {...props} />,
  // Inline code; code nằm trong <pre> được reset style ở `pre` bên dưới
  code: ({ node: _node, className, ...props }) => (
    <code
      className={cn('rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-pink-700', className)}
      {...props}
    />
  ),
  pre: ({ node: _node, className, ...props }) => (
    <pre
      className={cn(
        'my-2 overflow-x-auto rounded-md bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100 first:mt-0 last:mb-0',
        '[&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit',
        className,
      )}
      {...props}
    />
  ),
  table: ({ node: _node, className, ...props }) => (
    <div className="my-2 overflow-x-auto first:mt-0 last:mb-0">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  ),
  thead: ({ node: _node, className, ...props }) => <thead className={cn('bg-gray-50', className)} {...props} />,
  th: ({ node: _node, className, ...props }) => (
    <th className={cn('border border-gray-200 px-2 py-1 font-semibold text-gray-900', className)} {...props} />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td className={cn('border border-gray-200 px-2 py-1 align-top', className)} {...props} />
  ),
  img: ({ node: _node, className, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài do user nhập, không qua next/image
    <img alt={alt ?? ''} loading="lazy" className={cn('my-2 max-h-96 max-w-full rounded', className)} {...props} />
  ),
};
/* eslint-enable @typescript-eslint/no-unused-vars */

const remarkPlugins = [remarkGfm];

export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn('break-words text-sm leading-relaxed text-gray-800', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
