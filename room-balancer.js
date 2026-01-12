// Room Balancing System - Embassy Suites Centennial Park
// Priority: ADA > Rate Type > Honors Status > Length of Stay

const ROOM_INVENTORY = {
    'KNGN': 94, 'TDBN': 126, 'KSVN': 44, 'TSVN': 20,
    'NKSQA': 13, 'NKSQB': 2, 'NDSPXC': 5, 'TCSN': 5,
    'KEXN': 3, 'NKSCJ': 2, 'NKSPK': 2, 'NKSP': 1,
    'NKSPD': 1, 'KSLN': 1, 'KSPN': 1, 'KOTN': 1
};

const UPGRADE_PATHS = {
    'KNGN': ['KSVN', 'KEXN', 'NKSP', 'NKSPK', 'NKSCJ'],
    'KSVN': ['KEXN', 'NKSPK', 'NKSCJ', 'NKSP'],
    'KEXN': ['NKSPK', 'NKSCJ', 'NKSP'],
    'TDBN': ['TSVN', 'TCSN', 'NDSPXC'],
    'TSVN': ['TCSN', 'NDSPXC'],
    'NKSQA': ['NKSQB', 'NKSPD'],
    'NKSQB': ['NKSPD'],
};

const CROSS_CATEGORY_UPGRADES = {
    'TDBN': ['KNGN', 'KSVN', 'KEXN', 'NKSP'],
    'TSVN': ['KSVN', 'KEXN', 'NKSP', 'NKSPK'],
    'TCSN': ['KEXN', 'NKSP', 'NKSPK'],
    'NKSQA': ['KNGN', 'KSVN', 'KEXN'],
    'NKSQB': ['KNGN', 'KSVN', 'KEXN'],
    'NKSPD': ['NKSP', 'KEXN', 'NKSPK'],
};

const NAMED_SUITES = ['KSPN', 'KOTN', 'KSLN'];
const ADA_ROOMS = ['NKSQA', 'NKSQB', 'NKSPD'];

const RATE_PRIORITY = {
    'Direct': 1,
    'AAA': 2,
    'Government': 3,
    'Corporate': 4,
    'Third-Party': 5,
    'Hilton Go': 6,
};

const ROOM_TIERS = {
    'KNGN': 1, 'TDBN': 1,
    'KSVN': 2, 'TSVN': 2,
    'KEXN': 3, 'NKSPK': 3, 'NKSCJ': 3, 'NKSP': 3, 'NDSPXC': 3, 'TCSN': 3,
    'NKSQA': 1, 'NKSQB': 1, 'NKSPD': 3,
    'KSPN': 4, 'KOTN': 4, 'KSLN': 4,
};

let allReservations = [];
let currentDate = null;
let pendingAlerts = [];
let finalAssignments = [];
let filteredAssignments = [];

function isDowngrade(fromType, toType) {
    const fromTier = ROOM_TIERS[fromType] || 0;
    const toTier = ROOM_TIERS[toType] || 0;
    
    if (toTier < fromTier) return true;
    
    const fromIsKing = fromType.includes('K') && !fromType.includes('T');
    const toIsDouble = toType.includes('T') || toType.includes('D');
    
    if (fromIsKing && toIsDouble && fromTier >= toTier) return true;
    
    return false;
}

document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            allReservations = JSON.parse(event.target.result);
            populateDateSelect();
            document.getElementById('dateSelect').disabled = false;
            document.getElementById('analyzeBtn').disabled = false;
        } catch (error) {
            alert('Error loading file: ' + error.message);
        }
    };
    reader.readAsText(file);
});

function populateDateSelect() {
    const dates = [...new Set(allReservations.map(r => r.checkin_date))].sort();
    const select = document.getElementById('dateSelect');
    select.innerHTML = '<option value="">Select a date...</option>';
    
    dates.forEach(date => {
        const count = allReservations.filter(r => r.checkin_date === date).length;
        const occupancy = ((count / 321) * 100).toFixed(0);
        const option = document.createElement('option');
        option.value = date;
        option.textContent = `${date} (${count} arrivals - ${occupancy}% occupancy)`;
        select.appendChild(option);
    });
}

document.getElementById('analyzeBtn').addEventListener('click', () => {
    currentDate = document.getElementById('dateSelect').value;
    if (!currentDate) {
        alert('Please select a check-in date');
        return;
    }
    
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('previewPhase').classList.add('hidden');
    document.getElementById('resultsPhase').classList.add('hidden');
    
    setTimeout(() => {
        analyzeArrivals();
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('previewPhase').classList.remove('hidden');
    }, 500);
});

