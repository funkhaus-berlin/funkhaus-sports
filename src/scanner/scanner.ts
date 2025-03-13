// import { fullHeight, SchmancyAutocompleteChangeEvent } from '@mhmo91/schmancy'
// import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
// import { Timestamp } from 'firebase/firestore'
// import jsQR from 'jsqr'
// import { css, html, nothing } from 'lit'
// import { customElement, property, query, state } from 'lit/decorators.js'
// import { when } from 'lit/directives/when.js'
// import moment from 'moment'
// import { animationFrames, of, Subscription, timer } from 'rxjs'
// import { catchError, filter, finalize, map, throttleTime, timeout } from 'rxjs/operators'
// import { EventsDB } from 'src/app/firebase/events.collection'
// import { TicketsDB } from 'src/app/firebase/tickets.collection'
// import IFunkhausEvent from 'src/types/events.types'
// import { TTicket } from '../../../types/firebase.types'

// @customElement('funkhaus-scanner')
// export default class FunkhausScanner extends $LitElement(css`
// 	:host {
// 		display: block;
// 		position: relative;
// 		overflow: hidden;
// 	}
// 	/* Fullscreen video preview */
// 	video {
// 		position: fixed;
// 		top: 0;
// 		left: 0;
// 		width: 100vw;
// 		height: 100vh;
// 		object-fit: cover;
// 		z-index: -1;
// 	}
// 	.splash {
// 		position: fixed;
// 		inset: 0;
// 		display: flex;
// 		justify-content: center;
// 		align-items: center;
// 		opacity: 0;
// 		visibility: hidden;
// 		transition: opacity 0.5s ease-in-out, visibility 0s 0.5s;
// 		z-index: 9999;
// 		animation: splashAnimation 1s ease-in-out;
// 	}
// 	.splash.show {
// 		opacity: 1;
// 		visibility: visible;
// 		transition: opacity 0.5s ease-in-out;
// 	}
// 	.splash.green {
// 		background: radial-gradient(circle, rgba(0, 255, 0, 0.5) 20%, rgba(0, 128, 0, 0.7) 100%);
// 	}
// 	.splash.yellow {
// 		background: radial-gradient(circle, rgba(255, 255, 0, 0.5) 20%, rgba(128, 128, 0, 0.7) 100%);
// 	}
// 	.splash.red {
// 		background: radial-gradient(circle, rgba(255, 0, 0, 0.5) 20%, rgba(128, 0, 0, 0.7) 100%);
// 	}
// 	@keyframes splashAnimation {
// 		0% {
// 			transform: scale(0.8);
// 			opacity: 0;
// 		}
// 		50% {
// 			transform: scale(1.1);
// 			opacity: 1;
// 		}
// 		100% {
// 			transform: scale(1);
// 			opacity: 0;
// 		}
// 	}
// 	.status {
// 		position: fixed;
// 		bottom: 20px;
// 		left: 50%;
// 		transform: translateX(-50%);
// 		padding: 10px 20px;
// 		background-color: rgba(0, 0, 0, 0.7);
// 		color: #fff;
// 		border-radius: 5px;
// 		font-size: 1.2em;
// 		z-index: 2;
// 	}
// `) {
// 	@property({ type: String }) qrCodeMessage = ''

// 	@state() validTicket = false
// 	@state() showSplash = false
// 	@state() splashColor = 'green'
// 	@state() isReadyToScan = false
// 	@state() isBusy = false
// 	@state() events: Map<string, IFunkhausEvent> = new Map()
// 	@state() selectedEvent: string = localStorage.getItem('selectedEvent') || ''
// 	@state() ticketInfo: (TTicket & IFunkhausEvent) | undefined
// 	@state() qrCode: string = ''
// 	@state() reason: string | undefined

// 	// Query the video element in the template
// 	@query('#video')
// 	videoElement!: HTMLVideoElement

// 	// Subscription for the QR scanning observable – used for cleanup
// 	private qrScanSubscription?: Subscription

// 	connectedCallback() {
// 		super.connectedCallback()

// 		// Check for an event ID in the URL query string
// 		const urlParams = new URLSearchParams(window.location.search)
// 		const eventID = urlParams.get('e')
// 		if (eventID) {
// 			this.selectedEvent = eventID
// 			localStorage.setItem('selectedEvent', eventID)
// 		}

// 		// Mark the scanner as ready
// 		this.isReadyToScan = true

// 		// Load available events from the DB
// 		EventsDB.query([]).subscribe(events => {
// 			console.log('Events:', events)
// 			this.events = events
// 		})
// 	}

// 	firstUpdated() {
// 		// Start the camera once the component is rendered
// 		this.startCameraScan()
// 	}

