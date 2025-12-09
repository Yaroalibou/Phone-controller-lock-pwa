// Client Logic
let currentSessionId = null;
let sessionRef = null;
let isLocked = false;
let clientId = null;
let startTime = Date.now();
let batteryMonitor = null;
let cameraStream = null;

// Global auth state handler
window.onAuthStateChanged = function(user) {
    if (user) {
        updateStatus('firebaseStatus', 'Connected to Firebase', 'connected');
        logCommand('Firebase authentication successful', 'success');
        
        // Generate client ID
        clientId = 'client_' + user.uid.substring(0, 8);
        document.getElementById('clientId').textContent = clientId;
        
        // Check for session in URL
        checkURLForSession();
        
        // Initialize device info
        updateDeviceInfo();
        
        // Start battery monitoring
        startBatteryMonitoring();
        
        // Request necessary permissions
        requestPermissions();
        
    } else {
        updateStatus('firebaseStatus', 'Not connected', 'disconnected');
    }
};

// Check URL for session parameter
function checkURLForSession() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    
    if (sessionId) {
        document.getElementById('currentSessionId').textContent = sessionId;
        document.getElementById('lockSessionId').textContent = sessionId;
        connectToSession(sessionId);
    } else {
        // No session in URL, show connect options
        document.getElementById('sessionConnectCard').style.display = 'block';
    }
}

// Connect to session
async function connectToSession(sessionId) {
    if (!sessionId || sessionId.trim() === '') {
        alert('Please enter a valid session ID');
        return;
    }
    
    try {
        // Check if session exists
        sessionRef = firebaseDatabase.ref('sessions/' + sessionId);
        const snapshot = await sessionRef.once('value');
        
        if (!snapshot.exists()) {
            alert('Session not found. Please check the session ID.');
            logCommand('Session not found: ' + sessionId, 'error');
            return;
        }
        
        currentSessionId = sessionId;
        
        // Update UI
        document.getElementById('currentSessionId').textContent = sessionId;
        document.getElementById('lockSessionId').textContent = sessionId;
        document.getElementById('sessionStatus').innerHTML = 
            '<span class="status-dot connecting"></span> Connecting...';
        
        // Set client as connected
        await sessionRef.child('client').update({
            connected: true,
            lastSeen: Date.now(),
            deviceInfo: getDeviceInfo(),
            clientId: clientId
        });
        
        // Setup session listeners
        setupSessionListeners();
        
        // Update UI
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('disconnectBtn').disabled = false;
        document.getElementById('sessionConnectCard').style.display = 'none';
        
        logCommand('Connected to session: ' + sessionId, 'success');
        
        // Send welcome message to controller
        await sessionRef.child('commands').push({
            type: 'client_connected',
            timestamp: Date.now(),
            clientId: clientId,
            device: getDeviceInfo()
        });
        
    } catch (error) {
        console.error('Error connecting to session:', error);
        logCommand('Connection failed: ' + error.message, 'error');
        alert('Failed to connect to session. Please try again.');
    }
}

// Setup session listeners
function setupSessionListeners() {
    if (!sessionRef) return;
    
    // Listen for lock state changes
    sessionRef.child('lockState').on('value', (snapshot) => {
        const state = snapshot.val();
        handleLockStateChange(state);
    });
    
    // Listen for commands
    sessionRef.child('commands').on('child_added', (snapshot) => {
        const command = snapshot.val();
        handleCommand(command);
    });
    
    // Listen for session status
    sessionRef.child('status').on('value', (snapshot) => {
        const status = snapshot.val();
        if (status === 'ended') {
            handleSessionEnded();
        }
    });
    
    // Update last seen periodically
    setInterval(() => {
        if (sessionRef) {
            sessionRef.child('client/lastSeen').set(Date.now());
        }
    }, 30000);
}

// Handle lock state changes
function handleLockStateChange(state) {
    const lockStatus = document.getElementById('lockStatusDisplay');
    const lockStateText = lockStatus.querySelector('.lock-state-text');
    const statusDot = lockStatus.querySelector('.status-dot');
    
    if (state === 'locked' && !isLocked) {
        // Lock the phone
        lockPhone();
        
        lockStateText.textContent = 'Locked';
        lockStateText.className = 'lock-state-text locked';
        statusDot.className = 'status-dot locked';
        
        logCommand('Phone locked by controller', 'warning');
        
    } else if (state === 'unlocked' && isLocked) {
        // Unlock the phone
        unlockPhone();
        
        lockStateText.textContent = 'Unlocked';
        lockStateText.className = 'lock-state-text unlocked';
        statusDot.className = 'status-dot unlocked';
        
        logCommand('Phone unlocked by controller', 'success');
    }
    
    // Update session status
    updateStatus('sessionStatus', 'Connected', 'connected');
}

