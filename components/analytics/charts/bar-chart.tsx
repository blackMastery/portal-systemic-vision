'use client'

import { ResponsiveBar } from '@nivo/bar'
import { CHART_COLORS, nivoTheme } from '../chart-theme'

interface BarChartProps {
  data: { label: string; value: number }[]
  color?: string
  /** Tooltip value labels. */
  valueFormat?: (value: number) => string
  /** Left-axis tick labels. */
  axisFormat?: (value: number) => string
  /** Thin bottom-axis labels to roughly this many (band scales label every bar). */
  maxXTicks?: number
  /** Tailwind height class for the chart container. */
  height?: string
}

export function BarChart({
  data,
  color = CHART_COLORS.info,
  valueFormat,
  axisFormat,
  maxXTicks,
  height = 'h-[300px]',
}: BarChartProps) {
  const step = maxXTicks ? Math.max(1, Math.ceil(data.length / maxXTicks)) : 1
  const visibleLabels = new Set(data.filter((_, i) => i % step === 0).map(d => d.label))

  return (
    <div className={height}>
      <ResponsiveBar
        data={data}
        keys={['value']}
        indexBy="label"
        theme={nivoTheme}
        colors={[color]}
        margin={{ top: 12, right: 16, bottom: 36, left: axisFormat ? 56 : 44 }}
        padding={0.35}
        borderRadius={4}
        enableLabel={false}
        valueFormat={value => (valueFormat ? valueFormat(Number(value)) : String(value))}
        axisBottom={{
          tickSize: 0,
          tickPadding: 8,
          format: label => (visibleLabels.has(String(label)) ? String(label) : ''),
        }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: axisFormat }}
      />
    </div>
  )
}
