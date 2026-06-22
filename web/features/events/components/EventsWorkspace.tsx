"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { de, enUS } from "date-fns/locale"
import { StandaloneMonthView } from "@mui/x-scheduler/month-view"
import { eventCalendarClasses } from "@mui/x-scheduler/event-calendar"
import type { SchedulerEvent, SchedulerEventColor } from "@mui/x-scheduler/models"
import {
  Box,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  IconButton,
  Pagination,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material"
import { ControlBar } from "@/application/shell/ControlBar"
import { PageMetricGrid, PageShell } from "@/application/shell/PageShell"
import { useToast } from "@/application/toast/ToastProvider"
import { fmtCurrency, num } from "@/lib/format"
import type { PortfolioCorporateAction, PortfolioEarnings } from "@/lib/portfolio-events"

const EVENT_VIEW_STORAGE_KEY = "portfolio.events.view"
const WORKBENCH_HEIGHT = 900
const UPCOMING_WEEK_PAGE_SIZE = 6
const tableChromeBg = "color-mix(in srgb, var(--app-surface-raised) 94%, transparent)"

type EventFilter = "all" | "earnings" | "dividends" | "splits"
type EventView = "timeline" | "calendar"
type EventKind = "earnings" | "dividend" | "split"

type ContextSelection =
  | { type: "day"; dateKey: string }
  | { type: "week"; weekStartKey: string }
  | { type: "event"; eventId: string }

interface EventsWorkspaceProps {
  earnings: PortfolioEarnings[]
  corporateActions: PortfolioCorporateAction[]
  locale: string
}

interface WorkbenchEvent {
  id: string
  kind: EventKind
  filter: Exclude<EventFilter, "all">
  dateKey: string
  companyName: string
  shortCompanyName: string
  symbol: string
  provider: string
  positionId: string
  amountLabel: string
  statusLabel: string
  detailLabel: string
  epsEstimate: string
  epsActual: string
}

interface WeekGroup {
  key: string
  label: string
  rangeLabel: string
  startKey: string
  endKey: string
  events: WorkbenchEvent[]
}

interface SchedulerWorkbenchEvent extends SchedulerEvent {
  workbenchEventId: string
}

type CalendarClickAction =
  | { type: "day"; dateKey: string }
  | { type: "event"; eventId: string }

const eventFilterTabs = [
  { value: "all", label: "All" },
  { value: "earnings", label: "Earnings" },
  { value: "dividends", label: "Dividends" },
  { value: "splits", label: "Splits" },
] as const

export function EventsWorkspace({ earnings, corporateActions, locale }: EventsWorkspaceProps) {
  const router = useRouter()
  const { success } = useToast()
  const [isRefreshing, startRefreshTransition] = useTransition()
  const [filter, setFilter] = useState<EventFilter>("all")
  const [query, setQuery] = useState("")
  const [view, setView] = useState<EventView>("timeline")
  const [restoredViewPreference, setRestoredViewPreference] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [selection, setSelection] = useState<ContextSelection>(() => ({
    type: "week",
    weekStartKey: dateKey(startOfWeekMonday(new Date())),
  }))
  const [upcomingWeekPage, setUpcomingWeekPage] = useState(1)
  const today = useMemo(() => startOfDay(new Date()), [])
  const todayKey = dateKey(today)
  const searchTerm = query.trim().toLowerCase()

  const allEvents = useMemo(() => normalizeEvents(earnings, corporateActions, locale), [corporateActions, earnings, locale])
  const filteredEvents = useMemo(() => allEvents
    .filter((event) => filter === "all" || event.filter === filter)
    .filter((event) => matchesEvent(event, searchTerm))
    .sort(compareEventsAscending), [allEvents, filter, searchTerm])
  const currentWeekStart = useMemo(() => startOfWeekMonday(today), [today])
  const currentWeekStartKey = dateKey(currentWeekStart)
  const timelineEvents = useMemo(() => filteredEvents.filter((event) => event.dateKey >= currentWeekStartKey), [currentWeekStartKey, filteredEvents])
  const timelineWeeks = useMemo(() => groupEventsByWeek(timelineEvents, locale), [locale, timelineEvents])
  const eventById = useMemo(() => new Map(filteredEvents.map((event) => [event.id, event])), [filteredEvents])
  const selectedEvent = selection.type === "event" ? eventById.get(selection.eventId) ?? null : null
  const nextEarnings = useMemo(() => allEvents.find((event) => event.kind === "earnings" && event.dateKey >= todayKey) ?? null, [allEvents, todayKey])
  const tabCounts = useMemo(() => ({
    all: allEvents.length,
    dividends: allEvents.filter((event) => event.filter === "dividends").length,
    earnings: allEvents.filter((event) => event.filter === "earnings").length,
    splits: allEvents.filter((event) => event.filter === "splits").length,
  }), [allEvents])
  const legendCounts = tabCounts
  const upcomingWeekStart = useMemo(() => addDays(currentWeekStart, (upcomingWeekPage - 1) * 7), [currentWeekStart, upcomingWeekPage])
  const upcomingWeekEnd = useMemo(() => addDays(upcomingWeekStart, 6), [upcomingWeekStart])
  const upcomingWeekEvents = useMemo(() => filteredEvents
    .filter((event) => event.dateKey >= dateKey(upcomingWeekStart) && event.dateKey <= dateKey(upcomingWeekEnd))
    .sort(compareEventsAscending), [filteredEvents, upcomingWeekEnd, upcomingWeekStart])
  const upcomingWeekPageCount = useMemo(() => countFutureWeeksWithEvents(filteredEvents, currentWeekStart), [currentWeekStart, filteredEvents])

  useEffect(() => {
    const storedView = readStoredEventView()
    setRestoredViewPreference(true)
    if (storedView !== "calendar") return

    setView("calendar")
    setCalendarMonth(startOfMonth(today))
    setSelection({ type: "day", dateKey: todayKey })
  }, [today, todayKey])

  useEffect(() => {
    if (!restoredViewPreference) return
    window.localStorage.setItem(EVENT_VIEW_STORAGE_KEY, view)
  }, [restoredViewPreference, view])

  useEffect(() => {
    if (upcomingWeekPage > upcomingWeekPageCount) {
      setUpcomingWeekPage(upcomingWeekPageCount)
    }
  }, [upcomingWeekPage, upcomingWeekPageCount])

  useEffect(() => {
    if (view === "timeline" && selection.type === "day") {
      setSelection({ type: "week", weekStartKey: dateKey(startOfWeekMonday(today)) })
    }
    if (view === "calendar" && selection.type === "week") {
      setSelection({ type: "day", dateKey: todayKey })
    }
  }, [selection.type, today, todayKey, view])

  function clearFilters() {
    setFilter("all")
    setQuery("")
  }

  function refreshEvents() {
    if (isRefreshing) return
    startRefreshTransition(() => {
      router.refresh()
      success("Events reloaded.")
    })
  }

  function changeView(nextView: EventView) {
    setView(nextView)
    if (nextView === "calendar") {
      setCalendarMonth(startOfMonth(today))
      setSelection({ type: "day", dateKey: todayKey })
      return
    }
    setSelection({ type: "week", weekStartKey: dateKey(startOfWeekMonday(today)) })
  }

  return (
    <PageShell kind="reporting">
      <Breadcrumbs aria-label="breadcrumb">
        <Typography sx={{ color: "var(--app-text-faint)", fontSize: 12, fontWeight: 600 }}>
          Portfolio
        </Typography>
        <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700 }}>
          Events
        </Typography>
      </Breadcrumbs>

      <PageMetricGrid columns={{ xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }}>
        <MetricCard icon="calendar" label="Upcoming earnings" value={tabCounts.earnings} sub={nextEarnings ? `${nextEarnings.symbol} on ${formatDate(nextEarnings.dateKey, locale)}` : "No confirmed dates"} tone="primary" />
        <MetricCard icon="report" label="Recent earnings" value={earnings.filter((item) => !item.is_upcoming).length} sub="Latest reported earnings" tone="success" />
        <MetricCard icon="action" label="Corporate actions" value={tabCounts.dividends + tabCounts.splits} sub="Dividends, splits, and related events" tone="warning" />
      </PageMetricGrid>

      <ControlBar
        defaultTabValue="all"
        onClearFilters={clearFilters}
        onReload={refreshEvents}
        onSearchChange={setQuery}
        onTabChange={setFilter}
        reloadLabel="Reload events"
        reloadLoading={isRefreshing}
        searchPlaceholder="Search by name, ticker or provider"
        searchValue={query}
        tabs={eventFilterTabs.map((tab) => ({
          ...tab,
          count: tab.value === "all" ? undefined : tabCounts[tab.value],
        }))}
        tabValue={filter}
      />

      {filteredEvents.length === 0 ? (
        <CentralEmptyState onClear={clearFilters} />
      ) : (
        <Box sx={{ alignItems: "stretch", display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) 480px" } }}>
          <MainEventsCard
            view={view}
            calendarMonth={calendarMonth}
            onChangeMonth={setCalendarMonth}
            onChangeView={changeView}
            onSelectEvent={(eventId) => setSelection({ type: "event", eventId })}
            onSelectDay={(selectedDateKey) => setSelection({ type: "day", dateKey: selectedDateKey })}
            onSelectWeek={(weekStartKey) => setSelection({ type: "week", weekStartKey })}
            events={filteredEvents}
            timelineWeeks={timelineWeeks}
            selectedDateKey={selection.type === "day" ? selection.dateKey : null}
            selectedEventId={selectedEvent?.id ?? null}
            selectedWeekStartKey={selection.type === "week" ? selection.weekStartKey : null}
            locale={locale}
            today={today}
          />
          <EventsContextRail
            events={filteredEvents}
            legendCounts={legendCounts}
            locale={locale}
            selection={selection}
            selectedEvent={selectedEvent}
            today={today}
            upcomingPage={upcomingWeekPage}
            upcomingPageCount={upcomingWeekPageCount}
            upcomingWeekEnd={upcomingWeekEnd}
            upcomingWeekEvents={upcomingWeekEvents}
            upcomingWeekStart={upcomingWeekStart}
            onChangeUpcomingPage={setUpcomingWeekPage}
            onSelectEvent={(eventId) => setSelection({ type: "event", eventId })}
          />
        </Box>
      )}
    </PageShell>
  )
}

