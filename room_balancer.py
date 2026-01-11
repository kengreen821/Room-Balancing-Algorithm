#!/usr/bin/env python3
"""
Room Balancing Algorithm for Embassy Suites Centennial Park
Implements MOD decision-making logic for optimal room assignments
"""

import json
from collections import defaultdict
from typing import List, Dict, Tuple

# Room inventory - 321 total rooms
ROOM_INVENTORY = {
    'KNGN': 94,   # Standard King
    'TDBN': 126,  # Standard 2 Double
    'KSVN': 44,   # Park View King
    'TSVN': 20,   # Park View Double
    'NKSQA': 13,  # King ADA (tub)
    'NKSQB': 2,   # King ADA (roll-in)
    'NDSPXC': 5,  # Premium Corner Double
    'TCSN': 5,    # Conference Suite
    'KEXN': 3,    # Executive King
    'NKSCJ': 2,   # Park View King Corner
    'NKSPK': 2,   # Premium Park View King
    'NKSP': 1,    # Premium King
    'NKSPD': 1,   # Premium King ADA
    'KSLN': 1,    # Centennial Suite
    'KSPN': 1,    # Presidential Suite
    'KOTN': 1     # Governor's Suite
}

# Upgrade paths - same bed type preferred
UPGRADE_PATHS = {
    # King upgrades (same bed type - preferred)
    'KNGN': ['KSVN', 'KEXN', 'NKSP', 'NKSPK', 'NKSCJ'],  # Standard King -> Park View Kings, Premium
    'KSVN': ['KEXN', 'NKSPK', 'NKSCJ', 'NKSP'],          # Park View King -> Premium Kings
    'KEXN': ['NKSPK', 'NKSCJ', 'NKSP'],                  # Executive -> Premium
    
    # Double upgrades (same bed type - preferred) 
    'TDBN': ['TSVN', 'TCSN', 'NDSPXC'],                  # Standard Double -> Park View Double, Conference, Premium Corner
    'TSVN': ['TCSN', 'NDSPXC'],                          # Park View Double -> Conference, Premium Corner
    
    # ADA upgrades (stay within ADA)
    'NKSQA': ['NKSQB', 'NKSPD'],                         # ADA tub -> ADA roll-in or premium ADA
    'NKSQB': ['NKSPD'],                                  # ADA roll-in -> Premium ADA
}

# Cross-category upgrades - LAST RESORT to avoid walking guests
# Used only when same-bed-type upgrades are exhausted
CROSS_CATEGORY_UPGRADES = {
    # Double -> King (when desperate - requires guest approval)
    'TDBN': ['KNGN', 'KSVN', 'KEXN', 'NKSP'],            # Standard Double -> Any King (if guest accepts)
    'TSVN': ['KSVN', 'KEXN', 'NKSP'],                    # Park View Double -> Park View King or better
    'TCSN': ['KEXN', 'NKSP'],                            # Conference Suite -> Premium Kings
    'NDSPXC': ['KSVN', 'KEXN'],                          # Premium Corner Double -> Kings
    
    # King -> Double (less common, but possible to avoid walking)
    'KNGN': ['TDBN', 'TSVN', 'TCSN'],                    # Standard King -> Doubles (if guest prefers)
    'KSVN': ['TSVN', 'TCSN', 'NDSPXC'],                  # Park View King -> Park View Double
    'KEXN': ['TSVN', 'TCSN', 'NDSPXC'],                  # Executive King -> Premium Doubles
    
    # Premium King downgrades (to avoid walking - requires explanation)
    'NKSP': ['KNGN', 'KSVN', 'KEXN'],                    # Premium King -> Standard Kings
    'NKSPK': ['KSVN', 'KEXN', 'KNGN'],                   # Premium Park View King -> Other Kings
    'NKSCJ': ['KSVN', 'KEXN', 'KNGN'],                   # Corner Suite -> Other Kings
    
    # ADA cross-category (when ADA inventory exhausted)
    'NKSQA': ['KNGN', 'KSVN'],                           # ADA King -> Standard Kings (with accessibility notes)
    'NKSQB': ['KNGN', 'KSVN'],                           # ADA Roll-in -> Standard Kings
    'NKSPD': ['NKSP', 'KEXN', 'KSVN'],                   # Premium ADA -> Premium Kings
}

# Named suites - avoid unless necessary
NAMED_SUITES = ['KSPN', 'KOTN', 'KSLN']

