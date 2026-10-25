'use client'
import { localPoint } from '@visx/event'
import { sankey, sankeyCenter, sankeyLinkHorizontal } from '@visx/sankey'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lab/utils'
import { ParentSize } from '../chart-parent-size'
import { SankeyProvider } from './sankey-context'

const DEFAULT_MARGIN = { top: 40, right: 180, bottom: 40, left: 180 }

function SankeyChartInner(props) {
  const { width, height } = props

  if (width < 10 || height < 10) {
    return null
  }

  return <SankeyChartCore {...props} />
}

const SankeyChartCore = memo(function SankeyChartCore({
  data,
  width,
  height,
  margin,
  animationDuration,
  enterTransition,
  revealSignature = '',
  nodeWidth,
  nodePadding,
  children,
  hoveredNodeIndexProp,
  onNodeHoverChange,
}) {
  const containerRef = useRef(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [revealEpoch, setRevealEpoch] = useState(1)
  const [internalHoveredNodeIndex, setInternalHoveredNodeIndex] = useState(null)
  const isNodeHoverControlled = hoveredNodeIndexProp !== undefined
  const hoveredNodeIndex = isNodeHoverControlled ? hoveredNodeIndexProp : internalHoveredNodeIndex
  const setHoveredNodeIndex = useCallback(
    (index) => {
      if (isNodeHoverControlled) {
        onNodeHoverChange?.(index)
      } else {
        setInternalHoveredNodeIndex(index)
      }
    },
    [isNodeHoverControlled, onNodeHoverChange],
  )
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState(null)
  const [tooltipData, setTooltipData] = useState(null)
  const [mousePos, setMousePos] = useState(null)

  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  // Replay the reveal when motion settings change. Adjusted during render
  // ("store previous props in state") instead of setState in an effect, so a
  // replay costs one render rather than a commit plus a cascading re-render.
  const [revealKey, setRevealKey] = useState({
    animationDuration,
    revealSignature,
  })
  if (revealKey.animationDuration !== animationDuration || revealKey.revealSignature !== revealSignature) {
    setRevealKey({ animationDuration, revealSignature })
    setRevealEpoch((n) => n + 1)
    setIsLoaded(false)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: revealSignature
  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsLoaded(true)
    }, animationDuration)
    return () => clearTimeout(timeout)
  }, [animationDuration, revealSignature])

  const sankeyGenerator = useMemo(() => {
    return sankey()
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .nodeAlign(sankeyCenter)
      .extent([
        [0, 0],
        [innerWidth, innerHeight],
      ])
  }, [innerWidth, innerHeight, nodeWidth, nodePadding])

  const graph = useMemo(() => {
    const clonedData = {
      nodes: data.nodes.map((node) => ({ ...node })),
      links: data.links.map((link) => ({ ...link })),
    }
    return sankeyGenerator(clonedData)
  }, [data, sankeyGenerator])

  const createPath = useCallback((link) => {
    try {
      const pathGenerator = sankeyLinkHorizontal()
      return pathGenerator(link) || ''
    } catch {
      return ''
    }
  }, [])

  const handleMouseMove = useCallback((event) => {
    const point = localPoint(event)
    if (point) {
      setMousePos({ x: point.x, y: point.y })
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredNodeIndex(null)
    setHoveredLinkIndex(null)
    setTooltipData(null)
    setMousePos(null)
  }, [setHoveredNodeIndex])

  const contextValue = {
    graph,
    nodes: graph.nodes,
    links: graph.links,
    width,
    height,
    innerWidth,
    innerHeight,
    margin,
    hoveredNodeIndex,
    hoveredLinkIndex,
    setHoveredNodeIndex,
    setHoveredLinkIndex,
    tooltipData,
    setTooltipData,
    containerRef,
    isLoaded,
    animationDuration,
    enterTransition,
    revealEpoch,
    mousePos,
    createPath,
  }

  return (
    <SankeyProvider value={contextValue}>
      <div className="relative h-full w-full" ref={containerRef}>
        <svg aria-hidden="true" className="overflow-visible" height={height} onMouseLeave={handleMouseLeave} onMouseMove={handleMouseMove} width={width}>
          <g transform={`translate(${margin.left},${margin.top})`}>{children}</g>
        </svg>
      </div>
    </SankeyProvider>
  )
})

export function SankeyChart({
  data,
  margin: marginProp,
  animationDuration = 1100,
  enterTransition,
  revealSignature,
  aspectRatio = '2 / 1',
  nodeWidth = 16,
  nodePadding = 24,
  className = '',
  children,
  hoveredNodeIndex,
  onNodeHoverChange,
}) {
  const margin = { ...DEFAULT_MARGIN, ...marginProp }

  return (
    <div className={cn('relative w-full', className)} style={{ aspectRatio }}>
      <ParentSize>
        {({ width, height }) => (
          <SankeyChartInner
            animationDuration={animationDuration}
            data={data}
            enterTransition={enterTransition}
            height={height}
            hoveredNodeIndexProp={hoveredNodeIndex}
            margin={margin}
            nodePadding={nodePadding}
            nodeWidth={nodeWidth}
            onNodeHoverChange={onNodeHoverChange}
            revealSignature={revealSignature}
            width={width}
          >
            {children}
          </SankeyChartInner>
        )}
      </ParentSize>
    </div>
  )
}

SankeyChart.displayName = 'SankeyChart'

export default SankeyChart