function MainEventsCard({
  calendarMonth,
  events,
  locale,
  onChangeMonth,
  onChangeView,
  onSelectDay,
  onSelectEvent,
  onSelectWeek,
  selectedDateKey,
  selectedEventId,
  selectedWeekStartKey,
  timelineWeeks,
  today,
  view,
}: {
  calendarMonth: Date
  events: WorkbenchEvent[]
  locale: string
  onChangeMonth: (month: Date) => void
  onChangeView: (view: EventView) => void
  onSelectDay: (dateKey: string) => void
  onSelectEvent: (eventId: string) => void
  onSelectWeek: (weekStartKey: string) => void
  selectedDateKey: string | null
  selectedEventId: string | null
  selectedWeekStartKey: string | null
  timelineWeeks: WeekGroup[]
  today: Date
  view: EventView
}) {
  return (
    <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", display: "flex", flexDirection: "column", height: WORKBENCH_HEIGHT, overflow: "hidden" }}>
      <Stack direction="row" sx={{ alignItems: "center", bgcolor: tableChromeBg, borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
        {view === "calendar" ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography component="h2" sx={{ color: "var(--app-text)", fontSize: 18, fontWeight: 800 }}>{monthLabel(calendarMonth, locale)}</Typography>
            <IconButton size="small" aria-label="Previous month" onClick={() => onChangeMonth(addMonths(calendarMonth, -1))} sx={iconButtonSx}>
              <ChevronLeftIcon />
            </IconButton>
            <IconButton size="small" aria-label="Next month" onClick={() => onChangeMonth(addMonths(calendarMonth, 1))} sx={iconButtonSx}>
              <ChevronRightIcon />
            </IconButton>
            <Button size="small" variant="outlined" onClick={() => onChangeMonth(startOfMonth(today))} sx={{ textTransform: "none" }}>Today</Button>
          </Stack>
        ) : (
          <Typography component="h2" sx={{ color: "var(--app-text)", fontSize: 16, fontWeight: 800 }}>Event timeline</Typography>
        )}
        <ViewToggle value={view} onChange={onChangeView} />
      </Stack>

      {view === "calendar" ? (
        <CalendarView
          calendarMonth={calendarMonth}
          events={events}
          locale={locale}
          onSelectDay={onSelectDay}
          onSelectEvent={onSelectEvent}
          selectedDateKey={selectedDateKey}
          selectedEventId={selectedEventId}
          today={today}
        />
      ) : (
        <TimelineView
          locale={locale}
          onSelectEvent={onSelectEvent}
          onSelectWeek={onSelectWeek}
          selectedEventId={selectedEventId}
          selectedWeekStartKey={selectedWeekStartKey}
          weeks={timelineWeeks}
        />
      )}
    </Card>
  )
}

function ViewToggle({ value, onChange }: { value: EventView; onChange: (view: EventView) => void }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_, nextValue: EventView | null) => { if (nextValue) onChange(nextValue) }}
      sx={{
        border: "1px solid var(--app-border)",
        borderRadius: 1,
        overflow: "hidden",
        "& .MuiToggleButton-root": {
          border: 0,
          borderLeft: "1px solid var(--app-border)",
          color: "var(--app-text-muted)",
          fontSize: 12,
          fontWeight: 700,
          height: 32,
          minWidth: 86,
          px: 1.5,
          textTransform: "none",
          "&:first-of-type": { borderLeft: 0 },
          "&.Mui-selected": { bgcolor: "var(--app-primary)", color: "white" },
        },
      }}
    >
      <ToggleButton value="timeline">Timeline</ToggleButton>
      <ToggleButton value="calendar">Calendar</ToggleButton>
    </ToggleButtonGroup>
  )
}

