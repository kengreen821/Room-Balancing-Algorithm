// Room Balancing System - Embassy Suites Centennial Park
// COMPLETE REBUILD - All fixes integrated

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
    'NKSQB': ['NKSPD']
};

const CROSS_CATEGORY_UPGRADES = {
    'TDBN': ['KNGN', 'KSVN', 'KEXN', 'NKSP'],
    'TSVN': ['KSVN', 'KEXN', 'NKSP', 'NKSPK'],
    'TCSN': ['KEXN', 'NKSP', 'NKSPK'],
    'NKSQA': ['KNGN', 'KSVN', 'KEXN'],
    'NKSQB': ['KNGN', 'KSVN', 'KEXN'],
    'NKSPD': ['NKSP', 'KEXN', 'NKSPK']
};

const NAMED_SUITES = ['KSPN', 'KOTN', 'KSLN'];
const ADA_ROOMS = ['NKSQA', 'NKSQB', 'NKSPD'];

const RATE_PRIORITY = {
    'Direct': 1, 'AAA': 2, 'Government': 3,
    'Corporate': 4, 'Third-Party': 5, 'Hilton Go': 6
};

const ROOM_TIERS = {
    'KNGN': 1, 'TDBN': 1, 'KSVN': 2, 'TSVN': 2,
    'KEXN': 3, 'NKSPK': 3, 'NKSCJ': 3, 'NKSP': 3, 'NDSPXC': 3, 'TCSN': 3,
    'NKSQA': 1, 'NKSQB': 1, 'NKSPD': 3,
    'KSPN': 4, 'KOTN': 4, 'KSLN': 4
};

let allReservations = [];
let currentDate = null;
let pendingAlerts = [];
let finalAssignments = [];

function isDowngrade(fromType, toType) {
    const fromTier = ROOM_TIERS[fromType] || 0;
    const toTier = ROOM_TIERS[toType] || 0;
    if (toTier < fromTier) return true;
    const fromIsKing = fromType.includes('K') && !fromType.includes('T');
    const toIsDouble = toType.includes('T') || toType.includes('D');
    if (fromIsKing && toIsDouble && fromTier >= toTier) return true;
    return false;
}

// FILE UPLOAD HANDLER
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

// POPULATE DATE SELECT - WITH CORRECT OCCUPANCY CALCULATION
function populateDateSelect() {
    const dates = [...new Set(allReservations.map(r => r.checkin_date))].sort();
    const select = document.getElementById('dateSelect');
    select.innerHTML = '<option value="">Select a date...</option>';
    
    dates.forEach(date => {
        const arrivals = allReservations.filter(r => r.checkin_date === date).length;
        
        // Calculate TOTAL rooms occupied on this date (not just arrivals)
        const occupied = allReservations.filter(r => {
            const checkin = new Date(r.checkin_date);
            const checkout = new Date(r.checkout_date);
            const target = new Date(date);
            return checkin <= target && checkout > target;
        }).length;
        
        const occupancy = ((occupied / 321) * 100).toFixed(0);
        const option = document.createElement('option');
        option.value = date;
        option.textContent = `${date} (${arrivals} arrivals - ${occupied} occupied - ${occupancy}% occupancy)`;
        select.appendChild(option);
    });
}

// ANALYZE BUTTON HANDLER
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

