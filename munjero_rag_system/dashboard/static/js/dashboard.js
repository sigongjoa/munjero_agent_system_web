// static/js/dashboard.js

const rqStatusDiv = document.getElementById('rq-status');
const websocketLogsDiv = document.getElementById('websocket-logs');
const agentLogsDiv = document.getElementById('agent-logs');

async function fetchAndRenderData() {
    // Fetch RQ Status
    try {
        const rqResponse = await fetch('/api/rq_status');
        const rqData = await rqResponse.json();
        rqStatusDiv.innerHTML = `
            <p>Default Queue Jobs: ${rqData.default_queue_jobs}</p>
            <p>Started Workers: ${rqData.started_workers}</p>
        `;
    } catch (error) {
        console.error('Error fetching RQ status:', error);
        rqStatusDiv.innerHTML = '<p>Error loading RQ status.</p>';
    }

    // Fetch WebSocket Logs
    try {
        const wsResponse = await fetch('/api/websocket_logs');
        const wsData = await wsResponse.json();
        websocketLogsDiv.innerHTML = wsData.map(log => `
            <div class="log-entry">
                <span class="timestamp">${log.timestamp}</span>
                <span class="log-type">[${log.type.toUpperCase()}]</span>
                ${log.message}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error fetching WebSocket logs:', error);
        websocketLogsDiv.innerHTML = '<p>Error loading WebSocket logs.</p>';
    }

    // Fetch Agent Logs
    try {
        const agentResponse = await fetch('/api/agent_logs');
        const agentData = await agentResponse.json();
        agentLogsDiv.innerHTML = agentData.map(log => `
            <div class="log-entry">
                <span class="timestamp">${log.timestamp}</span>
                <span class="log-type">[${log.type.toUpperCase()}]</span>
                ${log.message}
                ${log.details ? `<pre>${JSON.stringify(log.details, null, 2)}</pre>` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error fetching Agent logs:', error);
        agentLogsDiv.innerHTML = '<p>Error loading Agent logs.</p>';
    }
}

// Fetch data initially and then every 3 seconds
fetchAndRenderData();
setInterval(fetchAndRenderData, 3000);
