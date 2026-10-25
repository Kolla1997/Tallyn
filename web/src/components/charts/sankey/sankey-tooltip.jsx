'use client'
import { intFmt } from '../chart-formatters'
import { TooltipBox } from '../tooltip/tooltip-box'
import { TooltipContent } from '../tooltip/tooltip-content'
import { useSankey } from './sankey-context'

function getNodeName(nodeOrIndex, fallbackIndex) {
  if (typeof nodeOrIndex === 'number') {
    return `Node ${nodeOrIndex}`
  }
  return nodeOrIndex.name ?? `Node ${fallbackIndex}`
}

export function SankeyTooltip({ nodeContent, linkContent, formatValue = intFmt, className = '', panelStyle, exit = true }) {
  const { tooltipData, containerRef, width, height, margin, nodes, links, mousePos } = useSankey()

  let x = 0
  let y = 0
  if (tooltipData) {
    // Use mouse position if available, otherwise fallback to anchor point
    x = mousePos ? mousePos.x : tooltipData.x + margin.left
    y = mousePos ? mousePos.y : tooltipData.y + margin.top
  }

  let body = null

  const node = tooltipData?.type === 'node' && tooltipData.nodeIndex !== undefined ? nodes[tooltipData.nodeIndex] : undefined
  const link = tooltipData?.type === 'link' && tooltipData.linkIndex !== undefined ? links[tooltipData.linkIndex] : undefined

  if (node && tooltipData?.nodeIndex !== undefined) {
    body = nodeContent ? (
      nodeContent({ node, index: tooltipData.nodeIndex })
    ) : (
      <TooltipContent
        rows={[
          {
            color: 'var(--chart-line-primary)',
            label: 'Sessions',
            value: formatValue(node.value ?? 0),
          },
        ]}
        title={node.name}
      />
    )
  } else if (link && tooltipData?.linkIndex !== undefined) {
    const index = tooltipData.linkIndex
    if (linkContent) {
      body = linkContent({ link, index })
    } else {
      const sourceName = getNodeName(link.source, index)
      const targetName = getNodeName(link.target, index)
      const rows = [
        {
          color: 'var(--chart-foreground-muted)',
          label: 'Flow',
          value: formatValue(link.value),
        },
      ]
      body = <TooltipContent rows={rows} title={`${sourceName} → ${targetName}`} />
    }
  }

  // Always mounted so the panel can fade out; `visible` drives presence.
  return (
    <TooltipBox
      className={className}
      containerHeight={height}
      containerRef={containerRef}
      containerWidth={width}
      exit={exit}
      panelStyle={panelStyle}
      visible={body !== null}
      x={x}
      y={y}
    >
      {body}
    </TooltipBox>
  )
}

SankeyTooltip.displayName = 'SankeyTooltip'

export default SankeyTooltip