function CalendarView({
  calendarMonth,
  events,
  locale,
  onSelectDay,
  onSelectEvent,
  selectedDateKey,
  selectedEventId,
  today,
}: {
  calendarMonth: Date
  events: WorkbenchEvent[]
  locale: string
  onSelectDay: (dateKey: string) => void
  onSelectEvent: (eventId: string) => void
  selectedDateKey: string | null
  selectedEventId: string | null
  today: Date
}) {
  const visibleDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth])
  const schedulerEvents = useMemo(() => {
    const groupedEvents = groupEventsByDate(events)
    const nextEvents: SchedulerWorkbenchEvent[] = []

    for (const [dayKey, dayEvents] of groupedEvents.entries()) {
      for (const event of dayEvents.slice(0, 3)) {
        const eventClassName = schedulerEventClassName(nextEvents.length)
        nextEvents.push({
          id: event.id,
          workbenchEventId: event.id,
          title: `${event.shortCompanyName} ${event.detailLabel}`,
          description: event.amountLabel,
          start: `${event.dateKey}T00:00:00`,
          end: `${event.dateKey}T23:59:59`,
          allDay: true,
          readOnly: true,
          color: schedulerEventColor(event.kind),
          className: [eventClassName, event.id === selectedEventId ? "portfolio-calendar-event-selected" : ""].filter(Boolean).join(" "),
        })
      }

      if (dayEvents.length > 3) {
        const eventClassName = schedulerEventClassName(nextEvents.length)
        nextEvents.push({
          id: `more-${dayKey}`,
          workbenchEventId: dayKey,
          title: `+${dayEvents.length - 3} more`,
          start: `${dayKey}T00:00:00`,
          end: `${dayKey}T23:59:59`,
          allDay: true,
          readOnly: true,
          color: "grey",
          className: `${eventClassName} portfolio-calendar-more-event`,
        })
      }
    }

    return nextEvents
  }, [events, selectedEventId])
  const actionByClassName = useMemo(() => new Map<string, CalendarClickAction>(schedulerEvents.map((event, index) => {
    const className = schedulerEventClassName(index)
    if (String(event.id).startsWith("more-")) return [className, { type: "day", dateKey: event.workbenchEventId }]
    return [className, { type: "event", eventId: event.workbenchEventId }]
  })), [schedulerEvents])

  function handleCalendarClick(mouseEvent: React.MouseEvent<HTMLDivElement>) {
    const target = mouseEvent.target instanceof Element ? mouseEvent.target : null
    if (!target) return

    for (const [className, action] of actionByClassName.entries()) {
      if (target.closest(`.${className}`)) {
        mouseEvent.preventDefault()
        mouseEvent.stopPropagation()
        if (action.type === "day") onSelectDay(action.dateKey)
        else onSelectEvent(action.eventId)
        return
      }
    }

    const cell = target.closest(`.${eventCalendarClasses.monthViewCell}`)
    if (!cell) return
    const monthBody = cell.closest(`.${eventCalendarClasses.monthViewBody}`)
    const cells = Array.from(monthBody?.querySelectorAll(`.${eventCalendarClasses.monthViewCell}`) ?? [])
    const index = cells.indexOf(cell)
    const selectedDay = visibleDays[index]
    if (selectedDay) onSelectDay(dateKey(selectedDay))
  }

  return (
    <Box
      onClickCapture={handleCalendarClick}
      sx={{
        flex: 1,
        minHeight: 0,
        p: 0,
        "--EventCalendar-fontSize-eventTitle": "0.68rem",
        [`& .${eventCalendarClasses.monthView}`]: {
          bgcolor: "transparent",
          border: 0,
          borderRadius: 0,
          color: "var(--app-text)",
          height: "100%",
          overflow: "hidden",
        },
        [`& .${eventCalendarClasses.monthViewHeader}`]: {
          bgcolor: tableChromeBg,
          borderColor: "var(--app-border)",
        },
        [`& .${eventCalendarClasses.monthViewHeaderCell}`]: {
          borderColor: "var(--app-border)",
          color: "var(--app-text-muted)",
          fontSize: 12,
          fontWeight: 800,
          py: 0.8,
        },
        [`& .${eventCalendarClasses.monthViewBody}`]: {
          minHeight: 0,
        },
        [`& .${eventCalendarClasses.monthViewRow}`]: {
          borderColor: "var(--app-border)",
        },
        [`& .${eventCalendarClasses.monthViewCell}`]: {
          bgcolor: "transparent",
          borderColor: "var(--app-border)",
          color: "var(--app-text)",
          cursor: "pointer",
          minHeight: 0,
          p: 0.75,
          "&:hover": {
            bgcolor: "var(--app-surface-hover)",
          },
          "&[data-current]": {
            bgcolor: "color-mix(in srgb, var(--app-primary) 8%, transparent)",
          },
          "&[data-weekend]": {
            bgcolor: "color-mix(in srgb, var(--app-surface-raised) 60%, transparent)",
          },
          "&[data-other-month]": {
            color: "var(--app-text-faint)",
            opacity: 0.72,
          },
        },
        [`& .${eventCalendarClasses.monthViewCellNumber}`]: {
          color: "inherit",
          fontSize: 12,
          fontWeight: 800,
        },
        [`& .${eventCalendarClasses.monthViewCellEvents}`]: {
          gap: 0.5,
        },
        [`& .${eventCalendarClasses.dayGridEvent}`]: {
          borderRadius: 1,
          boxShadow: "none",
          minHeight: 20,
        },
        [`& .${eventCalendarClasses.dayGridEvent}[data-palette="teal"]`]: {
          bgcolor: "color-mix(in srgb, var(--app-positive) 26%, transparent)",
          border: "1px solid color-mix(in srgb, var(--app-positive) 34%, transparent)",
          color: "var(--app-text)",
        },
        [`& .${eventCalendarClasses.dayGridEvent}[data-palette="blue"]`]: {
          bgcolor: "color-mix(in srgb, var(--app-accent) 24%, transparent)",
          border: "1px solid color-mix(in srgb, var(--app-accent) 34%, transparent)",
          color: "var(--app-text)",
        },
        [`& .${eventCalendarClasses.dayGridEvent}[data-palette="amber"]`]: {
          bgcolor: "color-mix(in srgb, var(--app-warning) 24%, transparent)",
          border: "1px solid color-mix(in srgb, var(--app-warning) 34%, transparent)",
          color: "var(--app-text)",
        },
        [`& .${eventCalendarClasses.dayGridEvent}[data-palette="grey"]`]: {
          bgcolor: "transparent",
          border: 0,
          color: "var(--app-accent)",
        },
        [`& .${eventCalendarClasses.dayGridEvent}.portfolio-calendar-event-selected`]: {
          borderColor: "var(--app-accent)",
          boxShadow: "inset 0 0 0 1px var(--app-accent)",
        },
        [`& .${eventCalendarClasses.dayGridEvent}.portfolio-calendar-more-event`]: {
          fontWeight: 800,
        },
        [`& .${eventCalendarClasses.dayGridEventTitle}`]: {
          color: "var(--app-text)",
          fontWeight: 800,
        },
        [`& .${eventCalendarClasses.monthViewMoreEvents}`]: {
          color: "var(--app-accent)",
          fontSize: 11,
          fontWeight: 800,
          minHeight: 20,
          py: 0,
        },
      }}
    >
      <StandaloneMonthView<SchedulerWorkbenchEvent, object>
        areEventsDraggable={false}
        areEventsResizable={false}
        dateLocale={schedulerLocale(locale)}
        defaultPreferences={{ showWeekends: true, showWeekNumber: false, weekStartsOn: 1 }}
        displayTimezone="default"
        eventColor="teal"
        events={schedulerEvents}
        preferences={{ showWeekends: true, showWeekNumber: false, weekStartsOn: 1 }}
        preferencesMenuConfig={false}
        readOnly
        showCurrentTimeIndicator={false}
        view="month"
        views={["month"]}
        visibleDate={calendarMonth}
      />
    </Box>
  )
}

