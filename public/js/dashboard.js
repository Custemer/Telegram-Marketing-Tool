document.addEventListener('DOMContentLoaded', function() {
    // Update stats every 10 seconds
    function updateStats() {
        fetch('/api/stats')
            .then(response => response.json())
            .then(data => {
                document.getElementById('totalUsers').textContent = data.users;
                document.getElementById('totalAdded').textContent = data.added;
                document.getElementById('totalGroups').textContent = data.groups;
                document.getElementById('autoStatus').textContent = 
                    data.autoAdding ? 'RUNNING 🟢' : 'STOPPED 🔴';
                
                // Update uptime
                const hours = Math.floor(data.uptime / 3600);
                const minutes = Math.floor((data.uptime % 3600) / 60);
                document.getElementById('uptime').textContent = 
                    `${hours}h ${minutes}m`;
            })
            .catch(error => console.error('Error:', error));
    }
    
    // Update every 10 seconds
    updateStats();
    setInterval(updateStats, 10000);
    
    // Control buttons
    document.getElementById('startBtn').addEventListener('click', function() {
        fetch('/api/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' })
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            updateStats();
        });
    });
    
    document.getElementById('stopBtn').addEventListener('click', function() {
        fetch('/api/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' })
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            updateStats();
        });
    });
    
    // Timer settings form
    document.getElementById('timerForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const minutes = document.getElementById('minutes').value;
        const members = document.getElementById('members').value;
        
        alert(`Timer set to ${members} members every ${minutes} minutes`);
        // Here you would send to backend API
    });
});
