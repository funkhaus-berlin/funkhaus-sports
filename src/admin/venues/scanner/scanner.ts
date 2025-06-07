import { select, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import jsQR from 'jsqr'
import { css, html } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { animationFrames, of, Subscription, timer } from 'rxjs'
import { catchError, filter, finalize, map, tap, throttleTime, timeout } from 'rxjs/operators'
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
	
	@keyframes splash-in {
		0% {
			transform: scale(0) rotate(0deg);
			opacity: 0;
		}
		50% {
			transform: scale(1.5) rotate(180deg);
			opacity: 1;
		}
		100% {
			transform: scale(1) rotate(360deg);
			opacity: 0.8;
		}
	}
	
	.splash-animation {
		animation: splash-in 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
	}
`) {
	@property({ type: String }) venueId = ''

	@state() private scannerStatus: 'idle' | 'scanning' | 'processing' | 'success' | 'error' = 'idle'
	@state() private statusMessage = 'Initializing scanner...'
	@state() private hasPermission = false
	@state() private cameraError = false
	@state() private showResult = false
	@state() private resultType: 'success' | 'warning' | 'error' = 'success'
	@state() private resultMessage = ''
	@state() private resultDetails = ''
	@state() private permissionState: PermissionState = 'prompt'
	@state() private showSplash = false
	@state() private splashColor = ''

	@query('#video')
	private videoElement!: HTMLVideoElement

	@select(venueContext)
	venue!: Partial<Venue>

	private qrScanSubscription?: Subscription
	private audioContext?: AudioContext

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

		// Initialize audio context for feedback sounds
		this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

		this.statusMessage = 'Ready to scan'
		this.scannerStatus = 'scanning'
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
					
					// Listen for permission changes
					permissionStatus.addEventListener('change', () => {
						console.log('Camera permission changed to:', permissionStatus.state)
						this.permissionState = permissionStatus.state
						if (permissionStatus.state === 'granted') {
							// Automatically retry if permission is granted
							this.retryCamera()
						}
					})
					
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
		this.qrScanSubscription?.unsubscribe()

		this.qrScanSubscription = animationFrames()
			.pipe(
				filter(() => this.scannerStatus === 'scanning'),
				map(() => this.scanFrame()),
				filter(code => code !== null),
				throttleTime(2000, undefined, { leading: true, trailing: false }),
				tap(code => this.processQRCode(code!)),
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

	private processQRCode(qrData: string) {
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

		if (!this.isValidBookingId(bookingId)) {
			this.showError('Invalid QR code format')
			return
		}

		this.scannerStatus = 'processing'
		this.statusMessage = 'Verifying booking...'
		console.log('Fetching booking from DB with ID:', bookingId)

		BookingsDB.get(bookingId)
			.pipe(
				timeout(5000),
				tap(booking => {
					if (!booking) {
						throw new Error('Booking not found')
					}
					this.validateAndProcessBooking(booking)
				}),
				catchError(error => {
					this.showError(error.message || 'Failed to retrieve booking')
					return of(null)
				}),
				finalize(() => {
					// Reset to scanning after delay
					timer(3000).subscribe(() => {
						if (this.scannerStatus !== 'error') {
							this.resetScanner()
						}
					})
				}),
			)
			.subscribe()
	}

	private validateAndProcessBooking(booking: Booking) {
		// Venue validation
		if (booking.venueId !== this.venueId) {
			this.showError('Booking is for a different venue')
			return
		}

		// Status validation
		if (['cancelled', 'refunded', 'no-show'].includes(booking.status)) {
			this.showError(`Booking is ${booking.status}`)
			return
		}

		// Already checked in
		if (booking.status === 'completed') {
			this.showWarning('Already checked in', `Checked in ${dayjs(booking.updatedAt).fromNow()}`)
			this.playFeedback('warning')
		} else {
			// Valid for check-in
			this.showSuccess('Valid booking', booking.userName || 'Guest')
			this.playFeedback('success')
			// Trigger success splash
			this.triggerSplash('success')
		}

		// Show booking details after a brief delay
		timer(1000).subscribe(() => {
			this.showBookingDetails(booking)
		})
	}

	private showBookingDetails(booking: Booking) {
		const detailsSheet = document.createElement('booking-details-sheet') as any
		detailsSheet.booking = booking

		sheet.open({
			component: detailsSheet,
      header:'hidden'
		})
	}

	private showSuccess(message: string, details: string) {
		this.resultType = 'success'
		this.resultMessage = message
		this.resultDetails = details
		this.showResult = true
		this.scannerStatus = 'success'
	}

	private showWarning(message: string, details: string) {
		this.resultType = 'warning'
		this.resultMessage = message
		this.resultDetails = details
		this.showResult = true
		this.scannerStatus = 'success'
	}

	private showError(message: string) {
		this.resultType = 'error'
		this.resultMessage = message
		this.resultDetails = ''
		this.showResult = true
		this.scannerStatus = 'error'
		this.playFeedback('error')

		// Trigger color splash for errors
		this.triggerSplash('error')

		// Auto-reset after showing error
		timer(3000).subscribe(() => {
			this.resetScanner()
		})
	}

	private resetScanner() {
		this.showResult = false
		this.scannerStatus = 'scanning'
		this.statusMessage = 'Point camera at QR code'
	}

	private playFeedback(type: 'success' | 'warning' | 'error') {
		if (!this.audioContext) return

		const oscillator = this.audioContext.createOscillator()
		const gainNode = this.audioContext.createGain()

		oscillator.connect(gainNode)
		gainNode.connect(this.audioContext.destination)

		// Different tones for different results
		switch (type) {
			case 'success':
				oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime) // A5
				break
			case 'warning':
				oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime) // E5
				break
			case 'error':
				oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime) // A4
				break
		}

		gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime)
		gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3)

		oscillator.start()
		oscillator.stop(this.audioContext.currentTime + 0.3)
	}

	private isValidBookingId(id: string): boolean {
		return !!id && id.trim().length > 0 && !id.includes('/')
	}

	private async retryCamera() {
		// Reset camera error state
		this.cameraError = false
		this.statusMessage = 'Initializing scanner...'
		
		// Try to start camera again
		await this.startCamera()
	}

	private triggerSplash(type: 'success' | 'error') {
		// Set splash color based on type
		this.splashColor = type === 'error' ? 'bg-error-default' : 'bg-primary-default'
		this.showSplash = true
		
		// Hide splash after animation
		timer(800).subscribe(() => {
			this.showSplash = false
		})
	}

	disconnectedCallback() {
		super.disconnectedCallback()

		// Clean up camera
		const stream = this.videoElement?.srcObject as MediaStream
		if (stream) {
			stream.getTracks().forEach(track => track.stop())
		}

		// Clean up subscriptions
		this.qrScanSubscription?.unsubscribe()

		// Close audio context
		this.audioContext?.close()
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
			<div class="fixed w-full h-screen overflow-hidden bg-black touch-none select-none">
				<video
					id="video"
					playsinline
					autoplay
					muted
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full object-cover touch-none"
				></video>

				<!-- Scanning overlay with gradient -->
				<div
					class="absolute inset-0 pointer-events-none bg-gradient-radial from-transparent via-transparent to-black/60"
				></div>

				<!-- Color splash effect -->
				${when(
					this.showSplash,
					() => html`
						<div class="absolute inset-0 pointer-events-none splash-animation">
							<div class="absolute inset-0 ${this.splashColor} opacity-70"></div>
							<div class="absolute inset-0 ${this.splashColor} opacity-50 blur-3xl scale-110"></div>
							<div class="absolute inset-0 bg-gradient-radial from-white/20 via-transparent to-transparent"></div>
						</div>
					`
				)}

			</div>

			<!-- Status bar -->
			<div class="fixed bottom-0 left-0 right-0 z-10 backdrop-blur-xl bg-blend-color-burn bg-gradient-to-br bg-primary-default/50 text-primary-on">
				<div class="  rounded-2xl p-4">
					<schmancy-flex justify="between" align="center">
						<schmancy-grid gap="xs">
							<schmancy-typography type="display"  class="text-onSurfaceVariant-default">
								${this.venue?.name || 'Scanner'}
							</schmancy-typography>
							<schmancy-typography type="body" token="md"> ${this.statusMessage} </schmancy-typography>
						</schmancy-grid>
						${when(
							this.scannerStatus === 'processing',
							() => html` <schmancy-circular-progress size="24"></schmancy-circular-progress> `,
						)}
					</schmancy-flex>
				</div>
			</div>

			<!-- Result splash -->
			<div
				class="fixed inset-0 flex justify-center items-center transition-all duration-300 z-[100] ${this.showResult ? 'opacity-100 visible' : 'opacity-0 invisible'}"
			>
				<div class=" backdrop-blur-md rounded-3xl p-8 m-4 max-w-md w-full">
					<schmancy-grid gap="lg" align="center">
						<schmancy-icon size="64px" class="text-onSurface-default">
							${this.resultType === 'success' ? 'check_circle' : this.resultType === 'warning' ? 'warning' : 'error'}
						</schmancy-icon>
						<schmancy-typography type="headline" align="center"> ${this.resultMessage} </schmancy-typography>
						${when(
							this.resultDetails,
							() => html`
								<schmancy-typography type="body" align="center" class="text-onSurfaceVariant-default">
									${this.resultDetails}
								</schmancy-typography>
							`,
						)}
					</schmancy-grid>
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-scanner': BookingScanner
	}
}