function TimelineView({
  locale,
  onSelectEvent,
  onSelectWeek,
  selectedEventId,
  selectedWeekStartKey,
  weeks,
}: {
  locale: string
  onSelectEvent: (eventId: string) => void
  onSelectWeek: (weekStartKey: string) => void
  selectedEventId: string | null
  selectedWeekStartKey: string | null
  weeks: WeekGroup[]
}) {
  if (weeks.length === 0) return <EmptyState text="No upcoming events match these filters." />
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      {weeks.map((week) => {
        const selected = week.startKey === selectedWeekStartKey
        return (
          <Box key={week.key} sx={{ position: "relative" }}>
            <Box
              component="button"
              type="button"
              onClick={() => onSelectWeek(week.startKey)}
              sx={{
                alignItems: "center",
                background: selected
                  ? "linear-gradient(90deg, color-mix(in srgb, var(--app-accent) 42%, var(--app-surface-raised)) 0%, color-mix(in srgb, var(--app-accent) 18%, var(--app-surface-raised)) 12%, color-mix(in srgb, var(--app-surface-raised) 94%, transparent) 42%, color-mix(in srgb, var(--app-surface-raised) 94%, transparent) 100%)"
                  : tableChromeBg,
                border: 0,
                borderBottom: "1px solid var(--app-border)",
                borderTop: selected ? "1px solid color-mix(in srgb, var(--app-accent) 55%, var(--app-border))" : 0,
                boxShadow: selected ? "inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 18%, transparent)" : "none",
                color: "inherit",
                cursor: "pointer",
                display: "flex",
                gap: 1,
                minHeight: 44,
                px: 1.25,
                py: 0.85,
                textAlign: "left",
                width: "100%",
              }}
            >
              <CollapseIndicator />
              <Typography sx={{ color: "var(--app-text)", fontSize: 16, fontWeight: 800 }}>{week.label}</Typography>
              <Chip label={week.events.length} color="primary" variant="outlined" size="small" sx={{ height: 24, fontWeight: 800 }} />
            </Box>
            {week.events.map((event, index) => (
              <TimelineRow
                key={event.id}
                event={event}
                locale={locale}
                selected={event.id === selectedEventId}
                firstInWeek={index === 0}
                lastInWeek={index === week.events.length - 1}
                onSelect={() => onSelectEvent(event.id)}
              />
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

function TimelineRow({
  event,
  firstInWeek,
  lastInWeek,
  locale,
  onSelect,
  selected,
}: {
  event: WorkbenchEvent
  firstInWeek: boolean
  lastInWeek: boolean
  locale: string
  onSelect: () => void
  selected: boolean
}) {
  const color = eventColor(event.kind)
  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      sx={{
        alignItems: "center",
        background: selected
          ? "linear-gradient(90deg, color-mix(in srgb, var(--app-accent) 26%, transparent) 0%, color-mix(in srgb, var(--app-accent) 10%, transparent) 16%, transparent 46%, transparent 100%)"
          : "transparent",
        border: 0,
        borderBottom: "1px solid var(--app-border)",
        color: "inherit",
        cursor: "pointer",
        display: "grid",
        gap: 1.25,
        gridTemplateColumns: { xs: "176px 132px minmax(0, 1fr) 96px 96px", md: "208px 148px minmax(0, 1fr) 118px 108px" },
        minWidth: 760,
        px: 1.25,
        py: 0.65,
        textAlign: "left",
        width: "100%",
        "&:hover": { bgcolor: "var(--app-surface-hover)" },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        <TimelineRailDot color={color} first={firstInWeek} last={lastInWeek} />
        <Chip
          label={shortWeekdayDate(event.dateKey, locale)}
          size="small"
          sx={{
            bgcolor: `color-mix(in srgb, ${color} 20%, transparent)`,
            borderRadius: 1,
            color,
            fontSize: 12,
            fontWeight: 800,
            height: 28,
            minWidth: 88,
            "& .MuiChip-label": { px: 1 },
          }}
        />
      </Stack>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
        <EventKindIcon kind={event.kind} />
        <Typography sx={{ color, fontSize: 12.5, fontWeight: 800, textTransform: "capitalize" }}>{event.detailLabel}</Typography>
      </Stack>
      <Typography noWrap sx={{ color: "var(--app-text)", fontSize: 13.5, fontWeight: 800 }}>{event.companyName}</Typography>
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>{event.provider}</Typography>
      <Box sx={{ textAlign: "right" }}>
        <Typography noWrap sx={{ color: "var(--app-text)", fontSize: 13.5, fontWeight: 800, lineHeight: 1.15 }}>{event.amountLabel}</Typography>
        <Typography noWrap sx={{ color: "var(--app-text-muted)", fontSize: 11, lineHeight: 1.2 }}>{eventAmountSubLabel(event)}</Typography>
      </Box>
    </Box>
  )
}

function EventsContextRail({
  events,
  legendCounts,
  locale,
  onChangeUpcomingPage,
  onSelectEvent,
  selectedEvent,
  selection,
  today,
  upcomingPage,
  upcomingPageCount,
  upcomingWeekEnd,
  upcomingWeekEvents,
  upcomingWeekStart,
}: {
  events: WorkbenchEvent[]
  legendCounts: Record<EventFilter, number>
  locale: string
  onChangeUpcomingPage: (page: number) => void
  onSelectEvent: (eventId: string) => void
  selectedEvent: WorkbenchEvent | null
  selection: ContextSelection
  today: Date
  upcomingPage: number
  upcomingPageCount: number
  upcomingWeekEnd: Date
  upcomingWeekEvents: WorkbenchEvent[]
  upcomingWeekStart: Date
}) {
  return (
    <Stack spacing={1.5} sx={{ height: WORKBENCH_HEIGHT, minHeight: 0 }}>
      <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", display: "flex", flex: "1.45 1 0", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        <ContextHeader selection={selection} selectedEvent={selectedEvent} events={events} locale={locale} />
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.5 }}>
          <ContextContent selection={selection} selectedEvent={selectedEvent} events={events} locale={locale} />
        </Box>
        {selection.type === "event" && selectedEvent ? <SelectedEventFooter event={selectedEvent} /> : null}
      </Card>

      <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", display: "flex", flex: "0.9 1 0", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        <Stack direction="row" sx={{ alignItems: "center", bgcolor: tableChromeBg, borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
          <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>Upcoming events this week</Typography>
          <Typography sx={{ color: "var(--app-text-muted)", fontSize: 11 }}>{dateRangeLabel(dateKey(upcomingWeekStart), dateKey(upcomingWeekEnd), locale)}</Typography>
        </Stack>
        <Stack sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {upcomingWeekEvents.length === 0 ? (
            <EmptyState text={upcomingPage === 1 ? "No events in the current week." : "No events in this future week."} compact />
          ) : (
            upcomingWeekEvents.slice(0, UPCOMING_WEEK_PAGE_SIZE).map((event) => (
              <CompactEventRow key={event.id} event={event} locale={locale} onSelect={() => onSelectEvent(event.id)} />
            ))
          )}
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", bgcolor: tableChromeBg, borderTop: "1px solid var(--app-border)", justifyContent: "flex-end", px: 1.5, py: 0.75 }}>
          <Pagination
            boundaryCount={1}
            count={upcomingPageCount}
            page={upcomingPage}
            siblingCount={1}
            size="small"
            onChange={(_, page) => onChangeUpcomingPage(page)}
          />
        </Stack>
      </Card>

      <LegendCard counts={legendCounts} />
    </Stack>
  )
}

function ContextHeader({ events, locale, selectedEvent, selection }: { events: WorkbenchEvent[]; locale: string; selectedEvent: WorkbenchEvent | null; selection: ContextSelection }) {
  if (selection.type === "event") {
    return (
      <Stack direction="row" sx={{ alignItems: "center", bgcolor: tableChromeBg, borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
        <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>Selected event</Typography>
        {selectedEvent ? <BookmarkIcon /> : null}
      </Stack>
    )
  }
  if (selection.type === "day") {
    return (
      <Stack direction="row" sx={{ alignItems: "center", bgcolor: tableChromeBg, borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
        <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>Selected day</Typography>
        <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>{formatDate(selection.dateKey, locale)}</Typography>
      </Stack>
    )
  }
  const weekEndKey = dateKey(addDays(parseDateKey(selection.weekStartKey), 6))
  return (
    <Stack direction="row" sx={{ alignItems: "center", bgcolor: tableChromeBg, borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
      <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>Selected week</Typography>
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>{dateRangeLabel(selection.weekStartKey, weekEndKey, locale)}</Typography>
    </Stack>
  )
}

function ContextContent({ events, locale, selectedEvent, selection }: { events: WorkbenchEvent[]; locale: string; selectedEvent: WorkbenchEvent | null; selection: ContextSelection }) {
  if (selection.type === "event") {
    return selectedEvent ? <SelectedEventDetails event={selectedEvent} locale={locale} /> : <EmptyState text="The selected event is no longer visible." compact />
  }
  if (selection.type === "day") {
    const dayEvents = events.filter((event) => event.dateKey === selection.dateKey).sort(compareEventsAscending)
    return <SelectedDayDetails dateKey={selection.dateKey} events={dayEvents} locale={locale} />
  }
  const weekEndKey = dateKey(addDays(parseDateKey(selection.weekStartKey), 6))
  const weekEvents = events.filter((event) => event.dateKey >= selection.weekStartKey && event.dateKey <= weekEndKey).sort(compareEventsAscending)
  return <SelectedWeekDetails endKey={weekEndKey} events={weekEvents} locale={locale} startKey={selection.weekStartKey} />
}

function SelectedEventDetails({ event, locale }: { event: WorkbenchEvent; locale: string }) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
        <Box sx={{ alignItems: "center", bgcolor: `color-mix(in srgb, ${eventColor(event.kind)} 26%, transparent)`, borderRadius: "50%", color: "var(--app-text)", display: "flex", flexShrink: 0, fontSize: 13, fontWeight: 800, height: 42, justifyContent: "center", width: 42 }}>
          {event.symbol.slice(0, 3)}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: "var(--app-text)", fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{event.companyName} {event.detailLabel}</Typography>
          <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>{event.companyName} · {event.symbol}</Typography>
        </Box>
      </Stack>
      <Box sx={{ border: "1px solid var(--app-border)", borderRadius: 1, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", overflow: "hidden" }}>
        <DetailCell label="Type" value={event.detailLabel} />
        <DetailCell label={event.kind === "earnings" ? "Report date" : "Ex-date"} value={formatDate(event.dateKey, locale)} />
        <DetailCell label="Amount" value={event.amountLabel} />
        <DetailCell label="Provider" value={event.provider} />
        <DetailCell label="Status" value={event.statusLabel} />
        {event.kind === "earnings" ? <DetailCell label="EPS" value={`${event.epsEstimate} / ${event.epsActual}`} /> : null}
      </Box>
    </Stack>
  )
}

function SelectedEventFooter({ event }: { event: WorkbenchEvent }) {
  return (
    <Stack direction="row" spacing={1} sx={{ bgcolor: tableChromeBg, borderTop: "1px solid var(--app-border)", px: 1.5, py: 1.25 }}>
      <Button component={Link} href={`/positions/${event.positionId}`} variant="outlined" size="small" sx={{ flex: 1, textTransform: "none" }}>Open asset</Button>
      <Button variant="outlined" size="small" sx={{ flex: 1, textTransform: "none" }}>Add reminder</Button>
      <Button variant="outlined" size="small" sx={{ flex: 1, textTransform: "none" }}>Mark reviewed</Button>
    </Stack>
  )
}

function SelectedDayDetails({ dateKey: selectedDateKey, events, locale }: { dateKey: string; events: WorkbenchEvent[]; locale: string }) {
  if (events.length === 0) return <EmptyState text={`No events on ${formatDate(selectedDateKey, locale)}.`} compact />
  return (
    <Stack spacing={0}>
      {events.map((event) => (
        <ContextEventLine key={event.id} event={event} locale={locale} />
      ))}
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 11, mt: 1 }}>{events.length} events on this day</Typography>
    </Stack>
  )
}

function SelectedWeekDetails({ events, locale }: { endKey: string; events: WorkbenchEvent[]; locale: string; startKey: string }) {
  return (
    <Stack spacing={0}>
      {events.length === 0 ? <EmptyState text="No events in this week." compact /> : events.map((event) => <ContextEventLine key={event.id} event={event} locale={locale} />)}
    </Stack>
  )
}

function ContextEventLine({ event, locale }: { event: WorkbenchEvent; locale: string }) {
  return (
    <Box sx={{ borderBottom: "1px solid var(--app-border)", display: "grid", gap: 1, gridTemplateColumns: "minmax(0, 1fr) 86px", px: 0.25, py: 0.85 }}>
      <Stack direction="row" spacing={0.85} sx={{ alignItems: "center", minWidth: 0 }}>
        <EventKindIcon kind={event.kind} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ color: "var(--app-text)", fontSize: 12.5, fontWeight: 800, lineHeight: 1.2 }}>{event.companyName} {event.detailLabel}</Typography>
          <Typography noWrap sx={{ color: "var(--app-text-muted)", fontSize: 10.5, lineHeight: 1.35 }}>
            {event.symbol} <Box component="span" sx={{ color: "var(--app-text-faint)", mx: 0.5 }}>·</Box> {event.kind === "earnings" ? "Report date" : "Ex-date"} {formatDate(event.dateKey, locale)}
          </Typography>
        </Box>
      </Stack>
      <Box sx={{ minWidth: 0, textAlign: "right" }}>
        <Typography noWrap sx={{ color: "var(--app-text)", fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>{event.amountLabel}</Typography>
        <Typography noWrap sx={{ color: "var(--app-text-muted)", fontSize: 10.5, lineHeight: 1.35 }}>{eventAmountSubLabel(event)}</Typography>
      </Box>
    </Box>
  )
}

function CompactEventRow({ event, locale, onSelect }: { event: WorkbenchEvent; locale: string; onSelect: () => void }) {
  return (
    <Box component="button" type="button" onClick={onSelect} sx={{ bgcolor: "transparent", border: 0, borderBottom: "1px solid var(--app-border)", color: "inherit", cursor: "pointer", display: "grid", gap: 1, gridTemplateColumns: "92px minmax(0, 1fr) 58px 72px", px: 1.5, py: 0.75, textAlign: "left", "&:hover": { bgcolor: "var(--app-surface-hover)" } }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
        <EventKindIcon kind={event.kind} />
        <Typography sx={{ color: "var(--app-text-muted)", fontSize: 11 }}>{shortWeekdayDate(event.dateKey, locale)}</Typography>
      </Stack>
      <Typography noWrap sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700 }}>{event.companyName} {event.detailLabel}</Typography>
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 11 }}>{event.symbol}</Typography>
      <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700, textAlign: "right" }}>{event.amountLabel}</Typography>
    </Box>
  )
}

function LegendCard({ counts }: { counts: Record<EventFilter, number> }) {
  return (
    <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", overflow: "hidden" }}>
      <Stack direction="row" sx={{ alignItems: "center", bgcolor: tableChromeBg, borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
        <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>Legend</Typography>
      </Stack>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(2, minmax(0, 1fr))", p: 1.5 }}>
        <LegendItem kind="earnings" label="Earnings" value={counts.earnings} />
        <LegendItem kind="dividend" label="Dividends" value={counts.dividends} />
        <LegendItem kind="split" label="Splits" value={counts.splits} />
      </Box>
    </Card>
  )
}

function LegendItem({ kind, label, value }: { kind: EventKind; label: string; value: number }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <EventKindIcon kind={kind} />
      <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700 }}>{label}</Typography>
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12, ml: "auto" }}>{value}</Typography>
    </Stack>
  )
}

function MetricCard({ icon, label, value, sub, tone }: { icon: "calendar" | "report" | "action"; label: string; value: number; sub: string; tone: "primary" | "success" | "warning" }) {
  const color = tone === "success" ? "var(--app-positive)" : tone === "warning" ? "var(--app-warning)" : "var(--app-accent)"
  return (
    <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface-raised) 92%, transparent)", p: 1.5 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Box sx={{ alignItems: "center", bgcolor: `color-mix(in srgb, ${color} 18%, transparent)`, borderRadius: 1.5, color, display: "flex", height: 46, justifyContent: "center", width: 46 }}>
          <MetricIcon icon={icon} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>{label}</Typography>
          <Typography sx={{ color: "var(--app-text)", fontSize: 24, fontWeight: 700, lineHeight: 1.1 }} className="tabular-nums">{value}</Typography>
          <Typography noWrap sx={{ color: "var(--app-text-faint)", fontSize: 11, mt: 0.25 }}>{sub}</Typography>
        </Box>
      </Stack>
    </Card>
  )
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ borderBottom: "1px solid var(--app-border)", borderRight: "1px solid var(--app-border)", p: 1 }}>
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 10, fontWeight: 700 }}>{label}</Typography>
      <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700 }}>{value}</Typography>
    </Box>
  )
}

function CentralEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <Card variant="outlined" sx={{ alignItems: "center", borderColor: "var(--app-border)", bgcolor: "var(--app-surface-raised)", display: "flex", flexDirection: "column", gap: 1.25, justifyContent: "center", minHeight: 260, p: 3 }}>
      <Typography sx={{ color: "var(--app-text)", fontSize: 15, fontWeight: 700 }}>No events match these filters</Typography>
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12, textAlign: "center" }}>Adjust the event type or search query to broaden the view.</Typography>
      <Button variant="outlined" size="small" onClick={onClear}>Clear filters</Button>
    </Card>
  )
}

function EmptyState({ compact = false, text }: { compact?: boolean; text: string }) {
  return <Typography sx={{ color: "var(--app-text-faint)", fontSize: 12, px: 2, py: compact ? 3 : 6, textAlign: "center" }}>{text}</Typography>
}

function normalizeEvents(earnings: PortfolioEarnings[], corporateActions: PortfolioCorporateAction[], locale: string): WorkbenchEvent[] {
  const earningsEvents = earnings.flatMap((item): WorkbenchEvent[] => {
    const eventDate = item.report_date ?? item.period_end_date
    if (!eventDate) return []
    const epsEstimate = num(item.eps_estimate)
    const epsActual = num(item.eps_actual)
    return [{
      id: `earnings-${item.instrument_id}-${eventDate}-${item.fiscal_year}-${item.fiscal_quarter ?? "fy"}`,
      kind: "earnings",
      filter: "earnings",
      dateKey: isoDateKey(eventDate),
      companyName: item.context.name,
      shortCompanyName: shortCompanyName(item.context.name),
      symbol: item.context.symbol,
      provider: item.provider,
      positionId: item.context.positionId,
      amountLabel: item.is_upcoming ? "Upcoming" : formatNumber(epsActual),
      statusLabel: item.is_upcoming ? "Upcoming" : resultLabel(item),
      detailLabel: "earnings",
      epsEstimate: formatNumber(epsEstimate),
      epsActual: formatNumber(epsActual),
    }]
  })

  const actionEvents = corporateActions.flatMap((item): WorkbenchEvent[] => {
    const split = item.type.includes("split")
    const kind = split ? "split" : "dividend"
    return [{
      id: `action-${item.stable_action_id}`,
      kind,
      filter: split ? "splits" : "dividends",
      dateKey: isoDateKey(item.ex_date),
      companyName: item.context.name,
      shortCompanyName: shortCompanyName(item.context.name),
      symbol: item.context.symbol,
      provider: item.provider,
      positionId: item.context.positionId,
      amountLabel: corporateActionValue(item, locale),
      statusLabel: "Upcoming",
      detailLabel: split ? "split" : "dividend",
      epsEstimate: "-",
      epsActual: "-",
    }]
  })

  return [...earningsEvents, ...actionEvents]
}

