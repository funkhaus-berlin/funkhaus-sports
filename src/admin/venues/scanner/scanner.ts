import { fullHeight, select, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import jsQR from 'jsqr'
import { css, html } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { animationFrames, of, Subscription, timer } from 'rxjs'
import { catchError, filter, finalize, map, throttleTime, timeout } from 'rxjs/operators'
import { BookingsDB } from 'src/db/bookings.collection'
import { Booking } from 'src/types/booking/models'
import { venueContext } from '../venue-context'
import { PermissionService } from 'src/firebase/permission.service'
import './booking-details-sheet'

// Initialize dayjs plugins
dayjs.extend(relativeTime)

// BookingDetailsSheet component moved to separate file

/**
 * Main QR code scanner component for check-in
 */
@customElement('booking-scanner')
export default class BookingScanner extends $LitElement(css`
  :host {
    display: block;
    position: relative;
    overflow: hidden;
  }
  /* Fullscreen video preview with iOS-safe setup */
  video {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    object-fit: cover;
    z-index: -1;
    /* iOS-specific fixes */
    background-color: transparent;
    width: 100% !important;
    max-height: -webkit-fill-available;
    max-height: -moz-available;
    max-height: fill-available;
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
    animation: splashAnimation 1s ease-in-out;
    /* iOS specific fixes */
    height: 100vh;
    height: calc(var(--vh, 1vh) * 100);
    max-height: -webkit-fill-available;
  }
  .splash.show {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.5s ease-in-out;
  }
  /* Add script to handle viewport height on iOS */
  :host {
    --vh: 1vh;
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
  @keyframes splashAnimation {
    0% {
      transform: scale(0.8);
      opacity: 0;
    }
    50% {
      transform: scale(1.1);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 0;
    }
  }
  .status {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    background-color: rgba(0, 0, 0, 0.7);
    color: #fff;
    border-radius: 5px;
    font-size: 1.2em;
    z-index: 2;
  }
`) {
  @property({ type: String }) qrCodeMessage = ''
  @property({ type: String }) venueId = ''

  @state() validBooking = false
  @state() showSplash = false
  @state() splashColor = 'green'
  @state() isReadyToScan = false
  @state() isBusy = false
  @state() bookingInfo: Booking | undefined
  @state() qrCode: string = ''
  @state() reason: string | undefined
  @state() checkedIn = false
  @state() hasPermission = false

  // Query the video element in the template
  @query('#video')
  videoElement!: HTMLVideoElement

  // Subscription for the QR scanning observable – used for cleanup
  private qrScanSubscription?: Subscription

  @select(venueContext)
  venue!: Partial<Venue>

  connectedCallback() {
    super.connectedCallback()
    
    // Primary source: Use the venue ID passed as a property
    if (this.venueId) {
      console.log('Scanner using venue ID from property:', this.venueId)
    } 
    // Secondary source: Check venue context
    else if (this.venue?.id) {
      this.venueId = this.venue.id
      console.log('Scanner using venue ID from context:', this.venueId)
    }
    // Tertiary source: Check URL parameters
    else {
      // First check for v param (old style)
      const urlParams = new URLSearchParams(window.location.search)
      const urlVenueId = urlParams.get('v')
      
      // Then check for venueId param (new style from navigation)
      const urlVenueIdNew = urlParams.get('venueId')
      
      if (urlVenueIdNew) {
        this.venueId = urlVenueIdNew
        console.log('Scanner using venue ID from URL venueId param:', this.venueId)
      } else if (urlVenueId) {
        this.venueId = urlVenueId
        console.log('Scanner using venue ID from URL v param:', this.venueId)
      } else {
        // Last resort: Try localStorage
        const storedVenueId = localStorage.getItem('selectedVenue')
        if (storedVenueId) {
          this.venueId = storedVenueId
          console.log('Scanner using venue ID from localStorage:', this.venueId)
        } else {
          console.warn('Scanner initialized without a venue ID')
        }
      }
    }

    // Save the current venue ID for future reference
    if (this.venueId) {
      localStorage.setItem('selectedVenue', this.venueId)
      
      // Check if user has permission to access this venue
      this.hasPermission = PermissionService.hasVenueRole(this.venueId, 'staff')
      
      if (!this.hasPermission) {
        console.error('User does not have permission to access venue scanner:', this.venueId)
      }
    }

    // Mark the scanner as ready if we have permission
    this.isReadyToScan = this.hasPermission
    
    // Set initial viewport height variable for iOS
    this.setViewportHeight();
    
    // Listen for resize events to update viewport height
    window.addEventListener('resize', this.setViewportHeight.bind(this));
    window.addEventListener('orientationchange', this.setViewportHeight.bind(this));
  }
  
  /**
   * Sets CSS variable for viewport height to work around iOS issues
   */
  private setViewportHeight() {
    // First, get the viewport height and multiply it by 1% to get a value for a vh unit
    const vh = window.innerHeight * 0.01;
    // Set the value in the --vh custom property to the root of the document
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  firstUpdated() {
    // Only start the camera if we have permission
    if (this.hasPermission) {
      this.startCameraScan()
    }
  }

  async startCameraScan() {
    try {
      // Check if running on iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      
      let constraints;
      if (isIOS) {
        // iOS specific constraints with exact facing mode
        constraints = {
          audio: false,
          video: {
            facingMode: {exact: 'environment'},
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 }
          }
        };
      } else {
        // Standard constraints for other platforms
        constraints = {
          video: { facingMode: 'environment' }
        };
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Set srcObject
      this.videoElement.srcObject = stream;
      
      // On iOS, ensure we wait for loadedmetadata event
      if (isIOS) {
        await new Promise<void>((resolve) => {
          this.videoElement.onloadedmetadata = () => {
            resolve();
          };
        });
      }
      
      // Play the video
      await this.videoElement.play();
      
      // Once the camera is playing, start the RxJS-based QR scan
      this.startQrScan();
      
      console.log('Camera started successfully');
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  }

  /**
   * Starts an RxJS observable that continuously scans video frames.
   * It maps each frame to a potential QR code value, filters out invalid,
   * duplicate or unwanted values, and passes new codes to the processing function.
   */
  startQrScan() {
    // Clean up any previous subscription
    this.qrScanSubscription?.unsubscribe()

    this.qrScanSubscription = animationFrames()
      .pipe(
        map(() => {
          // Only scan if we have enough video data
          if (!this.videoElement || this.videoElement.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
            return null
          }
          // Create an offscreen canvas for the current frame
          const canvas = document.createElement('canvas')
          canvas.width = this.videoElement.videoWidth
          canvas.height = this.videoElement.videoHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) return null
          ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

          // Attempt to detect a QR code in the image
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          return code ? code.data : null
        }),
        // Only pass on non-null values when we're ready and not busy processing
        filter(qrCode => qrCode !== null && this.isReadyToScan && !this.isBusy),
        // Throttle to avoid firing too often
        throttleTime(1500, undefined, { leading: true, trailing: false }),
      )
      .subscribe(qrCode => {
        // Process the new QR code
        this.onQrCodeScanned(qrCode!)
      })
  }

  private isValidBookingId(id: string): boolean {
    return !!id && id.trim().length > 0 && !id.includes('/')
  }

  onQrCodeScanned(qrCode: string) {
    console.log('Scanned QR code:', qrCode)
    // Validate that the QR code is acceptable as a Firestore document ID.
    if (!this.isValidBookingId(qrCode)) {
      console.error('Invalid QR code format:', qrCode)
      this.validBooking = false
      this.splashColor = 'red'
      this.reason = 'Invalid QR Code format'
      this.showSplash = true
      // Reset scanning state after a short delay.
      timer(750).subscribe({
        complete: () => {
          this.showSplash = false
          this.isReadyToScan = true
          this.isBusy = false
          this.requestUpdate()
        },
      })
      return // Stop further processing.
    }

    // Block further scans until processing is complete.
    this.isReadyToScan = false
    this.isBusy = true
    this.qrCode = qrCode
    console.log('QR Code scanned from camera:', qrCode)
    this.qrCodeMessage = qrCode

    BookingsDB.get(qrCode)
      .pipe(
        timeout(2000), // Ensure we don't wait forever
        finalize(() => {
          if (!this.isReadyToScan) {
            timer(750).subscribe(() => {
              this.showSplash = false
              this.isReadyToScan = true
              this.isBusy = false
              this.requestUpdate()
            })
          }
        }),
        catchError(() => of(null)),
      )
      .subscribe({
        next: booking => {
          this.isBusy = false

          if (booking) {
            // Always check if booking is for this venue - it's now required
            if (!this.venueId) {
              console.warn('No venue ID available for validation - using less secure validation')
            }
            
            if (this.venueId && booking.venueId !== this.venueId) {
              console.error(`Booking venue mismatch: Booking is for venue ${booking.venueId}, but scanner is for venue ${this.venueId}`)
              this.validBooking = false
              this.splashColor = 'red'
              this.reason = 'Booking is for a different venue'
              this.showSplash = true
              return
            }

            this.bookingInfo = booking
            this.validBooking = true

            // Check booking status
            if (['cancelled', 'refunded', 'no-show'].includes(booking.status)) {
              this.validBooking = false
              this.splashColor = 'red'
              this.reason = `Booking is ${booking.status}`
              this.showSplash = true
            } else if (booking.status === 'completed') {
              this.splashColor = 'yellow'
              this.checkedIn = true
              this.showSplash = true
              
              // Also show booking details for checked-in bookings
              timer(1000).subscribe(() => {
                this.showBookingDetails(booking)
              })
            } else {
              this.splashColor = 'green'
              this.playSuccessSound()
              this.showSplash = true
              
              // Open the booking details sheet
              timer(1000).subscribe(() => {
                this.showBookingDetails(booking)
              })
            }
          } else {
            this.validBooking = false
            this.splashColor = 'red'
            this.reason = 'Booking not found'
            this.showSplash = true
          }
          
          timer(this.validBooking ? 1000 : 750).subscribe(() => {
            this.showSplash = false
            this.isReadyToScan = true
            this.requestUpdate()
          })
        },
        error: error => {
          console.error('Error retrieving booking:', error)
          this.validBooking = false
          this.splashColor = 'red'
          this.reason = 'Error fetching booking data'
          this.showSplash = true
          timer(750).subscribe(() => {
            this.showSplash = false
            this.isReadyToScan = true
            this.isBusy = false
            this.requestUpdate()
          })
        },
      })
  }

  showBookingDetails(booking: Booking) {
    // Create booking details sheet from the external component
    const detailsSheet = document.createElement('booking-details-sheet') as HTMLElement & { booking?: Booking }
    detailsSheet.booking = booking
    
    // Open sheet with full screen on mobile for better visibility
    sheet.open({
      component: detailsSheet,
    })
  }

  /**
   * Plays a success sound.
   */
  playSuccessSound() {
    // Play a beep sound for success
    const context = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, context.currentTime) // A5
    
    const gainNode = context.createGain()
    gainNode.gain.setValueAtTime(0.3, context.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.5)
    
    oscillator.connect(gainNode)
    gainNode.connect(context.destination)
    
    oscillator.start()
    oscillator.stop(context.currentTime + 0.5)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    // Clean up the camera stream when the component is removed
    const stream = this.videoElement?.srcObject as MediaStream
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
    // Unsubscribe from the QR scanning observable to avoid memory leaks.
    this.qrScanSubscription?.unsubscribe()
    
    // Remove event listeners
    window.removeEventListener('resize', this.setViewportHeight.bind(this));
    window.removeEventListener('orientationchange', this.setViewportHeight.bind(this));
  }

  render() {
    // Show permission error if user doesn't have access
    if (!this.hasPermission) {
      return html`
        <schmancy-grid ${fullHeight()} class="py-2 overscroll-none overflow-hidden" justify="center" align="center">
          <schmancy-surface type="container" rounded="all" class="p-8 max-w-md">
            <schmancy-grid gap="lg" justify="center" align="center">
              <schmancy-icon class="text-6xl text-error-default">error_outline</schmancy-icon>
              <schmancy-typography type="headline" class="text-center">
                Permission Denied
              </schmancy-typography>
              <schmancy-typography class="text-center">
                You don't have permission to access the scanner for this venue. 
                Please contact an administrator if you think this is a mistake.
              </schmancy-typography>
            </schmancy-grid>
          </schmancy-surface>
        </schmancy-grid>
      `;
    }
    
    // Normal scanner UI when user has permission
    let statusMessage = 'Ready to Scan'
    if (this.checkedIn) {
      statusMessage = 'Already Checked In'
    }
    
    return html`
      <!-- Video element for camera preview with iOS attributes -->
      <video playsinline autoplay muted id="video" webkit-playsinline></video>

      <schmancy-grid ${fullHeight()} class="py-2 overscroll-none overflow-hidden" justify="center" align="center">
        ${this.isBusy ? html`<div class="status">Processing...</div>` : ''}
        ${this.isReadyToScan
          ? html`<div class="status">${statusMessage}</div>`
          : ''}
      </schmancy-grid>

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
