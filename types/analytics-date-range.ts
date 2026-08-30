export interface AnalyticsDateRange {
  /** Inclusive lower bound; null means no lower bound ("all time"). */
  start: Date | null
  /** Inclusive upper bound. */
  end: Date
}
