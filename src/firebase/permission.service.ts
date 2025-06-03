import { UserRole, userContext } from 'src/user.context'

/**
 * Simplified permission service for user access control
 */
export class PermissionService {
  /**
   * Check if user has a specific role or higher in the venue access list
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