function groupEventsByDate(events: WorkbenchEvent[]): Map<string, WorkbenchEvent[]> {
  const groups = new Map<string, WorkbenchEvent[]>()
  for (const event of events) {
    const current = groups.get(event.dateKey) ?? []
    current.push(event)
    groups.set(event.dateKey, current)
  }
  for (const [key, items] of groups) groups.set(key, [...items].sort(compareEventsAscending))
  return groups
}

function groupEventsByWeek(events: WorkbenchEvent[], locale: string): WeekGroup[] {
  const groups = new Map<string, WorkbenchEvent[]>()
  for (const event of events) {
    const weekStart = startOfWeekMonday(parseDateKey(event.dateKey))
    const key = dateKey(weekStart)
    const current = groups.get(key) ?? []
    current.push(event)
    groups.set(key, current)
  }
  return [...groups.entries()]
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .map(([key, items]) => {
      const weekStart = parseDateKey(key)
      const weekEnd = addDays(weekStart, 6)
      return {
        key,
        label: dateRangeLabel(dateKey(weekStart), dateKey(weekEnd), locale),
        rangeLabel: dateRangeLabel(dateKey(weekStart), dateKey(weekEnd), locale),
        startKey: dateKey(weekStart),
        endKey: dateKey(weekEnd),
        events: [...items].sort(compareEventsAscending),
      }
    })
}