// 	async startCameraScan() {
// 		try {
// 			const stream = await navigator.mediaDevices.getUserMedia({
// 				video: { facingMode: 'environment' },
// 			})
// 			this.videoElement.srcObject = stream
// 			await this.videoElement.play()
// 			// Once the camera is playing, start the RxJS-based QR scan.
// 			this.startQrScan()
// 		} catch (error) {
// 			console.error('Error accessing camera:', error)
// 		}
// 	}

// 	/**
// 	 * Starts an RxJS observable that continuously scans video frames.
// 	 * It maps each frame to a potential QR code value, filters out invalid,
// 	 * duplicate or unwanted values, and passes new codes to the processing function.
// 	 */
// 	startQrScan() {
// 		// Clean up any previous subscription
// 		this.qrScanSubscription?.unsubscribe()

// 		this.qrScanSubscription = animationFrames()
// 			.pipe(
// 				map(() => {
// 					// Only scan if we have enough video data
// 					if (!this.videoElement || this.videoElement.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
// 						return null
// 					}
// 					// Create an offscreen canvas for the current frame
// 					const canvas = document.createElement('canvas')
// 					canvas.width = this.videoElement.videoWidth
// 					canvas.height = this.videoElement.videoHeight
// 					const ctx = canvas.getContext('2d')
// 					if (!ctx) return null
// 					ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height)
// 					const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

// 					// Attempt to detect a QR code in the image
// 					const code = jsQR(imageData.data, imageData.width, imageData.height)
// 					return code ? code.data : null
// 				}),
// 				// Only pass on non-null values when we're ready and not busy processing
// 				filter(qrCode => qrCode !== null && this.isReadyToScan && !this.isBusy),
// 				// Only process a new code if it is different from the last one
// 				// distinctUntilChanged(),
// 				// Optionally, add a throttle to avoid firing too often (e.g. every 750ms)
// 				throttleTime(1500, undefined, { leading: true, trailing: false }),
// 			)
// 			.subscribe(qrCode => {
// 				// Process the new QR code – note that the non-null assertion is safe here
// 				this.onQrCodeScanned(qrCode!)
// 			})
// 	}

// 	private isValidFirebaseDocId(id: string): boolean {
// 		return !!id && id.trim().length > 0 && !id.includes('/')
// 	}
// 	onQrCodeScanned(qrCode: string) {
// 		console.log('Scanned QR code:', qrCode)
// 		// Validate that the QR code is acceptable as a Firestore document ID.
// 		if (!this.isValidFirebaseDocId(qrCode)) {
// 			console.error('Invalid QR code format:', qrCode)
// 			this.validTicket = false
// 			this.splashColor = 'red'
// 			this.reason = 'Invalid QR Code format'
// 			this.showSplash = true
// 			// Reset scanning state after a short delay.
// 			timer(750).subscribe({
// 				complete: () => {
// 					this.showSplash = false
// 					this.isReadyToScan = true
// 					this.isBusy = false
// 					this.requestUpdate()
// 				},
// 			})
// 			return // Stop further processing.
// 		}

// 		// Block further scans until processing is complete.
// 		this.isReadyToScan = false
// 		this.isBusy = true
// 		this.qrCode = qrCode
// 		console.log('QR Code scanned from camera:', qrCode)
// 		this.qrCodeMessage = qrCode

// 		TicketsDB.get(qrCode)
// 			.pipe(
// 				timeout(2000), // Ensure we don't wait forever
// 				finalize(() => {
// 					if (!this.isReadyToScan) {
// 						timer(750).subscribe(() => {
// 							this.showSplash = false
// 							this.isReadyToScan = true
// 							this.isBusy = false
// 							this.requestUpdate()
// 						})
// 					}
// 				}),
// 				catchError(() => of(null)),
// 			)
// 			.subscribe({
// 				next: ticket => {
// 					this.isBusy = false

// 					if (ticket && ticket.eventID === this.selectedEvent && ticket.status !== 'refunded') {
// 						this.ticketInfo = Object.assign({}, ticket, this.events.get(ticket.eventID))
// 						this.validTicket = true
// 						if (ticket.scanned) {
// 							this.splashColor = 'yellow'
// 						} else {
// 							this.splashColor = 'green'
// 							this.playSuccessSound()
// 							TicketsDB.update(qrCode, {
// 								scanned: new Timestamp(Math.floor(Date.now() / 1000), 0),
// 							}).subscribe()
// 						}
// 					} else {
// 						this.validTicket = false
// 						this.splashColor = 'red'
// 						this.reason = ticket?.status ?? ''
// 					}
// 					this.showSplash = true
// 					timer(this.validTicket ? 1000 : 750).subscribe(() => {
// 						this.showSplash = false
// 						this.isReadyToScan = true
// 						this.requestUpdate()
// 					})
// 					this.requestUpdate()
// 				},
// 				error: error => {
// 					console.error('Error retrieving ticket:', error)
// 					this.validTicket = false
// 					this.splashColor = 'red'
// 					this.reason = 'Error fetching ticket data'
// 					this.showSplash = true
// 					timer(750).subscribe(() => {
// 						this.showSplash = false
// 						this.isReadyToScan = true
// 						this.isBusy = false
// 						this.requestUpdate()
// 					})
// 				},
// 			})
// 	}

