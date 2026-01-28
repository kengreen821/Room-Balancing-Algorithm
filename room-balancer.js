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
    
    // Show AI recommendations section if overbookings exist or high occupancy
    const aiSection = document.getElementById('aiRecommendationsSection');
    if (overbookings.length > 0 || occupancy >= 95) {
        aiSection.style.display = 'block';
        // Reset AI recommendations for new analysis
        document.getElementById('aiRecommendationsList').innerHTML = '';
        document.getElementById('refreshAIBtn').style.display = 'none';
    } else {
        aiSection.style.display = 'none';
    }
    
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

// ============================================================================
// AI UPGRADE RECOMMENDATIONS SYSTEM
// ============================================================================

let aiRecommendations = [];

// API KEY MANAGEMENT
function getStoredApiKey() {
    return localStorage.getItem('claude_api_key') || '';
}

function saveApiKey(key) {
    if (key && key.trim()) {
        localStorage.setItem('claude_api_key', key.trim());
        return true;
    }
    return false;
}

function clearApiKey() {
    localStorage.removeItem('claude_api_key');
}

// Initialize API key on page load
window.addEventListener('DOMContentLoaded', () => {
    const storedKey = getStoredApiKey();
    if (storedKey) {
        updateApiKeyStatus(true);
    }
});

function updateApiKeyStatus(hasKey) {
    const statusEl = document.getElementById('apiKeyStatus');
    const manageBtn = document.getElementById('manageApiKeyBtn');
    
    if (statusEl) {
        if (hasKey) {
            statusEl.innerHTML = '🔑 <strong>API Key Saved</strong> - Using Real AI Mode';
            statusEl.style.background = 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)';
            statusEl.style.color = 'white';
            if (manageBtn) manageBtn.textContent = '⚙️ Manage API Key';
        } else {
            statusEl.innerHTML = '🎭 <strong>Demo Mode</strong> - Enter API key for real AI analysis';
            statusEl.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            statusEl.style.color = 'white';
            if (manageBtn) manageBtn.textContent = '🔑 Add API Key';
        }
    }
}

// CALL CLAUDE API FOR UPGRADE ANALYSIS
async function getAIUpgradeRecommendations(guests, overbookings) {
    let apiKey = getStoredApiKey();
    
    if (!apiKey || apiKey.trim() === '') {
        // DEMO MODE: Generate mock recommendations
        return generateDemoRecommendations(guests, overbookings);
    }
    
    try {
        // Prepare guest data for analysis
        const guestData = guests.slice(0, 20).map(g => ({
            name: g.guest_name,
            honors: g.honors_status,
            room_type: g.room_type,
            los: g.length_of_stay,
            rate: g.rate_type,
            requests: g.special_requests || 'None'
        }));
        
        const overbookingData = overbookings.map(o => ({
            type: o.roomType,
            overby: o.overby
        }));
        
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 2000,
                messages: [{
                    role: "user",
                    content: `You are analyzing guests for an overbooked hotel to recommend intelligent upgrades.

OVERBOOKED ROOM TYPES:
${JSON.stringify(overbookingData, null, 2)}

GUEST ARRIVALS (first 20):
${JSON.stringify(guestData, null, 2)}

For guests needing upgrades, consider:
1. Honors Status (Diamond/Gold = high priority)
2. Length of Stay (longer = more important)
3. Rate Type (Direct = high value, Third-Party = low)
4. Special Requests (anniversaries, birthdays, etc.)

Return JSON array of top 5-7 upgrade recommendations with this structure:
[{
  "guest_name": "name",
  "priority": "high|medium|low",
  "from_room": "KNGN",
  "to_room": "NKSP",
  "reasoning": "Brief explanation of why this guest should be upgraded"
}]

Focus on guests who would most appreciate the upgrade and have highest loyalty value.`
                }]
            })
        });
        
        const data = await response.json();
        const content = data.content[0].text;
        
        // Extract JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        throw new Error('Could not parse AI response');
        
    } catch (error) {
        console.error('AI API Error:', error);
        // Fallback to demo mode
        return generateDemoRecommendations(guests, overbookings);
    }
}

