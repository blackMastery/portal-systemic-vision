'use client'

import { ResponsivePie } from '@nivo/pie'
import { CATEGORICAL_PALETTE, nivoTheme } from '../chart-theme'

interface PieChartProps {
  data: { id: string; value: number }[]
  colors?: string[]
  /** Tooltip / center-total value labels. */
  valueFormat?: (value: number) => string
  /** Overrides the default center label (formatted sum of values). */
  centerLabel?: string
  /** Small caption under the center label, e.g. "trips". */
  centerCaption?: string
  /** Tailwind height class for the chart container. */
  height?: string
}

export function PieChart({
  data,
  colors = CATEGORICAL_PALETTE,
  valueFormat,
  centerLabel,
  centerCaption,
  height = 'h-[300px]',
}: PieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const label = centerLabel ?? (valueFormat ? valueFormat(total) : total.toLocaleString())

  // Kept minimal on purpose: Nivo's custom-layer prop generics vary by version
  const CenteredMetric = ({ centerX, centerY }: { centerX: number; centerY: number }) => (
    <>
      <text
        x={centerX}
        y={centerY - (centerCaption ? 6 : 0)}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 20, fontWeight: 700, fill: '#111827' }}
      >
        {label}
      </text>
      {centerCaption && (
        <text
          x={centerX}
          y={centerY + 16}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: 12, fill: '#6B7280' }}
        >
          {centerCaption}
        </text>
      )}
    </>
  )

  return (
    <div className={height}>
      <ResponsivePie
        data={data}
        theme={nivoTheme}
        colors={colors}
        margin={{ top: 24, right: 80, bottom: 24, left: 80 }}
        innerRadius={0.6}
        padAngle={1}
        cornerRadius={4}
        activeOuterRadiusOffset={6}
        enableArcLabels={false}
        arcLinkLabelsSkipAngle={8}
        arcLinkLabelsThickness={1.5}
        arcLinkLabelsColor={{ from: 'color' }}
        arcLinkLabelsTextColor="#374151"
        valueFormat={value => (valueFormat ? valueFormat(Number(value)) : String(value))}
        layers={['arcs', 'arcLinkLabels', CenteredMetric]}
      />
    </div>
  )
}
