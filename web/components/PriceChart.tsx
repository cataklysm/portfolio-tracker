import type { SparklinePoint } from "@/lib/types"

interface PriceChartProps {
  data: SparklinePoint[]
  currency: string
  positive?: boolean
  locale: string
}

function formatDate(locale: string, s: string): string {
  return new Date(s).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
  })
}

function formatPrice(locale: string, value: number, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

const W = 700
const H = 220

export function PriceChart({ data, currency, positive, locale }: PriceChartProps) {
  if (data.length < 2) return null

  const prices = data.map((d) => parseFloat(d.price))
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const coords = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W
    const y = H - ((p - min) / range) * (H - 12) - 6
    return [x, y] as const
  })
  const points = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)

  const isUp =
    positive === undefined ? prices[prices.length - 1]! >= prices[0]! : positive
  const color = isUp ? "#34d399" : "#f87171"

  const areaPath =
    `M ${points[0]} L ${points.slice(1).join(" L ")}` + ` L ${W},${H} L 0,${H} Z`

  const [lastX, lastY] = coords[coords.length - 1]!

  const gridYs = [0.25, 0.5, 0.75].map((f) => 6 + (H - 12) * f)

  return (
    <div className="flex h-full min-h-[300px] flex-col">
      <div className="relative min-h-0 flex-1">
        <span className="absolute right-2 top-1 text-xs tabular-nums text-[var(--app-text-faint)]">
          {formatPrice(locale, max, currency)}
        </span>
        <span className="absolute bottom-1 right-2 text-xs tabular-nums text-[var(--app-text-faint)]">
          {formatPrice(locale, min, currency)}
        </span>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="h-full min-h-[280px] w-full"
        >
          <defs>
            <linearGradient id="price-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridYs.map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2={W}
              y2={y}
              stroke="var(--app-border)"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
          ))}

          <path d={areaPath} fill="url(#price-chart-fill)" />
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={lastX} cy={lastY} r="3.5" fill={color} />
        </svg>
      </div>

      <div className="mt-2 flex shrink-0 justify-between text-xs text-[var(--app-text-faint)]">
        <span>{formatDate(locale, data[0]!.time)}</span>
        <span>{formatDate(locale, data[Math.floor(data.length / 2)]!.time)}</span>
        <span>{formatDate(locale, data[data.length - 1]!.time)}</span>
      </div>
    </div>
  )
}