// MAIN ANALYSIS FUNCTION
function analyzeArrivals() {
    const reservations = allReservations.filter(r => r.checkin_date === currentDate);
    pendingAlerts = [];
    finalAssignments = [];
    
    const currentDateObj = new Date(currentDate);
    const inHouse = {};
    const dueOuts = {};
    
    // Calculate In House and Due Outs
    allReservations.forEach(res => {
        const checkinDate = new Date(res.checkin_date);
        const checkoutDate = new Date(res.checkout_date);
        const roomType = res.room_type; // FIXED: Use room_type not booked_room_type
        
        // In House: checked in before today, checking out after today
        if (checkinDate < currentDateObj && checkoutDate > currentDateObj) {
            inHouse[roomType] = (inHouse[roomType] || 0) + 1;
        }
        
        // Due Outs: checking out today
        if (checkoutDate.toISOString().split('T')[0] === currentDate) {
            dueOuts[roomType] = (dueOuts[roomType] || 0) + 1;
        }
    });
    
    // Cap In House at capacity
    let totalInHouse = Object.values(inHouse).reduce((a, b) => a + b, 0);
    const maxCapacity = 321;
    
    if (totalInHouse > maxCapacity) {
        const scaleFactor = maxCapacity / totalInHouse;
        Object.keys(inHouse).forEach(roomType => {
            inHouse[roomType] = Math.floor(inHouse[roomType] * scaleFactor);
        });
        totalInHouse = Object.values(inHouse).reduce((a, b) => a + b, 0);
    }
    
    // Due Outs cannot exceed In House
    let totalDueOuts = Object.values(dueOuts).reduce((a, b) => a + b, 0);
    if (totalDueOuts > totalInHouse) {
        const dueOutScaleFactor = totalInHouse / totalDueOuts;
        Object.keys(dueOuts).forEach(roomType => {
            dueOuts[roomType] = Math.floor(dueOuts[roomType] * dueOutScaleFactor);
        });
        totalDueOuts = Object.values(dueOuts).reduce((a, b) => a + b, 0);
    }
    
    // Per room type: Due Outs can't exceed In House
    Object.keys(dueOuts).forEach(roomType => {
        const inHouseCount = inHouse[roomType] || 0;
        if (dueOuts[roomType] > inHouseCount) {
            dueOuts[roomType] = inHouseCount;
        }
    });
    
    // Calculate demand
    const demand = {};
    reservations.forEach(r => {
        demand[r.room_type] = (demand[r.room_type] || 0) + 1; // FIXED: Use room_type
    });
    
    // Find overbookings
    const overbookings = [];
    const overbookedTypes = new Set();
    
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
    
    // Simulate assignments
    const tempAvailable = { ...ROOM_INVENTORY };
    
    Object.entries(inHouse).forEach(([roomType, count]) => {
        const checkout = dueOuts[roomType] || 0;
        const netOccupied = count - checkout;
        if (tempAvailable[roomType]) {
            tempAvailable[roomType] = Math.max(0, tempAvailable[roomType] - netOccupied);
        }
    });
    
    // ADA guests first
    const adaGuests = reservations.filter(r => r.special_requests && r.special_requests.includes('ADA'));
    adaGuests.forEach(guest => {
        simulateAssignment(guest, tempAvailable, overbookedTypes, true);
    });
    
    // Remaining guests
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
        'Lifetime Diamond': 100, 'Diamond': 90, 'Gold': 80,
        'Silver': 70, 'Blue': 60, 'Non-Member': 50
    };
    return priorities[status] || 0;
}

