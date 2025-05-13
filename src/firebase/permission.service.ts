import { UserRole, userContext } from 'src/user.context'
import { filter, map } from 'rxjs/operators'
import { auth } from './firebase'
import { BehaviorSubject, Observable } from 'rxjs'

/**
 * Helper service for user permissions and access control
 */
export class PermissionService {
  /** Current user's claims as a BehaviorSubject */
  private static userClaims$ = new BehaviorSubject<Record<string, any>>({});
  
  /**
   * Initialize the user claims when authentication state changes
   */
  static init(): void {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Get the current claims
        const tokenResult = await user.getIdTokenResult();
        this.userClaims$.next(tokenResult.claims);
      } else {
        this.userClaims$.next({});
      }
    });
  }

  /**
   * Get user's global role
   */
  static get role$(): Observable<UserRole> {
    return this.userClaims$.pipe(
      map(claims => claims.role as UserRole || 'staff')
    );
  }

  /**
   * Check if user is a super admin
   */
  static get isSuperAdmin$(): Observable<boolean> {
    return this.userClaims$.pipe(
      map(claims => claims.role === 'super_admin')
    );
  }

  /**
   * Check if user has admin privileges (for backward compatibility)
   */
  static get isAdmin$(): Observable<boolean> {
    return this.userClaims$.pipe(
      map(claims => Boolean(claims.admin) || claims.role === 'super_admin')
    );
  }

  /**
   * Check if user has access to a specific venue
   * @param venueId The venue ID to check
   * @param requiredRole The minimum role required (or any role if not specified)
   */
  static hasVenueAccess$(venueId: string, requiredRole?: UserRole): Observable<boolean> {
    return this.userClaims$.pipe(
      map(claims => {
        // Super admins have access to all venues
        if (claims.role === 'super_admin') return true;
        
        // Check venue-specific access in claims
        // First check if we have new venueAccess format
        if (claims.venueAccess && Array.isArray(claims.venueAccess)) {
          const venueAccess = claims.venueAccess.find((access: any) => access.venueId === venueId);
          if (venueAccess) {
            return !requiredRole || this.hasRequiredRoleLevel(venueAccess.role as UserRole, requiredRole);
          }
        }
        
        // Fallback to legacy format for backward compatibility
        const venueRoles = claims.venues || {};
        const userVenueRole = venueRoles[venueId];
        
        if (!userVenueRole) return false;
        
        // If no specific role is required, any access to the venue is sufficient
        if (!requiredRole) return true;
        
        // Check if user has the required role or higher
        return this.hasRequiredRoleLevel(userVenueRole, requiredRole);
      })
    );
  }
  
  /**
   * Check if user has a specific role or higher in the venue access list from context
   * This is useful for checking permissions in components that already have the user context
   * @param venueId The venue ID to check
   * @param requiredRole The minimum role required
   */
  static hasVenueRole(venueId: string, requiredRole: UserRole): boolean {
    const user = userContext.value;
    
    // Super admins have access to all venues
    if (user.role === 'super_admin') return true;
    
    // Find venue access entry
    const venueAccess = user.venueAccess?.find(access => access.venueId === venueId);
    if (!venueAccess) return false;
    
    return this.hasRequiredRoleLevel(venueAccess.role, requiredRole);
  }
  
  /**
   * Determine if a role meets the minimum required level
   * @param userRole The user's role
   * @param requiredRole The minimum required role
   */
  private static hasRequiredRoleLevel(userRole: UserRole, requiredRole: UserRole): boolean {
    const roleHierarchy: Record<UserRole, number> = {
      'super_admin': 4,
      'venue_owner': 3,
      'venue_manager': 2,
      'staff': 1
    };
    
    return (roleHierarchy[userRole] || 0) >= (roleHierarchy[requiredRole] || 0);
  }
}

// Initialize the permission service
PermissionService.init();
