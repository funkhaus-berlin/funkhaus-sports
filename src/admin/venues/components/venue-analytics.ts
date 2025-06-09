import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { select } from '@mhmo91/schmancy'
import { customElement, property, state } from 'lit/decorators.js'
import { filter, takeUntil } from 'rxjs'
import { Court } from 'src/types/booking/court.types'
import { Venue } from 'src/types/booking/venue.types'
import { courtsContext, selectMyCourts } from '../courts/context'
import { venueContext } from '../venue-context'
import { formatEnum } from './venue-form'
import { css, html } from 'lit'

@customElement('venue-analytics')
export class VenueAnalytics extends $LitElement(css`
	.analytics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}

	.metric-card {
		background: var(--schmancy-sys-color-surface-container-low, #f8f8f8);
		border-radius: 0.75rem;
		padding: 1.5rem;
		text-align: center;
		transition: all 0.2s ease;
	}

	.metric-card:hover {
		transform: translateY(-3px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
	}

	.metric-value {
		font-size: 2.5rem;
		font-weight: 700;
		color: var(--schmancy-sys-color-primary-default, #6750a4);
		margin: 0.5rem 0;
	}

	.metric-label {
		font-size: 0.875rem;
		color: var(--schmancy-sys-color-surface-on-variant, #686868);
		margin-bottom: 0.25rem;
	}

	.metric-description {
		font-size: 0.75rem;
		color: var(--schmancy-sys-color-surface-on-variant, #757575);
	}

	.metric-icon {
		font-size: 1.75rem;
		color: var(--schmancy-sys-color-primary-default, #6750a4);
		opacity: 0.8;
	}

	.chart-container {
		height: 300px;
		margin-top: 1rem;
		position: relative;
	}

	.capacity-meter {
		position: relative;
		height: 1.5rem;
		border-radius: 0.75rem;
		background: var(--schmancy-sys-color-surface-variant, #e7e0ec);
		overflow: hidden;
		margin: 0.5rem 0 1.5rem;
	}

	.capacity-fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		background: linear-gradient(
			to right,
			var(--schmancy-sys-color-primary-default, #6750a4),
			var(--schmancy-sys-color-tertiary-default, #7d5260)
		);
		border-radius: 0.75rem;
		transition: width 1s ease-out;
	}

	.capacity-labels {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--schmancy-sys-color-surface-on-variant, #49454f);
	}

	.utilization-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem;
		margin-top: 1rem;
	}

	.utilization-day {
		text-align: center;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.utilization-cell {
		aspect-ratio: 1;
		border-radius: 0.25rem;
		transition: all 0.2s ease;
	}

	.utilization-cell:hover {
		transform: scale(1.1);
	}

	.utilization-low {
		background-color: var(--schmancy-sys-color-primary-container, #eaddff);
	}

	.utilization-med {
		background-color: var(--schmancy-sys-color-primary-default, #6750a4);
	}

	.utilization-high {
		background-color: var(--schmancy-sys-color-tertiary-default, #7d5260);
	}

	.insights-card {
		border-left: 4px solid var(--schmancy-sys-color-primary-default, #6750a4);
		padding: 1rem;
		margin-top: 1rem;
		background-color: var(--schmancy-sys-color-primary-container, #eaddff);
		border-radius: 0 0.5rem 0.5rem 0;
	}

	.insights-title {
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--schmancy-sys-color-primary-default, #6750a4);
	}

	.chart-card {
		padding: 1.5rem;
		border-radius: 0.75rem;
		background: var(--schmancy-sys-color-surface-container-low, #f8f8f8);
		margin-top: 1rem;
	}

	.revenue-distribution {
		display: flex;
		margin-top: 1rem;
	}

	.revenue-bar {
		height: 1.5rem;
		transition: width 1s ease-out;
	}

	.revenue-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 0.5rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		font-size: 0.8rem;
	}

	.legend-color {
		width: 1rem;
		height: 1rem;
		border-radius: 0.25rem;
		margin-right: 0.5rem;
	}
`) {
	@property({ type: Object }) venue?: Venue
	@state() courts: Map<string, Court> = new Map()
	@state() timeRange: '7days' | '30days' | '90days' = '30days'
	@state() chartType: 'revenue' | 'utilization' | 'bookings' = 'revenue'
	@state() loading: boolean = true
	@state() error: string | null = null
	@state() venueId: string = ''

	// Select from venue context
	@select(venueContext, undefined, {
		required: true,
	})
	venueData!: Partial<Venue>

	connectedCallback() {
		super.connectedCallback()

		console.log('VenueAnalytics connected, current venue:', this.venue)

		// If we have a venue from a property, use it
		if (this.venue) {
			this.venueId = this.venue.id
		}
		// Otherwise try to get venue ID from context
		else if (this.venueData?.id) {
			this.venueId = this.venueData.id

			// Also set the venue property
			this.venue = this.venueData as Venue
		}

		// Get courts for this venue from the context
		if (this.venueId) {
			console.log('VenueAnalytics loading courts for venue:', this.venueId)
			selectMyCourts.pipe(takeUntil(this.disconnecting)).subscribe({
				next: courts => {
					console.log('VenueAnalytics loaded courts:', courts.size)
					this.courts = courts
					this.loading = false
					this.requestUpdate()
				},
				error: err => {
					console.error('Error loading courts for analytics:', err)
					this.error = 'Failed to load court data'
					this.loading = false
					this.requestUpdate()
				},
			})
		} else {
			console.warn('VenueAnalytics: No venue ID available')
			this.loading = false
		}
	}

	// Calculate court utilization metrics
	getCourtUtilization() {
		// Check if courts is defined before accessing size
		if (!this.courts) {
			console.warn('Courts data is not available in venue analytics')
			return {
				totalCourts: 0,
				activeCourts: 0,
				utilizationPercentage: 0,
				capacityUtilization: this.venue?.maxCourtCapacity ? 0 : 100,
			}
		}

		const totalCourts = this.courts.size
		const activeCourts = Array.from(this.courts.values()).filter(c => c.status === 'active').length
		const utilizationPercentage = totalCourts > 0 ? Math.round((activeCourts / totalCourts) * 100) : 0

		return {
			totalCourts,
			activeCourts,
			utilizationPercentage,
			capacityUtilization: this.venue?.maxCourtCapacity
				? Math.round((totalCourts / this.venue.maxCourtCapacity) * 100)
				: 100,
		}
	}

	// Calculate operational metrics
	getOperationalMetrics() {
		// Ensure venue data is available
		if (!this.venue) {
			console.warn('Venue data is not available for operational metrics')
			return {
				operationalDays: 0,
				weeklyHours: 0,
				potentialRevenue: 0,
			}
		}

		const operationalDays = this.venue.operatingHours
			? Object.values(this.venue.operatingHours).filter(hours => hours !== null).length
			: 0

		// Calculate weekly operational hours
		let weeklyHours = 0
		if (this.venue.operatingHours) {
			Object.values(this.venue.operatingHours).forEach(hours => {
				if (hours) {
					const openTime = hours.open.split(':').map(Number)
					const closeTime = hours.close.split(':').map(Number)
					const openMinutes = openTime[0] * 60 + (openTime[1] || 0)
					const closeMinutes = closeTime[0] * 60 + (closeTime[1] || 0)
					weeklyHours += (closeMinutes - openMinutes) / 60
				}
			})
		}

		// Check if courts data is available
		if (!this.courts) {
			console.warn('Courts data is not available for calculating potential revenue')
			return {
				operationalDays,
				weeklyHours,
				potentialRevenue: 0,
			}
		}

		// Calculate potential revenue per week based on active courts and operating hours
		const activeCourts = Array.from(this.courts.values()).filter(c => c.status === 'active')
		let potentialRevenue = 0
		activeCourts.forEach(court => {
			const hourlyRate = court.pricing?.baseHourlyRate || 0
			potentialRevenue += hourlyRate * weeklyHours
		})

		return {
			operationalDays,
			weeklyHours,
			potentialRevenue,
		}
	}

	// Get court distribution by type
	getCourtTypeDistribution() {
		const courtsBySport: Record<string, number> = {}
		const courtsByType: Record<string, number> = {}

		// Check if courts is defined before using it
		if (!this.courts) {
			console.warn('Courts data is not available for type distribution')
			return { courtsBySport, courtsByType }
		}

		Array.from(this.courts.values()).forEach(court => {
			// Count by court type
			const type = court.courtType || 'standard'
			courtsByType[type] = (courtsByType[type] || 0) + 1

			// Count by sport types
			court.sportTypes?.forEach(sport => {
				courtsBySport[sport] = (courtsBySport[sport] || 0) + 1
			})
		})

		return { courtsBySport, courtsByType }
	}

	// Calculate revenue metrics
	getRevenueMetrics() {
		// Check if courts is defined before accessing size
		if (!this.courts) {
			console.warn('Courts data is not available for revenue metrics')
			return {
				totalHourlyRate: 0,
				averageRate: 0,
				medianRate: 0,
				rateDistribution: this.getEmptyRateDistribution(),
			}
		}

		const totalCourts = this.courts.size
		if (totalCourts === 0) {
			return {
				totalHourlyRate: 0,
				averageRate: 0,
				medianRate: 0,
				rateDistribution: this.getEmptyRateDistribution(),
			}
		}

		const rates = Array.from(this.courts.values())
			.map(court => court.pricing?.baseHourlyRate || 0)
			.sort((a, b) => a - b)

		const totalHourlyRate = rates.reduce((sum, rate) => sum + rate, 0)
		const averageRate = totalHourlyRate / totalCourts

		// Calculate median rate
		const middle = Math.floor(rates.length / 2)
		const medianRate = rates.length % 2 === 0 ? (rates[middle - 1] + rates[middle]) / 2 : rates[middle]

		// Calculate rate distribution by ranges
		const rateRanges = [
			{ min: 0, max: 20, label: '€0-20', color: '#eaddff' },
			{ min: 20, max: 40, label: '€20-40', color: '#d0bcff' },
			{ min: 40, max: 60, label: '€40-60', color: '#9a82db' },
			{ min: 60, max: 80, label: '€60-80', color: '#7f67be' },
			{ min: 80, max: Infinity, label: '€80+', color: '#6750a4' },
		]

		const rateDistribution: Record<string, { count: number; percentage: number; color: string }> = {}

		rateRanges.forEach(range => {
			const count = rates.filter(rate => rate >= range.min && rate < range.max).length
			const percentage = (count / totalCourts) * 100
			rateDistribution[range.label] = {
				count,
				percentage,
				color: range.color,
			}
		})

		return {
			totalHourlyRate,
			averageRate,
			medianRate,
			rateDistribution,
		}
	}

	// Helper method to create empty rate distribution
	private getEmptyRateDistribution() {
		const rateDistribution: Record<string, { count: number; percentage: number; color: string }> = {}
		const rateRanges = [
			{ min: 0, max: 20, label: '€0-20', color: '#eaddff' },
			{ min: 20, max: 40, label: '€20-40', color: '#d0bcff' },
			{ min: 40, max: 60, label: '€40-60', color: '#9a82db' },
			{ min: 60, max: 80, label: '€60-80', color: '#7f67be' },
			{ min: 80, max: Infinity, label: '€80+', color: '#6750a4' },
		]

		rateRanges.forEach(range => {
			rateDistribution[range.label] = {
				count: 0,
				percentage: 0,
				color: range.color,
			}
		})

		return rateDistribution
	}

	// Generate business insights based on metrics
	getBusinessInsights() {
		const insights: string[] = []

		// Ensure we have both venue and courts data
		if (!this.venue || !this.courts) {
			console.warn('Missing data for generating business insights')
			return insights
		}

		const utilization = this.getCourtUtilization()
		const operational = this.getOperationalMetrics()
		const revenue = this.getRevenueMetrics()
		const distribution = this.getCourtTypeDistribution()

		// Capacity utilization insights
		if (this.venue.maxCourtCapacity && this.courts.size < this.venue.maxCourtCapacity) {
			const unusedCapacity = this.venue.maxCourtCapacity - this.courts.size
			insights.push(
				`This venue has unused capacity for ${unusedCapacity} more courts. Consider expanding operations to maximize venue potential.`,
			)
		}

		// Court utilization insights
		if (utilization.activeCourts < utilization.totalCourts) {
			const inactiveCourts = utilization.totalCourts - utilization.activeCourts
			insights.push(
				`${inactiveCourts} courts are currently inactive. Reactivating these courts could increase weekly revenue potential by approximately €${Math.round(
					operational.weeklyHours * revenue.averageRate * inactiveCourts,
				)}.`,
			)
		}

		// Operating hours insights
		if (operational.operationalDays < 7) {
			insights.push(
				`This venue operates ${operational.operationalDays} days per week. Opening for additional days could increase weekly revenue potential.`,
			)
		}

		// Court type distribution insights
		const sportTypes = Object.keys(distribution.courtsBySport)
		if (sportTypes.length === 1) {
			insights.push(
				`All courts are dedicated to ${formatEnum(
					sportTypes[0],
				)}. Consider diversifying to attract a wider customer base.`,
			)
		}

		// Pricing insights
		if (revenue.averageRate < 30) {
			insights.push(
				`The average hourly rate (€${revenue.averageRate.toFixed(
					2,
				)}) is below market average. Consider a pricing strategy review to optimize revenue.`,
			)
		}

		return insights
	}

	handleTimeRangeChange(range: '7days' | '30days' | '90days') {
		this.timeRange = range
	}

	handleChartTypeChange(type: 'revenue' | 'utilization' | 'bookings') {
		this.chartType = type
	}

	render() {
		// Show loading state
		if (this.loading) {
			return html`
				<div class="p-5 text-center">
					<div
						class="inline-block w-8 h-8 border-4 border-t-primary-default border-r-outlineVariant border-b-outlineVariant border-l-outlineVariant rounded-full animate-spin mb-3"
					></div>
					<p>Loading analytics data...</p>
				</div>
			`
		}

		// Show error state if there's an error
		if (this.error) {
			return html`
				<div class="p-5 text-center bg-error-container rounded-lg mt-5">
					<schmancy-icon style="font-size: 48px;" class="text-error-default mb-3">error_outline</schmancy-icon>
					<p class="text-error-on-container mb-2">${this.error}</p>
					<p class="text-error-on-container text-sm">Please try again later</p>
				</div>
			`
		}

		// Add safeguards to check if the component has required data
		if (!this.venue) {
			return html`
				<div class="p-5 text-center bg-surface-container-low rounded-lg mt-5">
					<schmancy-icon style="font-size: 48px; opacity: 0.5;" class="mb-3">error_outline</schmancy-icon>
					<p class="text-surface-on-variant mb-2">Venue data not available</p>
					<p class="text-surface-on-variant text-sm">Please select a venue to view analytics</p>
				</div>
			`
		}

		// Get metrics with built-in null checks
		const utilizationMetrics = this.getCourtUtilization()
		const operationalMetrics = this.getOperationalMetrics()
		const revenueMetrics = this.getRevenueMetrics()
		const distribution = this.getCourtTypeDistribution()
		const insights = this.getBusinessInsights()

		return html`
			<div>
				<schmancy-flex justify="between" align="center" class="mb-4">
					<schmancy-typography type="title" token="lg">
						<schmancy-icon class="mr-2">insights</schmancy-icon>
						Venue Analytics & Insights
					</schmancy-typography>
				</schmancy-flex>

				<!-- Key Metrics Cards -->
				<div class="analytics-grid">
					<!-- Court Utilization -->
					<div class="metric-card">
						<schmancy-icon class="metric-icon">sports_tennis</schmancy-icon>
						<div class="metric-label">Court Utilization</div>
						<div class="metric-value">${utilizationMetrics.utilizationPercentage}%</div>
						<div class="metric-description">
							${utilizationMetrics.activeCourts} active courts out of ${utilizationMetrics.totalCourts} total
						</div>
					</div>

					<!-- Weekly Revenue Potential -->
					<div class="metric-card">
						<schmancy-icon class="metric-icon">payments</schmancy-icon>
						<div class="metric-label">Weekly Revenue Potential</div>
						<div class="metric-value">€${Math.round(operationalMetrics.potentialRevenue)}</div>
						<div class="metric-description">Based on ${operationalMetrics.weeklyHours} operational hours per week</div>
					</div>

					<!-- Average Hourly Rate -->
					<div class="metric-card">
						<schmancy-icon class="metric-icon">euro</schmancy-icon>
						<div class="metric-label">Average Hourly Rate</div>
						<div class="metric-value">€${revenueMetrics.averageRate.toFixed(2)}</div>
						<div class="metric-description">Median rate: €${revenueMetrics.medianRate.toFixed(2)}</div>
					</div>
				</div>

				<!-- Venue Capacity -->
				<schmancy-surface type="containerLow" rounded="all" class="p-5 mt-6">
					<schmancy-typography type="title" token="md" class="mb-2">
						<schmancy-icon class="mr-2">business</schmancy-icon>
						Venue Capacity Utilization
					</schmancy-typography>

					<schmancy-typography type="body" token="sm" class="mb-4">
						${this.venue.maxCourtCapacity
							? `This venue can accommodate up to ${this.venue.maxCourtCapacity} courts. Currently at ${utilizationMetrics.capacityUtilization}% capacity.`
							: 'Capacity data not available for this venue.'}
					</schmancy-typography>

					${this.venue.maxCourtCapacity
						? html`
								<div class="capacity-meter">
									<div class="capacity-fill" style="width: ${utilizationMetrics.capacityUtilization}%;"></div>
								</div>

								<div class="capacity-labels">
									<div>0</div>
									<div>${Math.round(this.venue.maxCourtCapacity / 4)}</div>
									<div>${Math.round(this.venue.maxCourtCapacity / 2)}</div>
									<div>${Math.round((this.venue.maxCourtCapacity * 3) / 4)}</div>
									<div>${this.venue.maxCourtCapacity}</div>
								</div>
						  `
						: ''}
				</schmancy-surface>

				<!-- Revenue Distribution Chart -->
				<div class="chart-card">
					<schmancy-typography type="title" token="md" class="mb-2">
						<schmancy-icon class="mr-2">bar_chart</schmancy-icon>
						Rate Distribution
					</schmancy-typography>

					<schmancy-typography type="body" token="sm" class="mb-4">
						Distribution of courts by hourly rate pricing.
					</schmancy-typography>

					<div class="revenue-distribution">
						${Object.entries(revenueMetrics.rateDistribution).map(
							([_label, data]) => html`
								<div
									class="revenue-bar"
									style="width: ${data.percentage}%; background-color: ${data.color};"
									title="${data.count} courts (${data.percentage.toFixed(1)}%)"
								></div>
							`,
						)}
					</div>

					<div class="revenue-legend">
						${Object.entries(revenueMetrics.rateDistribution)
							.filter(([_, data]) => data.count > 0)
							.map(
								([label, data]) => html`
									<div class="legend-item">
										<div class="legend-color" style="background-color: ${data.color};"></div>
										<div>${label}: ${data.count} court${data.count !== 1 ? 's' : ''}</div>
									</div>
								`,
							)}
					</div>
				</div>

				<!-- Business Insights -->
				${insights.length > 0
					? html`
							<div class="mt-6">
								<schmancy-typography type="title" token="md" class="mb-2">
									<schmancy-icon class="mr-2">lightbulb</schmancy-icon>
									Business Insights
								</schmancy-typography>

								${insights.map(
									insight => html`
										<div class="insights-card mb-2">
											<div class="insights-title">Recommendation</div>
											<schmancy-typography type="body">${insight}</schmancy-typography>
										</div>
									`,
								)}
							</div>
					  `
					: ''}

				<!-- Court Type Distribution -->
				<schmancy-surface type="containerLow" rounded="all" class="p-5 mt-6">
					<schmancy-typography type="title" token="md" class="mb-4">
						<schmancy-icon class="mr-2">pie_chart</schmancy-icon>
						Court Type Distribution
					</schmancy-typography>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<!-- Court Types -->
						<div>
							<schmancy-typography type="title" token="sm" class="mb-2">By Court Type</schmancy-typography>
							${Object.keys(distribution.courtsByType).length === 0
								? html`
										<schmancy-typography type="body" class="text-surface-on-variant italic">
											No court type data available
										</schmancy-typography>
								  `
								: html`
										<div class="mt-2">
											${Object.entries(distribution.courtsByType).map(
												([type, count]) => html`
													<div class="flex justify-between items-center mb-2">
														<div>${formatEnum(type)}</div>
														<schmancy-chip variant="tonal">${count} court${count !== 1 ? 's' : ''}</schmancy-chip>
													</div>
												`,
											)}
										</div>
								  `}
						</div>

						<!-- Sport Types -->
						<div>
							<schmancy-typography type="title" token="sm" class="mb-2">By Sport Type</schmancy-typography>
							${Object.keys(distribution.courtsBySport).length === 0
								? html`
										<schmancy-typography type="body" class="text-surface-on-variant italic">
											No sport type data available
										</schmancy-typography>
								  `
								: html`
										<div class="mt-2">
											${Object.entries(distribution.courtsBySport).map(
												([sport, count]) => html`
													<div class="flex justify-between items-center mb-2">
														<div>${formatEnum(sport)}</div>
														<schmancy-chip variant="tonal">${count} court${count !== 1 ? 's' : ''}</schmancy-chip>
													</div>
												`,
											)}
										</div>
								  `}
						</div>
					</div>
				</schmancy-surface>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'venue-analytics': VenueAnalytics
	}
}