function countFutureWeeksWithEvents(events: WorkbenchEvent[], currentWeekStart: Date): number {
  const currentWeekStartTime = currentWeekStart.getTime()
  let maxWeekOffset = 0
  for (const event of events) {
    const eventWeekStart = startOfWeekMonday(parseDateKey(event.dateKey))
    if (eventWeekStart.getTime() < currentWeekStartTime) continue
    const weekOffset = Math.round((eventWeekStart.getTime() - currentWeekStartTime) / (7 * 86_400_000))
    maxWeekOffset = Math.max(maxWeekOffset, weekOffset)
  }
  return maxWeekOffset + 1
}

function buildCalendarDays(month: Date): Date[] {
  const start = startOfWeekMonday(startOfMonth(month))
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const end = addDays(startOfWeekMonday(monthEnd), 6)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  return Array.from({ length: days }, (_, index) => addDays(start, index))
}

function matchesEvent(event: WorkbenchEvent, searchTerm: string): boolean {
  if (!searchTerm) return true
  return [event.companyName, event.symbol, event.provider, event.detailLabel].some((value) => value.toLowerCase().includes(searchTerm))
}

function compareEventsAscending(firstEvent: WorkbenchEvent, secondEvent: WorkbenchEvent): number {
  const dateComparison = firstEvent.dateKey.localeCompare(secondEvent.dateKey)
  if (dateComparison !== 0) return dateComparison
  return firstEvent.companyName.localeCompare(secondEvent.companyName)
}

