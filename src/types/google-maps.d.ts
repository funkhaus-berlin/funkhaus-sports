// Shared Google Maps type definitions
declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (element: HTMLElement, options: any) => any
        Marker: new (options: any) => any
        LatLng: new (lat: number, lng: number) => any
        LatLngBounds: new (sw?: any, ne?: any) => any
        Geocoder: new () => any
        OverlayView: new () => any
        Animation: {
          DROP: any
        }
        MapTypeId: {
          ROADMAP: any
          SATELLITE: any
          HYBRID: any
          TERRAIN: any
        }
        MapTypeControlStyle: {
          DEFAULT: any
          HORIZONTAL_BAR: any
          DROPDOWN_MENU: any
        }
        ControlPosition: {
          TOP_LEFT: any
          TOP_CENTER: any
          TOP_RIGHT: any
          LEFT_CENTER: any
          RIGHT_CENTER: any
          BOTTOM_LEFT: any
          BOTTOM_CENTER: any
          BOTTOM_RIGHT: any
        }
        SymbolPath: {
          CIRCLE: any
        }
        event: {
          addListener: (instance: any, eventName: string, handler: () => void) => any
          removeListener: (listener: any) => void
          trigger: (instance: any, eventName: string) => void
        }
      }
    }
    initMap?: () => void
    initCourtMap?: () => void
  }
}

export {}