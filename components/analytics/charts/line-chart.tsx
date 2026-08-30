'use client'

import { ResponsiveLine } from '@nivo/line'
import { linearGradientDef } from '@nivo/core'
import { CATEGORICAL_PALETTE, nivoTheme } from '../chart-theme'

export interface LineSeries {
  id: string
  color?: string
  data: { x: string; y: number }[]
}

interface LineChartProps {
  series: LineSeries[]
  colors?: string[]
  /** Tooltip value labels. */
  valueFormat?: (value: number) => string
  /** Left-axis tick labels. */
  axisFormat?: (value: number) => string
  showLegend?: boolean
  stacked?: boolean
  /** Tailwind height class for the chart container. */
  height?: string
}

/** Map chart rows ({ date, a, b, ... }) into Nivo line series. */
export function toLineSeries<T extends Record<string, unknown>>(
  rows: T[],
  defs: { id: string; key: keyof T; color?: string }[],
  xKey: keyof T = 'date' as keyof T
): LineSeries[] {
  return defs.map(def => ({
    id: def.id,
    color: def.color,
    data: rows.map(row => ({ x: String(row[xKey]), y: Number(row[def.key]) || 0 })),
  }))
}

export function LineChart({
  series,
  colors,
  valueFormat,
  axisFormat,
  showLegend = series.length > 1,
  stacked = false,
  height = 'h-[300px]',
}: LineChartProps) {
  const resolvedColors =
    colors ?? series.map((s, i) => s.color ?? CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length])

  // A point scale renders a tick per x value; thin long date ranges to ~8 labels
  const xValues = series[0]?.data.map(d => d.x) ?? []
  const step = Math.max(1, Math.ceil(xValues.length / 8))
  const tickValues = xValues.filter((_, i) => i % step === 0)

  return (
    <div className={height}>
      <ResponsiveLine
        data={series}
        theme={nivoTheme}
        colors={resolvedColors}
        margin={{ top: 12, right: 16, bottom: showLegend ? 56 : 36, left: axisFormat ? 56 : 44 }}
        xScale={{ type: 'point' }}
        yScale={{ type: 'linear', min: 0, max: 'auto', stacked }}
        curve="monotoneX"
        lineWidth={2.5}
        enablePoints={false}
        enableArea
        areaOpacity={stacked ? 0.25 : 0.12}
        defs={[
          linearGradientDef('areaFade', [
            { offset: 0, color: 'inherit', opacity: 0.35 },
            { offset: 100, color: 'inherit', opacity: 0 },
          ]),
        ]}
        fill={[{ match: '*', id: 'areaFade' }]}
        enableSlices="x"
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 8, tickValues }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: axisFormat }}
        yFormat={value => (valueFormat ? valueFormat(Number(value)) : String(value))}
        legends={
          showLegend
            ? [
                {
                  anchor: 'bottom',
                  direction: 'row',
                  translateY: 52,
                  itemWidth: 110,
                  itemHeight: 16,
                  itemsSpacing: 8,
                  symbolSize: 8,
                  symbolShape: 'circle',
                },
              ]
            : []
        }
      />
    </div>
  )
}
