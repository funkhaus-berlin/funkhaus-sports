import { fullHeight, select, sheet } from '@mhmo91/schmancy'
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
import { Booking } from 'src/types/booking/models'
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
  }
  
  private async startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })
      
      this.videoElement.srcObject = stream
      await this.videoElement.play()
      
      this.startScanning()
      this.scannerStatus = 'scanning'
      this.statusMessage = 'Point camera at QR code'
      
    } catch (error) {
      console.error('Camera error:', error)
      this.cameraError = true
      this.scannerStatus = 'error'
      this.statusMessage = 'Camera access denied'
    }
  }
  
  private startScanning() {
    this.qrScanSubscription?.unsubscribe()
    
    this.qrScanSubscription = animationFrames().pipe(
      filter(() => this.scannerStatus === 'scanning'),
      map(() => this.scanFrame()),
      filter(code => code !== null),
      throttleTime(2000, undefined, { leading: true, trailing: false }),
      tap(code => this.processQRCode(code!))
    ).subscribe()
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
      inversionAttempts: 'dontInvert'
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
    
    BookingsDB.get(bookingId).pipe(
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
      })
    ).subscribe()
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
      component: detailsSheet
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
        <schmancy-flex ${fullHeight()} justify="center" align="center" class="p-8">
          <schmancy-surface type="error" rounded="all" class="p-8 max-w-md">
            <schmancy-grid gap="lg" align="center">
              <schmancy-icon size="64px">lock</schmancy-icon>
              <schmancy-typography type="headline" align="center">
                Access Denied
              </schmancy-typography>
              <schmancy-typography type="body" align="center">
                You don't have permission to use the scanner for this venue.
              </schmancy-typography>
            </schmancy-grid>
          </schmancy-surface>
        </schmancy-flex>
      `
    }
    
    // Camera error view
    if (this.cameraError) {
      return html`
        <schmancy-flex ${fullHeight()} justify="center" align="center" class="p-8">
          <schmancy-surface type="surface" rounded="all" class="p-8 max-w-md">
            <schmancy-grid gap="lg" align="center">
              <schmancy-icon size="64px">videocam_off</schmancy-icon>
              <schmancy-typography type="headline" align="center">
                Camera Not Available
              </schmancy-typography>
              <schmancy-typography type="body" align="center">
                Please allow camera access to scan QR codes.
              </schmancy-typography>
              <schmancy-button variant="filled" @click=${() => window.location.reload()}>
                <schmancy-icon>refresh</schmancy-icon>
                Try Again
              </schmancy-button>
            </schmancy-grid>
          </schmancy-surface>
        </schmancy-flex>
      `
    }
    
    // Main scanner view
    return html`
      <div class="relative w-full h-screen overflow-hidden bg-black touch-none select-none">
        <video 
          id="video" 
          playsinline 
          autoplay 
          muted
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full object-cover touch-none"
        ></video>
        
        <!-- Scanning overlay with gradient -->
        <div class="absolute inset-0 pointer-events-none bg-gradient-radial from-transparent via-transparent to-black/60"></div>
        
        ${when(this.scannerStatus === 'scanning', () => html`
          <!-- Scanning frame with Tailwind animation -->
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(80vw,300px)] h-[min(80vw,300px)] border-[3px] border-primary-default rounded-3xl opacity-80 animate-pulse"></div>
        `)}
      </div>
      
      <!-- Status bar -->
      <schmancy-surface type="surfaceContainer" class="fixed bottom-0 left-0 right-0 p-4 z-10">
        <schmancy-flex justify="between" align="center">
          <schmancy-grid gap="xs">
            <schmancy-typography type="label" token="sm" class="text-onSurfaceVariant-default">
              ${this.venue?.name || 'Scanner'}
            </schmancy-typography>
            <schmancy-typography type="body" token="md">
              ${this.statusMessage}
            </schmancy-typography>
          </schmancy-grid>
          ${when(this.scannerStatus === 'processing', () => html`
            <schmancy-progress-circular size="24"></schmancy-progress-circular>
          `)}
        </schmancy-flex>
      </schmancy-surface>
      
      <!-- Result splash -->
      <schmancy-surface 
        class="fixed inset-0 flex justify-center items-center transition-all duration-300 z-[100]
          ${this.showResult ? 'opacity-100 visible' : 'opacity-0 invisible' } ${this.resultType === 'success' ? 'bg-success-container text-success-on' : 
               this.resultType === 'warning' ? 'bg-tertiary-container text-tertiary-on' : 
               'bg-error-container text-error-on'}">
        <schmancy-card class="p-8 m-4 max-w-md">
          <schmancy-grid gap="lg" align="center">
            <schmancy-icon size="64px" class="${this.resultType === 'success' ? 'text-success-on' : 
                this.resultType === 'warning' ? 'text-warning-on' : 
                'text-error-on'}">
              ${this.resultType === 'success' ? 'check_circle' : 
                this.resultType === 'warning' ? 'warning' : 'error'}
            </schmancy-icon>
            <schmancy-typography type="headline" align="center">
              ${this.resultMessage}
            </schmancy-typography>
            ${when(this.resultDetails, () => html`
              <schmancy-typography type="body" align="center" class="text-onSurfaceVariant-default">
                ${this.resultDetails}
              </schmancy-typography>
            `)}
          </schmancy-grid>
        </schmancy-card>
      </schmancy-surface>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'booking-scanner': BookingScanner
  }
}