function analyzeArrivals() {
    const reservations = allReservations.filter(r => r.checkin_date === currentDate);
    pendingAlerts = [];
    finalAssignments = [];
    
    // Calculate In House and Due Outs for this date
    const currentDateObj = new Date(currentDate);
    
    const inHouse = {};  // Guests staying over from previous night
    const dueOuts = {};  // Guests checking out today
    
    allReservations.forEach(res => {
        const checkinDate = new Date(res.checkin_date);
        const checkoutDate = new Date(checkinDate);
        checkoutDate.setDate(checkoutDate.getDate() + res.length_of_stay);
        
        const roomType = res.booked_room_type;
        
        // In House: checked in before today, checking out after today
        if (checkinDate < currentDateObj && checkoutDate > currentDateObj) {
            inHouse[roomType] = (inHouse[roomType] || 0) + 1;
        }
        
        // Due Outs: checking out today
        if (checkoutDate.toISOString().split('T')[0] === currentDate) {
            dueOuts[roomType] = (dueOuts[roomType] || 0) + 1;
        }
    });
    
    // CRITICAL FIX: Cap In House at physical capacity
    // Hotel has 321 rooms total - In House can NEVER exceed this
    let totalInHouse = Object.values(inHouse).reduce((a, b) => a + b, 0);
    let totalDueOuts = Object.values(dueOuts).reduce((a, b) => a + b, 0);
    
    // Maximum possible In House = 321 rooms (100% occupancy from previous night)
    const maxCapacity = 321;
    
    if (totalInHouse > maxCapacity) {
        // Scale down In House proportionally across all room types
        const scaleFactor = maxCapacity / totalInHouse;
        
        Object.keys(inHouse).forEach(roomType => {
            inHouse[roomType] = Math.floor(inHouse[roomType] * scaleFactor);
        });
        
        totalInHouse = Object.values(inHouse).reduce((a, b) => a + b, 0);
    }
    
    // CRITICAL FIX #2: Due Outs cannot exceed In House
    // You can't check out more people than are currently in the hotel
    if (totalDueOuts > totalInHouse) {
        const dueOutScaleFactor = totalInHouse / totalDueOuts;
        
        Object.keys(dueOuts).forEach(roomType => {
            dueOuts[roomType] = Math.floor(dueOuts[roomType] * dueOutScaleFactor);
        });
        
        totalDueOuts = Object.values(dueOuts).reduce((a, b) => a + b, 0);
    }
    
    // CRITICAL FIX #3: For EACH room type, Due Outs can't exceed In House
    Object.keys(dueOuts).forEach(roomType => {
        const inHouseCount = inHouse[roomType] || 0;
        const dueOutCount = dueOuts[roomType] || 0;
        
        if (dueOutCount > inHouseCount) {
            // Cap this room type's due outs at its in-house count
            dueOuts[roomType] = inHouseCount;
        }
    });
    
    const demand = {};
    reservations.forEach(r => {
        demand[r.booked_room_type] = (demand[r.booked_room_type] || 0) + 1;
    });
    
    const overbookings = [];
    const overbookedTypes = new Set();
    
    // Calculate actual availability: Inventory - (In House - Due Outs)
    Object.entries(demand).forEach(([roomType, arrivals]) => {
        const totalInventory = ROOM_INVENTORY[roomType] || 0;
        const currentlyOccupied = (inHouse[roomType] || 0) - (dueOuts[roomType] || 0);
        const actuallyAvailable = totalInventory - currentlyOccupied;
        
        if (arrivals > actuallyAvailable) {
            overbookings.push({ 
                roomType, 
                arrivals, 
                inHouse: inHouse[roomType] || 0,
                dueOuts: dueOuts[roomType] || 0,
                available: actuallyAvailable, 
                overby: arrivals - actuallyAvailable 
            });
            overbookedTypes.add(roomType);
        }
    });
    
    const tempAvailable = { ...ROOM_INVENTORY };
    
    // Adjust availability based on in-house guests
    Object.entries(inHouse).forEach(([roomType, count]) => {
        const checkout = dueOuts[roomType] || 0;
        const netOccupied = count - checkout;
        if (tempAvailable[roomType]) {
            tempAvailable[roomType] = Math.max(0, tempAvailable[roomType] - netOccupied);
        }
    });
    
    const adaGuests = reservations.filter(r => r.special_requests && r.special_requests.includes('ADA'));
    adaGuests.forEach(guest => {
        simulateAssignment(guest, tempAvailable, overbookedTypes, true);
    });
    
    const remainingGuests = reservations.filter(r => !finalAssignments.find(a => a.reservation_id === r.reservation_id));
    
    remainingGuests.sort((a, b) => {
        const rateA = RATE_PRIORITY[a.rate_type] || 99;
        const rateB = RATE_PRIORITY[b.rate_type] || 99;
        if (rateA !== rateB) return rateB - rateA;
        
        const statusA = getStatusPriority(a.honors_status);
        const statusB = getStatusPriority(b.honors_status);
        if (statusA !== statusB) return statusB - statusA;
        
        return b.length_of_stay - a.length_of_stay;
    });
    
    remainingGuests.forEach(guest => {
        simulateAssignment(guest, tempAvailable, overbookedTypes, false);
    });
    
    displayPreview(reservations, overbookings, demand, inHouse, dueOuts);
}