// Lock phone
function lockPhone() {
    isLocked = true;
    
    // Show lock screen
    const lockScreen = document.getElementById('lockScreen');
    lockScreen.style.display = 'block';
    
    // Prevent interaction
    document.body.style.overflow = 'hidden';
    document.body.classList.add('locked');
    
    // Vibrate (if enabled)
    if (Notification.permission === 'granted' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }
    
    // Play lock sound (if enabled)
    playLockSound();
    
    // Send notification
    sendLockNotification();
    
    // Prevent navigation
    window.addEventListener('beforeunload', preventUnload);
    window.addEventListener('popstate', preventNavigation);
    
    // Disable context menu
    document.addEventListener('contextmenu', preventDefault);
    
    // Disable keyboard shortcuts
    document.addEventListener('keydown', preventShortcuts);
    
    // Disable touch gestures
    document.addEventListener('touchmove', preventDefault, { passive: false });
    
    // Update lock screen time
    updateLockScreenTime();
}

// Unlock phone
function unlockPhone() {
    isLocked = false;
    
    // Hide lock screen
    const lockScreen = document.getElementById('lockScreen');
    lockScreen.style.display = 'none';
    
    // Restore interaction
    document.body.style.overflow = 'auto';
    document.body.classList.remove('locked');
    
    // Vibrate for unlock
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
    
    // Remove event listeners
    window.removeEventListener('beforeunload', preventUnload);
    window.removeEventListener('popstate', preventNavigation);
    document.removeEventListener('contextmenu', preventDefault);
    document.removeEventListener('keydown', preventShortcuts);
    document.removeEventListener('touchmove', preventDefault);
}

// Handle commands
function handleCommand(command) {
    if (!command || !command.type) return;
    
    switch(command.type) {
        case 'lock':
        case 'unlock':
            // Already handled by lock state listener
            break;
            
        case 'welcome':
            logCommand(`Controller: ${command.data?.message || 'Welcome'}`, 'info');
            break;
            
        case 'disconnect':
            handleDisconnectCommand(command.data?.reason);
            break;
            
        case 'test':
            handleTestCommand(command.data);
            break;
            
        default:
            logCommand(`Received command: ${command.type}`, 'info');
    }
}

// Handle disconnect command
function handleDisconnectCommand(reason) {
    logCommand(`Disconnected by controller: ${reason || 'No reason given'}`, 'warning');
    
    // Show message to user
    if (!isLocked) {
        alert('Disconnected from controller. You can reconnect anytime.');
    }
    
    // Disconnect from session
    disconnectSession();
}

// Handle test command
function handleTestCommand(data) {
    if (data?.type === 'vibration') {
        testVibration();
    } else if (data?.type === 'sound') {
        testSound();
    } else if (data?.type === 'notification') {
        testNotification();
    }
}

// Disconnect from session
async function disconnectSession() {
    if (!sessionRef) return;
    
    try {
        // Update session
        await sessionRef.child('client').update({
            connected: false,
            disconnectedAt: Date.now()
        });
        
        // Remove listeners
        sessionRef.off();
        sessionRef = null;
        currentSessionId = null;
        
        // Reset UI
        document.getElementById('currentSessionId').textContent = 'No session connected';
        document.getElementById('connectBtn').disabled = false;
        document.getElementById('disconnectBtn').disabled = true;
        document.getElementById('sessionConnectCard').style.display = 'block';
        
        updateStatus('sessionStatus', 'Disconnected', 'disconnected');
        
        logCommand('Disconnected from session', 'info');
        
    } catch (error) {
        console.error('Error disconnecting:', error);
        logCommand('Disconnect failed: ' + error.message, 'error');
    }
}

// Handle session ended
function handleSessionEnded() {
    logCommand('Session ended by controller', 'warning');
    
    if (!isLocked) {
        alert('Session has been ended by the controller.');
    }
    
    disconnectSession();
}

// Get device info
function getDeviceInfo() {
    return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screen: {
            width: screen.width,
            height: screen.height,
            colorDepth: screen.colorDepth
        },
        battery: batteryMonitor?.level || null,
        installed: window.matchMedia('(display-mode: standalone)').matches,
        timestamp: Date.now()
    };
}

// Update device info
function updateDeviceInfo() {
    // Update uptime
    setInterval(() => {
        const elapsed = Date.now() - startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        document.getElementById('uptime').textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Start battery monitoring
function startBatteryMonitoring() {
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            batteryMonitor = battery;
            
            const updateBatteryStatus = () => {
                const level = Math.round(battery.level * 100);
                const charging = battery.charging ? ' (Charging)' : '';
                document.getElementById('batteryStatus').textContent = `${level}%${charging}`;
            };
            
            updateBatteryStatus();
            
            battery.addEventListener('levelchange', updateBatteryStatus);
            battery.addEventListener('chargingchange', updateBatteryStatus);
        });
    } else {
        document.getElementById('batteryStatus').textContent = 'Not supported';
    }
}

