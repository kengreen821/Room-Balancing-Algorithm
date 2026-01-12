# Hotel Room Balancing System

**Automated room assignment and upgrade management for hotel operations**

A web-based tool designed for Manager on Duty (MOD) teams to optimize room assignments, handle overbookings, and manage guest upgrades while maintaining compliance with ADA requirements and honoring rate type priorities.

---

## Features

### 🎯 **Smart Assignment Algorithm**
- **Priority-Based Logic**: ADA requirements → Rate Type → Honors Status → Length of Stay
- **Overbooking Management**: Only upgrades when room types are actually overbooked
- **Rate Type Intelligence**: Prioritizes premium bookings (Direct, AAA, Government) over discounted rates (Third-Party, Hilton Go)

### ✅ **MOD Approval Workflow**
- **Two-Phase Process**: 
  - Phase 1: Review alerts and approve required actions
  - Phase 2: Finalize and export assignments
- **Action Tracking**: Checkbox system to confirm completion of guest calls, housekeeping coordination, etc.

### 📊 **Comprehensive Analytics**
- Overbooking analysis by room type
- Occupancy statistics
- Upgrade tracking
- Rate type distribution

### 🔧 **Practical Tools**
- Filter assignments by type (Standard/Upgrade)
- Filter by rate type
- Export to CSV for PMS integration
- View ALL assignments (no pagination limits)

---

## How It Works

### 1. Load Reservations
Upload your reservation JSON file containing check-in dates, guest details, room types, rate types, and special requests.

### 2. Select Date & Analyze
Choose a check-in date to analyze. The system will:
- Calculate demand vs. inventory
- Identify overbookings
- Generate upgrade recommendations
- Flag alerts requiring MOD action

### 3. Review & Approve
Check off each alert after handling:
- ✓ Called guest for cross-category upgrade approval
- ✓ Coordinated ADA room with housekeeping
- ✓ Verified availability with front desk

### 4. Finalize & Export
Once all alerts are approved, finalize assignments and export to CSV for check-in processing.

---

## Room Assignment Logic

### **Priority Hierarchy**
1. **ADA Requirements** (Legal compliance - top priority)
2. **Rate Type Priority** (Premium rates get preference)
   - High Priority: Direct, AAA, Government, Corporate
   - Low Priority: Third-Party, Hilton Go
3. **Honors Status** (Diamond > Gold > Silver > Blue > Non-member)
4. **Length of Stay** (3+ nights get preference for upgrades)

### **Upgrade Paths**
- **Same Bed Type First**: KNGN → KSVN → KEXN (King upgrades)
- **Cross-Category When Needed**: TDBN → KNGN (Double to King with approval)
- **Named Suites Last Resort**: Presidential, Governor's, Centennial suites avoided unless critical

### **Rate Type Consideration**
When overbooking requires moving guests:
- **Third-Party bookings** upgraded/moved first (lowest priority)
- **Hilton Go** (employee/friends/family) next
- **Direct bookings** protected whenever possible (highest priority)

---

## Technical Details

### **Files Included**
- `index.html` - Main application interface
- `room-balancer.js` - Assignment algorithm and logic
- `README.md` - This file

### **Room Inventory** (Embassy Suites Centennial Park - 321 Total Rooms)
- KNGN: 94 (Standard King)
- TDBN: 126 (Standard Double)
- KSVN: 44 (Park View King)
- TSVN: 20 (Park View Double)
- NKSQA: 13 (ADA King - Tub)
- NKSQB: 2 (ADA King - Roll-in)
- NDSPXC: 5 (Premium Corner Double)
- TCSN: 5 (Conference Suite)
- KEXN: 3 (Executive King)
- Additional premium suites (7 total)

### **Reservation Data Format**
```json
{
  "reservation_id": "RES123456",
  "guest_name": "John Smith",
  "checkin_date": "2026-01-15",
  "checkout_date": "2026-01-17",
  "length_of_stay": 2,
  "booked_room_type": "KNGN",
  "honors_status": "Diamond",
  "rate_type": "Direct",
  "special_requests": []
}
```

---

## Usage

### **Requirements**
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Reservation JSON file

### **Steps**
1. Open `index.html` in your browser
2. Click "Load Reservations JSON" and select your data file
3. Choose a check-in date from the dropdown
4. Click "Analyze Arrivals"
5. Review alerts and check off completed actions
6. Click "Finalize All Room Assignments"
7. Export CSV for PMS import

---

## Alert Types

### ℹ️ **Info** (Low-Priority Rate Upgrades)
Low-priority rate types (Third-Party, Hilton Go) being upgraded due to overbooking.

### ⚠️ **Warning** (Cross-Category Assignments)
Guest needs different bed type than booked - requires phone call for approval.

### 🚨 **Danger** (Critical Actions)
- ADA guest in non-ADA room - coordinate with housekeeping
- Emergency assignments - contact guest immediately
- Walk guest scenarios - find alternative accommodation

---

## Business Value

### **Time Savings**
- Reduces MOD balancing time from 2-3 hours to 10 minutes on sold-out nights
- Eliminates manual overbooking calculations

### **Consistency**
- Applies same priority logic every time
- Reduces human error in complex scenarios
- Documents all decisions for accountability

### **Guest Satisfaction**
- Prioritizes premium-paying guests
- Ensures ADA compliance
- Strategic upgrade allocation based on multiple factors

### **Scalability**
- Customizable for any hotel property
- Adaptable room types and inventory
- Configurable rate priority rules

---

## Future Enhancements

- [ ] Integration with property management systems (PMS)
- [ ] Connecting room assignment optimization
- [ ] VIP flagging and special handling
- [ ] Historical data analysis for demand forecasting
- [ ] Multi-property support
- [ ] Mobile-responsive design improvements

---

## License

MIT License - Feel free to use and adapt for your property's needs.

---

## Author

**Ken Green**  
Guest Service Agent, Embassy Suites Centennial Park  
Operations Technology Development

---

## Support

For questions, suggestions, or contributions, please contact via GitHub issues or pull requests.