// GENERATE DEMO RECOMMENDATIONS (when no API key)
function generateDemoRecommendations(guests, overbookings) {
    const recommendations = [];
    
    // Priority scoring
    const scored = guests.map(g => {
        let score = 0;
        
        // Honors status
        if (g.honors_status === 'Diamond' || g.honors_status === 'Lifetime Diamond') score += 100;
        else if (g.honors_status === 'Gold') score += 80;
        else if (g.honors_status === 'Silver') score += 60;
        else if (g.honors_status === 'Blue') score += 40;
        
        // Length of stay
        score += g.length_of_stay * 10;
        
        // Rate type
        if (g.rate_type === 'Direct') score += 50;
        else if (g.rate_type === 'AAA') score += 40;
        else if (g.rate_type === 'Government') score += 30;
        else if (g.rate_type === 'Corporate') score += 25;
        else if (g.rate_type === 'Third-Party') score += 5;
        
        // Special requests
        if (g.special_requests && (g.special_requests.includes('anniversary') || g.special_requests.includes('birthday'))) {
            score += 75;
        }
        
        return { ...g, score };
    }).sort((a, b) => b.score - a.score);
    
    // Generate recommendations for top guests
    scored.slice(0, 7).forEach(guest => {
        let priority = 'low';
        let reasoning = '';
        
        if (guest.score > 150) {
            priority = 'high';
            reasoning = `${guest.honors_status} member`;
            if (guest.length_of_stay >= 4) reasoning += ` staying ${guest.length_of_stay} nights`;
            if (guest.rate_type === 'Direct') reasoning += `, booked directly with us`;
            if (guest.special_requests && guest.special_requests.includes('anniversary')) {
                reasoning += `. Celebrating anniversary - excellent opportunity for delight!`;
            } else if (guest.special_requests && guest.special_requests.includes('birthday')) {
                reasoning += `. Birthday celebration - create memorable experience!`;
            }
        } else if (guest.score > 100) {
            priority = 'medium';
            reasoning = `${guest.honors_status} member, ${guest.length_of_stay} night stay. Good upgrade candidate for loyalty building.`;
        } else {
            priority = 'low';
            reasoning = `${guest.length_of_stay} night stay with ${guest.rate_type} rate. Standard upgrade opportunity.`;
        }
        
        // Determine upgrade path
        let toRoom = guest.room_type;
        if (UPGRADE_PATHS[guest.room_type] && UPGRADE_PATHS[guest.room_type].length > 0) {
            toRoom = UPGRADE_PATHS[guest.room_type][0];
        }
        
        recommendations.push({
            guest_name: guest.guest_name,
            priority: priority,
            from_room: guest.room_type,
            to_room: toRoom,
            reasoning: reasoning,
            honors_status: guest.honors_status,
            length_of_stay: guest.length_of_stay,
            rate_type: guest.rate_type,
            special_requests: guest.special_requests || 'None'
        });
    });
    
    return recommendations;
}

// DISPLAY AI RECOMMENDATIONS
function displayAIRecommendations(recommendations) {
    const container = document.getElementById('aiRecommendationsList');
    container.innerHTML = '';
    
    if (!recommendations || recommendations.length === 0) {
        container.innerHTML = `
            <div class="ai-error">
                <h3>No Recommendations Generated</h3>
                <p>Try analyzing a date with more overbookings or guests with higher loyalty tiers.</p>
            </div>
        `;
        return;
    }
    
    recommendations.forEach((rec, index) => {
        const card = document.createElement('div');
        card.className = 'ai-recommendation-card';
        card.innerHTML = `
            <div class="ai-rec-header">
                <div class="ai-rec-guest">👤 ${rec.guest_name}</div>
                <div class="ai-rec-priority ${rec.priority}">${rec.priority} Priority</div>
            </div>
            
            <div class="ai-rec-body">
                <div class="ai-rec-detail">
                    <strong>Status:</strong> ${rec.honors_status || 'Non-Member'}
                </div>
                <div class="ai-rec-detail">
                    <strong>Length:</strong> ${rec.length_of_stay || 1} nights
                </div>
                <div class="ai-rec-detail">
                    <strong>Rate:</strong> ${rec.rate_type || 'Standard'}
                </div>
                <div class="ai-rec-detail">
                    <strong>Requests:</strong> ${rec.special_requests || 'None'}
                </div>
            </div>
            
            <div class="ai-rec-reasoning">
                <div class="ai-rec-reasoning-title">
                    💡 AI Analysis
                </div>
                <div class="ai-rec-reasoning-text">
                    ${rec.reasoning}
                </div>
            </div>
            
            <div class="ai-rec-upgrade">
                <span>${rec.from_room}</span>
                <span class="ai-rec-upgrade-arrow">→</span>
                <span>${rec.to_room}</span>
            </div>
        `;
        
        container.appendChild(card);
    });
    
    // Show refresh button
    document.getElementById('refreshAIBtn').style.display = 'inline-block';
}

