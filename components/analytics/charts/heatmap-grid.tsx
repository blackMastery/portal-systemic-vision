'use client'

import { useId } from 'react'

interface HeatmapGridProps {
  /** Row labels, rendered down the left edge. */
  rows: string[]
  /** Column labels, rendered along the bottom. */
  columns: string[]
  /** values[rowIndex][columnIndex]; missing entries are treated as 0. */
  values: number[][]
  /** Base cell colour (hex). Intensity is applied as alpha. */
  color: string
  /** Tooltip value labels. */
  valueFormat?: (value: number) => string
  /** Thin bottom-axis labels to roughly this many. */
  maxColumnTicks?: number
}

/**
 * Dependency-free hour x weekday style matrix. Nivo's heatmap package isn't
 * installed, and a CSS grid keeps the cells crisp at any container width.
 */
export function HeatmapGrid({
  rows,
  columns,
  values,
  color,
  valueFormat,
  maxColumnTicks,
}: HeatmapGridProps) {
  const captionId = useId()
  const max = Math.max(0, ...values.flat())
  const format = valueFormat ?? ((v: number) => v.toLocaleString())

  const step = maxColumnTicks ? Math.max(1, Math.ceil(columns.length / maxColumnTicks)) : 1

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <table className="w-full border-separate border-spacing-[3px]" aria-describedby={captionId}>
          <caption id={captionId} className="sr-only">
            Values by {columns.length} columns across {rows.length} rows
          </caption>
          <tbody>
            {rows.map((rowLabel, rowIndex) => (
              <tr key={rowLabel}>
                <th
                  scope="row"
                  className="w-10 pr-2 text-right text-xs font-medium text-gray-500 align-middle"
                >
                  {rowLabel}
                </th>
                {columns.map((columnLabel, columnIndex) => {
                  const value = values[rowIndex]?.[columnIndex] ?? 0
                  // sqrt keeps low-but-nonzero cells visible against a few hot ones
                  const intensity = max > 0 ? Math.sqrt(value / max) : 0
                  return (
                    <td
                      key={columnLabel}
                      title={`${rowLabel} ${columnLabel}: ${format(value)}`}
                      className="h-7 rounded-[3px] border border-gray-100"
                      style={{
                        backgroundColor: value > 0 ? color : '#F9FAFB',
                        opacity: value > 0 ? 0.12 + intensity * 0.88 : 1,
                      }}
                    >
                      <span className="sr-only">
                        {rowLabel} {columnLabel}: {format(value)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <td />
              {columns.map((columnLabel, columnIndex) => (
                <td
                  key={columnLabel}
                  className="pt-1 text-center text-[10px] leading-none text-gray-500"
                >
                  {columnIndex % step === 0 ? columnLabel : ''}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-gray-500">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map(stop => (
            <span
              key={stop}
              className="h-3 w-5 rounded-[3px] border border-gray-100"
              style={{
                backgroundColor: stop === 0 ? '#F9FAFB' : color,
                opacity: stop === 0 ? 1 : 0.12 + stop * 0.88,
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}