# ADA room types
ADA_ROOMS = ['NKSQA', 'NKSQB', 'NKSPD']


class RoomBalancer:
    def __init__(self, reservations: List[Dict], checkin_date: str):
        """Initialize the room balancer with reservations for a specific check-in date."""
        self.checkin_date = checkin_date
        self.reservations = [r for r in reservations if r['checkin_date'] == checkin_date]
        self.available_rooms = ROOM_INVENTORY.copy()
        self.assignments = []
        self.warnings = []
        
    def balance_house(self) -> Tuple[List[Dict], List[str]]:
        """
        Balance the house following MOD priority logic:
        1. ADA needs (legal requirement)
        2. Avoid walking guests (fit everyone)
        3. When overbooked, upgrade Diamond/Gold + 3+ nights first
        4. Connecting rooms (first request priority)
        5. Preferences (high floor, VIP, etc.)
        """
        
        print(f"\n{'='*80}")
        print(f"BALANCING HOUSE FOR {self.checkin_date}")
        print(f"{'='*80}")
        print(f"Total arrivals: {len(self.reservations)}")
        print(f"Total rooms available: {sum(self.available_rooms.values())}")
        
        # Step 1: Analyze booking demand vs. inventory
        self._analyze_demand()
        
        # Step 2: Handle ADA requests first (legal priority)
        self._assign_ada_guests()
        
        # Step 3: Identify overbookings and determine who needs upgrades
        overbookings = self._identify_overbookings()
        
        # Step 4: Assign remaining guests (with upgrades where needed)
        self._assign_remaining_guests(overbookings)
        
        # Step 5: Handle connecting room requests
        self._handle_connecting_rooms()
        
        return self.assignments, self.warnings
    
    def _analyze_demand(self):
        """Analyze booking demand vs. available inventory."""
        demand = defaultdict(int)
        for res in self.reservations:
            demand[res['booked_room_type']] += 1
        
        print(f"\n{'─'*80}")
        print("DEMAND ANALYSIS")
        print(f"{'─'*80}")
        print(f"{'Room Type':<12} {'Booked':<10} {'Available':<12} {'Status':<20}")
        print(f"{'─'*80}")
        
        for room_type in sorted(demand.keys()):
            booked = demand[room_type]
            available = self.available_rooms.get(room_type, 0)
            status = "OK" if booked <= available else f"OVERBOOKED by {booked - available}"
            print(f"{room_type:<12} {booked:<10} {available:<12} {status:<20}")
    
    def _assign_ada_guests(self):
        """Assign ADA guests first - legal requirement."""
        ada_guests = [r for r in self.reservations if 'ADA' in r.get('special_requests', '')]
        
        print(f"\n{'─'*80}")
        print(f"PHASE 1: ADA ASSIGNMENTS (Priority 1)")
        print(f"{'─'*80}")
        print(f"ADA requests: {len(ada_guests)}")
        
        for guest in ada_guests:
            booked_type = guest['booked_room_type']
            
            # If they booked ADA room and it's available, assign it
            if booked_type in ADA_ROOMS and self.available_rooms.get(booked_type, 0) > 0:
                self._assign_room(guest, booked_type, "ADA - Assigned as booked")
            
            # Otherwise, find available ADA room
            else:
                assigned = False
                for ada_room in ADA_ROOMS:
                    if self.available_rooms.get(ada_room, 0) > 0:
                        self._assign_room(guest, ada_room, f"ADA - Upgraded from {booked_type}")
                        assigned = True
                        break
                
                if not assigned:
                    self.warnings.append(f"⚠️  CRITICAL: No ADA rooms available for {guest['guest_name']} (legal requirement)")
                    print(f"⚠️  WARNING: No ADA rooms for {guest['guest_name']}")
    
    def _identify_overbookings(self) -> Dict[str, int]:
        """Identify which room types are overbooked."""
        unassigned = [r for r in self.reservations if r['reservation_id'] not in [a['reservation_id'] for a in self.assignments]]
        
        demand = defaultdict(int)
        for res in unassigned:
            demand[res['booked_room_type']] += 1
        
        overbookings = {}
        for room_type, needed in demand.items():
            available = self.available_rooms.get(room_type, 0)
            if needed > available:
                overbookings[room_type] = needed - available
        
        if overbookings:
            print(f"\n{'─'*80}")
            print(f"OVERBOOKING ANALYSIS")
            print(f"{'─'*80}")
            for room_type, count in overbookings.items():
                print(f"  {room_type}: Overbooked by {count} rooms")
        
        return overbookings
    
    def _assign_remaining_guests(self, overbookings: Dict[str, int]):
        """Assign remaining guests, upgrading when necessary due to overbooking."""
        unassigned = [r for r in self.reservations if r['reservation_id'] not in [a['reservation_id'] for a in self.assignments]]
        
        print(f"\n{'─'*80}")
        print(f"PHASE 2: STANDARD ASSIGNMENTS & UPGRADES")
        print(f"{'─'*80}")
        
        # Sort unassigned: Overbooked room types first, then by upgrade priority
        def upgrade_priority(guest):
            room_type = guest['booked_room_type']
            is_overbooked = room_type in overbookings
            status = guest['honors_status']
            los = guest['length_of_stay']
            
            # Priority scoring
            priority = 0
            if is_overbooked:
                priority += 1000  # Handle overbookings first
            
            if status == 'Lifetime Diamond':
                priority += 100
            elif status == 'Diamond':
                priority += 90
            elif status == 'Gold':
                priority += 80
            
            if los >= 3:
                priority += 50
            
            return -priority  # Negative for descending sort
        
        unassigned.sort(key=upgrade_priority)
        
        for guest in unassigned:
            booked_type = guest['booked_room_type']
            
            # Try to assign booked room type first
            if self.available_rooms.get(booked_type, 0) > 0:
                self._assign_room(guest, booked_type, "Assigned as booked")
            
            # Need to upgrade (overbooking)
            else:
                upgraded = self._find_upgrade(guest)
                if not upgraded:
                    self.warnings.append(f"⚠️  CRITICAL: Could not assign {guest['guest_name']} - hotel at capacity")
                    print(f"⚠️  WARNING: No room for {guest['guest_name']} - may need to walk guest")
    
    def _find_upgrade(self, guest: Dict) -> bool:
        """Find an upgrade room for a guest (due to overbooking)."""
        booked_type = guest['booked_room_type']
        upgrade_options = UPGRADE_PATHS.get(booked_type, [])
        
        # Step 1: Try same-bed-type upgrades first (avoid named suites)
        for upgrade_type in upgrade_options:
            if upgrade_type not in NAMED_SUITES and self.available_rooms.get(upgrade_type, 0) > 0:
                reason = f"Upgrade from {booked_type} (overbooked) - {guest['honors_status']}"
                if guest['length_of_stay'] >= 3:
                    reason += f" [{guest['length_of_stay']} nights]"
                self._assign_room(guest, upgrade_type, reason)
                return True
        
        # Step 2: Try named suites before cross-category
        for upgrade_type in upgrade_options:
            if upgrade_type in NAMED_SUITES and self.available_rooms.get(upgrade_type, 0) > 0:
                reason = f"Upgrade from {booked_type} (overbooked - named suite used) - {guest['honors_status']}"
                self._assign_room(guest, upgrade_type, reason)
                self.warnings.append(f"ℹ️  Named suite {upgrade_type} used for {guest['guest_name']}")
                return True
        
        # Step 3: Last resort - try cross-category upgrades to avoid walking guest
        cross_category_options = CROSS_CATEGORY_UPGRADES.get(booked_type, [])
        for upgrade_type in cross_category_options:
            if self.available_rooms.get(upgrade_type, 0) > 0:
                # Special handling for ADA cross-category
                if booked_type in ADA_ROOMS and upgrade_type not in ADA_ROOMS:
                    reason = f"Cross-category from {booked_type} (ADA exhausted) - {guest['honors_status']}"
                    self._assign_room(guest, upgrade_type, reason)
                    self.warnings.append(f"⚠️  ADA ALERT: {guest['guest_name']} assigned to {upgrade_type} (non-ADA) - requires accessibility review")
                else:
                    reason = f"Cross-category from {booked_type} (avoid walk) - {guest['honors_status']}"
                    self._assign_room(guest, upgrade_type, reason)
                    self.warnings.append(f"ℹ️  Cross-category: {guest['guest_name']} {booked_type} → {upgrade_type} (requires guest approval)")
                return True
        
        # Step 4: Absolute last resort - assign ANY available room (100% sold out scenario)
        for room_type, count in self.available_rooms.items():
            if count > 0 and room_type not in NAMED_SUITES:  # Still avoid named suites if possible
                reason = f"Emergency assignment from {booked_type} (100% capacity) - {guest['honors_status']}"
                self._assign_room(guest, room_type, reason)
                self.warnings.append(f"⚠️  EMERGENCY: {guest['guest_name']} {booked_type} → {room_type} (requires immediate guest contact)")
                return True
        
        # Step 5: Even named suites if that's all that's left
        for room_type, count in self.available_rooms.items():
            if count > 0:
                reason = f"Named suite emergency assignment from {booked_type} - {guest['honors_status']}"
                self._assign_room(guest, room_type, reason)
                self.warnings.append(f"🚨 CRITICAL: {guest['guest_name']} assigned to named suite {room_type} (emergency only)")
                return True
        
        return False
    
    def _handle_connecting_rooms(self):
        """Log connecting room requests - handled separately by MOD."""
        connecting_requests = [a for a in self.assignments if 'Connecting' in a['special_requests']]
        
        if connecting_requests:
            print(f"\n{'─'*80}")
            print(f"CONNECTING ROOM REQUESTS: {len(connecting_requests)}")
            print(f"{'─'*80}")
            for req in connecting_requests:
                print(f"  {req['guest_name']} - {req['assigned_room_type']}")
            print(f"\nℹ️  Note: Connecting room assignments handled manually by MOD")
    
    def _assign_room(self, guest: Dict, room_type: str, reason: str):
        """Assign a room to a guest."""
        self.assignments.append({
            'reservation_id': guest['reservation_id'],
            'guest_name': guest['guest_name'],
            'honors_status': guest['honors_status'],
            'booked_room_type': guest['booked_room_type'],
            'assigned_room_type': room_type,
            'length_of_stay': guest['length_of_stay'],
            'special_requests': guest['special_requests'],
            'assignment_reason': reason
        })
        
        self.available_rooms[room_type] -= 1
        
        # Log upgrades
        if room_type != guest['booked_room_type']:
            print(f"  ↑ {guest['guest_name']}: {guest['booked_room_type']} → {room_type}")
    
    def generate_report(self) -> str:
        """Generate a summary report of room assignments."""
        report = []
        report.append(f"\n{'='*80}")
        report.append(f"ROOM BALANCING REPORT - {self.checkin_date}")
        report.append(f"{'='*80}")
        report.append(f"Total Guests: {len(self.assignments)}")
        report.append(f"Rooms Assigned: {len(self.assignments)}")
        
        # Count upgrades
        upgrades = [a for a in self.assignments if a['booked_room_type'] != a['assigned_room_type']]
        report.append(f"Upgrades: {len(upgrades)}")
        
        # Count by honors status
        status_count = defaultdict(int)
        for a in self.assignments:
            status_count[a['honors_status']] += 1
        
        report.append(f"\nGuests by Honors Status:")
        for status in ['Lifetime Diamond', 'Diamond', 'Gold', 'Silver', 'Blue', 'Non-member']:
            count = status_count.get(status, 0)
            if count > 0:
                report.append(f"  {status}: {count}")
        
        # Warnings
        if self.warnings:
            report.append(f"\n{'─'*80}")
            report.append(f"WARNINGS & ALERTS")
            report.append(f"{'─'*80}")
            for warning in self.warnings:
                report.append(f"  {warning}")
        
        report.append(f"\n{'='*80}\n")
        
        return '\n'.join(report)


def main():
    """Main execution function."""
    # Load reservations
    with open('/home/claude/embassy_suites_reservations_jan15_feb14_2026.json', 'r') as f:
        all_reservations = json.load(f)
    
    # Test on January 17, 2026 (100% sold out)
    test_date = '2026-01-17'
    
    print(f"\nTesting Room Balancing Algorithm")
    print(f"Test Date: {test_date} (Hawks vs. Celtics + Major Convention)")
    
    # Run the balancer
    balancer = RoomBalancer(all_reservations, test_date)
    assignments, warnings = balancer.balance_house()
    
    # Print report
    print(balancer.generate_report())
    
    # Save results
    output_file = f'/home/claude/room_assignments_{test_date}.json'
    with open(output_file, 'w') as f:
        json.dump(assignments, f, indent=2)
    
    print(f"✓ Room assignments saved to: {output_file}")
    print(f"✓ Total assignments: {len(assignments)}")
    print(f"✓ Upgrades: {len([a for a in assignments if a['booked_room_type'] != a['assigned_room_type']])}")


if __name__ == "__main__":
    main()
