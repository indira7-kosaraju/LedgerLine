import { cn } from '../../utils/cn'

// Generic table.
//   columns: [{ key, header, render?(row), align?: 'right', className? }]
//   rows:    array of objects (rowKey picks the unique id field)
// Wide tables scroll sideways inside their card on small screens.
export default function DataTable({ columns, rows = [], rowKey = 'id', loading = false, empty = 'Nothing to show yet.', caption }) {
  return (
    <div className={cn('overflow-x-auto', loading && rows.length > 0 && 'opacity-60')} aria-busy={loading || undefined}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500',
                  c.align === 'right' && 'text-right',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                {loading ? 'Loading…' : empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row[rowKey]} className="hover:bg-slate-50/70">
                {columns.map((c) => (
                  <td key={c.key} className={cn('whitespace-nowrap px-4 py-3 text-slate-700', c.align === 'right' && 'text-right', c.className)}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
