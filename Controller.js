// Controller Logic
let currentSession = null;
let sessionRef = null;
let clientConnected = false;
let lockState = 'unlocked';
let clientListener = null;
let sessionListener = null;

// Global auth state handler
window.onAuthStateChanged = function(user) {
    if (user) {
        updateStatus('firebaseStatus', 'Connected to Firebase', 'connected');
        logActivity('Firebase authentication successful', 'success');
    } else {
        updateStatus('firebaseStatus', 'Not connected', 'disconnected');
    }
};

// Initialize controller
function initController() {
    // Check for session in URL (for direct linking)
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    
    if (sessionId) {
        loadExistingSession(sessionId);
    }
    
    // Set up connection timer
    startConnectionTimer();
    
    // Request notification permission
    requestNotificationPermission();
}

// Generate new session
async function generateNewSession() {
    try {
        // Generate unique session ID
        const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Create session in Firebase
        sessionRef = firebaseDatabase.ref('sessions/' + sessionId);
        
        const sessionData = {
            id: sessionId,
            created: firebase.database.ServerValue.TIMESTAMP,
            status: 'active',
            lockState: 'unlocked',
            controller: {
                uid: firebaseAuth.currentUser.uid,
                connected: true,
                lastSeen: Date.now()
            },
            client: {
                connected: false,
                lastSeen: null,
                deviceInfo: null
            },
            commands: [],
            settings: {
                requireConfirmation: false,
                vibrateOnLock: true,
                soundOnLock: true
            }
        };
        
        await sessionRef.set(sessionData);
        
        currentSession = sessionId;
        
        // Update UI
        updateSessionUI(sessionId);
        
        // Listen for client connection
        setupSessionListeners(sessionId);
        
        logActivity(`Session created: ${sessionId}`, 'success');
        
        return sessionId;
        
    } catch (error) {
        console.error('Error creating session:', error);
        logActivity(`Failed to create session: ${error.message}`, 'error');
        return null;
    }
}

// Load existing session
async function loadExistingSession(sessionId) {
    try {
        sessionRef = firebaseDatabase.ref('sessions/' + sessionId);
        const snapshot = await sessionRef.once('value');
        
        if (snapshot.exists()) {
            currentSession = sessionId;
            updateSessionUI(sessionId);
            setupSessionListeners(sessionId);
            logActivity(`Loaded existing session: ${sessionId}`, 'info');
        } else {
            logActivity(`Session ${sessionId} not found`, 'error');
        }
    } catch (error) {
        console.error('Error loading session:', error);
    }
}

// Update session UI
function updateSessionUI(sessionId) {
    document.getElementById('sessionIdDisplay').textContent = sessionId;
    
    // Generate shareable link
    const baseUrl = window.location.origin;
    const shareLink = `${baseUrl}/client.html?session=${sessionId}`;
    document.getElementById('shareLink').value = shareLink;
    
    // Enable buttons
    document.getElementById('lockBtn').disabled = false;
    document.getElementById('unlockBtn').disabled = false;
    document.getElementById('endBtn').disabled = false;
    document.getElementById('qrBtn').disabled = false;
    document.getElementById('generateBtn').disabled = true;
    
    // Update session info
    logActivity('Session ready. Share the link with your other phone.', 'info');
}