function getStatusPriority(status) {
    const priorities = {
        'Lifetime Diamond': 100,
        'Diamond': 90,
        'Gold': 80,
        'Silver': 70,
        'Blue': 60,
        'Non-member': 50
    };
    return priorities[status] || 0;
}

function simulateAssignment(guest, available, overbookedTypes, isAda) {
    const bookedType = guest.booked_room_type;
    
    if (available[bookedType] > 0) {
        available[bookedType]--;
        finalAssignments.push({
            ...guest,
            assigned_room_type: bookedType,
            assignment_type: 'standard'
        });
        return true;
    }
    
    if (!overbookedTypes.has(bookedType)) return false;
    
    const upgrades = UPGRADE_PATHS[bookedType] || [];
    for (const upgradeType of upgrades) {
        if (!NAMED_SUITES.includes(upgradeType) && available[upgradeType] > 0) {
            available[upgradeType]--;
            
            const ratePriority = RATE_PRIORITY[guest.rate_type] || 99;
            const isLowPriority = ratePriority >= 5;
            
            pendingAlerts.push({
                type: isLowPriority ? 'info' : 'warning',
                message: `${isLowPriority ? 'Low-Priority ' : ''}Upgrade: ${guest.guest_name} (${guest.honors_status} | ${guest.rate_type}) from ${bookedType} → ${upgradeType}`,
                guest_name: guest.guest_name,
                approved: false
            });
            
            finalAssignments.push({
                ...guest,
                assigned_room_type: upgradeType,
                assignment_type: 'upgrade'
            });
            return true;
        }
    }
    
    const crossCategory = CROSS_CATEGORY_UPGRADES[bookedType] || [];
    for (const upgradeType of crossCategory) {
        if (available[upgradeType] > 0) {
            available[upgradeType]--;
            
            if (isAda && ADA_ROOMS.includes(bookedType) && !ADA_ROOMS.includes(upgradeType)) {
                pendingAlerts.push({
                    type: 'danger',
                    message: `🚨 ADA ALERT: ${guest.guest_name} from ${bookedType} → ${upgradeType} (non-ADA). Call guest + coordinate with housekeeping.`,
                    guest_name: guest.guest_name,
                    approved: false
                });
            } else {
                pendingAlerts.push({
                    type: 'warning',
                    message: `Cross-Category: ${guest.guest_name} (${guest.rate_type}) from ${bookedType} → ${upgradeType}. Call guest for approval.`,
                    guest_name: guest.guest_name,
                    approved: false
                });
            }
            
            finalAssignments.push({
                ...guest,
                assigned_room_type: upgradeType,
                assignment_type: 'cross-category'
            });
            return true;
        }
    }
    
    for (const [roomType, count] of Object.entries(available)) {
        if (count > 0 && !NAMED_SUITES.includes(roomType)) {
            if (isDowngrade(bookedType, roomType)) continue;
            
            available[roomType]--;
            pendingAlerts.push({
                type: 'danger',
                message: `⚠️ EMERGENCY: ${guest.guest_name} (${guest.rate_type}) from ${bookedType} → ${roomType}. Contact guest immediately.`,
                guest_name: guest.guest_name,
                approved: false
            });
            
            finalAssignments.push({
                ...guest,
                assigned_room_type: roomType,
                assignment_type: 'emergency'
            });
            return true;
        }
    }
    
    for (const [roomType, count] of Object.entries(available)) {
        if (count > 0) {
            if (isDowngrade(bookedType, roomType)) continue;
            
            available[roomType]--;
            pendingAlerts.push({
                type: 'danger',
                message: `🚨 NAMED SUITE: ${guest.guest_name} assigned to ${roomType}. Management approval required.`,
                guest_name: guest.guest_name,
                approved: false
            });
            
            finalAssignments.push({
                ...guest,
                assigned_room_type: roomType,
                assignment_type: 'named-suite'
            });
            return true;
        }
    }
    
    pendingAlerts.push({
        type: 'danger',
        message: `❌ WALK GUEST: ${guest.guest_name} - Cannot accommodate. Contact nearby hotels.`,
        guest_name: guest.guest_name,
        approved: false
    });
    
    return false;
}