// GET AI RECOMMENDATIONS BUTTON
document.getElementById('getAIRecommendationsBtn').addEventListener('click', async () => {
    const btn = document.getElementById('getAIRecommendationsBtn');
    const container = document.getElementById('aiRecommendationsList');
    
    // Show loading
    btn.disabled = true;
    btn.textContent = '⏳ Analyzing guests...';
    container.innerHTML = `
        <div class="ai-loading">
            <div class="ai-loading-spinner"></div>
            <h3>Claude AI is analyzing your guests...</h3>
            <p>Considering honors status, length of stay, rate types, and special occasions.</p>
        </div>
    `;
    
    try {
        const reservations = allReservations.filter(r => r.checkin_date === currentDate);
        const overbookings = []; // Get from existing analysis
        
        // Calculate overbookings
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
        
        Object.entries(demand).forEach(([roomType, arrivals]) => {
            const totalInventory = ROOM_INVENTORY[roomType] || 0;
            const sold = (inHouse[roomType] || 0) - (dueOuts[roomType] || 0);
            const available = totalInventory - sold;
            
            if (arrivals > available) {
                overbookings.push({
                    roomType,
                    arrivals,
                    available,
                    overby: arrivals - available
                });
            }
        });
        
        // Get AI recommendations
        aiRecommendations = await getAIUpgradeRecommendations(reservations, overbookings);
        displayAIRecommendations(aiRecommendations);
        
    } catch (error) {
        console.error('Error getting AI recommendations:', error);
        container.innerHTML = `
            <div class="ai-error">
                <h3>⚠️ Error Getting Recommendations</h3>
                <p>${error.message}</p>
                <p>Falling back to demo mode...</p>
            </div>
        `;
        
        setTimeout(async () => {
            const reservations = allReservations.filter(r => r.checkin_date === currentDate);
            aiRecommendations = generateDemoRecommendations(reservations, []);
            displayAIRecommendations(aiRecommendations);
        }, 2000);
    } finally {
        btn.disabled = false;
        btn.textContent = '🤖 Get AI Recommendations';
    }
});

// REFRESH AI RECOMMENDATIONS
document.getElementById('refreshAIBtn').addEventListener('click', () => {
    document.getElementById('getAIRecommendationsBtn').click();
});

// MANAGE API KEY BUTTON
document.getElementById('manageApiKeyBtn').addEventListener('click', () => {
    const currentKey = getStoredApiKey();
    
    if (currentKey) {
        // Key exists - show manage options
        const action = confirm('You have an API key saved. Choose:\n\nOK = Change Key\nCancel = Delete Key');
        
        if (action) {
            // Change key
            const newKey = prompt('Enter your new Claude API key:', currentKey);
            if (newKey && newKey.trim() && newKey !== currentKey) {
                if (saveApiKey(newKey)) {
                    updateApiKeyStatus(true);
                    alert('✅ API key updated successfully!\n\nYou\'re now using Real AI Mode.');
                }
            }
        } else {
            // Delete key
            const confirmDelete = confirm('Are you sure you want to delete your API key?\n\nYou\'ll switch to Demo Mode.');
            if (confirmDelete) {
                clearApiKey();
                updateApiKeyStatus(false);
                alert('🎭 API key deleted. Now using Demo Mode.');
            }
        }
    } else {
        // No key - add new one
        const newKey = prompt('Enter your Claude API key:\n\n(Get it from: https://console.anthropic.com/settings/keys)\n\nLeave blank to continue with Demo Mode.');
        
        if (newKey && newKey.trim()) {
            if (saveApiKey(newKey)) {
                updateApiKeyStatus(true);
                alert('✅ API key saved successfully!\n\nYou\'re now using Real AI Mode.\n\nCost: ~$0.01-0.02 per recommendation.');
            }
        }
    }
});

