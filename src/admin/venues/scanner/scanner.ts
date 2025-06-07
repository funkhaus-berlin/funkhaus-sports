import { $notify, select, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import jsQR from 'jsqr'
import { css, html, nothing } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { animationFrames, fromEvent, of, Subject, timer } from 'rxjs'
import { catchError, filter, map, switchMap, takeUntil, tap, throttleTime, timeout } from 'rxjs/operators'
import { BookingsDB } from 'src/db/bookings.collection'
import { Venue } from 'src/db/venue-collection'
import { PermissionService } from 'src/firebase/permission.service'
import { Booking } from 'src/types/booking/booking.types'
import { userContext } from 'src/user.context'
import { venueContext } from '../venue-context'
import './booking-details-sheet'

// Initialize dayjs plugins
dayjs.extend(relativeTime)

/**
 * QR code scanner component for booking check-in
 */
@customElement('booking-scanner')
export default class BookingScanner extends $LitElement(css`
	:host {
		display: block;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		overflow: hidden;
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
	}
	
	/* Fullscreen video preview */
	video {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		object-fit: cover;
		z-index: 1;
	}
	
	.splash {
		position: fixed;
		inset: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		opacity: 0;
		visibility: hidden;
		transition: opacity 0.5s ease-in-out, visibility 0s 0.5s;
		z-index: 9999;
	}
	
	.splash.show {
		opacity: 1;
		visibility: visible;
		transition: opacity 0.5s ease-in-out;
	}
	
	.splash.green {
		background: radial-gradient(circle, rgba(0, 255, 0, 0.5) 20%, rgba(0, 128, 0, 0.7) 100%);
	}
	
	.splash.yellow {
		background: radial-gradient(circle, rgba(255, 255, 0, 0.5) 20%, rgba(128, 128, 0, 0.7) 100%);
	}
	
	.splash.red {
		background: radial-gradient(circle, rgba(255, 0, 0, 0.5) 20%, rgba(128, 0, 0, 0.7) 100%);
	}
	
	.status-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 10;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	}
`) {
	@property({ type: String }) venueId = ''

	@state()  scannerStatus: 'idle' | 'scanning' | 'processing' | 'success' | 'error' = 'idle'
	@state() private statusMessage = 'Initializing scanner...'
	@state() private hasPermission = false
	@state() private cameraError = false
	@state() private permissionState: PermissionState = 'prompt'
	@state() private showSplash = false
	@state() private splashColor = 'green'
	@state() private validBooking = false
	@state() private bookingInfo?: Booking
	@state() private checkedIn = false
	@state() private reason?: string
	@state() private isReadyToScan = true
	@state() private isBusy = false

	@query('#video')
	private videoElement!: HTMLVideoElement

	@select(venueContext)
	venue!: Partial<Venue>

	private destroyed$ = new Subject<void>()
	private mediaStream?: MediaStream

	connectedCallback() {
		super.connectedCallback()

		this.initializeScanner()
	}

	private async initializeScanner() {
		// Determine venue ID from various sources
		this.venueId = this.getVenueId()

		if (!this.venueId) {
			this.statusMessage = 'No venue selected'
			this.scannerStatus = 'error'
			return
		}

		// Check permissions - super admins have access to all venues
		const user = userContext.value
		if (user.role === 'super_admin') {
			this.hasPermission = true
		} else {
			// For non-super admin users, check venue-specific permissions
			this.hasPermission = PermissionService.hasVenueRole(this.venueId, 'staff')
		}

		if (!this.hasPermission) {
			this.statusMessage = 'Access denied'
			this.scannerStatus = 'error'
			return
		}

		this.statusMessage = 'Ready to scan'
		this.scannerStatus = 'scanning'
		this.isReadyToScan = true
	}

	private getVenueId(): string {
		// Priority order for venue ID sources
		if (this.venueId) return this.venueId
		if (this.venue?.id) return this.venue.id

		const urlParams = new URLSearchParams(window.location.search)
		const urlVenueId = urlParams.get('venueId') || urlParams.get('v')
		if (urlVenueId) return urlVenueId

		const storedVenueId = localStorage.getItem('selectedVenue')
		if (storedVenueId) return storedVenueId

		return ''
	}

	async firstUpdated() {
		if (this.hasPermission && !this.cameraError) {
			await this.startCamera()
		}
		this.dispatchEvent(new CustomEvent('fullscreen', { bubbles: true, composed: true, detail: true }))

	}

	private async startCamera() {
		try {
			// Check if Permissions API is available
			if ('permissions' in navigator) {
				try {
					const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName })
					console.log('Camera permission status:', permissionStatus.state)
					
					// Update permission state
					this.permissionState = permissionStatus.state
					
					// Listen for permission changes using RxJS to ensure cleanup
					fromEvent(permissionStatus, 'change').pipe(
						takeUntil(this.destroyed$),
						tap(() => {
							console.log('Camera permission changed to:', permissionStatus.state)
							this.permissionState = permissionStatus.state
							if (permissionStatus.state === 'granted') {
								// Automatically retry if permission is granted
								this.retryCamera()
							}
						})
					).subscribe()
					
					// If denied, show appropriate message
					if (permissionStatus.state === 'denied') {
						throw new DOMException('Camera permission denied', 'NotAllowedError')
					}
				} catch (err) {
					// Permissions API might not support 'camera' query in some browsers
					console.log('Permissions API not fully supported:', err)
				}
			}
			
			// Request camera access
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: 'environment',
					width: { ideal: 1280 },
					height: { ideal: 720 },
				},
			})

			// Store stream reference for cleanup
			this.mediaStream = stream
			this.videoElement.srcObject = stream
			await this.videoElement.play()

			this.startScanning()
			this.scannerStatus = 'scanning'
			this.statusMessage = 'Point camera at QR code'
			this.cameraError = false
		} catch (error: any) {
			console.error('Camera error:', error)
			this.cameraError = true
			this.scannerStatus = 'error'
			
			// Provide Safari-specific guidance for localhost
			if (error.name === 'NotAllowedError' && window.location.hostname === 'localhost') {
				// Check if it's Safari
				const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
				
				if (isSafari) {
					this.statusMessage = 'Camera blocked on Safari localhost'
				} else {
					this.statusMessage = 'Camera access denied'
				}
			} else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
				this.statusMessage = 'No camera found'
			} else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
				this.statusMessage = 'Camera is already in use'
			} else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
				this.statusMessage = 'Camera settings not supported'
			} else if (error.name === 'TypeError') {
				this.statusMessage = 'Camera API not supported'
			} else {
				this.statusMessage = 'Camera access denied'
			}
		}
	}

	private startScanning() {
		// Use RxJS pipeline with proper cleanup
		animationFrames()
			.pipe(
				takeUntil(this.destroyed$),
				filter(() => this.isReadyToScan && !this.isBusy),
				map(() => this.scanFrame()),
				filter(code => code !== null),
				throttleTime(1500, undefined, { leading: true, trailing: false }),
				switchMap(code => this.processQRCodeRx(code!))
			)
			.subscribe()
	}

	private scanFrame(): string | null {
		if (!this.videoElement || this.videoElement.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
			return null
		}

		const canvas = document.createElement('canvas')
		canvas.width = this.videoElement.videoWidth
		canvas.height = this.videoElement.videoHeight

		const ctx = canvas.getContext('2d')
		if (!ctx) return null

		ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height)
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

		const code = jsQR(imageData.data, imageData.width, imageData.height, {
			inversionAttempts: 'dontInvert',
		})

		return code?.data || null
	}

	private processQRCodeRx(qrData: string) {
		console.log('QR Code scanned:', qrData)

		// Parse the QR code data
		let bookingId: string

		try {
			// Try to parse as JSON first (new format)
			const parsed = JSON.parse(qrData)
			bookingId = parsed.id
			console.log('Parsed booking ID from JSON:', bookingId)

			if (!bookingId) {
				throw new Error('No booking ID in QR code')
			}
		} catch (e) {
			// Fallback: assume the QR code contains just the booking ID (old format)
			bookingId = qrData
			console.log('Using raw QR data as booking ID:', bookingId)
		}

		// Validate QR code format
		if (!this.isValidBookingId(bookingId)) {
			console.error('Invalid QR code format:', bookingId)
			this.validBooking = false
			this.splashColor = 'red'
			this.reason = 'Invalid QR Code format'
			this.showSplash = true
			return timer(750).pipe(
				takeUntil(this.destroyed$),
				tap(() => {
					this.showSplash = false
					this.isReadyToScan = true
					this.isBusy = false
				})
			)
		}

		// Block further scans until processing is complete
		this.isReadyToScan = false
		this.isBusy = true
		this.statusMessage = 'Verifying booking...'

		return BookingsDB.get(bookingId).pipe(
			timeout(2000),
			tap(booking => {
				this.isBusy = false
				
				if (!booking) {
					this.validBooking = false
					this.splashColor = 'red'
					this.reason = 'Booking not found'
					this.showSplash = true
					return
				}

				// Venue validation
				if (booking.venueId !== this.venueId) {
					this.validBooking = false
					this.splashColor = 'red'
					this.reason = 'Booking is for a different venue'
					this.showSplash = true
					return
				}

				// Status validation
				if (['cancelled', 'refunded', 'no-show'].includes(booking.status)) {
					this.validBooking = false
					this.splashColor = 'red'
					this.reason = `Booking is ${booking.status}`
					this.showSplash = true
					return
				}

				// Already checked in
				if (booking.status === 'completed') {
					this.validBooking = true
					this.checkedIn = true
					this.bookingInfo = booking
					this.splashColor = 'yellow'
					this.reason = `Already checked in ${dayjs(booking.updatedAt).fromNow()}`
					this.showSplash = true
				} else {
					// Valid for check-in
					this.validBooking = true
					this.checkedIn = false
					this.bookingInfo = booking
					this.splashColor = 'green'
					this.showSplash = true
					// Play success sound only (no UI notification)
					this.playSuccessSound()
				}
			}),
			catchError(error => {
				console.error('Error retrieving booking:', error)
				this.validBooking = false
				this.splashColor = 'red'
				this.reason = 'Error fetching booking data'
				this.showSplash = true
				this.isBusy = false
				return of(null)
			}),
			// Reset after showing result
			switchMap(() => timer(this.validBooking ? 1000 : 750).pipe(
				takeUntil(this.destroyed$),
				tap(() => {
					this.showSplash = false
					this.isReadyToScan = true
					// Show booking details for valid bookings
					if (this.validBooking && this.bookingInfo) {
						this.showBookingDetails(this.bookingInfo)
					}
				})
			))
		)
	}


	private showBookingDetails(booking: Booking) {
		const detailsSheet = document.createElement('booking-details-sheet') as any
		detailsSheet.booking = booking

		sheet.open({
			component: detailsSheet,
      header:'hidden'
		})
	}


	private isValidBookingId(id: string): boolean {
		return !!id && id.trim().length > 0 && !id.includes('/')
	}

	private playSuccessSound(): void {
		// Use $notify with empty message and very short duration to play just the sound
		$notify.success('', { duration: 1 })
	}

	private async retryCamera() {
		// Reset camera error state
		this.cameraError = false
		this.statusMessage = 'Initializing scanner...'
		
		// Try to start camera again
		await this.startCamera()
	}


	disconnectedCallback() {
		super.disconnectedCallback()

		// Signal that component is being destroyed
		this.destroyed$.next()
		this.destroyed$.complete()

		// Clean up camera stream
		if (this.mediaStream) {
			this.mediaStream.getTracks().forEach(track => {
				track.stop()
				console.log('Stopped camera track:', track.kind)
			})
			this.mediaStream = undefined
		}

		// Clear video element to release resources
		if (this.videoElement) {
			this.videoElement.srcObject = null
			this.videoElement.load() // Force cleanup
		}

	}

	render() {
		// Permission denied view
		if (!this.hasPermission) {
			return html`
				<div class="fixed inset-0 bg-black/90 flex items-center justify-center p-8">
					<div class=" backdrop-blur-md rounded-3xl p-8 max-w-md">
						<schmancy-grid gap="lg" align="center">
							<schmancy-icon size="64px">lock</schmancy-icon>
							<schmancy-typography type="headline" align="center"> Access Denied </schmancy-typography>
							<schmancy-typography type="body" align="center">
								You don't have permission to use the scanner for this venue.
							</schmancy-typography>
						</schmancy-grid>
					</div>
				</div>
			`
		}

		// Camera error view
		if (this.cameraError) {
			const isSafariLocalhost = this.statusMessage === 'Camera blocked on Safari localhost'
			
			return html`
				<div class="fixed inset-0 bg-black/90 flex items-center justify-center p-8">
					<div class=" backdrop-blur-md rounded-3xl p-8 max-w-md">
						<schmancy-grid gap="lg" align="center">
							<schmancy-icon size="64px">videocam_off</schmancy-icon>
							<schmancy-typography type="headline" align="center"> Camera Not Available </schmancy-typography>
							<schmancy-typography type="body" align="center">
								${isSafariLocalhost
									? 'Safari blocks camera access on localhost by default.'
									: this.statusMessage}
							</schmancy-typography>
							${when(
								this.permissionState === 'denied' && !isSafariLocalhost,
								() => html`
									<schmancy-typography type="body" token="sm" align="center" class="text-onSurfaceVariant-default">
										You have denied camera access. Please enable it in your browser settings.
									</schmancy-typography>
								`
							)}
							${when(
								isSafariLocalhost,
								() => html`
									<schmancy-grid gap="md" class="text-left">
										<schmancy-typography type="body" token="sm">
											To enable camera access:
										</schmancy-typography>
										<ol class="list-decimal list-inside space-y-2">
											<li>
												<schmancy-typography type="body" token="sm">
													Open Safari → Settings → Websites → Camera
												</schmancy-typography>
											</li>
											<li>
												<schmancy-typography type="body" token="sm">
													Find "localhost" and change to "Allow"
												</schmancy-typography>
											</li>
											<li>
												<schmancy-typography type="body" token="sm">
													Reload this page
												</schmancy-typography>
											</li>
										</ol>
									</schmancy-grid>
								`,
								() => html`
									<schmancy-typography type="body" align="center">
										Please allow camera access to scan QR codes.
									</schmancy-typography>
								`
							)}
							<schmancy-button class="mx-auto" variant="filled" @click=${() => this.retryCamera()}>
								<schmancy-icon>refresh</schmancy-icon>
								Try Again
							</schmancy-button>
						</schmancy-grid>
					</div>
				</div>
			`
		}

		// Main scanner view
		return html`
			<!-- Video element for camera preview -->
			<video playsinline muted id="video"></video>

			<!-- Status bar -->
			<div class="status-bar">
				<div class="p-4">
					<schmancy-flex justify="between" align="center">
						<schmancy-grid gap="xs">
							<schmancy-typography type="headline" class="text-white">
								${this.venue?.name || 'Scanner'}
							</schmancy-typography>
							<schmancy-typography type="body" token="md" class="text-white/80"> 
								${this.isBusy ? 'Processing...' : this.statusMessage} 
							</schmancy-typography>
						</schmancy-grid>
						${when(
							this.isBusy,
							() => html` <schmancy-circular-progress size="24" class="text-white"></schmancy-circular-progress> `,
						)}
					</schmancy-flex>
				</div>
			</div>

			<!-- Color splash with result -->
			<div class="overscroll-none overflow-hidden splash ${this.showSplash ? 'show' : ''} ${this.splashColor}">
				${this.validBooking
					? html`
						<schmancy-grid justify="center" align="center" gap="sm">
							<schmancy-typography type="display">
								${this.checkedIn ? 'Already Checked In' : 'Valid Booking'}
							</schmancy-typography>
							<schmancy-typography type="headline">
								${this.bookingInfo?.userName}
							</schmancy-typography>
							${this.checkedIn && this.reason
								? html`<schmancy-typography type="body">${this.reason}</schmancy-typography>`
								: nothing}
						</schmancy-grid>
					`
					: html`
						<schmancy-grid justify="center" align="center" gap="md">
							<schmancy-typography type="display">Invalid Booking</schmancy-typography>
							${when(
								this.reason,
								() => html`<schmancy-typography type="headline">Reason: ${this.reason}</schmancy-typography>`,
							)}
						</schmancy-grid>
					`}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-scanner': BookingScanner
	}
}