function displayPreview(reservations, overbookings, demand, inHouse, dueOuts) {
    document.getElementById('previewTotalGuests').textContent = reservations.length;
    document.getElementById('previewOverbookings').textContent = overbookings.length;
    document.getElementById('previewAlerts').textContent = pendingAlerts.length;
    
    const occupancy = ((reservations.length / 321) * 100).toFixed(0);
    document.getElementById('previewOccupancy').textContent = occupancy + '%';
    
    const tbody = document.getElementById('previewOverbookingTable').querySelector('tbody');
    tbody.innerHTML = '';
    
    let totalInHouse = 0;
    let totalDueOuts = 0;
    let totalArrivals = 0;
    let totalAvailable = 0;
    let totalOverbooked = 0;
    
    // Get all room types from inventory to show even those with 0 bookings
    const allRoomTypes = Object.keys(ROOM_INVENTORY);
    
    allRoomTypes.sort((a, b) => {
        const demandA = demand[a] || 0;
        const demandB = demand[b] || 0;
        return demandB - demandA;
    }).forEach(roomType => {
        const arrivals = demand[roomType] || 0;
        const totalInventory = ROOM_INVENTORY[roomType] || 0;
        const inHouseCount = inHouse[roomType] || 0;
        const dueOutCount = dueOuts[roomType] || 0;
        const currentlyOccupied = inHouseCount - dueOutCount;
        const actuallyAvailable = totalInventory - currentlyOccupied;
        const overby = Math.max(0, arrivals - actuallyAvailable);
        const status = overby > 0 ? 'OVERBOOKED' : 'OK';
        
        totalInHouse += inHouseCount;
        totalDueOuts += dueOutCount;
        totalArrivals += arrivals;
        totalAvailable += actuallyAvailable;
        totalOverbooked += overby;
        
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${roomType}</strong></td>
            <td>${arrivals}</td>
            <td>${actuallyAvailable}</td>
            <td>${dueOutCount}</td>
            <td>${inHouseCount}</td>
            <td>${overby > 0 ? overby : '-'}</td>
            <td><span class="badge ${overby > 0 ? 'overbooked' : 'ok'}">${status}</span></td>
        `;
    });
    
    // Add totals row
    const totalsRow = tbody.insertRow();
    totalsRow.style.backgroundColor = '#f0f0f0';
    totalsRow.style.fontWeight = 'bold';
    totalsRow.style.borderTop = '2px solid #003057';
    
    totalsRow.innerHTML = `
        <td><strong>TOTALS</strong></td>
        <td><strong>${totalArrivals}</strong></td>
        <td><strong>${totalAvailable}</strong></td>
        <td><strong>${totalDueOuts}</strong></td>
        <td><strong>${totalInHouse}</strong></td>
        <td><strong>${totalOverbooked > 0 ? totalOverbooked : '-'}</strong></td>
        <td><span class="badge ${totalOverbooked > 0 ? 'overbooked' : 'ok'}">${totalOverbooked > 0 ? 'OVERBOOKED' : 'OK'}</span></td>
    `;
    
    const alertsList = document.getElementById('alertsList');
    alertsList.innerHTML = '';
    
    if (pendingAlerts.length === 0) {
        alertsList.innerHTML = `
            <div class="alert-item info">
                <span class="alert-icon">✓</span>
                <div class="alert-content"><strong>No alerts - all guests fit in booked room types!</strong></div>
            </div>
        `;
        const btn = document.getElementById('finalizeBtn');
        btn.disabled = false;
        btn.textContent = '✓ Finalize All Room Assignments';
    } else {
        pendingAlerts.forEach((alert, index) => {
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert-item ${alert.type}`;
            alertDiv.id = `alert-${index}`;
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'alert-checkbox';
            checkbox.id = `checkbox-${index}`;
            checkbox.onchange = updateApprovalStatus;
            
            const icon = document.createElement('span');
            icon.className = 'alert-icon';
            icon.textContent = alert.type === 'danger' ? '⚠️' : alert.type === 'warning' ? '⚠️' : 'ℹ️';
            
            const content = document.createElement('div');
            content.className = 'alert-content';
            content.textContent = alert.message;
            
            alertDiv.appendChild(checkbox);
            alertDiv.appendChild(icon);
            alertDiv.appendChild(content);
            alertsList.appendChild(alertDiv);
        });
        
        updateApprovalStatus();
    }
}