function readStoredEventView(): EventView {
  if (typeof window === "undefined") return "timeline"
  const stored = window.localStorage.getItem(EVENT_VIEW_STORAGE_KEY)
  return stored === "calendar" ? "calendar" : "timeline"
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfWeekMonday(date: Date): Date {
  const normalized = startOfDay(date)
  const day = normalized.getDay()
  const diff = day === 0 ? -6 : 1 - day
  normalized.setDate(normalized.getDate() + diff)
  return normalized
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return startOfMonth(next)
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function isoDateKey(iso: string): string {
  return iso.slice(0, 10)
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function monthLabel(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { month: "long", year: "numeric" })
}

function weekDayLabels(locale: string): string[] {
  const monday = new Date(2026, 5, 15)
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index).toLocaleDateString(locale, { weekday: "short" }))
}

function shortWeekdayDate(key: string, locale: string): string {
  return parseDateKey(key).toLocaleDateString(locale, { day: "2-digit", month: "short", weekday: "short" })
}

function dateRangeLabel(startKey: string, endKey: string, locale: string): string {
  const start = parseDateKey(startKey)
  const end = parseDateKey(endKey)
  return `${start.toLocaleDateString(locale, { day: "2-digit", month: "short" })} - ${end.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}`
}

function shortCompanyName(name: string): string {
  const cleaned = name
    .replace(/\b(company|corp\.?|corporation|inc\.?|ltd\.?|limited|ag|asa|nv|se|co\.?|group|holdings|holding)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
  const parts = cleaned.split(" ").filter(Boolean)
  if (parts.length <= 2) return cleaned || name
  return parts.slice(0, 2).join(" ")
}

function resultLabel(item: PortfolioEarnings): string {
  const surprise = num(item.surprise_pct)
  if (surprise === null) return "In line"
  if (surprise > 0) return "Beat"
  if (surprise < 0) return "Miss"
  return "In line"
}

function corporateActionValue(item: PortfolioCorporateAction, locale: string): string {
  const amount = num(item.dividend_amount)
  const numerator = num(item.ratio_numerator)
  const denominator = num(item.ratio_denominator)
  if (item.type === "dividend" && amount !== null) return fmtCurrency(locale, amount, item.dividend_currency ?? item.context.currency)
  if (numerator !== null && denominator !== null) return `${formatNumber(numerator)}:${formatNumber(denominator)}`
  return "-"
}

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "-"
  return parseDateKey(iso.slice(0, 10)).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })
}

function formatNumber(value: number | null): string {
  return value === null ? "-" : value.toFixed(2)
}

function amountFromLabel(label: string): number {
  const parsed = Number.parseFloat(label.replace(/[^0-9,.-]/g, "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : 0
}

function eventAmountSubLabel(event: WorkbenchEvent): string {
  if (event.kind === "dividend") return "Per share"
  if (event.kind === "split") return "Ratio"
  return event.statusLabel
}

function eventColor(kind: EventKind): string {
  if (kind === "dividend") return "var(--app-positive)"
  if (kind === "split") return "var(--app-warning)"
  return "var(--app-accent)"
}

function schedulerEventColor(kind: EventKind): SchedulerEventColor {
  if (kind === "dividend") return "teal"
  if (kind === "split") return "amber"
  return "blue"
}

function schedulerEventClassName(index: number): string {
  return `portfolio-calendar-event-${index}`
}

function schedulerLocale(locale: string) {
  return locale.toLowerCase().startsWith("de") ? de : enUS
}

const iconButtonSx = {
  border: "1px solid var(--app-border)",
  borderRadius: 1,
  color: "var(--app-text-muted)",
  height: 34,
  width: 34,
  "&:hover": { bgcolor: "var(--app-surface-hover)", color: "var(--app-text)" },
}

function TimelineRailDot({ color, first, last }: { color: string; first: boolean; last: boolean }) {
  return (
    <Box sx={{ alignSelf: "stretch", display: "flex", justifyContent: "center", minHeight: 42, position: "relative", width: 24 }}>
      <Box
        sx={{
          bgcolor: "color-mix(in srgb, var(--app-border) 70%, transparent)",
          bottom: last ? "50%" : 0,
          left: "50%",
          position: "absolute",
          top: first ? "50%" : 0,
          transform: "translateX(-50%)",
          width: 1,
        }}
      />
      <Box
        sx={{
          bgcolor: color,
          border: "2px solid color-mix(in srgb, var(--app-surface) 85%, transparent)",
          borderRadius: "50%",
          boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 22%, transparent)`,
          height: 11,
          left: "50%",
          position: "absolute",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 11,
        }}
      />
    </Box>
  )
}

function EventKindIcon({ kind }: { kind: EventKind }) {
  const color = eventColor(kind)
  return (
    <Box sx={{ alignItems: "center", bgcolor: `color-mix(in srgb, ${color} 18%, transparent)`, borderRadius: "50%", color, display: "inline-flex", flexShrink: 0, height: 24, justifyContent: "center", width: 24 }}>
      {kind === "dividend" ? <DollarIcon /> : kind === "split" ? <SplitIcon /> : <CalendarIcon />}
    </Box>
  )
}

function MetricIcon({ icon }: { icon: "calendar" | "report" | "action" }) {
  if (icon === "report") return <ReportIcon />
  if (icon === "action") return <ActionIcon />
  return <CalendarIcon large />
}

function CalendarIcon({ large = false }: { large?: boolean }) {
  return (
    <svg width={large ? 24 : 14} height={large ? 24 : 14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3v4M17 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ReportIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ActionIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v8h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12a8 8 0 1 1-8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function DollarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v18M16 7.5c-.8-.9-2-1.5-3.6-1.5-2.1 0-3.4 1.1-3.4 2.6 0 3.7 7 1.6 7 5.7 0 1.7-1.5 3-3.8 3-1.8 0-3.3-.7-4.2-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SplitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7h10M7 17h10M12 7v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CollapseIndicator() {
  return (
    <Box component="span" sx={{ color: "var(--app-text-muted)", display: "inline-flex" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Box>
  )
}

function BookmarkIcon() {
  return (
    <Box sx={{ color: "var(--app-text-muted)", display: "inline-flex" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 4h12v16l-6-3-6 3V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Box>
  )
}