function simulateAssignment(guest, available, overbookedTypes, isADA) {
    const bookedType = guest.room_type; // FIXED: Use room_type
    
    if (available[bookedType] > 0) {
        available[bookedType]--;
        finalAssignments.push({
            ...guest,
            assigned_room_type: bookedType,
            assignment_type: 'standard'
        });
        return true;
    }
    
    // Try upgrades
    if (!isADA && !ADA_ROOMS.includes(bookedType)) {
        const upgrades = UPGRADE_PATHS[bookedType] || [];
        for (let upgradeType of upgrades) {
            if (available[upgradeType] > 0 && !NAMED_SUITES.includes(upgradeType)) {
                available[upgradeType]--;
                pendingAlerts.push({
                    type: 'warning',
                    message: `⚠️ UPGRADE REQUIRED: ${guest.guest_name} (${guest.honors_status}) - ${bookedType} → ${upgradeType}`,
                    guest_name: guest.guest_name,
                    approved: false
                });
                finalAssignments.push({
                    ...guest,
                    assigned_room_type: upgradeType,
                    assignment_type: 'upgraded'
                });
                return true;
            }
        }
    }
    
    // Try cross-category
    if (!isADA) {
        const crossUpgrades = CROSS_CATEGORY_UPGRADES[bookedType] || [];
        for (let upgradeType of crossUpgrades) {
            if (available[upgradeType] > 0 && !NAMED_SUITES.includes(upgradeType)) {
                available[upgradeType]--;
                pendingAlerts.push({
                    type: 'warning',
                    message: `⚠️ CROSS-CATEGORY UPGRADE: ${guest.guest_name} - ${bookedType} → ${upgradeType}`,
                    guest_name: guest.guest_name,
                    approved: false
                });
                finalAssignments.push({
                    ...guest,
                    assigned_room_type: upgradeType,
                    assignment_type: 'cross-category'
                });
                return true;
            }
        }
    }
    
    // Try named suites
    for (let roomType of NAMED_SUITES) {
        if (available[roomType] > 0) {
            available[roomType]--;
            pendingAlerts.push({
                type: 'danger',
                message: `🚨 NAMED SUITE UPGRADE: ${guest.guest_name} - ${bookedType} → ${roomType} (requires approval)`,
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
    
    // Walk guest
    pendingAlerts.push({
        type: 'danger',
        message: `❌ WALK GUEST: ${guest.guest_name} - Cannot accommodate. Contact nearby hotels.`,
        guest_name: guest.guest_name,
        approved: false
    });
    
    return false;
}

// DISPLAY PREVIEW - WITH CORRECT OCCUPANCY CALCULATION
function displayPreview(reservations, overbookings, demand, inHouse, dueOuts) {
    document.getElementById('previewTotalGuests').textContent = reservations.length;
    document.getElementById('previewOverbookings').textContent = overbookings.length;
    document.getElementById('previewAlerts').textContent = pendingAlerts.length;
    
    // Calculate TOTAL occupied rooms: (In House - Due Outs + New Arrivals)
    const occupancyInHouse = Object.values(inHouse).reduce((a, b) => a + b, 0);
    const occupancyDueOuts = Object.values(dueOuts).reduce((a, b) => a + b, 0);
    const totalOccupied = occupancyInHouse - occupancyDueOuts + reservations.length;
    const occupancy = ((totalOccupied / 321) * 100).toFixed(0);
    document.getElementById('previewOccupancy').textContent = occupancy + '% (' + totalOccupied + ' rooms)';
    
    const tbody = document.getElementById('previewOverbookingTable').querySelector('tbody');
    tbody.innerHTML = '';
    
    // Table totals - use DIFFERENT variable names to avoid conflict
    let tableAvailable = 0;
    let tableArrivals = 0;
    let tableSold = 0;
    let tableOOO = 0;
    let tableTotalInventory = 0;
    let tableDepartures = 0;
    let tableInHouse = 0;
    let tableOverbooked = 0;
    
    const allRoomTypes = Object.keys(ROOM_INVENTORY);
    
    allRoomTypes.sort((a, b) => {
        const demandA = demand[a] || 0;
        const demandB = demand[b] || 0;
        return demandB - demandA;
    }).forEach(roomType => {
        const arrivals = demand[roomType] || 0;
        const totalInventory = ROOM_INVENTORY[roomType] || 0;
        const inHouseCount = inHouse[roomType] || 0;
        const departuresCount = dueOuts[roomType] || 0;
        const sold = inHouseCount - departuresCount;  // Rooms staying over from last night
        const ooo = 0;  // Out of Order rooms (can be made dynamic later)
        const actuallyAvailable = totalInventory - sold - ooo;  // Available for new arrivals
        const overby = Math.max(0, arrivals - actuallyAvailable);
        const status = overby > 0 ? 'OVERBOOKED' : 'OK';
        
        tableAvailable += actuallyAvailable;
        tableArrivals += arrivals;
        tableSold += sold;
        tableOOO += ooo;
        tableTotalInventory += totalInventory;
        tableDepartures += departuresCount;
        tableInHouse += inHouseCount;
        tableOverbooked += overby;
        
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${roomType}</strong></td>
            <td>${actuallyAvailable}</td>
            <td>${arrivals}</td>
            <td>${sold}</td>
            <td>${ooo}</td>
            <td>${totalInventory}</td>
            <td>${departuresCount}</td>
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
        <td><strong>${tableAvailable}</strong></td>
        <td><strong>${tableArrivals}</strong></td>
        <td><strong>${tableSold}</strong></td>
        <td><strong>${tableOOO}</strong></td>
        <td><strong>${tableTotalInventory}</strong></td>
        <td><strong>${tableDepartures}</strong></td>
        <td><strong>${tableInHouse}</strong></td>
        <td><strong>${tableOverbooked > 0 ? tableOverbooked : '-'}</strong></td>
        <td><span class="badge ${tableOverbooked > 0 ? 'overbooked' : 'ok'}">${tableOverbooked > 0 ? 'OVERBOOKED' : 'OK'}</span></td>
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
        if (btn) {
            btn.textContent = 'Finalize Assignments';
            btn.disabled = false;
        }
    } else {
        pendingAlerts.forEach((alert, index) => {
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert-item ${alert.type}`;
            alertDiv.innerHTML = `
                <input type="checkbox" id="checkbox-${index}" class="alert-checkbox">
                <span class="alert-icon">${alert.type === 'danger' ? '🚨' : '⚠️'}</span>
                <div class="alert-content">
                    <strong>${alert.message}</strong>
                </div>
            `;
            alertsList.appendChild(alertDiv);
        });
        
        const btn = document.getElementById('finalizeBtn');
        if (btn) {
            btn.textContent = `Review & Approve ${pendingAlerts.length} Alert${pendingAlerts.length > 1 ? 's' : ''}`;
            btn.disabled = false;
        }
    }
}

// FINALIZE BUTTON HANDLER
document.getElementById('finalizeBtn').addEventListener('click', () => {
    const approvedGuestNames = new Set();
    const remainingAlerts = [];
    
    pendingAlerts.forEach((alert, index) => {
        const checkbox = document.getElementById(`checkbox-${index}`);
        if (checkbox && checkbox.checked) {
            approvedGuestNames.add(alert.guest_name);
        } else {
            remainingAlerts.push(alert);
        }
    });
    
    pendingAlerts = remainingAlerts;
    
    if (pendingAlerts.length === 0) {
        document.getElementById('previewPhase').classList.add('hidden');
        document.getElementById('resultsPhase').classList.remove('hidden');
        displayFinalResults([]);
    } else {
        const reservations = allReservations.filter(r => r.checkin_date === currentDate);
        const currentDateObj = new Date(currentDate);
        const inHouse = {};
        const dueOuts = {};
        
        allReservations.forEach(res => {
            const checkinDate = new Date(res.checkin_date);
            const checkoutDate = new Date(res.checkout_date);
            const roomType = res.room_type;
            
            if (checkinDate < currentDateObj && checkoutDate > currentDateObj) {
                inHouse[roomType] = (inHouse[roomType] || 0) + 1;
            }
            
            if (checkoutDate.toISOString().split('T')[0] === currentDate) {
                dueOuts[roomType] = (dueOuts[roomType] || 0) + 1;
            }
        });
        
        const demand = {};
        reservations.forEach(r => {
            demand[r.room_type] = (demand[r.room_type] || 0) + 1;
        });
        
        displayPreview(reservations, [], demand, inHouse, dueOuts);
    }
});

// DISPLAY FINAL RESULTS - WITH CORRECT OCCUPANCY CALCULATION
function displayFinalResults(unapprovedAlerts = []) {
    const reservations = allReservations.filter(r => r.checkin_date === currentDate);
    
    document.getElementById('statTotalGuests').textContent = reservations.length;
    document.getElementById('statAssigned').textContent = finalAssignments.length;
    
    const upgrades = finalAssignments.filter(a => a.assignment_type !== 'standard').length;
    document.getElementById('statUpgrades').textContent = upgrades;
    
    // Calculate TOTAL occupied rooms (In House - Due Outs + Arrivals)
    const currentDateObj = new Date(currentDate);
    let resultsInHouse = 0;
    let resultsDueOuts = 0;
    
    allReservations.forEach(res => {
        const checkinDate = new Date(res.checkin_date);
        const checkoutDate = new Date(res.checkout_date);
        
        if (checkinDate < currentDateObj && checkoutDate > currentDateObj) {
            resultsInHouse++;
        }
        
        if (checkoutDate.toISOString().split('T')[0] === currentDate) {
            resultsDueOuts++;
        }
    });
    
    const totalOccupied = Math.min(321, resultsInHouse - resultsDueOuts + reservations.length);
    const occupancy = ((totalOccupied / 321) * 100).toFixed(0);
    document.getElementById('statOccupancy').textContent = occupancy + '% (' + totalOccupied + ' rooms)';
    
    let bannerHTML = '';
    
    if (unapprovedAlerts.length > 0) {
        bannerHTML = `
            <div style="padding: 20px; background: #fff3e0; border: 2px solid #f57c00; border-radius: 8px; margin-bottom: 20px;">
                <strong style="color: #f57c00; font-size: 16px;">⚠️ ${unapprovedAlerts.length} Unresolved Alert${unapprovedAlerts.length > 1 ? 's' : ''} - Manual Handling Required</strong>
                <div style="margin-top: 15px;">
                    ${unapprovedAlerts.map(alert => `
                        <div style="padding: 10px; background: white; margin-top: 10px; border-left: 4px solid #f57c00;">
                            ${alert.message}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    document.getElementById('summaryBanner').innerHTML = bannerHTML;
    
    const assignmentTable = document.getElementById('assignmentTable').querySelector('tbody');
    assignmentTable.innerHTML = '';
    
    finalAssignments.forEach(assignment => {
        const isUpgrade = assignment.room_type !== assignment.assigned_room_type;
        const row = assignmentTable.insertRow();
        row.innerHTML = `
            <td>${assignment.reservation_id}</td>
            <td>${assignment.guest_name}</td>
            <td>${assignment.honors_status}</td>
            <td>${assignment.room_type}</td>
            <td><strong>${assignment.assigned_room_type}</strong> ${isUpgrade ? '↑' : ''}</td>
            <td><span class="badge ${isUpgrade ? 'upgraded' : 'standard'}">${assignment.assignment_type.toUpperCase()}</span></td>
        `;
    });
}

// EXPORT CSV HANDLER
document.getElementById('exportBtn').addEventListener('click', () => {
    let csv = 'Reservation ID,Guest Name,Honors Status,Booked Room Type,Assigned Room Type,Assignment Type\n';
    
    finalAssignments.forEach(a => {
        csv += `${a.reservation_id},${a.guest_name},${a.honors_status},${a.room_type},${a.assigned_room_type},${a.assignment_type}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `room-assignments-${currentDate}.csv`;
    a.click();
});

// START OVER HANDLER
document.getElementById('startOverBtn').addEventListener('click', () => {
    document.getElementById('resultsPhase').classList.add('hidden');
    document.getElementById('dateSelect').value = '';
    pendingAlerts = [];
    finalAssignments = [];
});