// Setup session listeners
function setupSessionListeners(sessionId) {
    if (!sessionRef) return;
    
    // Listen for client connection
    sessionRef.child('client/connected').on('value', (snapshot) => {
        clientConnected = snapshot.val() || false;
        
        const clientStatus = document.getElementById('clientStatusText');
        const clientBadge = document.getElementById('clientStatusBadge').querySelector('.badge');
        
        if (clientConnected) {
            clientStatus.textContent = 'Connected';
            clientStatus.className = 'status-connected';
            clientBadge.className = 'badge connected';
            clientBadge.textContent = 'Client Connected';
            
            logActivity('Client phone connected', 'success');
            
            // Send welcome command
            sendCommand('welcome', { message: 'Connected to controller' });
        } else {
            clientStatus.textContent = 'Disconnected';
            clientStatus.className = 'status-disconnected';
            clientBadge.className = 'badge disconnected';
            clientBadge.textContent = 'No Client';
        }
    });
    
    // Listen for lock state changes
    sessionRef.child('lockState').on('value', (snapshot) => {
        lockState = snapshot.val() || 'unlocked';
        
        const lockStateText = document.getElementById('lockStateText');
        lockStateText.textContent = lockState.charAt(0).toUpperCase() + lockState.slice(1);
        
        if (lockState === 'locked') {
            lockStateText.className = 'state-locked';
        } else {
            lockStateText.className = 'state-unlocked';
        }
    });
    
    // Listen for commands history
    sessionRef.child('commands').limitToLast(5).on('child_added', (snapshot) => {
        const command = snapshot.val();
        if (command && command.type === 'lock' || command.type === 'unlock') {
            document.getElementById('lastCommandTime').textContent = 
                new Date(command.timestamp).toLocaleTimeString();
        }
    });
    
    // Listen for client device info
    sessionRef.child('client/deviceInfo').on('value', (snapshot) => {
        const deviceInfo = snapshot.val();
        if (deviceInfo) {
            console.log('Client device info:', deviceInfo);
        }
    });
}

// Send lock command
async function sendLockCommand() {
    if (!currentSession || !clientConnected) {
        alert('No client connected. Connect a client first.');
        return;
    }
    
    try {
        const command = {
            type: 'lock',
            timestamp: Date.now(),
            id: 'lock_' + Date.now(),
            confirmed: false
        };
        
        // Update lock state
        await sessionRef.update({
            lockState: 'locked'
        });
        
        // Add to commands history
        await sessionRef.child('commands').push(command);
        
        logActivity('Lock command sent to client', 'command');
        
        // Show notification
        if (Notification.permission === 'granted') {
            new Notification('Phone Locked', {
                body: 'Lock command sent to client phone',
                icon: 'icons/icon-96x96.png',
                badge: 'icons/icon-72x72.png'
            });
        }
        
        // Vibrate controller (if supported)
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
        
    } catch (error) {
        console.error('Error sending lock command:', error);
        logActivity(`Failed to send lock command: ${error.message}`, 'error');
    }
}

// Send unlock command
async function sendUnlockCommand() {
    if (!currentSession) {
        alert('No active session');
        return;
    }
    
    try {
        const command = {
            type: 'unlock',
            timestamp: Date.now(),
            id: 'unlock_' + Date.now(),
            confirmed: false
        };
        
        // Update lock state
        await sessionRef.update({
            lockState: 'unlocked'
        });
        
        // Add to commands history
        await sessionRef.child('commands').push(command);
        
        logActivity('Unlock command sent to client', 'command');
        
    } catch (error) {
        console.error('Error sending unlock command:', error);
        logActivity(`Failed to send unlock command: ${error.message}`, 'error');
    }
}

// Send custom command
async function sendCommand(type, data = {}) {
    if (!currentSession) return;
    
    try {
        const command = {
            type: type,
            timestamp: Date.now(),
            id: type + '_' + Date.now(),
            data: data,
            confirmed: false
        };
        
        await sessionRef.child('commands').push(command);
        
        logActivity(`Command sent: ${type}`, 'command');
        
    } catch (error) {
        console.error('Error sending command:', error);
    }
}

// End current session
async function endCurrentSession() {
    if (!currentSession || !sessionRef) return;
    
    if (confirm('Are you sure you want to end this session? The client will be disconnected.')) {
        try {
            // Send disconnect command
            await sendCommand('disconnect', { reason: 'session_ended' });
            
            // Remove session from Firebase
            await sessionRef.remove();
            
            // Reset UI
            resetSessionUI();
            
            logActivity('Session ended. Client disconnected.', 'info');
            
        } catch (error) {
            console.error('Error ending session:', error);
            logActivity(`Failed to end session: ${error.message}`, 'error');
        }
    }
}