function updateApprovalStatus() {
    let approvedCount = 0;
    
    pendingAlerts.forEach((alert, index) => {
        const checkbox = document.getElementById(`checkbox-${index}`);
        const alertDiv = document.getElementById(`alert-${index}`);
        
        if (checkbox && checkbox.checked) {
            alertDiv.classList.add('approved');
            alert.approved = true;
            approvedCount++;
        } else if (checkbox) {
            alertDiv.classList.remove('approved');
            alert.approved = false;
        }
    });
    
    const btn = document.getElementById('finalizeBtn');
    const totalAlerts = pendingAlerts.length;
    
    if (approvedCount > 0) {
        btn.disabled = false;
        if (approvedCount === totalAlerts) {
            btn.textContent = '✓ Finalize All & Complete';
        } else {
            btn.textContent = `✓ Finalize ${approvedCount} (${totalAlerts - approvedCount} Will Remain)`;
        }
    } else {
        btn.disabled = true;
        btn.textContent = '✓ Check at least one alert to finalize';
    }
}

document.getElementById('finalizeBtn').addEventListener('click', () => {
    const remainingAlerts = [];
    const approvedGuestNames = new Set();
    
    // Separate approved vs remaining (unchecked) alerts
    pendingAlerts.forEach((alert, index) => {
        const checkbox = document.getElementById(`checkbox-${index}`);
        
        if (checkbox && checkbox.checked) {
            // This one is approved - will be finalized
            approvedGuestNames.add(alert.guest_name);
        } else {
            // This one is NOT approved - keep it in the list
            remainingAlerts.push(alert);
        }
    });
    
    // Update global pendingAlerts to only the unchecked ones
    pendingAlerts = remainingAlerts;
    
    // If ALL alerts are now handled, show final results
    if (pendingAlerts.length === 0) {
        document.getElementById('previewPhase').classList.add('hidden');
        document.getElementById('resultsPhase').classList.remove('hidden');
        displayFinalResults([]);
    } else {
        // Still have unchecked alerts - refresh the preview to show only remaining
        const reservations = allReservations.filter(r => r.checkin_date === currentDate);
        
        // Recalculate stats for remaining alerts
        document.getElementById('previewAlerts').textContent = pendingAlerts.length;
        
        // Rebuild alert list with only remaining alerts
        const alertsList = document.getElementById('alertsList');
        alertsList.innerHTML = '';
        
        pendingAlerts.forEach((alert, index) => {
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert-item ${alert.type}`;
            alertDiv.id = `alert-${index}`;
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'alert-checkbox';
            checkbox.id = `checkbox-${index}`;
            checkbox.onchange = updateApprovalStatus;
            
            const icon = document.createElement('span');
            icon.className = 'alert-icon';
            icon.textContent = alert.type === 'danger' ? '⚠️' : alert.type === 'warning' ? '⚠️' : 'ℹ️';
            
            const content = document.createElement('div');
            content.className = 'alert-content';
            content.textContent = alert.message;
            
            alertDiv.appendChild(checkbox);
            alertDiv.appendChild(icon);
            alertDiv.appendChild(content);
            alertsList.appendChild(alertDiv);
        });
        
        // Show success message for what was just finalized
        const approvalBanner = document.querySelector('.approval-banner');
        approvalBanner.innerHTML = `
            <h3>✓ ${approvedGuestNames.size} Alert${approvedGuestNames.size > 1 ? 's' : ''} Finalized</h3>
            <p>
                <strong>${pendingAlerts.length} alert${pendingAlerts.length > 1 ? 's' : ''} remaining.</strong> 
                Continue working on the alerts below. Check each box after you've handled it, then click finalize again.
            </p>
        `;
        
        updateApprovalStatus();
    }
});

function displayFinalResults(unapprovedAlerts = []) {
    const reservations = allReservations.filter(r => r.checkin_date === currentDate);
    
    document.getElementById('statTotalGuests').textContent = reservations.length;
    document.getElementById('statAssigned').textContent = finalAssignments.length;
    
    const upgrades = finalAssignments.filter(a => a.assignment_type !== 'standard').length;
    document.getElementById('statUpgrades').textContent = upgrades;
    
    const occupancy = ((reservations.length / 321) * 100).toFixed(0);
    document.getElementById('statOccupancy').textContent = occupancy + '%';
    
    let bannerHTML = '';
    
    if (unapprovedAlerts.length > 0) {
        bannerHTML = `
            <div style="padding: 20px; background: #fff3e0; border: 2px solid #f57c00; border-radius: 8px; margin-bottom: 20px;">
                <strong style="color: #f57c00; font-size: 16px;">⚠️ ${unapprovedAlerts.length} Unresolved Alert${unapprovedAlerts.length > 1 ? 's' : ''} - Manual Handling Required</strong>
                <div style="margin-top: 15px;">
                    ${unapprovedAlerts.map(alert => `
                        <div style="padding: 10px; background: white; border-radius: 6px; margin-top: 8px; border-left: 3px solid #f57c00; font-size: 14px;">
                            ${alert.message}
                        </div>
                    `).join('')}
                </div>
                <p style="margin-top: 15px; color: #666; font-size: 14px;">
                    <strong>Next Steps:</strong> These ${unapprovedAlerts.length} guest${unapprovedAlerts.length > 1 ? 's' : ''} require manual intervention. 
                    The remaining <strong>${finalAssignments.length} guests</strong> have been assigned and are ready for check-in.
                </p>
            </div>
        `;
    } else {
        bannerHTML = `
            <div style="padding: 20px; background: #e8f5e9; border-radius: 8px; margin-bottom: 20px;">
                <strong style="color: #27ae60; font-size: 16px;">✓ All room assignments finalized and ready for check-in.</strong>
            </div>
        `;
    }
    
    document.getElementById('resultsBanner').innerHTML = bannerHTML;
    
    filteredAssignments = [...finalAssignments];
    updateAssignmentsTable();
}

function updateAssignmentsTable() {
    const tbody = document.getElementById('assignmentsTable').querySelector('tbody');
    tbody.innerHTML = '';
    
    filteredAssignments.forEach(assignment => {
        const row = tbody.insertRow();
        const isUpgrade = assignment.booked_room_type !== assignment.assigned_room_type;
        
        const ratePriority = RATE_PRIORITY[assignment.rate_type] || 99;
        const rateBadgeClass = ratePriority <= 4 ? 'high-priority' : 'low-priority';
        const assignmentBadgeClass = assignment.assignment_type === 'standard' ? 'standard' : 'upgrade';
        
        row.innerHTML = `
            <td>${assignment.guest_name}</td>
            <td>${assignment.honors_status}</td>
            <td><span class="badge ${rateBadgeClass}">${assignment.rate_type}</span></td>
            <td>${assignment.booked_room_type}</td>
            <td><strong>${assignment.assigned_room_type}</strong> ${isUpgrade ? '↑' : ''}</td>
            <td>${assignment.length_of_stay}N</td>
            <td><span class="badge ${assignmentBadgeClass}">${assignment.assignment_type}</span></td>
        `;
    });
    
    document.getElementById('assignmentCount').textContent = filteredAssignments.length;
}

document.getElementById('filterType').addEventListener('change', applyFilters);
document.getElementById('filterRate').addEventListener('change', applyFilters);

function applyFilters() {
    const typeFilter = document.getElementById('filterType').value;
    const rateFilter = document.getElementById('filterRate').value;
    
    filteredAssignments = finalAssignments.filter(a => {
        const typeMatch = typeFilter === 'all' || 
                         (typeFilter === 'upgrade' && a.assignment_type !== 'standard') ||
                         (typeFilter === 'standard' && a.assignment_type === 'standard');
        
        const rateMatch = rateFilter === 'all' || a.rate_type === rateFilter;
        
        return typeMatch && rateMatch;
    });
    
    updateAssignmentsTable();
}

document.getElementById('exportBtn').addEventListener('click', () => {
    const csv = [
        ['Guest Name', 'Honors Status', 'Rate Type', 'Booked Room', 'Assigned Room', 'Length of Stay', 'Assignment Type'],
        ...filteredAssignments.map(a => [
            a.guest_name,
            a.honors_status,
            a.rate_type,
            a.booked_room_type,
            a.assigned_room_type,
            a.length_of_stay,
            a.assignment_type
        ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `room-assignments-${currentDate}.csv`;
    a.click();
});