// 	/**
// 	 * Plays a cute success sound.
// 	 */
// 	playSuccessSound() {
// 		const audio = new Audio('/success-sound.mp3')
// 		audio.play().catch(error => console.error('Error playing success sound:', error))
// 	}

// 	disconnectedCallback() {
// 		super.disconnectedCallback()
// 		// Clean up the camera stream when the component is removed
// 		const stream = this.videoElement?.srcObject as MediaStream
// 		if (stream) {
// 			stream.getTracks().forEach(track => track.stop())
// 		}
// 		// Unsubscribe from the QR scanning observable to avoid memory leaks.
// 		this.qrScanSubscription?.unsubscribe()
// 	}

// 	render() {
// 		let timeSince = undefined
// 		if (this.ticketInfo?.scanned && this.splashColor === 'yellow') {
// 			const date = new Date(this.ticketInfo.scanned.seconds * 1000)
// 			const now = moment()
// 			const duration = moment.duration(now.diff(date))
// 			timeSince = duration.humanize()
// 		}
// 		return html`
// 			<!-- Video element for camera preview -->
// 			<video playsinline muted id="video"></video>

// 			<schmancy-grid ${fullHeight()} class="py-2 overscroll-none overflow-hidden" justify="center" align="center">
// 				${when(
// 					this.selectedEvent,
// 					() => html`
// 						<schmancy-typography type="headline">
// 							Event: ${this.events.get(this.selectedEvent)?.title}
// 						</schmancy-typography>
// 					`,
// 					() => html`
// 						<schmancy-select
// 							class="w-[300px]"
// 							@change=${(e: SchmancyAutocompleteChangeEvent) => {
// 								console.log('Event selected:', e.detail.value)
// 								this.selectedEvent = e.detail.value as string
// 								localStorage.setItem('selectedEvent', e.detail.value as string)
// 							}}
// 							label="Event"
// 							.value="${this.selectedEvent}"
// 						>
// 							${Array.from(this.events).map(
// 								o => html`
// 									<schmancy-option .value="${o[0]}" label="${o[1].title.concat(o[1].subtitle)}">
// 										${o[1].title.concat(o[1].subtitle)}
// 									</schmancy-option>
// 								`,
// 							)}
// 						</schmancy-select>
// 					`,
// 				)}
// 				${!this.events.get(this.selectedEvent)
// 					? html`<schmancy-typography type="headline">PLEASE SELECT AN EVENT</schmancy-typography>`
// 					: nothing}
// 				${this.isBusy ? html`<div class="status">Processing...</div>` : ''}
// 				${this.isReadyToScan
// 					? html`<div class="status">
// 							${this.selectedEvent
// 								? 'Ready to Scan'
// 								: html`
// 										<div class="flex gap-2">
// 											<span>Please select an event</span>
// 											<span class="relative flex h-3 w-3">
// 												<span
// 													class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"
// 												></span>
// 												<span class="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
// 											</span>
// 										</div>
// 								  `}
// 					  </div>`
// 					: ''}
// 			</schmancy-grid>

// 			<div class="overscroll-none overflow-hidden splash ${this.showSplash ? 'show' : ''} ${this.splashColor}">
// 				${this.validTicket
// 					? html`
// 							<schmancy-grid justify="center" align="center" gap="sm">
// 								<schmancy-typography type="display">Valid Ticket</schmancy-typography>
// 								${this.splashColor === 'yellow'
// 									? html`<schmancy-typography type="display"> Scanned ${timeSince} ago </schmancy-typography>`
// 									: nothing}
// 								<schmancy-typography type="headline"> Event: ${this.ticketInfo?.title} </schmancy-typography>
// 							</schmancy-grid>
// 					  `
// 					: html`
// 							<schmancy-grid justify="center" align="center" gap="md">
// 								<schmancy-typography type="display">Invalid Ticket</schmancy-typography>
// 								${when(
// 									this.reason,
// 									() => html`<schmancy-typography type="headline"> Reason: ${this.reason} </schmancy-typography>`,
// 								)}
// 							</schmancy-grid>
// 					  `}
// 			</div>
// 		`
// 	}
// }

// declare global {
// 	interface HTMLElementTagNameMap {
// 		'funkhaus-scanner': FunkhausScanner
// 	}
// }