// Reset session UI
function resetSessionUI() {
    document.getElementById('sessionIdDisplay').textContent = 'No active session';
    document.getElementById('shareLink').value = '';
    document.getElementById('lockBtn').disabled = true;
    document.getElementById('unlockBtn').disabled = true;
    document.getElementById('endBtn').disabled = true;
    document.getElementById('qrBtn').disabled = true;
    document.getElementById('generateBtn').disabled = false;
    
    document.getElementById('clientStatusText').textContent = 'Disconnected';
    document.getElementById('clientStatusText').className = 'status-disconnected';
    document.getElementById('lockStateText').textContent = 'Unlocked';
    document.getElementById('lockStateText').className = 'state-unlocked';
    document.getElementById('lastCommandTime').textContent = 'Never';
    
    // Clear QR code
    const qrcode = document.getElementById('qrcode');
    qrcode.innerHTML = '';
    
    // Remove listeners
    if (sessionRef) {
        sessionRef.off();
        sessionRef = null;
    }
    
    currentSession = null;
    clientConnected = false;
}

// Generate QR code
function generateQRCode() {
    if (!currentSession) {
        alert('Generate a session first');
        return;
    }
    
    const qrcode = document.getElementById('qrcode');
    qrcode.innerHTML = '';
    
    const baseUrl = window.location.origin;
    const shareLink = `${baseUrl}/client.html?session=${currentSession}`;
    
    // Generate QR code using library
    QRCode.toCanvas(qrcode, shareLink, {
        width: 200,
        height: 200,
        margin: 1,
        color: {
            dark: '#2c3e50',
            light: '#ffffff'
        }
    }, function(error) {
        if (error) {
            console.error('QR Code error:', error);
            logActivity('Failed to generate QR code', 'error');
        } else {
            logActivity('QR code generated. Scan with client phone.', 'info');
        }
    });
}

// Copy share link
function copyShareLink() {
    const shareLink = document.getElementById('shareLink');
    
    if (!shareLink.value) {
        alert('Generate a session first');
        return;
    }
    
    shareLink.select();
    shareLink.setSelectionRange(0, 99999); // For mobile
    
    try {
        navigator.clipboard.writeText(shareLink.value);
        
        // Show success feedback
        const originalText = shareLink.value;
        shareLink.value = '✓ Copied to clipboard!';
        
        setTimeout(() => {
            shareLink.value = originalText;
        }, 2000);
        
        logActivity('Share link copied to clipboard', 'info');
        
    } catch (error) {
        console.error('Copy failed:', error);
        alert('Copy failed. Please copy manually.');
    }
}

// Update status display
function updateStatus(elementId, text, status) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const dot = element.querySelector('.status-dot');
    
    if (dot) {
        dot.className = 'status-dot ' + status;
    }
    
    element.innerHTML = `<span class="status-dot ${status}"></span> ${text}`;
}

// Log activity
function logActivity(message, type = 'info') {
    const logContainer = document.getElementById('activityLog');
    const logEntry = document.createElement('div');
    
    const timestamp = new Date().toLocaleTimeString();
    const icon = getLogIcon(type);
    
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-time">[${timestamp}]</span>
        <span class="log-icon">${icon}</span>
        <span class="log-text">${message}</span>
    `;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // Keep log manageable
    const entries = logContainer.getElementsByClassName('log-entry');
    if (entries.length > 50) {
        logContainer.removeChild(entries[0]);
    }
}

// Get log icon
function getLogIcon(type) {
    switch(type) {
        case 'success': return '✓';
        case 'error': return '✗';
        case 'warning': return '⚠';
        case 'command': return '⚡';
        case 'info': return 'ℹ';
        default: return '•';
    }
}

// Clear log
function clearLog() {
    const logContainer = document.getElementById('activityLog');
    logContainer.innerHTML = '';
    logActivity('Log cleared', 'info');
}

// Request notification permission
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                logActivity('Notifications enabled', 'success');
            }
        });
    }
}

// Start connection timer
function startConnectionTimer() {
    const startTime = Date.now();
    const timerElement = document.getElementById('connectionTime');
    
    setInterval(() => {
        const elapsed = Date.now() - startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        if (hours > 0) {
            timerElement.textContent = `Connected: ${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            timerElement.textContent = `Connected: ${minutes}m ${seconds}s`;
        } else {
            timerElement.textContent = `Connected: ${seconds}s`;
        }
    }, 1000);
}

// Show install promotion (for controller PWA)
function showInstallPromotion() {
    // You can add install promotion for controller too
    console.log('Install promotion available');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initController);
