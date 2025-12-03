<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= title %></title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stat-card h3 {
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
            text-transform: uppercase;
        }
        .stat-card .value {
            font-size: 36px;
            font-weight: bold;
            color: #333;
        }
        .control-panel {
            background: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            margin: 5px;
            transition: all 0.3s;
        }
        .btn-start { background: #4CAF50; color: white; }
        .btn-stop { background: #f44336; color: white; }
        .btn:hover { opacity: 0.9; transform: translateY(-2px); }
        .form-group { margin: 15px 0; }
        label { display: block; margin-bottom: 5px; color: #555; }
        input { 
            width: 100%; 
            padding: 10px; 
            border: 1px solid #ddd; 
            border-radius: 5px; 
            font-size: 16px;
        }
        .status {
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            text-align: center;
            font-weight: bold;
        }
        .status-online { background: #d4edda; color: #155724; }
        .status-offline { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 <%= title %></h1>
            <p>Bot: @<%= botUsername %> | Dashboard v1.0</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total Users</h3>
                <div class="value" id="totalUsers"><%= totalUsers %></div>
            </div>
            <div class="stat-card">
                <h3>Members Added</h3>
                <div class="value" id="totalAdded"><%= totalAdded %></div>
            </div>
            <div class="stat-card">
                <h3>Active Groups</h3>
                <div class="value" id="totalGroups"><%= totalGroups %></div>
            </div>
            <div class="stat-card">
                <h3>Auto-Add Status</h3>
                <div class="value" id="autoStatus">
                    <%= isAutoAdding ? 'RUNNING 🟢' : 'STOPPED 🔴' %>
                </div>
            </div>
        </div>
        
        <div class="control-panel">
            <h2>🛠️ Control Panel</h2>
            
            <div class="status <%= botStatus === 'online' ? 'status-online' : 'status-offline' %>">
                Bot Status: <%= botStatus.toUpperCase() %> | Uptime: <span id="uptime">0h 0m</span>
            </div>
            
            <div style="margin: 20px 0;">
                <button class="btn btn-start" id="startBtn">▶️ START Auto-Add</button>
                <button class="btn btn-stop" id="stopBtn">⏹️ STOP Auto-Add</button>
            </div>
            
            <h3>⚙️ Timer Settings</h3>
            <form id="timerForm">
                <div class="form-group">
                    <label>Add Members Every (minutes):</label>
                    <input type="number" id="minutes" value="2" min="1" max="60">
                </div>
                <div class="form-group">
                    <label>Members Per Interval:</label>
                    <input type="number" id="members" value="5" min="1" max="50">
                </div>
                <button type="submit" class="btn btn-start">💾 Save Settings</button>
            </form>
        </div>
        
        <div class="control-panel">
            <h2>📋 Quick Commands</h2>
            <p>Send these commands to @<%= botUsername %>:</p>
            <ul style="margin: 15px 0; padding-left: 20px;">
                <li><code>/startauto</code> - Start auto-adding members</li>
                <li><code>/stopauto</code> - Stop auto-adding</li>
                <li><code>/stats</code> - Show statistics</li>
                <li><code>/settime 2 5</code> - Set 2 minutes, 5 members</li>
            </ul>
        </div>
    </div>
    
    <script src="/js/dashboard.js"></script>
</body>
</html>