// Request permissions
function requestPermissions() {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            document.getElementById('notificationStatus').textContent = 
                permission === 'granted' ? 'Enabled' : 'Disabled';
        });
    } else {
        document.getElementById('notificationStatus').textContent = 
            Notification.permission === 'granted' ? 'Enabled' : 'Disabled';
    }
}

// Update status
function updateStatus(elementId, text, status) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const dot = element.querySelector('.status-dot');
    
    if (dot) {
        dot.className = 'status-dot ' + status;
    }
    
    element.innerHTML = `<span class="status-dot ${status}"></span> ${text}`;
}

// Log command
function logCommand(message, type = 'info') {
    const logContainer = document.getElementById('commandLog');
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

// Clear command log
function clearCommandLog() {
    const logContainer = document.getElementById('commandLog');
    logContainer.innerHTML = '';
    logCommand('Log cleared', 'info');
}

// Test functions
function testLockScreen() {
    lockPhone();
    setTimeout(() => {
        if (isLocked) unlockPhone();
    }, 3000);
    logCommand('Test lock screen activated', 'info');
}

function testVibration() {
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100, 50, 100]);
        logCommand('Vibration test successful', 'info');
    } else {
        logCommand('Vibration not supported', 'warning');
    }
}

async function testNotification() {
    if (Notification.permission === 'granted') {
        const notification = new Notification('Test Notification', {
            body: 'This is a test notification from Phone Lock Client',
            icon: 'icons/icon-96x96.png',
            badge: 'icons/icon-72x72.png',
            vibrate: [100, 50, 100]
        });
        
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
        
        logCommand('Test notification sent', 'info');
    } else {
        alert('Please enable notifications first');
    }
}

function testSound() {
    const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
    audio.volume = 0.5;
    audio.play().catch(() => {});
    logCommand('Test sound played', 'info');
}

// Permission requests
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                document.getElementById('notificationStatus').textContent = 'Enabled';
                logCommand('Notifications enabled', 'success');
            }
        });
    }
}

function requestVibrationPermission() {
    // Vibration API doesn't require explicit permission on most browsers
    if (navigator.vibrate) {
        navigator.vibrate(100);
        logCommand('Vibration enabled', 'success');
    } else {
        logCommand('Vibration not supported', 'warning');
    }
}

// QR Code scanning
async function scanQRCode() {
    const modal = document.getElementById('cameraModal');
    modal.style.display = 'block';
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });
        
        cameraStream = stream;
        const video = document.getElementById('cameraPreview');
        video.srcObject = stream;
        
        startQRScanner();
        
    } catch (error) {
        console.error('Camera error:', error);
        document.getElementById('cameraStatus').textContent = 'Camera access denied';
    }
}

function startQRScanner() {
    const video = document.getElementById('cameraPreview');
    const canvas = document.getElementById('qrCanvas');
    const context = canvas.getContext('2d');
    
    function scanQR() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
                // QR code found
                const sessionId = extractSessionId(code.data);
                if (sessionId) {
                    closeCamera();
                    connectToSession(sessionId);
                }
            }
        }
        
        if (cameraStream) {
            requestAnimationFrame(scanQR);
        }
    }
    
    scanQR();
}

function extractSessionId(url) {
    const match = url.match(/session=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

function closeCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    const modal = document.getElementById('cameraModal');
    modal.style.display = 'none';
}

// Connect with manual ID
function connectWithId() {
    const sessionId = document.getElementById('sessionIdInput').value.trim();
    if (sessionId) {
        connectToSession(sessionId);
    } else {
        alert('Please enter a session ID');
    }
}

// Emergency unlock
function emergencyUnlock() {
    if (isLocked) {
        if (confirm('Emergency unlock will disconnect from controller. Continue?')) {
            unlockPhone();
            disconnectSession();
            logCommand('Emergency unlock activated', 'warning');
        }
    }
}

// Helper functions
function preventDefault(e) {
    e.preventDefault();
    return false;
}

function preventUnload(e) {
    e.preventDefault();
    e.returnValue = '';
    return '';
}

function preventNavigation(e) {
    history.pushState(null, null, window.location.href);
}

function preventShortcuts(e) {
    // Prevent common shortcuts when locked
    if (isLocked && (e.ctrlKey || e.metaKey || e.key === 'F5' || e.key === 'F11' || e.key === 'F12')) {
        e.preventDefault();
        return false;
    }
}

function playLockSound() {
    // Simple beep sound using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
        
    } catch (error) {
        console.error('Audio error:', error);
    }
}

function sendLockNotification() {
    if (Notification.permission === 'granted') {
        new Notification('Phone Locked', {
            body: 'Your phone has been locked remotely by the controller',
            icon: 'icons/icon-96x96.png',
            badge: 'icons/icon-72x72.png',
            requireInteraction: true,
            vibrate: [200, 100, 200]
        });
    }
}
